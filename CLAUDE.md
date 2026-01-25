# Buienradar Rain Card

A Home Assistant custom Lovelace card that displays Buienradar rain radar forecast for Belgium/Netherlands.

## Project Structure

```
├── buienradar-rain-card.js   # Main card code (single file)
├── hacs.json                 # HACS configuration
├── docker-compose.yml        # Local dev HA instance
├── config/                   # Dev HA config (gitignored)
└── README.md
```

## Development

Start local Home Assistant:
```bash
docker compose up -d
```

Access at http://localhost:8123. The JS file is mounted directly - just hard refresh (Cmd+Shift+R) to see changes.

## How It Works

### Buienradar Data

Radar overlays come from:
```
https://processing-cdn.buienradar.nl/processing/nl/rain/forecast/runs/webm/{runTime}/{frameTime}.png
```

- `runTime`: When forecast was generated (updates every ~5 min)
- `frameTime`: The time this frame represents
- 37 frames total: 3 hours in 5-minute intervals
- Overlay bounds: SW [49.5, 0] to NE [54.8, 10]

Since we don't know the exact `runTime`, we probe backwards in 5-min increments until we get HTTP 200.

### Color Transform

Original Buienradar colors (blue for rain) don't show well on light maps. We apply CSS filter to shift to magenta:
```css
filter: hue-rotate(-60deg) saturate(2.5) brightness(0.9);
```

### Key Components

- **Leaflet**: Map library loaded from CDN
- **Shadow DOM**: Card uses shadow DOM for style isolation
- **Editor**: Uses native HA components (ha-textfield, ha-switch)

## Notes

- Card height is controlled by HA dashboard layout, not fixed
- Click on map toggles play/pause
- All images preloaded before playback to prevent flicker
