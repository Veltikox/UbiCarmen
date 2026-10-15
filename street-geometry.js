/* Draw only geometry belonging to streets in the supplied itinerary.
 * Unknown connections remain disconnected, without straight-line shortcuts.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.UbiCarmenGeometry = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const CITY_BOUNDS = [[18.59, -91.88], [18.74, -91.60]];
  const ENDPOINT = 'https://overpass-api.de/api/interpreter';
  const CACHE_KEY = 'ubicarmen-osm-streets-v1';
  const CACHE_AGE = 7 * 24 * 60 * 60 * 1000;

  function normalize(value) {
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/\b(?:avenida|av|calle|c|carretera)\b\.?/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function namesOf(element) {
    const tags = element.tags || {};
    return ['name', 'official_name', 'alt_name', 'short_name'].flatMap((key) => (tags[key] || '').split(';')).filter(Boolean);
  }

  function streetKind(value) {
    const plain = String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (/^(avenida|av)\b/.test(plain)) return 'avenue';
    if (/^(calle|c)\b/.test(plain)) return 'street';
    if (/^carretera\b/.test(plain)) return 'road';
    return null;
  }

  function distance(a, b) {
    const lat = (a[0] + b[0]) * Math.PI / 360;
    return Math.hypot((a[0] - b[0]) * 111195, (a[1] - b[1]) * 111195 * Math.cos(lat));
  }

  function buildRoad(ways) {
    const nodes = new Map();
    const graph = new Map();
    const wayEdges = new Map();
    function edge(from, to, meters, wayId) {
      if (!graph.has(from)) graph.set(from, []);
      graph.get(from).push({ to, meters });
      wayEdges.set(`${from}:${to}`, wayId);
    }
    for (const way of ways) {
      const tags = way.tags || {};
      if (['no', 'private'].includes(tags.access) && !['yes', 'designated', 'permissive'].includes(tags.bus) && !['yes', 'designated'].includes(tags.psv)) continue;
      const geometry = way.geometry || [];
      const ids = way.nodes || [];
      if (ids.length !== geometry.length) continue;
      const busTwoWay = tags['oneway:bus'] === 'no' || tags['oneway:psv'] === 'no';
      const forward = !busTwoWay && (['yes', '1', 'true'].includes(tags.oneway) || (tags.junction === 'roundabout' && tags.oneway !== 'no'));
      const reverse = !busTwoWay && tags.oneway === '-1';
      for (let i = 0; i < ids.length; i++) {
        const point = geometry[i];
        if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
        nodes.set(ids[i], [point.lat, point.lon]);
        if (i === 0 || !geometry[i - 1] || !nodes.has(ids[i - 1])) continue;
        const previous = ids[i - 1]; const current = ids[i];
        const meters = distance(nodes.get(previous), nodes.get(current));
        if (!reverse) edge(previous, current, meters, way.id);
        if (!forward) edge(current, previous, meters, way.id);
      }
    }
    return { nodes, graph, wayEdges };
  }

  // Multi-source Dijkstra, with prior-stage costs, using a binary min heap.
  function shortestPath(road, starts, target) {
    const best = new Map();
    const previous = new Map();
    const heap = [];
    function push(item) {
      heap.push(item);
      let i = heap.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (heap[parent].cost <= item.cost) break;
        heap[i] = heap[parent]; i = parent;
      }
      heap[i] = item;
    }
    function pop() {
      const first = heap[0]; const last = heap.pop();
      if (heap.length) {
        let i = 0;
        while (2 * i + 1 < heap.length) {
          let child = 2 * i + 1;
          if (child + 1 < heap.length && heap[child + 1].cost < heap[child].cost) child++;
          if (heap[child].cost >= last.cost) break;
          heap[i] = heap[child]; i = child;
        }
        heap[i] = last;
      }
      return first;
    }
    starts.forEach((cost, id) => { best.set(id, cost); push({ id, cost }); });
    while (heap.length) {
      const { id, cost } = pop();
      if (cost !== best.get(id)) continue;
      if (id === target) {
        const path = [id];
        while (previous.has(path[0])) path.unshift(previous.get(path[0]));
        return { path, cost };
      }
      for (const next of road.graph.get(id) || []) {
        const nextCost = cost + next.meters;
        if (nextCost >= (best.get(next.to) ?? Infinity)) continue;
        best.set(next.to, nextCost); previous.set(next.to, id);
        push({ id: next.to, cost: nextCost });
      }
    }
    return null;
  }

  function resolveRoute(route, elements) {
    const ways = elements.filter((element) => element.type === 'way' && element.tags?.highway);
    const entries = route.streets.map((name) => {
      const accepted = [name, ...(route.aliases?.[name] || [])];
      const ambiguousKind = route.streets.some((other) => normalize(other) === normalize(name) && streetKind(other) !== streetKind(name));
      const matchesName = (candidate) => accepted.some((alias) => normalize(alias) === normalize(candidate) && (!streetKind(alias) || !streetKind(candidate) || streetKind(alias) === streetKind(candidate)) && !(ambiguousKind && !streetKind(candidate)));
      const matchingWays = ways.filter((way) => namesOf(way).some(matchesName));
      const isPlace = (route.places || []).includes(name);
      const matches = isPlace ? elements.filter((element) => !element.tags?.highway && namesOf(element).some(matchesName)) : [];
      const positions = matches.map((element) => {
        // For polygon/relations, use a supplied center; never its first vertex.
        const point = element.type === 'node' ? element : element.center;
        return point && Number.isFinite(point.lat) && Number.isFinite(point.lon) ? [point.lat, point.lon] : null;
      }).filter(Boolean);
      const unique = positions.filter((point, index) => positions.findIndex((other) => distance(point, other) < 50) === index);
      return { name, road: buildRoad(matchingWays), position: unique.length === 1 ? unique[0] : null, isPlace };
    });
    const intersections = [];
    const issues = [];
    for (let i = 0; i < entries.length - 1; i++) {
      const a = entries[i]; const b = entries[i + 1];
      // Shared OSM node identity avoids joining bridges or near-miss junctions.
      const shared = [...a.road.nodes.keys()].filter((id) => b.road.nodes.has(id));
      intersections.push(shared);
      if (!shared.length) issues.push({ index: i, from: a.name, to: b.name, reason: 'Cruce o enlace por confirmar' });
    }
    const segments = [];
    const junctions = [];
    let boundary = 0;
    while (boundary < intersections.length) {
      if (!intersections[boundary].length) { boundary++; continue; }
      let states = new Map(intersections[boundary].map((id) => [id, { cost: 0, segments: [] }]));
      let next = boundary + 1;
      for (; next < intersections.length && intersections[next].length; next++) {
        const entry = entries[next];
        const starts = new Map([...states].map(([id, state]) => [id, state.cost]));
        const newStates = new Map();
        for (const target of intersections[next]) {
          const found = shortestPath(entry.road, starts, target);
          if (!found) continue;
          const previousState = states.get(found.path[0]);
          const coordinates = found.path.map((id) => entry.road.nodes.get(id));
          const wayIds = [...new Set(found.path.slice(1).map((id, index) => entry.road.wayEdges.get(`${found.path[index]}:${id}`)))];
          const addition = found.path.length > 1 ? [{ streetIndex: next, name: entry.name, wayIds, coordinates }] : [];
          newStates.set(target, { cost: found.cost, segments: [...previousState.segments, ...addition] });
        }
        if (!newStates.size) {
          issues.push({ index: next, from: entries[next - 1].name, to: entries[next + 1].name, reason: `No hay paso comprobado por ${entry.name} en este sentido` });
          break;
        }
        states = newStates;
      }
      const chosen = [...states.values()].sort((a, b) => a.cost - b.cost)[0];
      segments.push(...chosen.segments.map(segment => ({ ...segment, runId: boundary })));
      // A failed direction is a new run, never a line connecting separate runs.
      boundary = next;
    }
    segments.forEach((segment) => [segment.coordinates[0], segment.coordinates.at(-1)].forEach((coordinates) => junctions.push({ coordinates })));
    const locations = entries.filter((entry) => entry.position).map((entry) => ({ name: entry.name, coordinates: entry.position }));
    const uniqueJunctions = junctions.filter((point, index) => junctions.findIndex((other) => distance(point.coordinates, other.coordinates) < 1) === index);
    const unresolvedStreets = entries.filter((entry) => !entry.road.nodes.size && !entry.position).map((entry) => entry.name);
    const extentPoints = entries.flatMap((entry) => [...entry.road.nodes.values()]);
    return { segments, locations, junctions: uniqueJunctions, issues, unresolvedStreets, extentPoints, entries: entries.map((entry) => ({ name: entry.name, located: Boolean(entry.road.nodes.size || entry.position), isPlace: entry.isPlace })), endpointsPending: true };
  }

  function createLoader({ fetchFn = (...args) => fetch(...args), storage = null, now = () => Date.now() } = {}) {
    let inFlight;
    function load({ refresh = false } = {}) {
      if (inFlight && !refresh) return inFlight;
      if (!refresh && storage) {
        try {
          const cached = JSON.parse(storage.getItem(CACHE_KEY));
          if (cached?.version === 1 && now() - cached.savedAt >= 0 && now() - cached.savedAt < CACHE_AGE && Array.isArray(cached.elements) && cached.elements.some((element) => element.tags?.highway)) {
            inFlight = Promise.resolve(cached.elements);
            return inFlight;
          }
        } catch { /* A disabled or full cache must not prevent loading. */ }
      }
      inFlight = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 45000);
        const bbox = `${CITY_BOUNDS[0].join(',')},${CITY_BOUNDS[1].join(',')}`;
        const query = `[out:json][timeout:35];(way["highway"]["name"](${bbox}););out body geom;nwr["name"~"Campus III|Manigua|San Judas|Playa Norte",i](${bbox});out center;`;
        try {
          const response = await fetchFn(ENDPOINT, { method: 'POST', body: new URLSearchParams({ data: query }), signal: controller.signal });
          if (!response.ok) throw new Error(`El servicio de calles respondió HTTP ${response.status}.`);
          const data = await response.json();
          if (!Array.isArray(data.elements) || data.remark || !data.elements.some((element) => element.tags?.highway)) throw new Error('El servicio devolvió cartografía incompleta.');
          if (storage) {
            try { storage.setItem(CACHE_KEY, JSON.stringify({ version: 1, savedAt: now(), elements: data.elements })); } catch { /* Cache quota is optional. */ }
          }
          return data.elements;
        } finally { clearTimeout(timer); }
      })();
      inFlight.catch(() => { inFlight = undefined; });
      return inFlight;
    }
    return { load };
  }
  return { CITY_BOUNDS, ENDPOINT, normalize, resolveRoute, createLoader };
});
