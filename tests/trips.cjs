const assert = require('node:assert/strict');
const { test } = require('node:test');
const trips = require('../trip-planner.js');
const live = require('../live-services.js');
const points = [[18.64,-91.83],[18.64,-91.82],[18.65,-91.82],[18.65,-91.81]];
const result = { segments: [
  { runId: 0, streetIndex: 1, coordinates: points.slice(0,3) },
  { runId: 0, streetIndex: 2, coordinates: points.slice(2) }
] };
test('the trip retains every bend of the bus itinerary, rather than taking a direct shortcut', () => {
  const plan = trips.planTrip(result,points[0],points[3],{speedKph:20});
  assert.equal(plan.ok,true);
  assert.deepEqual(plan.coordinates,points);
  assert.ok(plan.rideMeters > trips.meters(points[0],points[3]) * 1.2);
  assert.ok(Math.abs(plan.rideSeconds-plan.rideMeters/ (20/3.6))<0.01);
});
test('projection clips the trip exactly inside the first and last selected road edges', () => {
  const origin=[18.6401,-91.825]; const destination=[18.6501,-91.815];
  const plan=trips.planTrip(result,origin,destination,{speedKph:20});
  assert.equal(plan.ok,true);
  assert.ok(trips.meters(plan.coordinates[0],[18.64,-91.825])<0.01);
  assert.ok(trips.meters(plan.coordinates.at(-1),[18.65,-91.815])<0.01);
  assert.ok(plan.accessMeters>10 && plan.accessMeters<12);
});
test('a destination behind the origin is rejected instead of reversing the bus route', () => {
  assert.equal(trips.planTrip(result,points[3],points[0]).code,'direction');
});
test('a missing connection cannot be bridged even if its endpoint coordinates coincide', () => {
  const broken={segments:[result.segments[0],{...result.segments[1],runId:10}]};
  assert.equal(trips.planTrip(broken,points[0],points[3]).code,'gap');
});
test('near misses with an equal run ID are not joined into a straight connector', () => {
  const broken={segments:[result.segments[0],{...result.segments[1],coordinates:[[18.6501,-91.82],points[3]]}]};
  assert.equal(trips.buildTracks(broken.segments).length,2);
  assert.equal(trips.planTrip(broken,points[0],points[3]).ok,false);
});
test('invalid, missing, remote and identical points do not produce arrival times', () => {
  assert.equal(trips.planTrip(result,null,points[3]).code,'points');
  assert.equal(trips.planTrip(result,[NaN,-91.83],points[3]).ok,false);
  assert.equal(trips.planTrip(result,[18.70,-91.70],points[3]).code,'far');
  assert.equal(trips.planTrip(result,points[0],points[0]).code,'same-point');
  assert.equal(trips.planTrip({segments:[]},points[0],points[3]).code,'geometry');
});
test('a missing or unrealistic assumed speed is not turned into a duration', () => {
  for(const speedKph of [null,0,200,NaN]) assert.equal(trips.planTrip(result,points[0],points[3],{speedKph}).rideSeconds,null);
});
test('simulation advances three explicit simulated units along the street vertices', () => {
  const track=trips.buildTracks(result.segments)[0];
  const start=trips.simulationFrame(track,0,{routeId:'campus',count:3});
  const later=trips.simulationFrame(track,100,{routeId:'campus',count:3});
  assert.equal(start.length,3);
  assert.notDeepEqual([start[0].lat,start[0].lon],[later[0].lat,later[0].lon]);
  for(const vehicle of later){
    assert.equal(vehicle.simulated,true); assert.match(vehicle.id,/^SIM-campus-/);
    assert.ok(Math.min(...trips.projections(track,[vehicle.lat,vehicle.lon]).map(p=>p.offset))<0.01);
  }
});
test('finishing a simulated run creates a new trip ID and never drives back against the route', () => {
  const track=trips.buildTracks(result.segments)[0];
  const before=trips.simulationFrame(track,0,{count:1})[0];
  const after=trips.simulationFrame(track,track.cumulative.at(-1)+50,{count:1})[0];
  assert.notEqual(before.id,after.id);
  assert.equal(after.direction,'forward');
  assert.deepEqual(trips.simulationFrame(null,10),[]);
  assert.equal(trips.simulationFrame(track,1,{count:0}).length,1);
});
test('future GPS adapter discards stale, malformed, off-city and duplicate older positions', () => {
  const now=Date.now();
  const item={id:'BUS-1',routeId:'campus',lat:18.64,lon:-91.82,timestamp:new Date(now).toISOString(),direction:'forward'};
  const data=live.parseVehicles({vehicles:[item,{...item,timestamp:new Date(now-10000).toISOString()},{...item,id:'stale',timestamp:new Date(now-90000).toISOString()},{...item,id:'far',lat:10},{...item,id:'future',timestamp:new Date(now+60000).toISOString()},{...item,id:'invalid',lat:'18.64'}]},{now});
  assert.equal(data.length,1); assert.equal(data[0].id,'BUS-1');
  assert.equal(data[0].timestamp,item.timestamp);
  assert.throws(()=>live.parseVehicles({positions:[]}),/Formato/);
});
test('traffic tiles use a supported separate provider without embedding a second map', () => {
  assert.equal(live.trafficURL(''),null);
  const url=live.trafficURL('test&public=key');
  assert.match(url,/api\.tomtom\.com\/traffic\/map\/4\/tile\/flow\/relative0/);
  assert.match(url,/key=test%26public%3Dkey/);
});
test('service URLs require HTTPS and reject credential-bearing URLs', () => {
  assert.equal(live.serviceURL('/api/vehicles','https://example.org/app/'),'https://example.org/api/vehicles');
  assert.throws(()=>live.serviceURL('http://example.org/gps'),/HTTPS/);
  assert.throws(()=>live.serviceURL('https://user:password@example.org/gps'),/credenciales/);
});
test('address search is bounded to the city and discards outside results', async () => {
  let request;
  const results=await live.searchPlaces('Mercado',{fetchFn:async url=>{request=new URL(url);return {ok:true,json:async()=>[{lat:'18.64',lon:'-91.82',display_name:'Mercado local'},{lat:'19.4',lon:'-99.1',display_name:'Otra ciudad'}]};}});
  assert.equal(request.searchParams.get('bounded'),'1');
  assert.equal(results.length,1); assert.equal(results[0].label,'Mercado local');
});
test('nearby route alerts include a crossing line with distant endpoints, but exclude other parts of the city', () => {
  const incidents=[
    {id:'point',coordinates:[[18.6401,-91.825]]},
    {id:'crossing',coordinates:[[18.635,-91.825],[18.645,-91.825]]},
    {id:'far',coordinates:[[18.70,-91.70]]}
  ];
  assert.deepEqual(trips.nearbyIncidents(result,incidents).map(item=>item.id),['point','crossing']);
  assert.deepEqual(trips.nearbyIncidents({segments:[]},incidents),[]);
});
test('provider incident parsing respects GeoJSON coordinate order and rejects expired or invalid data', () => {
  const now=Date.now();
  const item={geometry:{type:'Point',coordinates:[-91.825,18.64]},properties:{id:'1',iconCategory:8,events:[{description:'Cierre de prueba'}]}};
  const data=live.parseIncidents({incidents:[item,{...item,properties:{...item.properties,id:'old',endTime:new Date(now-1000).toISOString()}},{...item,geometry:{type:'Point',coordinates:[18.64,-91.825]}}]},now);
  assert.equal(data.length,1); assert.equal(data[0].label,'Calle cerrada');
  assert.deepEqual(data[0].coordinates,[[18.64,-91.825]]);
});
