(() => {
  'use strict';
  const routes = window.UbiCarmenRoutes;
  const $ = (id) => document.getElementById(id);
  const select = $('route-select');
  let map;
  let routeLayer;
  let currentRoute;
  let activeView = 'route';
  let wazeLoadedFor;

  function fitRoute() {
    if (!map || !routeLayer) return;
    map.invalidateSize({ animate: false });
    map.fitBounds(routeLayer.getBounds(), { padding: [45, 65], maxZoom: 14, animate: false });
  }

  function wazeURL(route, embed = false) {
    // Show the area, without navigating a car along a bus route.
    const center = route.coordinates[Math.floor(route.coordinates.length / 2)];
    const url = new URL(embed ? 'https://embed.waze.com/iframe' : 'https://www.waze.com/live-map/');
    url.searchParams.set('lat', center[0]);
    url.searchParams.set('lon', center[1]);
    url.searchParams.set('zoom', '13');
    if (embed) url.searchParams.set('ct', 'livemap');
    return url.href;
  }

  function loadWaze() {
    if (wazeLoadedFor === select.value) return;
    $('waze-frame').src = wazeURL(currentRoute, true);
    wazeLoadedFor = select.value;
  }

  function showView(view) {
    activeView = view;
    const traffic = view === 'traffic';
    $('route-map').hidden = traffic;
    $('waze-panel').hidden = !traffic;
    $('map-label').hidden = traffic;
    $('center-map').hidden = traffic;
    $('map-status').hidden = traffic || $('map-status').dataset.loaded === 'true';
    for (const [id, selected] of [['route-view-button', !traffic], ['traffic-view-button', traffic]]) {
      $(id).classList.toggle('active', selected);
      $(id).setAttribute('aria-pressed', String(selected));
    }
    if (traffic) loadWaze();
    else requestAnimationFrame(fitRoute);
  }

  function selectRoute() {
    currentRoute = routes[select.value];
    const route = currentRoute;
    document.documentElement.style.setProperty('--route-color', route.color);
    $('route-name').textContent = route.name;
    $('route-category').textContent = route.category;
    $('route-description').textContent = route.description;
    $('legend-name').textContent = route.name;
    $('reference-count').textContent = `${route.references.length} referencias`;
    $('selection-status').textContent = `${route.name} · trazado de ejemplo`;
    $('waze-link').href = wazeURL(route);
    $('route-map').setAttribute('aria-label', `Mapa ilustrativo: ${route.name}`);
    const items = route.references.map((reference) => {
      const item = document.createElement('li');
      const name = document.createElement('strong');
      const detail = document.createElement('span');
      name.textContent = reference.name;
      detail.textContent = reference.detail;
      item.append(name, detail);
      return item;
    });
    $('reference-list').replaceChildren(...items);
    if (map) {
      // Removing the group clears its outline, line, markers and popups.
      if (routeLayer) map.removeLayer(routeLayer);
      routeLayer = L.featureGroup();
      L.polyline(route.coordinates, { color: '#ffffff', weight: 9, opacity: 0.95 }).addTo(routeLayer);
      L.polyline(route.coordinates, { color: route.color, weight: 5, opacity: 1, lineCap: 'round' }).addTo(routeLayer);
      route.references.forEach((reference, index) => {
        const popup = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = reference.name;
        popup.append(title, document.createElement('br'), document.createTextNode(reference.detail));
        L.circleMarker(route.coordinates[reference.index], { radius: index === 1 ? 6 : 8, color: '#ffffff', weight: 3, fillColor: route.color, fillOpacity: 1 }).bindPopup(popup).addTo(routeLayer);
      });
      routeLayer.addTo(map);
      if (activeView === 'route') fitRoute();
    }
    if (activeView === 'traffic') loadWaze();
  }

  if (typeof L !== 'undefined') {
    map = L.map('route-map', { zoomControl: false, scrollWheelZoom: false }).setView([18.651,-91.804], 13);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
    }).addTo(map);
    let tileCycleFailed = false;
    tiles.on('loading', () => { tileCycleFailed = false; });
    tiles.on('load', () => {
      // Leaflet also emits "load" after failed tiles finish. Keep that error visible.
      $('map-status').dataset.loaded = String(!tileCycleFailed);
      $('map-status').hidden = !tileCycleFailed || activeView === 'traffic';
    });
    tiles.on('tileerror', () => {
      tileCycleFailed = true;
      $('map-status').dataset.loaded = 'false';
      $('map-status').textContent = 'No se pudo cargar parte del mapa. Revisa tu conexión o consulta Waze.';
      $('map-status').hidden = activeView === 'traffic';
    });
    const observer = new ResizeObserver(() => {
      if (activeView === 'route') fitRoute();
    });
    observer.observe($('route-map'));
  } else {
    $('map-status').textContent = 'No se pudo iniciar el mapa. Recarga la página o abre Waze.';
    $('center-map').disabled = true;
  }
  select.addEventListener('change', selectRoute);
  $('center-map').addEventListener('click', fitRoute);
  $('route-view-button').addEventListener('click', () => showView('route'));
  $('traffic-view-button').addEventListener('click', () => showView('traffic'));
  $('show-traffic').addEventListener('click', () => {
    showView('traffic');
    $('traffic-view-button').focus();
    $('traffic-view-button').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  selectRoute();
})();
