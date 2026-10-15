/* Google Maps adapter for the map operations used by this application.
 * Uses the supported Maps JavaScript API. No unauthenticated Google tile URLs.
 */
(function (root) {
  'use strict';
  let loading;
  function loadGoogle(key) {
    if (root.google?.maps?.Map) return Promise.resolve(root.google.maps);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => finish(new Error('Google Maps no respondió.')), 12000);
      function finish(error) {
        clearTimeout(timer); delete root.__ubiGoogleReady;
        if (error) { script.remove(); reject(error); } else resolve(root.google.maps);
      }
      root.__ubiGoogleReady = () => finish();
      script.onerror = () => finish(new Error('No se pudo cargar Google Maps.'));
      const url = new URL('https://maps.googleapis.com/maps/api/js');
      url.search = new URLSearchParams({ key, callback: '__ubiGoogleReady', loading: 'async', v: 'weekly', language: 'es', region: 'MX' });
      script.src = url.href; script.async = true; document.head.append(script);
    });
    return loading;
  }
  function adapter(g, settings) {
    const nativePoint = point => Array.isArray(point) ? { lat: point[0], lng: point[1] } : { lat: typeof point.lat === 'function' ? point.lat() : point.lat, lng: typeof point.lng === 'function' ? point.lng() : point.lng };
    class Bounds {
      constructor(points) {
        this.native = new g.LatLngBounds();
        (points || []).forEach(point => this.native.extend(nativePoint(point)));
      }
      getCenter() { return nativePoint(this.native.getCenter()); }
      getSouthWest() { return nativePoint(this.native.getSouthWest()); }
      getNorthEast() { return nativePoint(this.native.getNorthEast()); }
    }
    class GoogleMap {
      constructor(id) {
        this.element = document.getElementById(id); this.layers = new Set(); this.panes = {};
        this.native = new g.Map(this.element, { center: { lat: 18.65, lng: -91.80 }, zoom: 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: true, gestureHandling: 'cooperative', ...(settings.googleMapId ? { mapId: settings.googleMapId } : {}) });
      }
      addLayer(layer) { if (!this.layers.has(layer)) { this.layers.add(layer); layer.attach(this); } return this; }
      removeLayer(layer) { if (this.layers.delete(layer)) layer.detach(); return this; }
      invalidateSize() { g.event.trigger(this.native, 'resize'); }
      getSize() { return { x: this.element.clientWidth, y: this.element.clientHeight }; }
      fitBounds(points, options = {}) {
        const bounds = points instanceof Bounds ? points : new Bounds(points);
        const padding = options.padding || [35, 35];
        this.native.fitBounds(bounds.native, { left: padding[0], right: padding[0], top: padding[1], bottom: padding[1] });
        if (options.maxZoom) g.event.addListenerOnce(this.native, 'idle', () => { if (this.native.getZoom() > options.maxZoom) this.native.setZoom(options.maxZoom); });
      }
      createPane(name) { this.panes[name] = { style: {} }; return this.panes[name]; }
      getPane(name) { return this.panes[name]; }
      on(name, fn) { this.native.addListener(name, event => fn({ latlng: nativePoint(event.latLng) })); return this; }
    }
    class Layer {
      addTo(target) { target.addLayer(this); return this; }
      bindPopup(content) { this.popup = content; return this; }
      openPopup() {
        if (!this.map || !this.popup) return;
        this.info = this.info || new g.InfoWindow(); this.info.setContent(this.popup);
        this.info.setPosition(nativePoint(this.point || this.coordinates[0])); this.info.open({ map: this.map.native });
      }
      detach() { this.info?.close(); this.native?.setMap(null); this.map = null; }
    }
    class Group extends Layer {
      constructor() { super(); this.children = new Set(); }
      addLayer(layer) { this.children.add(layer); if (this.map) this.map.addLayer(layer); return this; }
      attach(map) { this.map = map; this.children.forEach(layer => map.addLayer(layer)); }
      detach() { const map = this.map; this.children.forEach(layer => map?.removeLayer(layer)); this.map = null; }
    }
    class Polyline extends Layer {
      constructor(coordinates, options) { super(); this.coordinates = coordinates; this.options = options; }
      attach(map) {
        this.map = map;
        this.native = new g.Polyline({ map: map.native, path: this.coordinates.map(nativePoint), strokeColor: this.options.color, strokeWeight: this.options.weight, strokeOpacity: this.options.opacity ?? 1, clickable: true });
        this.native.addListener('click', () => this.openPopup());
      }
    }
    class Marker extends Layer {
      constructor(point, options = {}, circle = false) { super(); this.point = point; this.options = options; this.circle = circle; }
      attach(map) {
        this.map = map;
        if (this.circle) {
          this.native = new g.Marker({ map: map.native, position: nativePoint(this.point), title: this.options.title || '', clickable: this.options.interactive !== false, icon: { path: g.SymbolPath.CIRCLE, scale: this.options.radius || 5, fillColor: this.options.fillColor, fillOpacity: this.options.fillOpacity ?? 1, strokeColor: this.options.color, strokeWeight: this.options.weight || 1 } });
          this.native.addListener('click', () => this.openPopup());
          return;
        }
        const owner = this;
        class HTMLMarker extends g.OverlayView {
          onAdd() {
            const icon = owner.options.icon;
            this.element = document.createElement('div');
            this.element.className = icon.className || '';
            // Icon HTML is application-owned, never provider or search text.
            this.element.innerHTML = icon.html;
            Object.assign(this.element.style, { position: 'absolute', width: `${icon.iconSize[0]}px`, height: `${icon.iconSize[1]}px`, zIndex: String(owner.options.zIndexOffset || 1), cursor: 'pointer' });
            this.element.title = owner.options.title || ''; this.element.tabIndex = 0; this.element.setAttribute('role', 'button'); this.element.setAttribute('aria-label', owner.options.title || 'Punto en el mapa');
            this.element.addEventListener('click', event => { event.stopPropagation(); owner.openPopup(); });
            this.element.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); owner.openPopup(); } });
            this.getPanes().overlayMouseTarget.append(this.element);
          }
          draw() {
            if (!this.element) return;
            const pixel = this.getProjection().fromLatLngToDivPixel(new g.LatLng(nativePoint(owner.point)));
            const anchor = owner.options.icon.iconAnchor;
            this.element.style.left = `${pixel.x - anchor[0]}px`; this.element.style.top = `${pixel.y - anchor[1]}px`;
          }
          onRemove() { this.element?.remove(); }
        }
        this.native = new HTMLMarker(); this.native.setMap(map.native);
      }
      setLatLng(point) { this.point = point; if (this.circle) this.native?.setPosition(nativePoint(point)); else this.native?.draw(); return this; }
    }
    class Circle extends Layer {
      constructor(point, options) { super(); this.point = point; this.options = options; }
      attach(map) { this.map = map; this.native = new g.Circle({ map: map.native, center: nativePoint(this.point), radius: this.options.radius, strokeColor: this.options.color, strokeWeight: this.options.weight, fillColor: this.options.color, fillOpacity: this.options.fillOpacity }); }
    }
    return {
      provider: 'google', map: id => new GoogleMap(id), featureGroup: () => new Group(),
      polyline: (points, options) => new Polyline(points, options),
      marker: (point, options) => new Marker(point, options), circleMarker: (point, options) => new Marker(point, options, true), circle: (point, options) => new Circle(point, options),
      divIcon: options => options, latLngBounds: points => new Bounds(points),
      control: { zoom: () => ({ addTo: map => { map.native.setOptions({ zoomControl: true }); } }) },
      setTraffic(map, enabled) { map.googleTraffic = map.googleTraffic || new g.TrafficLayer(); map.googleTraffic.setMap(enabled ? map.native : null); }
    };
  }
  root.UbiCarmenMaps = {
    async choose(settings = {}) {
      if (settings.provider === 'google' && settings.googleBrowserKey) {
        try { return { api: adapter(await loadGoogle(settings.googleBrowserKey), settings), provider: 'google', message: 'Mapa de Google' }; }
        catch { return { api: root.L, provider: 'leaflet', message: 'Google Maps no respondió; se muestra el mapa alternativo.' }; }
      }
      return { api: root.L, provider: 'leaflet', message: settings.provider === 'google' ? 'Google Maps pendiente de clave. Las rutas están disponibles en el mapa alternativo.' : 'Mapa OpenStreetMap' };
    }
  };
})(window);
