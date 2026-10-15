const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { normalize, resolveRoute, createLoader } = require('../street-geometry.js');
const { makeWay } = require('./fixtures/streets.cjs');
const context = { window: {} };
runInNewContext(readFileSync(require.resolve('../routes.js'), 'utf8'), context);
const routes = context.window.UbiCarmenRoutes;
const p = [[18.64,-91.83],[18.64,-91.82],[18.645,-91.815],[18.65,-91.81],[18.65,-91.80]];
const roads = [makeWay(1,'Calle A',[1,2],[p[0],p[1]]),makeWay(2,'Calle B',[2,3,4],[p[1],p[2],p[3]]),makeWay(3,'Calle C',[4,5],[p[3],p[4]])];
const route = { streets: ['Calle A','Calle B','Calle C'] };

test('owner itineraries preserve all ordered streets and the confirmed Paseo del Mar name', () => {
  assert.equal(routes.campus.streets.length,13);
  assert.equal(routes.campus.streets[0],'Calle 31');
  assert.equal(routes.campus.streets.at(-1),'Campus III');
  assert.equal(routes.laguna.streets.length,19);
  assert.equal(routes.laguna.streets[0],'Vicente Guerrero');
  assert.equal(routes.laguna.streets.at(-1),'Calle 39');
  assert.equal(routes.costera.streets.length,9);
  assert.equal(routes.costera.streets[0],'Calle 22');
  assert.equal(routes.costera.streets[5],'Paseo del Mar');
  assert.equal(routes.costera.streets.at(-1),'Av. Constelación');
  assert.equal(routes.laguna.stops.length,11);
  assert.equal(routes.laguna.stops[0],'Paradero Mercado AFA');
  assert.equal(routes.laguna.stops.at(-1),'Calle Constitución');
});

test('street matching handles accents, abbreviations and numbered suffixes', () => {
  assert.equal(normalize('Av. Las Américas'),normalize('Avenida Las Americas'));
  assert.equal(normalize('Calle 17-D'),normalize('Calle 17D'));
  assert.notEqual(normalize('Calle 17-D'),normalize('Calle 17'));
});

test('geometry follows every vertex of the specified street between actual shared nodes', () => {
  const result=resolveRoute(route,roads);
  assert.equal(result.segments.length,1);
  assert.deepEqual(result.segments[0].coordinates,[p[1],p[2],p[3]]);
  assert.deepEqual(result.segments[0].wayIds,[2]);
  assert.equal(result.endpointsPending,true);
  assert.ok(result.extentPoints.some(point=>point[1]===p[0][1]));
  assert.ok(result.extentPoints.some(point=>point[1]===p[4][1]));
});

test('near crossings with distinct node IDs are not connected, even at identical coordinates', () => {
  const fake=makeWay(2,'Calle B',[20,3,4],[p[1],p[2],p[3]]);
  const result=resolveRoute(route,[roads[0],fake,roads[2]]);
  assert.equal(result.segments.length,0);
  assert.equal(result.issues[0].from,'Calle A');
});

test('a shorter unlisted road is never used as a shortcut', () => {
  const shortcut=makeWay(99,'Atajo no autorizado',[2,4],[p[1],p[3]]);
  const result=resolveRoute(route,[...roads,shortcut]);
  assert.deepEqual(result.segments[0].coordinates,[p[1],p[2],p[3]]);
  assert.equal(result.segments.some(segment=>segment.wayIds.includes(99)),false);
});

test('only the part between intersections is drawn, excluding branches and arbitrary terminals', () => {
  const extra=makeWay(4,'Calle B',[3,88],[p[2],[18.69,-91.75]]);
  const result=resolveRoute(route,[...roads,extra]);
  assert.deepEqual(result.segments[0].coordinates,[p[1],p[2],p[3]]);
  assert.equal(result.segments[0].coordinates.some(point=>point[0]===18.69),false);
  assert.deepEqual(result.segments.map(segment=>segment.name),['Calle B']);
});

test('one-way streets are respected; an explicit bus exemption permits the reverse direction', () => {
  const backwards=makeWay(2,'Calle B',[4,3,2],[p[3],p[2],p[1]],{oneway:'yes'});
  assert.equal(resolveRoute(route,[roads[0],backwards,roads[2]]).segments.length,0);
  backwards.tags['oneway:bus']='no';
  assert.equal(resolveRoute(route,[roads[0],backwards,roads[2]]).segments.length,1);
});

test('private roads are excluded unless bus access is explicitly allowed', () => {
  const privateRoad=structuredClone(roads[1]); privateRoad.tags.access='private';
  assert.equal(resolveRoute(route,[roads[0],privateRoad,roads[2]]).segments.length,0);
  privateRoad.tags.bus='yes';
  assert.equal(resolveRoute(route,[roads[0],privateRoad,roads[2]]).segments.length,1);
});

test('same-named avenue and street remain distinct, including Laguna 16 de Septiembre', () => {
  const result=resolveRoute({streets:['Avenida 16 de Septiembre','Calle 16 de Septiembre']},[
    makeWay(1,'Av. 16 de Septiembre',[1,2],[p[0],p[1]]),
    makeWay(2,'Calle 16 de Septiembre',[3,4],[p[2],p[3]])
  ]);
  assert.equal(result.issues.length,1);
  assert.equal(result.issues[0].reason,'Cruce o enlace por confirmar');
});

test('references do not add roads or assign arbitrary stop coordinates', () => {
  const result=resolveRoute({...route,stops:['Otra calle','Paradero de prueba']},roads);
  assert.equal(result.segments.length,1);
  assert.deepEqual(result.locations,[]);
});

test('ambiguous places are left unlocated, rather than choosing one arbitrarily', () => {
  const result=resolveRoute({streets:['Playa Norte'],places:['Playa Norte']},[
    {type:'node',id:7,lat:18.66,lon:-91.82,tags:{name:'Playa Norte'}},
    {type:'node',id:8,lat:18.68,lon:-91.82,tags:{name:'Playa Norte'}}
  ]);
  assert.equal(result.locations.length,0);
  assert.deepEqual(result.unresolvedStreets,['Playa Norte']);
});

test('loader shares a request across selections and caches successful data', async () => {
  let requests=0; const cache=new Map();
  const storage={getItem:key=>cache.get(key),setItem:(key,value)=>cache.set(key,value)};
  const loader=createLoader({storage,fetchFn:async()=>{requests++;return {ok:true,json:async()=>({elements:roads})};}});
  const a=loader.load(); const b=loader.load();
  assert.equal(a,b);
  await a; assert.equal(requests,1);
  await createLoader({storage,fetchFn:()=>{throw new Error('Unexpected fetch');}}).load();
  assert.equal(requests,1);
});

test('failed or incomplete data can be retried, and is never cached as valid', async () => {
  let requests=0;
  const loader=createLoader({fetchFn:async()=>{requests++;return requests===1?{ok:false,status:503}:{ok:true,json:async()=>({elements:roads})};}});
  await assert.rejects(loader.load(),/503/);
  assert.deepEqual(await loader.load(),roads);
  const incomplete=createLoader({fetchFn:async()=>({ok:true,json:async()=>({elements:roads,remark:'timeout'})})});
  await assert.rejects(incomplete.load(),/incompleta/);
});
