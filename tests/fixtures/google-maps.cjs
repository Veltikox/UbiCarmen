// Minimal SDK contract mock. Does not fetch or emulate real Google cartography.
module.exports = function googleMapsFixture() {
  const state = window.__googleTest = { maps: [], polylines: [], overlays: new Set(), traffic: false };
  class LatLng {
    constructor(value, longitude) { this.value = typeof value === 'object' ? { lat: typeof value.lat === 'function' ? value.lat() : value.lat, lng: typeof value.lng === 'function' ? value.lng() : value.lng } : { lat: value, lng: longitude }; }
    lat() { return this.value.lat; } lng() { return this.value.lng; }
  }
  class LatLngBounds {
    constructor() { this.points = []; }
    extend(point) { this.points.push(new LatLng(point)); return this; }
    getSouthWest() { return new LatLng(Math.min(...this.points.map(p=>p.lat())),Math.min(...this.points.map(p=>p.lng()))); }
    getNorthEast() { return new LatLng(Math.max(...this.points.map(p=>p.lat())),Math.max(...this.points.map(p=>p.lng()))); }
    getCenter() { const a=this.getSouthWest(),b=this.getNorthEast();return new LatLng((a.lat()+b.lat())/2,(a.lng()+b.lng())/2); }
  }
  class NativeMap {
    constructor(element) { this.element=element;this.zoom=12;this.listeners={};this.panes={overlayMouseTarget:document.createElement('div')};element.append(this.panes.overlayMouseTarget);element.dataset.googleMock='true';state.maps.push(this); }
    setOptions() {} getZoom() {return this.zoom;} setZoom(value){this.zoom=value;}
    fitBounds(bounds){this.bounds=bounds;state.overlays.forEach(overlay=>overlay.draw());}
    addListener(name,fn){this.listeners[name]=fn;return {remove(){}};}
  }
  class NativeLayer {
    constructor(options={}){this.options=options;this.setMap(options.map||null);}
    setMap(map){this.map=map;} addListener(){return {remove(){}};}
    setPosition(point){this.point=point;}
  }
  class Polyline extends NativeLayer {constructor(options){super(options);state.polylines.push(this);}}
  class OverlayView {
    setMap(map){if(this.map){this.onRemove();state.overlays.delete(this);}this.map=map;if(map){this.onAdd();state.overlays.add(this);this.draw();}}
    getPanes(){return this.map.panes;}
    getProjection(){return {fromLatLngToDivPixel:point=>{
      const b=this.map.bounds;const a=b?.getSouthWest()||new LatLng(18.59,-91.88),c=b?.getNorthEast()||new LatLng(18.74,-91.60);
      return {x:(point.lng()-a.lng())/(c.lng()-a.lng()||1)*this.map.element.clientWidth,y:(c.lat()-point.lat())/(c.lat()-a.lat()||1)*this.map.element.clientHeight};
    }};}
  }
  class TrafficLayer {setMap(map){state.traffic=Boolean(map);}}
  class InfoWindow {setContent(){}setPosition(){}open(){}close(){}}
  window.google={maps:{Map:NativeMap,LatLng,LatLngBounds,Polyline,Marker:NativeLayer,Circle:NativeLayer,OverlayView,TrafficLayer,InfoWindow,SymbolPath:{CIRCLE:'circle'},event:{trigger(){},addListenerOnce(map,name,fn){queueMicrotask(fn);}}}};
};
