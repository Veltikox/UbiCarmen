(() => {
  'use strict';
  const routes = window.UbiCarmenRoutes;
  const geometry = window.UbiCarmenGeometry;
  const $ = (id) => document.getElementById(id);
  const select = $('route-select');
  let storage;
  try { storage = window.localStorage; } catch { /* Storage may be disabled. */ }
  const loader = geometry.createLoader({ storage });
  let map;
  let tiles;
  let routeLayer;
  let currentRoute;
  let activeView = 'route';
  let selectionVersion = 0;
  let wazeLoadedFor;
  let routeBounds;
  let loadedElements;
  const resolvedRoutes = new Map();

  function fitRoute() {
    if (!map) return;
    map.invalidateSize({ animate: false });
    const size = map.getSize();
    const padding = [Math.min(45, size.x / 8), Math.min(65, size.y / 6)];
    map.fitBounds(routeBounds || geometry.CITY_BOUNDS, { padding, maxZoom: 14, animate: false });
  }

  function wazeURL(embed = false) {
    const center = routeBounds ? routeBounds.getCenter() : { lat: 18.65, lng: -91.79 };
    const url = new URL(embed ? 'https://embed.waze.com/iframe' : 'https://www.waze.com/live-map/');
    url.searchParams.set('lat', center.lat.toFixed(6));
    url.searchParams.set('lon', center.lng.toFixed(6));
    url.searchParams.set('zoom', '13');
    if (embed) url.searchParams.set('ct', 'livemap');
    return url.href;
  }

  function updateWazeLink() {
    $('waze-link').href = wazeURL();
    if (activeView === 'traffic') loadWaze();
  }

  function loadWaze() {
    const url = wazeURL(true);
    if (wazeLoadedFor === url) return;
    $('waze-frame').src = url;
    wazeLoadedFor = url;
  }

  function showView(view) {
    activeView = view;
    const traffic = view === 'traffic';
    $('route-map').hidden = traffic;
    $('waze-panel').hidden = !traffic;
    $('map-label').hidden = traffic;
    $('center-map').hidden = traffic;
    $('tile-notice').hidden = traffic || $('tile-notice').dataset.failed !== 'true';
    for (const [id, selected] of [['route-view-button', !traffic], ['traffic-view-button', traffic]]) {
      $(id).classList.toggle('active', selected);
      $(id).setAttribute('aria-pressed', String(selected));
    }
    if (traffic) loadWaze();
    else requestAnimationFrame(fitRoute);
  }

  function clearRoute() {
    if (map && routeLayer) map.removeLayer(routeLayer);
    routeLayer = null;
    routeBounds = null;
  }

  function renderItinerary(route) {
    const items = route.streets.map((name, index) => {
      const item = document.createElement('li');
      const label = document.createElement('strong');
      const status = document.createElement('span');
      label.textContent = name;
      status.textContent = index === 0 ? 'Inicio del recorrido' : index === route.streets.length - 1 ? 'Parada final' : `Tramo ${index + 1}`;
      item.append(label, status);
      return item;
    });
    $('street-list').replaceChildren(...items);
    $('reference-list').replaceChildren(...route.stops.map((name) => {
      const item = document.createElement('li');
      item.textContent = name;
      return item;
    }));
    $('stop-details').hidden = !route.stops.length;
    $('reference-heading').textContent = `Paraderos · ${route.stops.length} referencias generales`;
    $('reference-count').textContent = `${route.streets.length} tramos`;
  }

  function renderIssues(result) {
    const descriptions = result.issues.map((issue) => `${issue.from} → ${issue.to}: ${issue.reason.toLowerCase()}.`);
    if (result.unresolvedStreets.length) descriptions.unshift(`Sin localizar de forma inequívoca: ${result.unresolvedStreets.join(', ')}.`);
    descriptions.push('Faltan los cruces exactos del inicio y la parada final. No se prolongan las calles hasta extremos arbitrarios.');
    const items = descriptions.map((description) => {
      const item = document.createElement('li'); item.textContent = description; return item;
    });
    $('connection-list').replaceChildren(...items);
    $('connection-details').hidden = false;
  }

  function drawGeometry(result, route) {
    if (!map) return;
    clearRoute();
    routeLayer = L.featureGroup();
    const allPoints = [];
    result.segments.forEach((segment) => {
      allPoints.push(...segment.coordinates);
      L.polyline(segment.coordinates, { color: '#ffffff', weight: 9, opacity: 0.95 }).addTo(routeLayer);
      const popup = document.createElement('span'); popup.textContent = segment.name;
      L.polyline(segment.coordinates, { color: route.color, weight: 5, lineCap: 'round' }).bindPopup(popup).addTo(routeLayer);
    });
    result.junctions.forEach((junction) => {
      L.circleMarker(junction.coordinates, { radius: 4, color: '#ffffff', weight: 2, fillColor: route.color, fillOpacity: 1, interactive: false }).addTo(routeLayer);
    });
    result.locations.forEach((place) => {
      allPoints.push(place.coordinates);
      const popup = document.createElement('span'); popup.textContent = `${place.name} · referencia cartográfica, no paradero confirmado`;
      L.circleMarker(place.coordinates, { radius: 7, color: '#ffffff', weight: 3, fillColor: route.color, fillOpacity: 1 }).bindPopup(popup).addTo(routeLayer);
    });
    // Include the extent of EVERY matched itinerary street, not only drawn sections.
    // This prevents Laguna's southern/western references from being left offscreen.
    allPoints.push(...result.extentPoints);
    routeBounds = allPoints.length ? L.latLngBounds(allPoints) : null;
    routeLayer.addTo(map);
    if (activeView === 'route') fitRoute();
    updateWazeLink();
  }

  async function loadRoute(version, refresh = false) {
    const route = currentRoute;
    $('geometry-status').textContent = 'Buscando las calles y sus cruces…';
    $('retry-geometry').hidden = true;
    $('route-map').setAttribute('aria-busy', 'true');
    try {
      const elements = await loader.load({ refresh });
      if (version !== selectionVersion) return;
      if (loadedElements !== elements) { resolvedRoutes.clear(); loadedElements = elements; }
      if (!resolvedRoutes.has(route)) resolvedRoutes.set(route, geometry.resolveRoute(route, elements));
      const result = resolvedRoutes.get(route);
      drawGeometry(result, route);
      renderIssues(result);
      $('geometry-status').textContent = result.segments.length ? `${result.segments.length} tramos dibujados sobre calles · conexiones y extremos por confirmar.` : 'No hay tramos conectados que puedan dibujarse con certeza. Revisa los enlaces pendientes.';
      $('selection-status').textContent = `${route.name} · ${result.segments.length ? 'trazado parcial' : 'trazado pendiente'}`;
      $('legend-status').textContent = result.segments.length ? 'Tramos sobre calles · parcial' : 'Calles por localizar';
    } catch (error) {
      if (version !== selectionVersion) return;
      $('geometry-status').textContent = 'No se pudieron consultar las calles. El itinerario sigue disponible; reintenta para cargar el trazado.';
      $('retry-geometry').hidden = false;
      $('selection-status').textContent = `${route.name} · cartografía del recorrido pendiente`;
      $('legend-status').textContent = 'Trazado pendiente';
    } finally {
      if (version === selectionVersion) $('route-map').setAttribute('aria-busy', 'false');
    }
  }

  function selectRoute() {
    currentRoute = routes[select.value];
    const route = currentRoute;
    const version = ++selectionVersion;
    clearRoute();
    document.documentElement.style.setProperty('--route-color', route.color);
    $('route-name').textContent = route.name;
    $('route-category').textContent = route.category;
    $('route-description').textContent = route.description;
    $('legend-name').textContent = route.name;
    $('legend-status').textContent = 'Localizando calles…';
    $('selection-status').textContent = `${route.name} · cargando trazado`;
    $('route-map').setAttribute('aria-label', `Mapa de calles: ${route.name}`);
    $('connection-details').hidden = true;
    $('connection-list').replaceChildren();
    renderItinerary(route);
    fitRoute();
    updateWazeLink();
    loadRoute(version);
  }

  if (typeof L !== 'undefined') {
    map = L.map('route-map', { zoomControl: false, scrollWheelZoom: false });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, keepBuffer: 3,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
    }).addTo(map);
    const failedTiles = new Set();
    const tileKey = (event) => `${event.coords.z}/${event.coords.x}/${event.coords.y}`;
    function updateTileNotice() {
      $('tile-notice').dataset.failed = String(failedTiles.size > 0);
      $('tile-notice').hidden = !failedTiles.size || activeView === 'traffic';
    }
    tiles.on('tileerror', (event) => { failedTiles.add(tileKey(event)); updateTileNotice(); });
    tiles.on('tileload tileunload', (event) => { failedTiles.delete(tileKey(event)); updateTileNotice(); });
    new ResizeObserver(() => { if (activeView === 'route') fitRoute(); }).observe($('route-map'));
  } else {
    $('tile-notice').textContent = 'No se pudo iniciar el mapa. Recarga la página o abre Waze.';
    $('tile-notice').dataset.failed = 'true';
    $('tile-notice').hidden = false;
    $('center-map').disabled = true;
  }
  select.addEventListener('change', selectRoute);
  $('center-map').addEventListener('click', fitRoute);
  $('retry-geometry').addEventListener('click', () => loadRoute(selectionVersion, true));
  $('retry-tiles').addEventListener('click', () => tiles?.redraw());
  $('route-view-button').addEventListener('click', () => showView('route'));
  $('traffic-view-button').addEventListener('click', () => showView('traffic'));
  $('show-traffic').addEventListener('click', () => {
    showView('traffic');
    $('traffic-view-button').focus();
    $('traffic-view-button').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  selectRoute();
})();
