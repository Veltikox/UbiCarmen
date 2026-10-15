(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UbiCarmenTrips = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  function validPoint(point) {
    return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 90 && Math.abs(point[1]) <= 180;
  }
  function meters(a, b) {
    const radians = Math.PI / 180;
    const dLat = (b[0] - a[0]) * radians;
    const dLon = (b[1] - a[1]) * radians;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * radians) * Math.cos(b[0] * radians) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
  }
  function buildTracks(segments) {
    const tracks = [];
    for (const segment of segments) {
      if (!Array.isArray(segment.coordinates) || segment.coordinates.length < 2 || !segment.coordinates.every(validPoint)) continue;
      const previous = tracks.at(-1);
      if (previous && previous.runId === segment.runId && segment.streetIndex >= previous.lastStreetIndex && meters(previous.points.at(-1), segment.coordinates[0]) < 0.5) {
        previous.points.push(...segment.coordinates.slice(1));
        previous.lastStreetIndex = segment.streetIndex;
      } else {
        tracks.push({ runId: segment.runId, lastStreetIndex: segment.streetIndex, points: segment.coordinates.slice() });
      }
    }
    tracks.forEach((track, index) => {
      track.id = index;
      track.cumulative = [0];
      track.points.slice(1).forEach((point, i) => track.cumulative.push(track.cumulative.at(-1) + meters(track.points[i], point)));
    });
    return tracks;
  }
  function projections(track, point) {
    const scale = Math.cos(point[0] * Math.PI / 180);
    const candidates = [];
    for (let i = 0; i < track.points.length - 1; i++) {
      const a = track.points[i]; const b = track.points[i + 1];
      const dx = (b[1] - a[1]) * scale; const dy = b[0] - a[0];
      const length2 = dx * dx + dy * dy;
      if (!length2) continue;
      const t = Math.max(0, Math.min(1, (((point[1] - a[1]) * scale * dx) + (point[0] - a[0]) * dy) / length2));
      const snapped = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      candidates.push({ point: snapped, offset: meters(point, snapped), measure: track.cumulative[i] + (track.cumulative[i + 1] - track.cumulative[i]) * t, segmentIndex: i, trackId: track.id });
    }
    return candidates;
  }
  function sliceTrack(track, from, to) {
    const coordinates = [from.point];
    for (let i = from.segmentIndex + 1; i <= to.segmentIndex; i++) coordinates.push(track.points[i]);
    coordinates.push(to.point);
    return coordinates.filter((point, i) => i === 0 || meters(point, coordinates[i - 1]) > 0.01);
  }
  function planTrip(result, origin, destination, { speedKph = null, maxAccessMeters = 800 } = {}) {
    if (!validPoint(origin) || !validPoint(destination)) return { ok: false, code: 'points', message: 'Indica tu origen y el destino para planear el viaje.' };
    if (meters(origin, destination) < 5) return { ok: false, code: 'same-point', message: 'El origen y el destino son el mismo punto.' };
    const tracks = buildTracks(result?.segments || []);
    if (!tracks.length) return { ok: false, code: 'geometry', message: 'Falta cargar un tramo conectado de la ruta del camión.' };
    const candidates = tracks.map(track => ({ track, origins: projections(track, origin), destinations: projections(track, destination) }));
    const originMin = Math.min(...candidates.flatMap(candidate => candidate.origins.map(point => point.offset)));
    const destinationMin = Math.min(...candidates.flatMap(candidate => candidate.destinations.map(point => point.offset)));
    if (originMin > maxAccessMeters || destinationMin > maxAccessMeters) return { ok: false, code: 'far', message: 'El origen o el destino está lejos del trazado localizado de esta ruta. Prueba otra ruta.' };
    const plans = [];
    let sharedTrack = false;
    candidates.forEach(({ track, origins, destinations }) => {
      const nearbyOrigins = origins.filter(point => point.offset <= Math.min(maxAccessMeters, originMin + 20));
      const nearbyDestinations = destinations.filter(point => point.offset <= Math.min(maxAccessMeters, destinationMin + 20));
      if (nearbyOrigins.length && nearbyDestinations.length) sharedTrack = true;
      nearbyOrigins.forEach(from => nearbyDestinations.forEach(to => {
        if (to.measure <= from.measure + 1) return;
        plans.push({ track, from, to, score: from.offset + to.offset + (to.measure - from.measure) * 0.00001 });
      }));
    });
    if (!plans.length) return { ok: false, code: sharedTrack ? 'direction' : 'gap', message: sharedTrack ? 'El destino queda antes del origen en el sentido indicado. No se ha confirmado una ruta de regreso.' : 'Hay una conexión pendiente entre estos puntos. No se calcula un viaje atravesando ese hueco.' };
    plans.sort((a, b) => a.score - b.score);
    const { track, from, to } = plans[0];
    const rideMeters = to.measure - from.measure;
    const speed = Number.isFinite(speedKph) && speedKph >= 5 && speedKph <= 60 ? speedKph : null;
    return { ok: true, track, from, to, coordinates: sliceTrack(track, from, to), rideMeters, rideSeconds: speed ? rideMeters / (speed / 3.6) : null, speedKph: speed, accessMeters: from.offset, egressMeters: to.offset };
  }
  function positionAt(track, measure) {
    const clamped = Math.max(0, Math.min(track.cumulative.at(-1), measure));
    for (let i = 0; i < track.points.length - 1; i++) {
      if (track.cumulative[i + 1] < clamped) continue;
      const length = track.cumulative[i + 1] - track.cumulative[i];
      const t = length ? (clamped - track.cumulative[i]) / length : 0;
      const a = track.points[i]; const b = track.points[i + 1];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    return track.points.at(-1);
  }
  function simulationFrame(track, traveledMeters, { count = 3, routeId = 'campus', now = Date.now() } = {}) {
    const length = track?.cumulative.at(-1);
    if (!(length > 1) || !Number.isFinite(traveledMeters) || traveledMeters < 0) return [];
    const slots = Number.isFinite(count) ? Math.max(1, Math.min(10, Math.floor(count))) : 3;
    return Array.from({ length: slots }, (_, index) => {
      const progress = traveledMeters + length * index / slots;
      const cycle = Math.floor(progress / length);
      const point = positionAt(track, progress % length);
      return { id: `SIM-${routeId}-${index + 1}-${cycle}`, label: `Camión simulado ${index + 1}`, routeId, lat: point[0], lon: point[1], timestamp: new Date(now).toISOString(), direction: 'forward', simulated: true };
    });
  }
  function nearbyIncidents(result, incidents, threshold = 100) {
    const routeEdges = buildTracks(result?.segments || []).flatMap(track => track.points.slice(1).map((point, index) => [track.points[index], point]));
    const xy = point => [point[1] * 111195 * Math.cos(18.66 * Math.PI / 180), point[0] * 111195];
    function pointSegment(p, a, b) {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    }
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    function near(a, b, c, d) {
      if (Math.max(a[0], b[0]) + threshold < Math.min(c[0], d[0]) || Math.max(c[0], d[0]) + threshold < Math.min(a[0], b[0]) || Math.max(a[1], b[1]) + threshold < Math.min(c[1], d[1]) || Math.max(c[1], d[1]) + threshold < Math.min(a[1], b[1])) return false;
      const overlaps = Math.max(a[0], b[0]) >= Math.min(c[0], d[0]) && Math.max(c[0], d[0]) >= Math.min(a[0], b[0]) && Math.max(a[1], b[1]) >= Math.min(c[1], d[1]) && Math.max(c[1], d[1]) >= Math.min(a[1], b[1]);
      if (overlaps && cross(a,b,c) * cross(a,b,d) <= 0 && cross(c,d,a) * cross(c,d,b) <= 0) return true;
      return Math.min(pointSegment(a,c,d), pointSegment(b,c,d), pointSegment(c,a,b), pointSegment(d,a,b)) <= threshold;
    }
    const edges = routeEdges.map(edge => edge.map(xy));
    return incidents.filter(incident => {
      if (!Array.isArray(incident.coordinates) || !incident.coordinates.length || !incident.coordinates.every(validPoint)) return false;
      const points = incident.coordinates.map(xy);
      const incidentEdges = points.length === 1 ? [[points[0], points[0]]] : points.slice(1).map((point, index) => [points[index], point]);
      return incidentEdges.some(([c,d]) => edges.some(([a,b]) => near(a,b,c,d)));
    });
  }
  return { validPoint, meters, buildTracks, projections, planTrip, positionAt, simulationFrame, nearbyIncidents };
});
