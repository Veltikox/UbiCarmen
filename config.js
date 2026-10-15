/* Public browser configuration. Never put private tokens/passwords here.
 * See docs/live-data.md for simulation, GPS and traffic settings.
 */
window.UbiCarmenConfig = Object.freeze({
  vehicles: { url: '', pollIntervalMs: 15000, maxAgeMs: 60000 },
  simulation: { enabled: true, vehiclesPerRoute: 3 },
  traffic: { tomtomBrowserKey: '' },
  estimation: { defaultAverageSpeedKph: 20, maxAccessMeters: 800 }
});
