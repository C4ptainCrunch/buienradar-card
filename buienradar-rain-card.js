const DEFAULTS = {
  zoom: 9,
  autoplay: false,
  timeOffset: 15,
  animationSpeed: 200,
  opacity: 0.7,
  showMarker: true,
  refreshInterval: 30,
};

const RADAR_URL = 'https://processing-cdn.buienradar.nl/processing/nl/rain/forecast/runs/webm';
const BOUNDS = [[49.5, 0], [54.8, 10]];

class BuienradarRainCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._frameUrls = [];
    this._frameTimes = [];
    this._currentFrame = 0;
    this._playing = false;
    this._intervalId = null;
    this._refreshTimerId = null;
  }

  disconnectedCallback() {
    clearInterval(this._intervalId);
    clearInterval(this._refreshTimerId);
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
        :host { display: block; height: 100%; }
        ha-card { height: 100%; }
        .container {
          position: relative;
          width: 100%;
          height: 100%;
          background: #f5f5f5;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          display: flex;
          flex-direction: column;
        }
        .map-container {
          width: 100%;
          flex: 1;
          min-height: 200px;
          position: relative;
          z-index: 0;
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
          cursor: pointer;
          color: #5a7a9a;
          --mdc-icon-size: 18px;
          padding: 2px;
          display: flex;
          align-items: center;
        }
        .play-btn:hover { color: #3a5a7a; }
        .timeline {
          flex: 1;
          height: 3px;
          background: rgba(0,0,0,0.1);
          border-radius: 2px;
          cursor: pointer;
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
          z-index: 10;
          background: rgba(255,255,255,0.95);
          padding: 10px 20px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .error { color: #d9534f; }
      </style>
      <ha-card>
        <div class="container">
          <div class="map-container">
            <div class="status">Loading radar...</div>
          </div>
          <div class="controls">
            <ha-icon class="play-btn" icon="mdi:play"></ha-icon>
            <div class="timeline"><div class="timeline-progress"></div></div>
            <span class="time-label">--:--</span>
          </div>
        </div>
      </ha-card>
    `;
    this.shadowRoot.querySelector('.play-btn').addEventListener('click', () => this._togglePlay());
    this.shadowRoot.querySelector('.timeline').addEventListener('click', (e) => this._seekTo(e));
  }

  _getCoords() {
    let { lat, lon } = this._config;
    if (lat === undefined || lon === undefined) {
      const home = this._hass?.states?.['zone.home']?.attributes;
      lat = lat ?? home?.latitude;
      lon = lon ?? home?.longitude;
    }
    return [lat, lon];
  }

  _initMap() {
    const [lat, lon] = this._getCoords();
    const { zoom, showMarker, opacity } = this._config;

    this._map = L.map(this.shadowRoot.querySelector('.map-container'), {
      attributionControl: false,
      zoomControl: false,
      maxBounds: BOUNDS,
      maxBoundsViscosity: 1.0,
      minZoom: 7,
    }).setView([lat, lon], zoom);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(this._map);

    this._map.on('click', () => this._togglePlay());

    if (showMarker) {
      const icon = L.divIcon({
        className: 'custom-marker',
        html: '<div style="width:12px;height:12px;background:#5a9fcf;border:2px solid white;border-radius:50%;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      L.marker([lat, lon], { icon }).addTo(this._map);
    }

    this._overlay = L.imageOverlay(this._frameUrls[0], BOUNDS, { opacity }).addTo(this._map);
  }

  _formatTime(date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`;
  }

  _parseTime(str) {
    return Date.UTC(+str.slice(0, 4), +str.slice(4, 6) - 1, +str.slice(6, 8), +str.slice(8, 10), +str.slice(10, 12));
  }

  async _findLatestRun() {
    const now = new Date();
    for (let offset = 5; offset <= 30; offset += 5) {
      const runTime = new Date(now);
      runTime.setUTCMinutes(Math.floor(now.getUTCMinutes() / 5) * 5 - offset, 0, 0);
      const runStr = this._formatTime(runTime);
      try {
        const res = await fetch(`${RADAR_URL}/${runStr}/${runStr}.png`, { method: 'HEAD' });
        if (res.ok) return { runTime, runStr };
      } catch {}
    }
    return null;
  }

  _findClosestFrame(targetTime) {
    let closest = 0, minDiff = Infinity;
    for (let i = 0; i < this._frameTimes.length; i++) {
      const diff = Math.abs(this._parseTime(this._frameTimes[i]) - targetTime);
      if (diff < minDiff) { minDiff = diff; closest = i; }
    }
    return closest;
  }

  async _loadImages(isRefresh = false) {
    const status = this.shadowRoot.querySelector('.status');
    if (!isRefresh) status.style.display = '';

    const run = await this._findLatestRun();
    if (!run) {
      if (!isRefresh) {
        status.textContent = 'Could not load radar data';
        status.classList.add('error');
      }
      return;
    }

    this._frameUrls = [];
    this._frameTimes = [];
    for (let i = 0; i <= 36; i++) {
      const frameTime = new Date(run.runTime.getTime() + i * 5 * 60000);
      const frameStr = this._formatTime(frameTime);
      this._frameUrls.push(`${RADAR_URL}/${run.runStr}/${frameStr}.png`);
      this._frameTimes.push(frameStr);
    }

    await Promise.all(this._frameUrls.map(url => new Promise(r => {
      const img = new Image();
      img.onload = img.onerror = r;
      img.src = url;
    })));

    if (!isRefresh) {
      status.style.display = 'none';
      this._initMap();
    }

    const startFrame = this._findClosestFrame(Date.now() + this._config.timeOffset * 60000);
    this._showFrame(startFrame);

    if (!isRefresh && this._config.autoplay) this._play();
    this._scheduleRefresh();
  }

  _scheduleRefresh() {
    clearInterval(this._refreshTimerId);
    const interval = this._config.refreshInterval;
    if (interval >= 5) {
      this._refreshTimerId = setInterval(() => this._refresh(), interval * 60000);
    }
  }

  async _refresh() {
    const wasPlaying = this._playing;
    if (wasPlaying) this._pause();
    await this._loadImages(true);
    if (wasPlaying) this._play();
  }

  _showFrame(index) {
    this._currentFrame = index;
    this._overlay?.setUrl(this._frameUrls[index]);
    const percent = (index / (this._frameUrls.length - 1)) * 100;
    this.shadowRoot.querySelector('.timeline-progress').style.width = `${percent}%`;
    const t = this._frameTimes[index];
    if (t) {
      const utcTime = this._parseTime(t);
      const localDate = new Date(utcTime);
      const pad = (n) => String(n).padStart(2, '0');
      this.shadowRoot.querySelector('.time-label').textContent = `${pad(localDate.getHours())}:${pad(localDate.getMinutes())}`;
    }
  }

  _togglePlay() {
    this._playing ? this._pause() : this._play();
  }

  _play() {
    this._playing = true;
    this.shadowRoot.querySelector('.play-btn').setAttribute('icon', 'mdi:pause');
    this._intervalId = setInterval(() => {
      this._showFrame((this._currentFrame + 1) % this._frameUrls.length);
    }, this._config.animationSpeed);
  }

  _pause() {
    this._playing = false;
    this.shadowRoot.querySelector('.play-btn').setAttribute('icon', 'mdi:play');
    clearInterval(this._intervalId);
  }

  _seekTo(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this._showFrame(Math.round(percent * (this._frameUrls.length - 1)));
  }

  getCardSize() { return 5; }
}

class BuienradarRainCardEditor extends HTMLElement {
  set hass(hass) { this._hass = hass; }

  setConfig(config) {
    this._config = { ...DEFAULTS, ...config };
    this._render();
  }

  _render() {
    const c = this._config;
    this.innerHTML = `
      <style>
        .card-config { display: flex; flex-direction: column; gap: 16px; }
        .row { display: flex; gap: 16px; }
        .row > * { flex: 1; }
      </style>
      <div class="card-config">
        <div class="row">
          <ha-textfield label="Latitude" type="number" step="0.01" id="lat" value="${c.lat ?? ''}" placeholder="Home zone"></ha-textfield>
          <ha-textfield label="Longitude" type="number" step="0.01" id="lon" value="${c.lon ?? ''}" placeholder="Home zone"></ha-textfield>
        </div>
        <div class="row">
          <ha-textfield label="Zoom (7-19)" type="number" id="zoom" value="${c.zoom}"></ha-textfield>
          <ha-textfield label="Time Offset (min)" type="number" id="timeOffset" value="${c.timeOffset}"></ha-textfield>
        </div>
        <div class="row">
          <ha-textfield label="Animation Speed (ms)" type="number" step="50" id="animationSpeed" value="${c.animationSpeed}"></ha-textfield>
          <ha-textfield label="Opacity (0.1-1)" type="number" step="0.1" id="opacity" value="${c.opacity}"></ha-textfield>
        </div>
        <div class="row">
          <ha-textfield label="Auto Refresh (min)" type="number" step="5" id="refreshInterval" value="${c.refreshInterval}"></ha-textfield>
          <div></div>
        </div>
        <div class="row">
          <ha-formfield label="Autoplay"><ha-switch id="autoplay" ${c.autoplay ? 'checked' : ''}></ha-switch></ha-formfield>
          <ha-formfield label="Show marker"><ha-switch id="showMarker" ${c.showMarker ? 'checked' : ''}></ha-switch></ha-formfield>
        </div>
      </div>
    `;

    ['lat', 'lon', 'zoom', 'timeOffset', 'animationSpeed', 'opacity', 'refreshInterval'].forEach(id => {
      this.querySelector(`#${id}`).addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === '' && (id === 'lat' || id === 'lon')) {
          delete this._config[id];
        } else {
          this._config[id] = parseFloat(val);
        }
        this._fireChange();
      });
    });

    ['autoplay', 'showMarker'].forEach(id => {
      this.querySelector(`#${id}`).addEventListener('change', (e) => {
        this._config[id] = e.target.checked;
        this._fireChange();
      });
    });
  }

  _fireChange() {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: this._config },
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define('buienradar-rain-card', BuienradarRainCard);
customElements.define('buienradar-rain-card-editor', BuienradarRainCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'buienradar-rain-card',
  name: 'Buienradar Rain Card',
  description: 'Rain radar card using Buienradar data',
  preview: true,
});
