(async () => {
  'use strict';
  const routes = window.UbiCarmenRoutes;
  const geometry = window.UbiCarmenGeometry;
  const trips = window.UbiCarmenTrips;
  const live = window.UbiCarmenLive;
  const config = window.UbiCarmenConfig;
  const mapChoice = await window.UbiCarmenMaps.choose(config.map);
  const L = mapChoice.api;
  const usingGoogle = mapChoice.provider === 'google';
  const $ = id => document.getElementById(id);
  const select = $('route-select');
  const simulated = config.simulation?.enabled === true;
  let storage;
  try { storage = window.localStorage; } catch { /* Storage is optional. */ }
  const loader = geometry.createLoader({ storage });
  let map, tiles, routeLayer, tripLayer, trafficLayer, userLayer, destinationLayer;
  let currentRoute, currentResult, routeBounds, loadedElements;
  let selectionVersion = 0;
  const resolvedRoutes = new Map();
  let origin, destination, locationWatch, pickMode;
  let journeyPlan;
  let searchVersion = 0, searchController, lastSearchAt = 0;
  const busMarkers = new Map();
  let vehicles = [], gpsController, gpsTimer, gpsBusy = false;
  let simulationPaused = false, simulationMeters = 0, lastFrame = performance.now();
  let simulationTrack;
  let incidentLayer, incidents = [], incidentController, incidentTimer;
  let trafficVersion = 0;
  let incidentsState = 'off';
  const arrivalFormat = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });

  function speedKph() {
    const value = $('average-speed').valueAsNumber;
    return Number.isFinite(value) && value >= 5 && value <= 60 ? value : null;
  }
  function fitRoute() {
    if (!map) return;
    map.invalidateSize({ animate: false });
    const points = [];
    if (routeBounds) points.push(routeBounds.getSouthWest(), routeBounds.getNorthEast());
    if (origin) points.push(origin.point);
    if (destination) points.push(destination.point);
    const bounds = points.length ? L.latLngBounds(points) : geometry.CITY_BOUNDS;
    const size = map.getSize();
    map.fitBounds(bounds, { padding: [Math.min(45, size.x / 8), Math.min(65, size.y / 6)], maxZoom: 14, animate: false });
  }
  function updateWazeLink() {
    const center = routeBounds ? routeBounds.getCenter() : { lat: 18.65, lng: -91.79 };
    const url = new URL('https://www.waze.com/live-map/');
    url.search = new URLSearchParams({ lat: center.lat.toFixed(6), lon: center.lng.toFixed(6), zoom: '13' });
    $('waze-link').href = url.href;
  }
  function removeLayer(layer) { if (map && layer) map.removeLayer(layer); }
  function clearBuses() {
    busMarkers.forEach(marker => removeLayer(marker)); busMarkers.clear();
  }
  function clearRoute() {
    removeLayer(routeLayer); removeLayer(tripLayer); clearBuses();
    routeLayer = null; tripLayer = null; routeBounds = null;
    currentResult = null; simulationTrack = null; simulationMeters = 0;
  }
  function renderItinerary(route) {
    $('street-list').replaceChildren(...route.streets.map((name, index) => {
      const item = document.createElement('li'); const label = document.createElement('strong'); const status = document.createElement('span');
      label.textContent = name;
      status.textContent = index === 0 ? 'Inicio del recorrido' : index === route.streets.length - 1 ? 'Parada final' : `Tramo ${index + 1}`;
      item.append(label, status); return item;
    }));
    $('reference-list').replaceChildren(...route.stops.map(name => { const item = document.createElement('li'); item.textContent = name; return item; }));
    $('stop-details').hidden = !route.stops.length;
    $('reference-heading').textContent = `Paraderos · ${route.stops.length} referencias generales`;
    $('reference-count').textContent = `${route.streets.length} tramos`;
  }
  function renderIssues(result) {
    const descriptions = result.issues.map(issue => `${issue.from} → ${issue.to}: ${issue.reason.toLowerCase()}.`);
    if (result.unresolvedStreets.length) descriptions.unshift(`Sin localizar de forma inequívoca: ${result.unresolvedStreets.join(', ')}.`);
    descriptions.push('Faltan los cruces exactos del inicio y la parada final. Los puntos de acceso del cálculo son aproximados; confirma el paradero.');
    $('connection-list').replaceChildren(...descriptions.map(description => { const item = document.createElement('li'); item.textContent = description; return item; }));
    $('connection-details').hidden = false;
  }
  function drawGeometry(result, route) {
    if (!map) return;
    removeLayer(routeLayer); removeLayer(tripLayer); clearBuses();
    routeLayer = L.featureGroup();
    const allPoints = [...result.extentPoints];
    result.segments.forEach(segment => {
      allPoints.push(...segment.coordinates);
      L.polyline(segment.coordinates, { color: '#ffffff', weight: 9, opacity: 0.95 }).addTo(routeLayer);
      const popup = document.createElement('span'); popup.textContent = segment.name;
      L.polyline(segment.coordinates, { color: route.color, weight: 5, lineCap: 'round' }).bindPopup(popup).addTo(routeLayer);
    });
    result.junctions.forEach(junction => L.circleMarker(junction.coordinates, { radius: 4, color: '#ffffff', weight: 2, fillColor: route.color, fillOpacity: 1, interactive: false }).addTo(routeLayer));
    result.locations.forEach(place => {
      allPoints.push(place.coordinates);
      const popup = document.createElement('span'); popup.textContent = `${place.name} · referencia cartográfica, no paradero confirmado`;
      L.circleMarker(place.coordinates, { radius: 7, color: '#ffffff', weight: 3, fillColor: route.color, fillOpacity: 1 }).bindPopup(popup).addTo(routeLayer);
    });
    routeBounds = allPoints.length ? L.latLngBounds(allPoints) : null;
    routeLayer.addTo(map);
    simulationTrack = trips.buildTracks(result.segments).sort((a, b) => b.cumulative.at(-1) - a.cumulative.at(-1))[0];
    simulationMeters = 0; lastFrame = performance.now();
    fitRoute(); updateWazeLink(); renderVehicles();
  }
  async function loadRoute(version, refresh = false) {
    const route = currentRoute;
    $('geometry-status').textContent = 'Buscando las calles y sus cruces…';
    $('retry-geometry').hidden = true; $('route-map').setAttribute('aria-busy', 'true');
    try {
      const elements = await loader.load({ refresh });
      if (version !== selectionVersion) return;
      if (loadedElements !== elements) { resolvedRoutes.clear(); loadedElements = elements; }
      if (!resolvedRoutes.has(route)) resolvedRoutes.set(route, geometry.resolveRoute(route, elements));
      currentResult = resolvedRoutes.get(route);
      drawGeometry(currentResult, route); renderIssues(currentResult);
      $('geometry-status').textContent = currentResult.segments.length ? `${currentResult.segments.length} tramos sobre calles · trazado parcial, con enlaces por confirmar.` : 'No hay tramos conectados que puedan dibujarse con certeza. Revisa los enlaces pendientes.';
      $('selection-status').textContent = `${route.name} · ${currentResult.segments.length ? 'trazado parcial' : 'trazado pendiente'}`;
      $('legend-status').textContent = currentResult.segments.length ? 'Tramos sobre calles · parcial' : 'Calles por localizar';
      renderIncidents();
    } catch {
      if (version !== selectionVersion) return;
      $('geometry-status').textContent = currentResult?.segments.length ? 'No se pudieron verificar los cruces en línea. Se conservan las calles precargadas; puedes reintentar.' : 'No se pudieron consultar las calles. El itinerario sigue disponible; reintenta para cargar el trazado.';
      $('retry-geometry').hidden = false;
      $('selection-status').textContent = `${route.name} · ${currentResult?.segments.length ? 'calles precargadas' : 'cartografía pendiente'}`;
      $('legend-status').textContent = currentResult?.segments.length ? 'Calles precargadas · parcial' : 'Trazado pendiente';
    } finally {
      if (version === selectionVersion) { $('route-map').setAttribute('aria-busy', 'false'); updateJourney(); renderVehicles(); }
    }
  }
  function selectRoute() {
    currentRoute = routes[select.value]; const route = currentRoute; const version = ++selectionVersion;
    clearRoute();
    renderIncidents();
    document.documentElement.style.setProperty('--route-color', route.color);
    $('route-name').textContent = route.name; $('route-category').textContent = route.category;
    $('route-description').textContent = route.description; $('legend-name').textContent = route.name;
    $('legend-status').textContent = 'Localizando calles…'; $('selection-status').textContent = `${route.name} · cargando trazado`;
    $('route-map').setAttribute('aria-label', `Mapa de ruta, viaje y camiones: ${route.name}`);
    $('connection-details').hidden = true; $('connection-list').replaceChildren();
    renderItinerary(route); updateJourney(); renderVehicles(); fitRoute(); updateWazeLink();
    const prepared = window.UbiCarmenRouteSnapshot?.routes?.[select.value];
    if (config.routing?.preferBundled !== false && prepared?.segments?.length) {
      currentResult = prepared; drawGeometry(prepared, route); renderIssues(prepared);
      $('geometry-status').textContent = `${prepared.segments.length} secciones de calles precargadas de OpenStreetMap. Los enlaces entre calles y el sentido del servicio están por confirmar.`;
      $('legend-status').textContent = 'Calles precargadas · conexiones pendientes';
      $('selection-status').textContent = `${route.name} · calles disponibles desde el inicio`;
      $('retry-geometry').textContent = 'Verificar cruces en línea'; $('retry-geometry').hidden = false;
      $('route-map').setAttribute('aria-busy', 'false'); updateJourney(); renderIncidents();
    } else loadRoute(version);
  }
  function updateJourney() {
    removeLayer(tripLayer); tripLayer = null;
    $('ride-time').textContent = '—'; $('ride-distance').textContent = '—'; $('ride-arrival').textContent = '—';
    const plan = trips.planTrip(currentResult, origin?.point, destination?.point, { speedKph: speedKph(), maxAccessMeters: config.estimation.maxAccessMeters });
    journeyPlan = plan;
    if (!plan.ok) { $('trip-status').textContent = plan.message; return; }
    if (map && plan.coordinates.length >= 2) tripLayer = L.polyline(plan.coordinates, { color: '#176fba', weight: 8, opacity: 0.9, className: 'journey-line' }).addTo(map);
    $('ride-distance').textContent = `${(plan.rideMeters / 1000).toLocaleString('es-MX', { maximumFractionDigits: 2 })} km`;
    if (plan.rideSeconds === null) { $('trip-status').textContent = 'Indica un promedio supuesto de 5 a 60 km/h para estimar el tiempo.'; return; }
    const minutes = Math.max(1, Math.ceil(plan.rideSeconds / 60));
    $('ride-time').textContent = `${minutes} min`;
    $('ride-arrival').textContent = arrivalFormat.format(new Date(Date.now() + plan.rideSeconds * 1000));
    $('trip-status').textContent = `Estimación a ${plan.speedKph} km/h, solo en camión. Acceso a la ruta a ${Math.round(plan.accessMeters)} m del origen y descenso a ${Math.round(plan.egressMeters)} m del destino, en línea recta; confirma los paraderos. No incluye caminata, espera, tráfico ni detenciones.`;
  }
  function pointMarker(point, kind, title) {
    if (!map) return null;
    const icon = L.divIcon({ className: `point-marker ${kind}`, html: `<span>${kind === 'origin' ? 'A' : 'B'}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
    const text = document.createElement('span'); text.textContent = title;
    return L.marker(point, { icon, title }).bindPopup(text).addTo(map);
  }
  function setOrigin(point, label = 'Origen elegido en el mapa', accuracy = null) {
    if (!live.validCityPoint(point)) { $('origin-status').textContent = 'El origen está fuera de la zona de Ciudad del Carmen.'; return; }
    origin = { point, label };
    removeLayer(userLayer);
    if (map) {
      userLayer = L.featureGroup();
      const marker = pointMarker(point, 'origin', label); marker.addTo(userLayer);
      if (accuracy) L.circle(point, { radius: accuracy, color: '#176fba', weight: 1, fillOpacity: 0.05, interactive: false }).addTo(userLayer);
      userLayer.addTo(map);
    }
    $('origin-status').textContent = accuracy ? `${label} · precisión aproximada ${Math.round(accuracy)} m` : label;
    updateJourney();
  }
  function stopLocation() {
    if (locationWatch !== undefined) navigator.geolocation?.clearWatch(locationWatch);
    locationWatch = undefined; $('stop-location').hidden = true; $('locate-user').disabled = false;
  }
  function locateUser() {
    if (!window.isSecureContext || !navigator.geolocation) { $('origin-status').textContent = 'Tu navegador necesita HTTPS y geolocalización. También puedes marcar el origen en el mapa.'; return; }
    stopLocation(); $('origin-status').textContent = 'Buscando tu ubicación…'; $('locate-user').disabled = true;
    locationWatch = navigator.geolocation.watchPosition(position => {
      $('locate-user').disabled = false; $('stop-location').hidden = false;
      if (position.coords.accuracy > 150) { $('origin-status').textContent = 'La ubicación es poco precisa. Espera una mejor señal o marca el origen en el mapa.'; return; }
      const first = !origin;
      setOrigin([position.coords.latitude, position.coords.longitude], 'Tu ubicación', position.coords.accuracy);
      if (first) fitRoute();
    }, error => {
      $('locate-user').disabled = false;
      if (error.code === 1) {
        stopLocation();
        $('origin-status').textContent = 'No se autorizó la ubicación. Puedes marcar el origen en el mapa.';
      } else {
        // Position-unavailable/timeout errors can be temporary during a watch.
        // Keep listening so the next valid fix can update the origin.
        $('stop-location').hidden = false;
        $('origin-status').textContent = 'Se perdió temporalmente la señal. Esperando ubicación; se conserva el último origen elegido.';
      }
    }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 });
  }
  function setDestination(point, label = 'Destino elegido en el mapa') {
    if (!live.validCityPoint(point)) { $('search-status').textContent = 'El destino debe estar en Ciudad del Carmen.'; return; }
    searchVersion++; searchController?.abort(); $('destination-submit').disabled = false;
    destination = { point, label }; removeLayer(destinationLayer); destinationLayer = pointMarker(point, 'destination', label);
    $('destination-input').value = label; $('search-results').replaceChildren(); $('search-results').hidden = true;
    $('search-status').textContent = 'Destino seleccionado. El viaje sigue el sentido de la ruta elegida.';
    setPickMode(null); updateJourney(); fitRoute();
  }
  function setPickMode(mode) {
    pickMode = mode;
    $('pick-origin').setAttribute('aria-pressed', String(mode === 'origin'));
    $('pick-destination').setAttribute('aria-pressed', String(mode === 'destination'));
    $('pick-notice').hidden = !mode;
    $('pick-instruction').textContent = mode === 'origin' ? 'Toca el mapa para marcar tu origen.' : 'Toca el mapa para marcar el destino.';
    $('route-map').classList.toggle('picking', Boolean(mode));
  }
  async function searchDestination(event) {
    event.preventDefault(); const query = $('destination-input').value.trim();
    const coordinates = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (coordinates) { setDestination([Number(coordinates[1]), Number(coordinates[2])], query); return; }
    if (query.length < 3) { $('search-status').textContent = 'Escribe al menos 3 caracteres o marca el destino en el mapa.'; return; }
    if (Date.now() - lastSearchAt < 1100) { $('search-status').textContent = 'Espera un momento antes de otra búsqueda.'; return; }
    lastSearchAt = Date.now(); const version = ++searchVersion;
    searchController?.abort(); searchController = new AbortController();
    $('search-status').textContent = 'Buscando el destino…'; $('destination-submit').disabled = true;
    $('search-results').replaceChildren(); $('search-results').hidden = true;
    try {
      const results = await live.searchPlaces(query, { signal: searchController.signal });
      if (version !== searchVersion) return;
      $('search-results').replaceChildren(...results.map(result => {
        const item = document.createElement('li'); const button = document.createElement('button');
        button.type = 'button'; button.textContent = result.label; button.addEventListener('click', () => setDestination(result.point, result.label)); item.append(button); return item;
      }));
      $('search-results').hidden = !results.length;
      $('search-status').textContent = results.length ? 'Elige el resultado correcto.' : 'No se encontró el destino. Prueba otra dirección o márcalo en el mapa.';
    } catch {
      if (version === searchVersion) $('search-status').textContent = 'No se pudo buscar la dirección. Puedes marcar el destino en el mapa.';
    } finally { if (version === searchVersion) $('destination-submit').disabled = false; }
  }
  function busIcon() {
    return L.divIcon({ className: `bus-marker ${simulated ? 'simulated' : ''}`, html: '<svg class="icon" aria-hidden="true"><use href="#i-bus"/></svg>', iconSize: [32, 32], iconAnchor: [16, 16] });
  }
  function renderVehicles() {
    let visible;
    if (simulated) visible = simulationTrack ? trips.simulationFrame(simulationTrack, simulationMeters, { count: config.simulation.vehiclesPerRoute, routeId: select.value }) : [];
    else visible = vehicles.filter(vehicle => vehicle.routeId === select.value && Date.now() - Date.parse(vehicle.timestamp) <= config.vehicles.maxAgeMs);
    const ids = new Set(visible.map(vehicle => vehicle.id));
    busMarkers.forEach((marker, id) => { if (!ids.has(id)) { removeLayer(marker); busMarkers.delete(id); } });
    if (map) visible.forEach(vehicle => {
      let marker = busMarkers.get(vehicle.id);
      if (!marker) {
        const label = vehicle.label || `Camión ${vehicle.id}`;
        const popup = document.createElement('span'); popup.textContent = `${label} · ${simulated ? 'SIMULACIÓN, sin GPS real' : 'posición GPS reportada'}`;
        marker = L.marker([vehicle.lat, vehicle.lon], { icon: busIcon(), title: label, zIndexOffset: 500 }).bindPopup(popup).addTo(map);
        busMarkers.set(vehicle.id, marker);
      } else marker.setLatLng([vehicle.lat, vehicle.lon]);
    });
    $('vehicle-count').textContent = String(visible.length);
    if (simulated) $('vehicle-status').textContent = simulationTrack ? `${visible.length} camiones simulados en un tramo conectado · ${simulationPaused ? 'pausados' : 'en movimiento'}. No son posiciones reales.` : 'La simulación necesita un tramo conectado de la ruta. Reintenta cargar las calles.';
    else if (!config.vehicles.url) $('vehicle-status').textContent = 'La ubicación GPS de los camiones todavía no está disponible.';
    else if (visible.length) $('vehicle-status').textContent = `${visible.length} unidades con posiciones recientes en esta ruta.`;
    $('vehicle-mode').textContent = simulated ? 'SIMULACIÓN · SIN GPS REAL' : 'POSICIONES GPS';
  }
  async function refreshGPS() {
    clearTimeout(gpsTimer);
    if (simulated || !config.vehicles.url || gpsBusy || document.hidden) return;
    gpsBusy = true; gpsController = new AbortController();
    try {
      vehicles = await live.fetchVehicles(config.vehicles, { base: location.href, signal: gpsController.signal });
      $('vehicle-status').textContent = vehicles.length ? 'Posiciones GPS recibidas.' : 'No hay posiciones recientes disponibles.';
    } catch { vehicles = []; $('vehicle-status').textContent = 'No se pudo actualizar la ubicación de los camiones.'; }
    finally {
      gpsBusy = false; renderVehicles();
      if (!document.hidden) gpsTimer = setTimeout(refreshGPS, Math.max(10000, config.vehicles.pollIntervalMs));
    }
  }
  function renderIncidents() {
    removeLayer(incidentLayer); incidentLayer = null; $('incident-list').replaceChildren();
    if (!$('traffic-toggle').checked) { $('incident-status').textContent = 'Activa Tráfico para consultar avisos del proveedor. Sin conexión no se puede afirmar que la ruta esté libre.'; return; }
    if (incidentsState === 'unavailable') { $('incident-status').textContent = 'El flujo de tráfico de Google se muestra en el mapa. Para listar cierres, obras o accidentes hace falta conectar el proveedor de incidentes.'; return; }
    if (incidentsState === 'error') { $('incident-status').textContent = 'No se pudieron consultar los incidentes. No se conoce el estado de esta ruta.'; return; }
    if (incidentsState !== 'ready') { $('incident-status').textContent = 'Consultando incidentes actuales…'; return; }
    if (!currentResult?.segments.length) { $('incident-status').textContent = 'Falta cargar el trazado para identificar qué incidentes están cerca de esta ruta.'; return; }
    const nearby = trips.nearbyIncidents(currentResult, incidents);
    $('incident-status').textContent = nearby.length ? `${nearby.length} avisos del proveedor cerca de la ruta seleccionada.` : 'El proveedor no devolvió avisos cercanos. Esto no garantiza una ruta libre de incidencias.';
    if (map) incidentLayer = L.featureGroup().addTo(map);
    nearby.forEach(incident => {
      const text = [incident.label, incident.description, incident.from && `Desde ${incident.from}`, incident.to && `hasta ${incident.to}`].filter(Boolean).join(' · ');
      const item = document.createElement('li'); const button = document.createElement('button');
      button.type = 'button'; button.textContent = text;
      button.addEventListener('click', () => { if (map) map.fitBounds(L.latLngBounds(incident.coordinates), { padding: [50, 70], maxZoom: 16 }); $('route-map').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
      item.append(button); $('incident-list').append(item);
      if (map) {
        const popup = document.createElement('span'); popup.textContent = `${text}. Aviso cercano al trazado; confirma si afecta al camión.`;
        if (incident.coordinates.length > 1) L.polyline(incident.coordinates, { color: '#b74e4c', weight: 5, dashArray: '5 5', className: 'incident-line' }).bindPopup(popup).addTo(incidentLayer);
        const icon = L.divIcon({ className: 'incident-marker', html: '<span aria-hidden="true">!</span>', iconSize: [26,26], iconAnchor: [13,13] });
        L.marker(incident.coordinates[0], { icon, title: incident.label, zIndexOffset: 600 }).bindPopup(popup).addTo(incidentLayer);
      }
    });
  }
  async function refreshIncidents(version) {
    clearTimeout(incidentTimer); incidentController?.abort();
    if (!$('traffic-toggle').checked || !config.traffic.tomtomBrowserKey || document.hidden) return;
    incidentController = new AbortController(); incidentsState = 'loading'; incidents = []; renderIncidents();
    try {
      const data = await live.fetchIncidents(config.traffic.tomtomBrowserKey, { signal: incidentController.signal });
      if (version !== trafficVersion) return;
      incidents = data; incidentsState = 'ready'; renderIncidents();
    } catch {
      if (version !== trafficVersion || document.hidden) return;
      incidents = []; incidentsState = 'error'; renderIncidents();
    } finally {
      if (version === trafficVersion && $('traffic-toggle').checked && !document.hidden) incidentTimer = setTimeout(() => refreshIncidents(version), 120000);
    }
  }
  function updateTraffic() {
    const version = ++trafficVersion;
    clearTimeout(incidentTimer); incidentController?.abort();
    incidents = []; incidentsState = 'off';
    const enabled = $('traffic-toggle').checked;
    if (usingGoogle && map) L.setTraffic(map, enabled);
    removeLayer(trafficLayer); trafficLayer = null;
    if (!enabled) { $('traffic-status').textContent = 'Tráfico e incidentes desactivados. Waze está disponible como consulta externa.'; renderIncidents(); return; }
    if (usingGoogle && map) {
      $('traffic-status').textContent = 'Capa de tráfico de Google en el mismo mapa. No modifica el tiempo supuesto del viaje.';
      if (config.traffic.tomtomBrowserKey) refreshIncidents(version);
      else { incidentsState = 'unavailable'; renderIncidents(); }
      return;
    }
    const url = live.trafficURL(config.traffic.tomtomBrowserKey);
    if (!url || !map) { $('traffic-toggle').checked = false; $('traffic-status').textContent = 'La capa de tráfico aún no está conectada. Puedes consultar los reportes en Waze.'; renderIncidents(); return; }
    $('traffic-status').textContent = 'Cargando el tráfico en este mismo mapa…';
    trafficLayer = L.tileLayer(url, { pane: 'trafficPane', opacity: 0.8, maxZoom: 19, attribution: 'Traffic &copy; TomTom' });
    let failed = false;
    trafficLayer.on('loading', () => { failed = false; });
    trafficLayer.on('tileerror', () => { if (version === trafficVersion) { failed = true; $('traffic-status').textContent = 'No se pudo cargar el tráfico. La ruta del camión sigue disponible.'; } });
    trafficLayer.on('load', () => { if (!failed && version === trafficVersion) $('traffic-status').textContent = 'Tráfico de TomTom en el mismo mapa. Los avisos cercanos se muestran en la lista; no modifican el tiempo estimado.'; });
    trafficLayer.addTo(map);
    refreshIncidents(version);
  }

  $('average-speed').value = String(config.estimation.defaultAverageSpeedKph);
  $('pause-simulation').hidden = !simulated;
  $('refresh-vehicles').hidden = simulated || !config.vehicles.url;
  $('simulation-badge').hidden = !simulated;
  $('map-provider-status').textContent = mapChoice.message;
  if (usingGoogle) $('traffic-status').textContent = 'Activa Tráfico para ver el flujo vial de Google en este mismo mapa.';
  $('footer-mode').textContent = simulated ? 'Proyecto independiente · Simulación de camiones; no son posiciones GPS reales' : 'Proyecto independiente · Posiciones proporcionadas por el servicio GPS configurado';
  if (typeof L !== 'undefined') {
    map = L.map('route-map', { zoomControl: false, scrollWheelZoom: false });
    map.createPane('trafficPane'); map.getPane('trafficPane').style.zIndex = '350';
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    if (!usingGoogle) {
    tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, keepBuffer: 3, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' }).addTo(map);
    const failedTiles = new Set(); const tileKey = event => `${event.coords.z}/${event.coords.x}/${event.coords.y}`;
    const updateTileNotice = () => { $('tile-notice').hidden = !failedTiles.size; };
    tiles.on('tileerror', event => { failedTiles.add(tileKey(event)); updateTileNotice(); });
    tiles.on('tileload tileunload', event => { failedTiles.delete(tileKey(event)); updateTileNotice(); });
    }
    map.on('click', event => {
      if (pickMode === 'origin') { stopLocation(); setOrigin([event.latlng.lat, event.latlng.lng]); setPickMode(null); fitRoute(); }
      else if (pickMode === 'destination') setDestination([event.latlng.lat, event.latlng.lng]);
    });
    new ResizeObserver(fitRoute).observe($('route-map'));
  } else {
    $('tile-notice-text').textContent = 'No se pudo iniciar el mapa. Recarga la página.';
    $('tile-notice').hidden = false;
    ['center-map','pick-origin','pick-destination','traffic-toggle'].forEach(id => { $(id).disabled = true; });
  }
  select.addEventListener('change', selectRoute);
  $('center-map').addEventListener('click', fitRoute);
  $('retry-geometry').addEventListener('click', () => loadRoute(selectionVersion, true));
  $('retry-tiles').addEventListener('click', () => tiles?.redraw());
  $('locate-user').addEventListener('click', locateUser);
  $('stop-location').addEventListener('click', () => { stopLocation(); $('origin-status').textContent = 'Seguimiento detenido; se conserva el último origen elegido.'; });
  $('pick-origin').addEventListener('click', () => setPickMode(pickMode === 'origin' ? null : 'origin'));
  $('pick-destination').addEventListener('click', () => { setPickMode(pickMode === 'destination' ? null : 'destination'); $('route-map').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
  $('cancel-pick').addEventListener('click', () => setPickMode(null));
  $('destination-form').addEventListener('submit', searchDestination);
  $('destination-input').addEventListener('input', () => {
    searchVersion++; searchController?.abort(); $('destination-submit').disabled = false;
    destination = null; removeLayer(destinationLayer); destinationLayer = null;
    $('search-results').replaceChildren(); $('search-results').hidden = true; $('search-status').textContent = ''; updateJourney();
  });
  $('clear-trip').addEventListener('click', () => {
    stopLocation(); searchVersion++; searchController?.abort(); $('destination-submit').disabled = false;
    origin = null; destination = null; removeLayer(userLayer); removeLayer(destinationLayer); userLayer = null; destinationLayer = null;
    $('destination-input').value = ''; $('origin-status').textContent = 'Elige tu ubicación o marca el origen en el mapa.';
    $('search-results').replaceChildren(); $('search-results').hidden = true; $('search-status').textContent = ''; setPickMode(null); updateJourney(); fitRoute();
  });
  $('average-speed').addEventListener('input', updateJourney);
  $('traffic-toggle').addEventListener('change', updateTraffic);
  $('pause-simulation').addEventListener('click', () => {
    simulationPaused = !simulationPaused; lastFrame = performance.now();
    $('pause-simulation').textContent = simulationPaused ? 'Reanudar simulación' : 'Pausar simulación';
    $('pause-simulation').setAttribute('aria-pressed', String(simulationPaused)); renderVehicles();
  });
  $('refresh-vehicles').addEventListener('click', refreshGPS);
  document.addEventListener('visibilitychange', () => {
    lastFrame = performance.now();
    if (document.hidden) { clearTimeout(gpsTimer); gpsController?.abort(); clearTimeout(incidentTimer); incidentController?.abort(); }
    else { refreshGPS(); renderVehicles(); if ($('traffic-toggle').checked) refreshIncidents(trafficVersion); }
  });
  setInterval(() => {
    const now = performance.now(); const elapsed = Math.min(2, (now - lastFrame) / 1000); lastFrame = now;
    if (document.hidden) return;
    if (simulated && !simulationPaused && simulationTrack && speedKph()) simulationMeters += elapsed * speedKph() / 3.6;
    if (journeyPlan?.ok && journeyPlan.rideSeconds !== null) $('ride-arrival').textContent = arrivalFormat.format(new Date(Date.now() + journeyPlan.rideSeconds * 1000));
    renderVehicles();
  }, 1000);
  selectRoute(); refreshGPS();
})();
