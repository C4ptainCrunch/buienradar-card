# Buienradar Rain Card

Dead simple Home Assistant card showing Buienradar rain radar overlay for Belgium/Netherlands.

## Installation

1. Copy `buienradar-rain-card.js` to your Home Assistant `config/www/` folder

2. Add the resource in your Lovelace config (Settings > Dashboards > Resources):
   ```
   /local/buienradar-rain-card.js
   ```
   Type: JavaScript Module

3. Add the card to your dashboard:
   ```yaml
   type: custom:buienradar-rain-card
   ```

## That's it

No config options. It just shows the next 3 hours of rain forecast.
