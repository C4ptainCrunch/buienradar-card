# Buienradar Rain Card

A Home Assistant custom card showing Buienradar rain radar forecast for Belgium/Netherlands.

> **Note**: This project was built by with Claude Code. 

## Installation

1. Open HACS in Home Assistant
2. Go to "Frontend" section
3. Click the menu (three dots) and select "Custom repositories"
4. Add this repository URL and select "Lovelace" as category
5. Find "Buienradar Rain Card" and click Install
6. Restart Home Assistant


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


## License

I'm not even sure i can claim a copyright on this, but if i can, i'm licensing it under MIT.
