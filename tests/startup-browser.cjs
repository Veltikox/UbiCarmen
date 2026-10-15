const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { chromium } = require('playwright');
const googleMapsFixture = require('./fixtures/google-maps.cjs');
const context = { window: {} };
runInNewContext(readFileSync(require.resolve('../route-snapshot.js'),'utf8'),context);
const snapshot = context.window.UbiCarmenRouteSnapshot;
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8000';
const configSource = readFileSync(require.resolve('../config.js'),'utf8');
async function main() {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  let passed=0;
  const check=async(name,fn)=>{await fn();passed++;console.log(`PASS ${name}`);};
  try {
    const page=await browser.newPage({viewport:{width:1440,height:1100}});const errors=[];let externalGeometryRequests=0;
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://**',route=>{if(route.request().url().includes('overpass'))externalGeometryRequests++;return route.abort();});
    await page.goto(baseURL,{waitUntil:'domcontentloaded'});
    await check('a first visit with empty storage immediately renders real bundled streets without an external lookup',async()=>{
      assert.equal(await page.locator('.leaflet-overlay-pane path[stroke="#24775d"]').count(),snapshot.routes.campus.segments.length);
      assert.ok(snapshot.routes.campus.segments.length>0);assert.equal(externalGeometryRequests,0);
      assert.equal(await page.locator('.bus-marker.simulated').count(),3);
      assert.match(await page.locator('#legend-status').textContent(),/precargadas/);
      assert.match(snapshot.source,/OpenStreetMap/);assert.equal(snapshot.license,'ODbL-1.0');
      assert.ok(snapshot.wayIds.every(id=>Number.isInteger(id)&&id>0));
    });
    await check('all three route selections have local street geometry despite failed tiles and no Google key',async()=>{
      for(const [id,color] of [['laguna','#b56530'],['costera','#7358a5'],['campus','#24775d']]){
        await page.selectOption('#route-select',id);
        assert.equal(await page.locator(`.leaflet-overlay-pane path[stroke="${color}"]`).count(),snapshot.routes[id].segments.length);
        assert.equal(await page.locator('.bus-marker.simulated').count(),3);
      }
      assert.equal(externalGeometryRequests,0);
      assert.match(await page.locator('#map-provider-status').textContent(),/pendiente de clave/);
      assert.equal(await page.locator('iframe').count(),0);
    });
    await check('a failed manual verification never clears the already visible streets',async()=>{
      await page.click('#retry-geometry');
      await page.waitForFunction(()=>document.getElementById('route-map').getAttribute('aria-busy')==='false');
      assert.match(await page.locator('#geometry-status').textContent(),/Se conservan las calles precargadas/);
      assert.equal(await page.locator('.leaflet-overlay-pane path[stroke="#24775d"]').count(),snapshot.routes.campus.segments.length);
      assert.equal(await page.locator('.bus-marker.simulated').count(),3);
      assert.deepEqual(errors,[]);
    });
    await check('failure of the Google SDK falls back to one usable map with the streets preserved',async()=>{
      const broken=await browser.newPage();
      await broken.route(/\/config\.js(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:configSource.replace("googleBrowserKey: ''","googleBrowserKey: 'PUBLIC-TEST-KEY'")}));
      await broken.route('https://**',route=>route.abort());
      await broken.goto(baseURL,{waitUntil:'networkidle'});
      assert.match(await broken.locator('#map-provider-status').textContent(),/Google Maps no respondió/);
      assert.equal(await broken.locator('.leaflet-container').count(),1);
      assert.equal(await broken.locator('.leaflet-overlay-pane path[stroke="#24775d"]').count(),snapshot.routes.campus.segments.length);
      await broken.close();
    });
    await check('Google adapter draws the same local streets and buses on one native map and supports its traffic layer',async()=>{
      const google=await browser.newPage(); const sdkErrors=[];
      google.on('pageerror',error=>sdkErrors.push(error.message));
      await google.addInitScript(googleMapsFixture);
      await google.route(/\/config\.js(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:configSource.replace("googleBrowserKey: ''","googleBrowserKey: 'PUBLIC-TEST-KEY'")}));
      await google.route('https://**',route=>route.abort());
      await google.goto(baseURL,{waitUntil:'networkidle'});
      assert.match(await google.locator('#map-provider-status').textContent(),/Mapa de Google/);
      assert.equal(await google.locator('.leaflet-container').count(),0);
      assert.equal(await google.locator('[data-google-mock="true"]').count(),1);
      assert.equal(await google.locator('.bus-marker.simulated').count(),3);
      assert.equal(await google.evaluate(()=>window.__googleTest.polylines.filter(line=>line.map).length),snapshot.routes.campus.segments.length*2);
      await google.click('#traffic-toggle');
      assert.equal(await google.evaluate(()=>window.__googleTest.traffic),true);
      assert.match(await google.locator('#traffic-status').textContent(),/tráfico de Google/);
      await google.selectOption('#route-select','laguna');
      assert.equal(await google.evaluate(()=>window.__googleTest.polylines.filter(line=>line.map).length),snapshot.routes.laguna.segments.length*2);
      assert.equal(await google.locator('.bus-marker.simulated').count(),3);
      await google.click('#traffic-toggle');assert.equal(await google.evaluate(()=>window.__googleTest.traffic),false);
      assert.deepEqual(sdkErrors,[]);await google.close();
    });
    console.log(`${passed} production startup checks passed. No external map/geometry service was reachable.`);
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
