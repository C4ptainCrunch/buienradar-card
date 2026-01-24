# Buienradar Rain Card

A Home Assistant custom card showing Buienradar rain radar forecast for Belgium/Netherlands.

## Features

- 3-hour rain forecast with 5-minute intervals
- Interactive timeline with play/pause
- Light theme with high-visibility overlay
- Configurable via UI editor
- Defaults to your Home Assistant home zone location

## Installation

### HACS (Recommended)

1. Open HACS in Home Assistant
2. Go to "Frontend" section
3. Click the menu (three dots) and select "Custom repositories"
4. Add this repository URL and select "Lovelace" as category
5. Find "Buienradar Rain Card" and click Install
6. Restart Home Assistant

### Manual

1. Download `buienradar-rain-card.js` from the latest release
2. Copy it to `config/www/buienradar-rain-card.js`
3. Add the resource in Settings > Dashboards > Resources:
   - URL: `/local/buienradar-rain-card.js`
   - Type: JavaScript Module

## Usage

Add the card to your dashboard:

```yaml
type: custom:buienradar-rain-card
```

## Configuration

All options are configurable via the visual editor. Click "Edit" on the card to access settings.

| Option | Default | Description |
|--------|---------|-------------|
| `lat` | Home zone | Latitude for map center |
| `lon` | Home zone | Longitude for map center |
| `zoom` | 9 | Map zoom level (7-19) |
| `timeOffset` | 15 | Default time offset in minutes |
| `animationSpeed` | 200 | Milliseconds between frames |
| `opacity` | 0.7 | Rain overlay opacity (0.1-1.0) |
| `autoplay` | false | Auto-start animation |
| `showMarker` | true | Show location marker on map |

Example with custom config:

```yaml
type: custom:buienradar-rain-card
lat: 52.37
lon: 4.89
zoom: 10
autoplay: true
```

## License

MIT
