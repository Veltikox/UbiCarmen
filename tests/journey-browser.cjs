const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { chromium } = require('playwright');
const { routeFixture } = require('./fixtures/streets.cjs');
const { resolveRoute } = require('../street-geometry.js');
const context = { window: {} };
runInNewContext(readFileSync(require.resolve('../routes.js'), 'utf8'), context);
const routes = context.window.UbiCarmenRoutes;
const data = routeFixture(routes);
const campus = resolveRoute(routes.campus,data.elements);
const origin = campus.segments[0].coordinates[0];
const destination = campus.segments.at(-1).coordinates.at(-1);
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8000';
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=', 'base64');
async function prepare(page, traffic = false) {
  await page.route('https://tile.openstreetmap.org/**',route=>route.fulfill({contentType:'image/png',body:pixel}));
  await page.route('https://overpass-api.de/api/interpreter',route=>route.fulfill({json:data}));
  await page.route(/\/config\.js(?:\?.*)?$/,route=>{let body=readFileSync(require.resolve('../config.js'),'utf8').replace('preferBundled: true','preferBundled: false');if(traffic)body=body.replace("tomtomBrowserKey: ''","tomtomBrowserKey: 'PUBLIC-TEST-KEY'");return route.fulfill({contentType:'text/javascript',body});});
  await page.goto(baseURL,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.getElementById('route-map').getAttribute('aria-busy')==='false');
}
async function main(){
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  let passed=0;
  const check=async(name,fn)=>{await fn();passed++;console.log(`PASS ${name}`);};
  try{
    const browserContext=await browser.newContext({viewport:{width:1440,height:1100},geolocation:{latitude:origin[0],longitude:origin[1],accuracy:10},permissions:['geolocation']});
    const page=await browserContext.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await prepare(page);
    await check('simulation is explicitly labeled and does not automatically use the visitor location',async()=>{
      assert.equal(await page.locator('iframe').count(),0);
      assert.equal(await page.locator('.leaflet-container').count(),1);
      assert.equal(await page.locator('.bus-marker.simulated').count(),3);
      assert.match(await page.locator('#simulation-badge').textContent(),/SIN GPS REAL/);
      assert.equal(await page.locator('.point-marker.origin').count(),0);
      assert.equal(await page.locator('#ride-time').textContent(),'—');
    });
    await check('three simulated vehicles move, pause, and resume without recentering the map',async()=>{
      const first=page.locator('.bus-marker').first();const transform=await first.getAttribute('style');
      await page.waitForFunction(before=>document.querySelector('.bus-marker')?.getAttribute('style')!==before,transform);
      await page.click('#pause-simulation');const paused=await first.getAttribute('style');
      await page.waitForTimeout(1200);assert.equal(await first.getAttribute('style'),paused);
      await page.click('#pause-simulation');
      await page.waitForFunction(before=>document.querySelector('.bus-marker')?.getAttribute('style')!==before,paused);
    });
    await check('permission-based user location and a coordinate destination generate a bus-only journey',async()=>{
      await page.click('#locate-user');
      await page.waitForSelector('.point-marker.origin');
      await page.fill('#destination-input',destination.join(', '));await page.click('#destination-submit');
      assert.equal(await page.locator('.point-marker.destination').count(),1);
      assert.equal(await page.locator('.journey-line').count(),1);
      assert.match(await page.locator('#ride-time').textContent(),/^\d+ min$/);
      assert.match(await page.locator('#ride-distance').textContent(),/km/);
      assert.match(await page.locator('#trip-status').textContent(),/No incluye caminata, espera, tráfico ni detenciones/);
      assert.match(await page.locator('#ride-arrival').textContent(),/\d{2}:\d{2}/);
    });
    await check('assumed speed changes the estimate and a destination behind the origin is rejected',async()=>{
      const first=Number((await page.locator('#ride-time').textContent()).split(' ')[0]);
      await page.locator('.estimation-settings summary').click();await page.fill('#average-speed','10');
      const slower=Number((await page.locator('#ride-time').textContent()).split(' ')[0]);
      assert.ok(slower>=first*2-1);
      await page.fill('#average-speed','20');
      const originalMarker = await page.locator('.point-marker.origin').getAttribute('style');
      await browserContext.setGeolocation({latitude:destination[0],longitude:destination[1],accuracy:10});
      await page.waitForFunction(before=>document.querySelector('.point-marker.origin')?.getAttribute('style')!==before,originalMarker);
      await page.fill('#destination-input',origin.join(', '));await page.click('#destination-submit');
      await page.waitForFunction(()=>document.getElementById('trip-status').textContent.includes('antes del origen'));
      assert.equal(await page.locator('#ride-time').textContent(),'—');
      assert.equal(await page.locator('.journey-line').count(),0);
      await browserContext.setGeolocation({latitude:origin[0],longitude:origin[1],accuracy:10});
    });
    await check('address lookup requires a submitted query and choosing a result; HTML labels remain plain text',async()=>{
      let searches=0;
      await page.route('https://nominatim.openstreetmap.org/search?**',route=>{searches++;return route.fulfill({json:[{display_name:'<img src=x onerror=alert(1)> Destino de prueba',lat:String(destination[0]),lon:String(destination[1])}]});});
      await page.fill('#destination-input','Campus III');
      assert.equal(searches,0);
      await page.click('#destination-submit');await page.waitForSelector('#search-results button');
      assert.equal(searches,1);assert.equal(await page.locator('#search-results img').count(),0);
      await page.locator('#search-results button').click();
      assert.equal(await page.locator('#destination-submit').isDisabled(),false);
      assert.equal(await page.locator('#search-results').isVisible(),false);
      assert.equal(await page.locator('.point-marker.destination').count(),1);
    });
    await check('manual map selection works and clearing a trip stops location tracking and clears its layers',async()=>{
      await page.click('#pick-origin');const box=await page.locator('#route-map').boundingBox();
      await page.mouse.click(box.x+box.width*.43,box.y+box.height*.47);
      assert.equal(await page.locator('#pick-notice').isVisible(),false);
      assert.match(await page.locator('#origin-status').textContent(),/Origen elegido/);
      await page.click('#pick-destination');
      const target=await page.locator('#route-map').boundingBox();
      await page.mouse.click(target.x+target.width*.58,target.y+target.height*.53);
      assert.equal(await page.locator('#pick-notice').isVisible(),false);
      assert.equal(await page.locator('.point-marker.destination').count(),1);
      await page.click('#clear-trip');
      assert.equal(await page.locator('.point-marker').count(),0);
      assert.equal(await page.locator('.journey-line').count(),0);
      assert.equal(await page.locator('#ride-time').textContent(),'—');
      assert.equal(await page.locator('#stop-location').isVisible(),false);
    });
    await check('changing a route removes old simulated markers and maintains exactly three current units',async()=>{
      const old=await page.locator('.bus-marker').first().elementHandle();
      await page.selectOption('#route-select','costera');
      await page.waitForFunction(()=>document.getElementById('route-map').getAttribute('aria-busy')==='false');
      assert.equal(await old.evaluate(node=>node.isConnected),false);
      assert.equal(await page.locator('.bus-marker.simulated').count(),3);
      assert.deepEqual(errors,[]);
    });
    await check('denied geolocation offers manual origin instead of claiming a location',async()=>{
      const denied=await browser.newPage();
      await denied.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{value:{watchPosition(success,error){queueMicrotask(()=>error({code:1}));return 1;},clearWatch(){}}}));
      await prepare(denied);await denied.click('#locate-user');
      assert.match(await denied.locator('#origin-status').textContent(),/No se autorizó/);
      assert.equal(await denied.locator('.point-marker.origin').count(),0);
      await denied.close();
    });
    await check('traffic flow and near-route incident alerts use the same map, while distant alerts are excluded',async()=>{
      const traffic=await browser.newPage({viewport:{width:1440,height:1100}});let flowRequests=0;
      await traffic.route('https://api.tomtom.com/traffic/**',route=>{
        if(new URL(route.request().url()).pathname.includes('incidentDetails'))return route.fulfill({json:{incidents:[
          {geometry:{type:'Point',coordinates:[origin[1],origin[0]]},properties:{id:'near',iconCategory:8,events:[{description:'Cierre de prueba'}]}},
          {geometry:{type:'Point',coordinates:[-91.70,18.72]},properties:{id:'far',iconCategory:9,events:[{description:'Obra lejana de prueba'}]}}
        ]}});
        flowRequests++;return route.fulfill({contentType:'image/png',body:pixel});
      });
      await prepare(traffic,true);await traffic.click('#traffic-toggle');
      await traffic.waitForSelector('.incident-marker');
      assert.ok(flowRequests>0);assert.equal(await traffic.locator('.incident-marker').count(),1);
      assert.equal(await traffic.locator('#incident-list li').count(),1);
      assert.match(await traffic.locator('#incident-list').textContent(),/Cierre de prueba/);
      assert.equal(await traffic.locator('iframe').count(),0);assert.equal(await traffic.locator('.leaflet-container').count(),1);
      assert.equal(await traffic.locator('.bus-marker').count(),3);
      assert.equal(await traffic.locator('.leaflet-overlay-pane path[stroke="#24775d"]').count(),campus.segments.length);
      await traffic.click('#traffic-toggle');assert.equal(await traffic.locator('.incident-marker').count(),0);
      assert.equal(await traffic.locator('#incident-list li').count(),0);
      await traffic.close();
    });
    await check('failed incident data is reported as unknown rather than no problems on the route',async()=>{
      const broken=await browser.newPage();
      await broken.route('https://api.tomtom.com/traffic/**',route=>new URL(route.request().url()).pathname.includes('incidentDetails')?route.fulfill({status:503,body:'Unavailable'}):route.fulfill({contentType:'image/png',body:pixel}));
      await prepare(broken,true);await broken.click('#traffic-toggle');
      await broken.waitForFunction(()=>document.getElementById('incident-status').textContent.includes('No se pudieron'));
      assert.match(await broken.locator('#incident-status').textContent(),/No se conoce/);
      assert.equal(await broken.locator('.bus-marker').count(),3);await broken.close();
    });
    await check('mobile retains one usable map and no horizontal overflow',async()=>{
      await page.setViewportSize({width:390,height:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));
      assert.equal(await page.locator('.leaflet-container').count(),1);
      assert.equal(await page.locator('.bus-marker').count(),3);
      assert.equal(await page.locator('#pick-destination').isEnabled(),true);
    });
    console.log(`${passed} journey browser checks passed. Maps, geocoding and traffic were mocked.`);
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
