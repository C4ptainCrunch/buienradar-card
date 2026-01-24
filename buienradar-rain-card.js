class BuienradarRainCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._images = [];
    this._currentFrame = 0;
    this._playing = false;
    this._intervalId = null;
  }

  set hass(hass) {
    this._hass = hass;
  }

  setConfig(config) {
    this._config = config;
    this._render();
    this._loadImages();
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        .container {
          position: relative;
          width: 100%;
          background: #1a1a2e;
          border-radius: 12px;
          overflow: hidden;
        }
        .radar-frame {
          width: 100%;
          aspect-ratio: 1;
          background: #0d1117;
          position: relative;
        }
        .overlay-img {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          object-fit: contain;
          opacity: 0;
          will-change: opacity;
        }
        .overlay-img.active {
          opacity: 1;
        }
        .controls {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
          background: rgba(0,0,0,0.3);
        }
        .play-btn {
          background: #4a90d9;
          border: none;
          border-radius: 50%;
          width: 44px;
          height: 44px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 16px;
          flex-shrink: 0;
        }
        .play-btn:hover {
          background: #5a9fe9;
        }
        .timeline-container {
          flex: 1;
          padding-top: 8px;
        }
        .timeline {
          position: relative;
          height: 20px;
          cursor: pointer;
        }
        .timeline-track {
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          height: 4px;
          background: #4a90d9;
          transform: translateY(-50%);
          border-radius: 2px;
        }
        .timeline-dots {
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          transform: translateY(-50%);
          display: flex;
          justify-content: space-between;
        }
        .timeline-dot {
          width: 8px;
          height: 8px;
          background: #4a90d9;
          border-radius: 50%;
        }
        .timeline-handle {
          position: absolute;
          top: 50%;
          width: 20px;
          height: 20px;
          background: #4CAF50;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          cursor: grab;
          z-index: 1;
        }
        .timeline-handle:active {
          cursor: grabbing;
        }
        .timeline-labels {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          color: rgba(255,255,255,0.8);
          font-size: 11px;
          font-family: sans-serif;
        }
        .timeline-labels span {
          text-align: center;
          min-width: 40px;
        }
        .status {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          color: white;
          font-family: sans-serif;
          text-align: center;
        }
        .error {
          color: #ff6b6b;
        }
      </style>
      <ha-card>
        <div class="container">
          <div class="radar-frame">
            <div class="status">Loading radar...</div>
          </div>
          <div class="controls">
            <button class="play-btn">▶</button>
            <div class="timeline-container">
              <div class="timeline">
                <div class="timeline-track"></div>
                <div class="timeline-dots"></div>
                <div class="timeline-handle"></div>
              </div>
              <div class="timeline-labels"></div>
            </div>
          </div>
        </div>
      </ha-card>
    `;

    this.shadowRoot.querySelector('.play-btn').addEventListener('click', () => this._togglePlay());

    const timeline = this.shadowRoot.querySelector('.timeline');
    const handle = this.shadowRoot.querySelector('.timeline-handle');

    timeline.addEventListener('click', (e) => this._seekTo(e));

    // Drag handling
    let dragging = false;
    handle.addEventListener('mousedown', (e) => {
      dragging = true;
      this._pause();
      e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
      if (dragging) this._dragTo(e);
    });
    document.addEventListener('mouseup', () => {
      dragging = false;
    });

    // Touch support
    handle.addEventListener('touchstart', (e) => {
      dragging = true;
      this._pause();
      e.preventDefault();
    });
    document.addEventListener('touchmove', (e) => {
      if (dragging) this._dragTo(e.touches[0]);
    });
    document.addEventListener('touchend', () => {
      dragging = false;
    });
  }

  async _findLatestRun() {
    const baseUrl = 'https://processing-cdn.buienradar.nl/processing/nl/rain/forecast/runs/webm';
    const now = new Date();

    // Try run times going backwards in 5-minute increments
    for (let offset = 5; offset <= 30; offset += 5) {
      const runTime = new Date(now);
      const runMinutes = Math.floor(now.getUTCMinutes() / 5) * 5 - offset;
      runTime.setUTCMinutes(runMinutes, 0, 0);
      if (runMinutes < 0) {
        runTime.setUTCHours(runTime.getUTCHours() - 1);
        runTime.setUTCMinutes(60 + runMinutes);
      }

      const runStr = this._formatDateTime(runTime);
      // Test if this run exists by checking first frame
      const testUrl = `${baseUrl}/${runStr}/${runStr}.png`;

      try {
        const response = await fetch(testUrl, { method: 'HEAD' });
        if (response.ok) {
          return { runTime, runStr };
        }
      } catch (e) {
        // Continue to next offset
      }
    }
    return null;
  }

  async _loadImages() {
    const frame = this.shadowRoot.querySelector('.radar-frame');
    const status = frame.querySelector('.status');

    const run = await this._findLatestRun();
    if (!run) {
      status.textContent = 'Could not load radar data';
      status.classList.add('error');
      return;
    }

    const { runTime, runStr } = run;
    const baseUrl = 'https://processing-cdn.buienradar.nl/processing/nl/rain/forecast/runs/webm';

    // Generate frame times: from run time to +3 hours in 5-minute steps
    this._images = [];

    for (let i = 0; i <= 36; i++) { // 36 * 5min = 3 hours
      const frameTime = new Date(runTime.getTime() + i * 5 * 60 * 1000);
      const frameStr = this._formatDateTime(frameTime);
      const url = `${baseUrl}/${runStr}/${frameStr}.png`;

      const img = document.createElement('img');
      img.className = 'overlay-img';
      img.src = url;
      img.dataset.time = frameStr;
      frame.appendChild(img);
      this._images.push(img);
    }

    // Wait for ALL images to load
    const loadPromises = this._images.map(img =>
      new Promise(resolve => {
        if (img.complete) {
          resolve();
        } else {
          img.onload = resolve;
          img.onerror = resolve;
        }
      })
    );

    let loaded = 0;
    loadPromises.forEach(p => p.then(() => {
      loaded++;
      status.textContent = `Loading radar... ${Math.round(loaded / this._images.length * 100)}%`;
    }));

    await Promise.all(loadPromises);

    status.style.display = 'none';
    this._buildTimeline();
    this._showFrame(0);
    this._play();
  }

  _buildTimeline() {
    const dotsContainer = this.shadowRoot.querySelector('.timeline-dots');
    const labelsContainer = this.shadowRoot.querySelector('.timeline-labels');

    // Add dots for each frame
    for (let i = 0; i < this._images.length; i++) {
      const dot = document.createElement('div');
      dot.className = 'timeline-dot';
      dotsContainer.appendChild(dot);
    }

    // Add time labels (every ~25 minutes = 5 frames)
    const labelInterval = 5;
    for (let i = 0; i < this._images.length; i += labelInterval) {
      const timeStr = this._images[i]?.dataset.time;
      if (timeStr) {
        const h = timeStr.slice(8, 10);
        const m = timeStr.slice(10, 12);
        const label = document.createElement('span');
        label.textContent = `${h}:${m}`;
        labelsContainer.appendChild(label);
      }
    }
    // Add last label
    const lastTimeStr = this._images[this._images.length - 1]?.dataset.time;
    if (lastTimeStr) {
      const h = lastTimeStr.slice(8, 10);
      const m = lastTimeStr.slice(10, 12);
      const label = document.createElement('span');
      label.textContent = `${h}:${m}`;
      labelsContainer.appendChild(label);
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
    const prevFrame = this._currentFrame;
    this._currentFrame = index;

    // Only toggle the frames that changed
    if (prevFrame !== undefined && this._images[prevFrame]) {
      this._images[prevFrame].classList.remove('active');
    }
    if (this._images[index]) {
      this._images[index].classList.add('active');
    }

    const percent = (index / (this._images.length - 1)) * 100;
    this.shadowRoot.querySelector('.timeline-handle').style.left = `${percent}%`;
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
      const next = (this._currentFrame + 1) % this._images.length;
      this._showFrame(next);
    }, 200);
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
    const frame = Math.round(percent * (this._images.length - 1));
    this._showFrame(frame);
  }

  _dragTo(e) {
    const timeline = this.shadowRoot.querySelector('.timeline');
    const rect = timeline.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const frame = Math.round(percent * (this._images.length - 1));
    this._showFrame(frame);
  }

  getCardSize() {
    return 4;
  }

  static getStubConfig() {
    return {};
  }
}

customElements.define('buienradar-rain-card', BuienradarRainCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'buienradar-rain-card',
  name: 'Buienradar Rain Card',
  description: 'A simple rain radar card using Buienradar data'
});
