const DEFAULTS = {
  lat: 50.79,
  lon: 4.41,
  zoom: 9,
  autoplay: false,
  timeOffset: 15,
  animationSpeed: 200,
  opacity: 0.7,
  showMarker: false,
};

class BuienradarRainCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._frameUrls = [];
    this._frameTimes = [];
    this._currentFrame = 0;
    this._playing = false;
    this._intervalId = null;
    this._map = null;
    this._overlay = null;
    this._marker = null;
  }

  set hass(hass) {
    this._hass = hass;
  }

  setConfig(config) {
    this._config = { ...DEFAULTS, ...config };
    this._loadLeaflet().then(() => {
      this._render();
      this._loadImages();
    });
  }

  static getConfigElement() {
    return document.createElement('buienradar-rain-card-editor');
  }

  static getStubConfig() {
    return { ...DEFAULTS };
  }

  async _loadLeaflet() {
    if (window.L) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    await new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = resolve;
      document.head.appendChild(script);
    });
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        @import url('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css');
        :host {
          display: block;
        }
        .container {
          position: relative;
          width: 100%;
          background: #f5f5f5;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .map-container {
          width: 100%;
          aspect-ratio: 1;
        }
        .map-container .leaflet-overlay-pane img {
          filter: hue-rotate(-60deg) saturate(2.5) brightness(0.9);
        }
        .controls {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: rgba(255,255,255,0.9);
          border-top: 1px solid rgba(0,0,0,0.06);
        }
        .play-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #5a7a9a;
          font-size: 12px;
          padding: 4px;
          flex-shrink: 0;
        }
        .play-btn:hover {
          color: #3a5a7a;
        }
        .timeline {
          flex: 1;
          height: 3px;
          background: rgba(0,0,0,0.1);
          border-radius: 2px;
          cursor: pointer;
          position: relative;
        }
        .timeline-progress {
          height: 100%;
          background: #5a9fcf;
          border-radius: 2px;
          width: 0%;
        }
        .time-label {
          color: #5a7a9a;
          font-size: 11px;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          min-width: 36px;
          text-align: right;
        }
        .status {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: #5a7a9a;
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 13px;
          text-align: center;
          z-index: 1000;
          background: rgba(255,255,255,0.95);
          padding: 10px 20px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .error {
          color: #d9534f;
        }
      </style>
      <ha-card>
        <div class="container">
          <div class="map-container">
            <div class="status">Loading radar...</div>
          </div>
          <div class="controls">
            <button class="play-btn">▶</button>
            <div class="timeline">
              <div class="timeline-progress"></div>
            </div>
            <span class="time-label">--:--</span>
          </div>
        </div>
      </ha-card>
    `;

    this.shadowRoot.querySelector('.play-btn').addEventListener('click', () => this._togglePlay());
    this.shadowRoot.querySelector('.timeline').addEventListener('click', (e) => this._seekTo(e));
  }

  _initMap() {
    const mapContainer = this.shadowRoot.querySelector('.map-container');
    const { lat, lon, zoom, opacity, showMarker } = this._config;

    const bounds = [[49.5, 0], [54.8, 10]];

    this._map = L.map(mapContainer, {
      attributionControl: false,
      zoomControl: false,
      maxBounds: bounds,
      maxBoundsViscosity: 1.0,
      minZoom: 7,
    }).setView([lat, lon], zoom);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(this._map);

    this._bounds = bounds;

    if (showMarker) {
      const markerIcon = L.divIcon({
        className: 'custom-marker',
        html: '<div style="width:12px;height:12px;background:#5a9fcf;border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      this._marker = L.marker([lat, lon], { icon: markerIcon }).addTo(this._map);
    }
  }

  async _findLatestRun() {
    const baseUrl = 'https://processing-cdn.buienradar.nl/processing/nl/rain/forecast/runs/webm';
    const now = new Date();

    for (let offset = 5; offset <= 30; offset += 5) {
      const runTime = new Date(now);
      const runMinutes = Math.floor(now.getUTCMinutes() / 5) * 5 - offset;
      runTime.setUTCMinutes(runMinutes, 0, 0);
      if (runMinutes < 0) {
        runTime.setUTCHours(runTime.getUTCHours() - 1);
        runTime.setUTCMinutes(60 + runMinutes);
      }

      const runStr = this._formatDateTime(runTime);
      const testUrl = `${baseUrl}/${runStr}/${runStr}.png`;

      try {
        const response = await fetch(testUrl, { method: 'HEAD' });
        if (response.ok) {
          return { runTime, runStr };
        }
      } catch (e) {
        // Continue
      }
    }
    return null;
  }

  async _loadImages() {
    const status = this.shadowRoot.querySelector('.status');
    const { opacity, timeOffset, autoplay } = this._config;

    const run = await this._findLatestRun();
    if (!run) {
      status.textContent = 'Could not load radar data';
      status.classList.add('error');
      return;
    }

    const { runTime, runStr } = run;
    const baseUrl = 'https://processing-cdn.buienradar.nl/processing/nl/rain/forecast/runs/webm';

    this._frameUrls = [];
    this._frameTimes = [];

    for (let i = 0; i <= 36; i++) {
      const frameTime = new Date(runTime.getTime() + i * 5 * 60 * 1000);
      const frameStr = this._formatDateTime(frameTime);
      const url = `${baseUrl}/${runStr}/${frameStr}.png`;
      this._frameUrls.push(url);
      this._frameTimes.push(frameStr);
    }

    const loadPromises = this._frameUrls.map(url =>
      new Promise(resolve => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve;
        img.src = url;
      })
    );

    let loaded = 0;
    loadPromises.forEach(p => p.then(() => {
      loaded++;
      status.textContent = `Loading radar... ${Math.round(loaded / this._frameUrls.length * 100)}%`;
    }));

    await Promise.all(loadPromises);

    status.style.display = 'none';

    this._initMap();
    this._overlay = L.imageOverlay(this._frameUrls[0], this._bounds, { opacity }).addTo(this._map);

    // Find frame closest to now + timeOffset minutes
    const targetTime = Date.now() + timeOffset * 60 * 1000;
    let closestFrame = 0;
    let closestDiff = Infinity;
    for (let i = 0; i < this._frameTimes.length; i++) {
      const t = this._frameTimes[i];
      const frameDate = Date.UTC(
        parseInt(t.slice(0, 4)),
        parseInt(t.slice(4, 6)) - 1,
        parseInt(t.slice(6, 8)),
        parseInt(t.slice(8, 10)),
        parseInt(t.slice(10, 12))
      );
      const diff = Math.abs(frameDate - targetTime);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestFrame = i;
      }
    }

    this._showFrame(closestFrame);

    if (autoplay) {
      this._play();
    }
  }

  _formatDateTime(date) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    const h = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    return `${y}${m}${d}${h}${min}`;
  }

  _showFrame(index) {
    this._currentFrame = index;

    if (this._overlay) {
      this._overlay.setUrl(this._frameUrls[index]);
    }

    const percent = (index / (this._frameUrls.length - 1)) * 100;
    this.shadowRoot.querySelector('.timeline-progress').style.width = `${percent}%`;

    const timeStr = this._frameTimes[index];
    if (timeStr) {
      const h = timeStr.slice(8, 10);
      const m = timeStr.slice(10, 12);
      this.shadowRoot.querySelector('.time-label').textContent = `${h}:${m}`;
    }
  }

  _togglePlay() {
    if (this._playing) {
      this._pause();
    } else {
      this._play();
    }
  }

  _play() {
    this._playing = true;
    this.shadowRoot.querySelector('.play-btn').textContent = '⏸';
    this._intervalId = setInterval(() => {
      const next = (this._currentFrame + 1) % this._frameUrls.length;
      this._showFrame(next);
    }, this._config.animationSpeed);
  }

  _pause() {
    this._playing = false;
    this.shadowRoot.querySelector('.play-btn').textContent = '▶';
    clearInterval(this._intervalId);
  }

  _seekTo(e) {
    const timeline = this.shadowRoot.querySelector('.timeline');
    const rect = timeline.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const frame = Math.round(percent * (this._frameUrls.length - 1));
    this._showFrame(frame);
  }

  getCardSize() {
    return 5;
  }
}

// Editor element
class BuienradarRainCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  setConfig(config) {
    this._config = { ...DEFAULTS, ...config };
    this._render();
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        .form {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .row {
          display: flex;
          gap: 16px;
        }
        .field {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        label {
          font-size: 12px;
          font-weight: 500;
          color: var(--primary-text-color);
        }
        input, select {
          padding: 8px;
          border: 1px solid var(--divider-color);
          border-radius: 4px;
          background: var(--card-background-color);
          color: var(--primary-text-color);
        }
        .checkbox-field {
          flex-direction: row;
          align-items: center;
          gap: 8px;
        }
        .checkbox-field input {
          width: auto;
        }
      </style>
      <div class="form">
        <div class="row">
          <div class="field">
            <label>Latitude</label>
            <input type="number" step="0.01" id="lat" value="${this._config.lat}">
          </div>
          <div class="field">
            <label>Longitude</label>
            <input type="number" step="0.01" id="lon" value="${this._config.lon}">
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Zoom (7-19)</label>
            <input type="number" min="7" max="19" id="zoom" value="${this._config.zoom}">
          </div>
          <div class="field">
            <label>Time Offset (min)</label>
            <input type="number" id="timeOffset" value="${this._config.timeOffset}">
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>Animation Speed (ms)</label>
            <input type="number" min="50" max="1000" step="50" id="animationSpeed" value="${this._config.animationSpeed}">
          </div>
          <div class="field">
            <label>Overlay Opacity</label>
            <input type="number" min="0.1" max="1" step="0.1" id="opacity" value="${this._config.opacity}">
          </div>
        </div>
        <div class="row">
          <div class="field checkbox-field">
            <input type="checkbox" id="autoplay" ${this._config.autoplay ? 'checked' : ''}>
            <label for="autoplay">Autoplay</label>
          </div>
          <div class="field checkbox-field">
            <input type="checkbox" id="showMarker" ${this._config.showMarker ? 'checked' : ''}>
            <label for="showMarker">Show Location Marker</label>
          </div>
        </div>
      </div>
    `;

    // Add event listeners
    ['lat', 'lon', 'zoom', 'timeOffset', 'animationSpeed', 'opacity'].forEach(id => {
      this.shadowRoot.getElementById(id).addEventListener('change', (e) => {
        this._config[id] = parseFloat(e.target.value);
        this._fireChange();
      });
    });

    ['autoplay', 'showMarker'].forEach(id => {
      this.shadowRoot.getElementById(id).addEventListener('change', (e) => {
        this._config[id] = e.target.checked;
        this._fireChange();
      });
    });
  }

  _fireChange() {
    const event = new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }
}

customElements.define('buienradar-rain-card', BuienradarRainCard);
customElements.define('buienradar-rain-card-editor', BuienradarRainCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'buienradar-rain-card',
  name: 'Buienradar Rain Card',
  description: 'A simple rain radar card using Buienradar data',
  preview: true,
});
