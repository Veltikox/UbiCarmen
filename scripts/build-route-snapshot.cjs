/* Build the browser's local street snapshot from cached Nominatim responses.
 * Usage: node scripts/build-route-snapshot.cjs /path/to/cached-searches.json
 * Makes no network requests. Never creates coordinates or joins separate ways.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalize, CITY_BOUNDS } = require('../street-geometry.js');
const root = path.resolve(__dirname,'..');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root,'routes.js'),'utf8'),context);
const cache = JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const results = {};
const ids = new Set();
for (const [routeId, route] of Object.entries(context.window.UbiCarmenRoutes)) {
  const segments = [], locations = [], unresolvedStreets = [], entries = [];
  route.streets.forEach((name, streetIndex) => {
    const accepted = new Set([name,...(route.aliases?.[name]||[])].map(normalize));
    const rows = cache[name] || [];
    const ambiguousType = route.streets.some(other => other !== name && normalize(other) === normalize(name));
    const roadType = text => /^(av\.?\b|avenida\b)/i.test(text) ? 'avenue' : /^(calle\b|c\.)/i.test(text) ? 'street' : null;
    const matching = rows.filter(row => {
      const names = [row.name,...['alt_name','official_name','short_name'].flatMap(key=>(row.extratags?.[key]||'').split(';'))].filter(Boolean);
      if (!names.some(candidate => accepted.has(normalize(candidate)))) return false;
      if (ambiguousType && roadType(name) !== roadType(row.name || '')) return false;
      return true;
    });
    const seen = new Set(); let located = false;
    matching.forEach(row => {
      if ((route.places || []).includes(name)) return;
      if (row.category !== 'highway' || row.geojson?.type !== 'LineString' || row.osm_type !== 'way' || seen.has(row.osm_id)) return;
      if (['private','no'].includes(row.extratags?.access) && row.extratags?.bus !== 'yes') return;
      const coordinates = row.geojson.coordinates.map(([lon,lat])=>[lat,lon]);
      if (coordinates.length < 2 || !coordinates.every(([lat,lon])=>Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=CITY_BOUNDS[0][0]&&lat<=CITY_BOUNDS[1][0]&&lon>=CITY_BOUNDS[0][1]&&lon<=CITY_BOUNDS[1][1])) return;
      if (row.extratags?.oneway === '-1') coordinates.reverse();
      segments.push({ name, streetIndex, wayIds: [row.osm_id], runId: `osm-way-${row.osm_id}-stage-${streetIndex}`, coordinates, referenceOnly: true, osmName: row.name });
      seen.add(row.osm_id); ids.add(row.osm_id); located = true;
    });
    if ((route.places||[]).includes(name)) {
      const places = matching.filter(row=>row.category!=='highway');
      if (places.length === 1) {
        const point = [Number(places[0].lat),Number(places[0].lon)];
        if (point.every(Number.isFinite)) { locations.push({name,coordinates:point}); located = true; }
      }
    }
    if (!located) unresolvedStreets.push(name);
    entries.push({name,located,isPlace:(route.places||[]).includes(name)});
  });
  if (!segments.length) throw new Error(`No real street geometry found for ${routeId}`);
  results[routeId] = { segments, locations, junctions: [], extentPoints: segments.flatMap(segment=>segment.coordinates), issues: route.streets.slice(1).map((name,index)=>({index,from:route.streets[index],to:name,reason:'Conexión y sentido del servicio por confirmar'})), unresolvedStreets, entries, endpointsPending: true, referenceOnly: true, source: 'bundled-openstreetmap' };
}
const snapshot = { source: 'OpenStreetMap contributors, Nominatim', license: 'ODbL-1.0', attributionURL: 'https://www.openstreetmap.org/copyright', preparedOn: new Date().toISOString().slice(0,10), wayIds: [...ids].sort((a,b)=>a-b), routes: results };
fs.writeFileSync(path.join(root,'route-snapshot.js'), '/* Real OSM street geometry. Independent ways are not validated bus connections.\n * Source: OpenStreetMap/Nominatim. ODbL: https://www.openstreetmap.org/copyright\n */\nwindow.UbiCarmenRouteSnapshot = '+JSON.stringify(snapshot)+';\n');
for (const [id,result] of Object.entries(results)) console.log(id,result.segments.length,'OSM street sections;',result.unresolvedStreets.length,'unlocated itinerary entries');
