(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UbiCarmenLive = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const BOUNDS = [[18.59, -91.88], [18.74, -91.60]];
  const validCityPoint = point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && point[0] >= BOUNDS[0][0] && point[0] <= BOUNDS[1][0] && point[1] >= BOUNDS[0][1] && point[1] <= BOUNDS[1][1];
  function serviceURL(value, base) {
    const url = new URL(value, base);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) throw new Error('La fuente debe utilizar HTTPS, sin credenciales en la URL.');
    return url.href;
  }
  function parseVehicles(payload, { now = Date.now(), maxAgeMs = 60000 } = {}) {
    if (!payload || !Array.isArray(payload.vehicles) || payload.vehicles.length > 2000) throw new Error('Formato de posiciones no compatible.');
    const vehicles = new Map();
    payload.vehicles.forEach(vehicle => {
      if (!vehicle || typeof vehicle.id !== 'string' || !vehicle.id.trim() || vehicle.id.length > 100 || !['campus', 'laguna', 'costera'].includes(vehicle.routeId) || !validCityPoint([vehicle.lat, vehicle.lon]) || typeof vehicle.timestamp !== 'string') return;
      const timestamp = Date.parse(vehicle.timestamp);
      if (!Number.isFinite(timestamp) || now - timestamp > maxAgeMs || timestamp - now > 15000) return;
      const item = { id: vehicle.id, routeId: vehicle.routeId, lat: vehicle.lat, lon: vehicle.lon, timestamp: new Date(timestamp).toISOString(), direction: ['forward', 'reverse'].includes(vehicle.direction) ? vehicle.direction : null };
      if (!vehicles.has(item.id) || timestamp > Date.parse(vehicles.get(item.id).timestamp)) vehicles.set(item.id, item);
    });
    return [...vehicles.values()];
  }
  async function fetchJSON(url, options, fetchFn = fetch) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    const parent = options?.signal;
    const abort = () => controller.abort();
    if (parent?.aborted) controller.abort();
    parent?.addEventListener('abort', abort, { once: true });
    try {
      const response = await fetchFn(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`Servicio no disponible (HTTP ${response.status}).`);
      return await response.json();
    } finally { clearTimeout(timer); parent?.removeEventListener('abort', abort); }
  }
  async function fetchVehicles(config, { fetchFn = fetch, base, now = Date.now(), signal } = {}) {
    if (!config.url) return [];
    const data = await fetchJSON(serviceURL(config.url, base), { cache: 'no-store', credentials: 'same-origin', signal }, fetchFn);
    return parseVehicles(data, { now, maxAgeMs: config.maxAgeMs });
  }
  async function searchPlaces(query, { fetchFn = fetch, signal } = {}) {
    if (query.trim().length < 3 || query.length > 200) throw new Error('Escribe una dirección de entre 3 y 200 caracteres.');
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q: `${query.trim()}, Ciudad del Carmen, Campeche, México`, format: 'jsonv2', limit: '5', bounded: '1', viewbox: '-91.88,18.74,-91.60,18.59' });
    const data = await fetchJSON(url.href, { signal, credentials: 'omit' }, fetchFn);
    if (!Array.isArray(data)) throw new Error('No se pudo interpretar la búsqueda.');
    return data.map(item => ({ label: String(item.display_name || 'Destino'), point: [Number(item.lat), Number(item.lon)] })).filter(item => validCityPoint(item.point));
  }
  function trafficURL(key) {
    if (typeof key !== 'string' || !key.trim()) return null;
    return `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(key.trim())}&tileSize=256`;
  }
  function parseIncidents(payload, now = Date.now()) {
    if (!payload || !Array.isArray(payload.incidents) || payload.incidents.length > 5000) throw new Error('Formato de incidentes no compatible.');
    const categories = { 1: 'Accidente', 2: 'Niebla', 3: 'Condiciones peligrosas', 4: 'Lluvia', 5: 'Hielo', 6: 'Congestión', 7: 'Carril cerrado', 8: 'Calle cerrada', 9: 'Obras', 10: 'Viento', 11: 'Inundación', 14: 'Vehículo averiado' };
    return payload.incidents.flatMap((item, index) => {
      const shape = item.geometry;
      if (!shape || !['Point', 'LineString'].includes(shape.type)) return [];
      const raw = shape.type === 'Point' ? [shape.coordinates] : shape.coordinates;
      if (!Array.isArray(raw) || !raw.length || raw.length > 5000 || !raw.every(point => Array.isArray(point) && point.length >= 2 && validCityPoint([point[1], point[0]]))) return [];
      const properties = item.properties || {};
      const end = Date.parse(properties.endTime);
      if (Number.isFinite(end) && end < now) return [];
      const label = categories[properties.iconCategory] || 'Incidente vial';
      const descriptions = Array.isArray(properties.events) ? properties.events.map(event => event.description).filter(text => typeof text === 'string').slice(0, 3).join('. ') : '';
      return [{ id: String(properties.id || index), type: shape.type, coordinates: raw.map(point => [point[1], point[0]]), label, description: descriptions.slice(0, 500), from: String(properties.from || '').slice(0, 200), to: String(properties.to || '').slice(0, 200) }];
    });
  }
  async function fetchIncidents(key, { fetchFn = fetch, signal } = {}) {
    if (!key) return [];
    const url = new URL('https://api.tomtom.com/traffic/services/5/incidentDetails');
    url.search = new URLSearchParams({ key, bbox: '-91.88,18.59,-91.60,18.74', fields: '{incidents{type,geometry{type,coordinates},properties{id,iconCategory,events{description},from,to,startTime,endTime}}}', language: 'es-ES', timeValidityFilter: 'present' });
    return parseIncidents(await fetchJSON(url.href, { signal, credentials: 'omit', cache: 'no-store' }, fetchFn));
  }
  return { validCityPoint, serviceURL, parseVehicles, fetchVehicles, searchPlaces, trafficURL, parseIncidents, fetchIncidents };
});
