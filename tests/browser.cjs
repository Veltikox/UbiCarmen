const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const { chromium } = require('playwright');
const { routeFixture } = require('./fixtures/streets.cjs');
const { resolveRoute } = require('../street-geometry.js');
const context = { window: {} };
runInNewContext(readFileSync(require.resolve('../routes.js'), 'utf8'), context);
const routes = context.window.UbiCarmenRoutes;
const fixture = routeFixture(routes);
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8000';
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=', 'base64');
const endpoint = 'https://overpass-api.de/api/interpreter';
const resultFor = key => resolveRoute(routes[key], fixture.elements);
const countFor = key => { const r = resultFor(key); return 2*r.segments.length+r.junctions.length+r.locations.length; };
const fulfillGeometry = route => route.fulfill({ json: fixture });
const fulfillTile = route => route.fulfill({ contentType: 'image/png', body: pixel });
async function waitForRoute(page) {
  await page.waitForFunction(() => document.getElementById('route-map').getAttribute('aria-busy') === 'false');
}
async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  let passed = 0;
  async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    let requests = 0;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://tile.openstreetmap.org/**', fulfillTile);
    await page.route(endpoint, route => { requests++; return fulfillGeometry(route); });
    await page.route(/\/config\.js(?:\?.*)?$/, route => route.fulfill({contentType:'text/javascript',body:readFileSync(require.resolve('../config.js'),'utf8').replace('preferBundled: true','preferBundled: false')}));
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    await waitForRoute(page);

    await check('Campus lists all 13 streets from Calle 31 to Campus III', async () => {
      assert.equal(await page.locator('#route-select option').count(), 3);
      assert.equal(await page.locator('#street-list li').count(), 13);
      assert.equal(await page.locator('#street-list strong').first().textContent(), 'Calle 31');
      assert.equal(await page.locator('#street-list strong').last().textContent(), 'Campus III');
      assert.equal(await page.locator('#stop-details').isVisible(), false);
      assert.equal(await page.locator('.leaflet-overlay-pane path').count(), countFor('campus'));
      assert.equal(await page.locator('#tile-notice').isVisible(), false);
      assert.equal(await page.locator('iframe').count(), 0);
    });

    await check('Laguna lists all 19 streets and 11 general references without adding stop detours', async () => {
      const previous = await page.locator('.leaflet-overlay-pane path[stroke="#24775d"]').first().elementHandle();
      await page.locator('.leaflet-overlay-pane path[stroke="#24775d"]').first().click({ force: true });
      await page.selectOption('#route-select', 'laguna');
      await waitForRoute(page);
      assert.equal(await previous.evaluate(element => element.isConnected), false);
      await page.locator('.leaflet-popup').waitFor({ state: 'detached' });
      assert.equal(await page.locator('#street-list li').count(), 19);
      assert.equal(await page.locator('#street-list strong').first().textContent(), 'Vicente Guerrero');
      assert.equal(await page.locator('#street-list strong').last().textContent(), 'Calle 39');
      assert.equal(await page.locator('#reference-list li').count(), 11);
      await page.locator('#stop-details summary').click();
      assert.match(await page.locator('#stop-details').textContent(), /no indican el orden de viaje/);
      assert.equal(await page.locator('.leaflet-overlay-pane path[stroke="#24775d"]').count(), 0);
      assert.equal(await page.locator('.leaflet-overlay-pane path').count(), countFor('laguna'));
      assert.equal(await page.locator('.route-dot').first().evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(181, 101, 48)');
    });

    await check('switching routes updates colors without accumulating old geometry or requests', async () => {
      for (const key of ['costera', 'campus', 'laguna', 'costera']) {
        await page.selectOption('#route-select', key); await waitForRoute(page);
        assert.equal(await page.locator('#street-list li').count(), routes[key].streets.length);
        assert.equal(await page.locator('.leaflet-overlay-pane path').count(), countFor(key));
        assert.equal(await page.locator(`.leaflet-overlay-pane path[stroke="${routes[key].color}"]`).count(), resultFor(key).segments.length);
      }
      assert.equal(await page.locator('#street-list strong').nth(5).textContent(), 'Paseo del Mar');
      assert.equal(requests, 1);
      assert.equal(await page.locator('#stop-details').isVisible(), false);
    });

    await check('one map retains routes and simulations when unconfigured traffic is requested', async () => {
      await page.selectOption('#route-select', 'campus'); await waitForRoute(page);
      await page.click('#traffic-toggle');
      assert.equal(await page.locator('#traffic-toggle').isChecked(), false);
      assert.match(await page.locator('#traffic-status').textContent(), /no está conectada/);
      assert.equal(await page.locator('#route-map').isVisible(), true);
      assert.equal(await page.locator('iframe').count(), 0);
      assert.equal(await page.locator('.leaflet-container').count(), 1);
      assert.equal(await page.locator('.bus-marker.simulated').count(), 3);
      const link = new URL(await page.locator('#waze-link').getAttribute('href'));
      assert.equal(link.hostname, 'www.waze.com');
      assert.equal(link.searchParams.has('navigate'), false);
    });

    await check('centering restores the full geographic extent after zooming', async () => {
      const line = page.locator('.leaflet-overlay-pane path[stroke="#24775d"]').first();
      const initial = await line.boundingBox();
      await page.click('.leaflet-control-zoom-in'); await page.waitForTimeout(350);
      const zoomed = await line.boundingBox();
      assert.notEqual(zoomed.width, initial.width);
      await page.click('#center-map'); await page.waitForTimeout(350);
      const centered = await line.boundingBox();
      for (const key of ['x','y','width','height']) assert.ok(Math.abs(centered[key] - initial[key]) <= 1);
    });

    await check('Laguna fits on desktop, tablet and mobile with no clipped geometry or horizontal overflow', async () => {
      await page.selectOption('#route-select', 'laguna'); await waitForRoute(page);
      for (const width of [1440,768,390,320]) {
        await page.setViewportSize({ width, height: 844 });
        await page.click('#center-map');
        await page.waitForFunction(() => {
          const box = document.getElementById('route-map').getBoundingClientRect();
          return [...document.querySelectorAll('.leaflet-overlay-pane path')].every(node => {
            const p = node.getBoundingClientRect();
            return p.left >= box.left && p.right <= box.right && p.top >= box.top && p.bottom <= box.bottom;
          });
        });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
        const size = await page.locator('#route-map').boundingBox();
        assert.ok(size.width > 200 && size.height >= 350);
      }
    });

    await check('keyboard route selection and map picking work without script errors', async () => {
      await page.locator('#route-select').focus();
      await page.keyboard.press('Home'); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
      await waitForRoute(page);
      assert.equal(await page.locator('#route-name').textContent(), 'Laguna de Términos');
      await page.click('#pick-destination');
      assert.equal(await page.locator('#pick-notice').isVisible(), true);
      await page.click('#cancel-pick');
      assert.equal(await page.locator('#pick-notice').isVisible(), false);
      assert.deepEqual(errors, []);
    });

    await check('failed map tiles can be retried independently of route data', async () => {
      const broken = await browser.newPage(); let fail = true;
      await broken.route(/\/config\.js(?:\?.*)?$/, route => route.fulfill({contentType:'text/javascript',body:readFileSync(require.resolve('../config.js'),'utf8').replace('preferBundled: true','preferBundled: false')}));
      await broken.route('https://tile.openstreetmap.org/**', route => fail ? route.abort() : fulfillTile(route));
      await broken.route(endpoint, fulfillGeometry);
      await broken.goto(baseURL, { waitUntil: 'networkidle' });
      assert.equal(await broken.locator('#tile-notice').isVisible(), true);
      fail = false; await broken.click('#retry-tiles');
      await broken.waitForFunction(() => document.getElementById('tile-notice').hidden);
      assert.equal(await broken.locator('#street-list li').count(), 13);
      await broken.close();
    });

    await check('failed street service leaves all lists usable and supports a real retry', async () => {
      const broken = await browser.newPage(); let fail = true;
      await broken.route(/\/config\.js(?:\?.*)?$/, route => route.fulfill({contentType:'text/javascript',body:readFileSync(require.resolve('../config.js'),'utf8').replace('preferBundled: true','preferBundled: false')}));
      await broken.route('https://tile.openstreetmap.org/**', fulfillTile);
      await broken.route(endpoint, route => fail ? route.fulfill({ status: 503, body: 'Unavailable' }) : fulfillGeometry(route));
      await broken.goto(baseURL, { waitUntil: 'networkidle' });
      assert.equal(await broken.locator('#retry-geometry').isVisible(), true);
      assert.equal(await broken.locator('.leaflet-overlay-pane path').count(), 0);
      await broken.selectOption('#route-select', 'laguna'); await waitForRoute(broken);
      assert.equal(await broken.locator('#street-list li').count(), 19);
      assert.equal(await broken.locator('#reference-list li').count(), 11);
      fail = false; await broken.click('#retry-geometry'); await waitForRoute(broken);
      assert.equal(await broken.locator('#retry-geometry').isVisible(), false);
      assert.equal(await broken.locator('.leaflet-overlay-pane path').count(), countFor('laguna'));
      await broken.close();
    });

    await check('a late response never redraws a route selected earlier', async () => {
      const slow = await browser.newPage(); let release;
      await slow.route(/\/config\.js(?:\?.*)?$/, route => route.fulfill({contentType:'text/javascript',body:readFileSync(require.resolve('../config.js'),'utf8').replace('preferBundled: true','preferBundled: false')}));
      const gate = new Promise(resolve => { release = resolve; });
      await slow.route('https://tile.openstreetmap.org/**', fulfillTile);
      await slow.route(endpoint, async route => { await gate; await fulfillGeometry(route); });
      await slow.goto(baseURL, { waitUntil: 'domcontentloaded' });
      await slow.selectOption('#route-select','laguna'); await slow.selectOption('#route-select','costera');
      release(); await waitForRoute(slow);
      assert.equal(await slow.locator('#route-name').textContent(),'Ruta Costera');
      assert.equal(await slow.locator('.leaflet-overlay-pane path[stroke="#24775d"]').count(),0);
      assert.equal(await slow.locator('.leaflet-overlay-pane path').count(),countFor('costera'));
      await slow.close();
    });
    console.log(`${passed} browser checks passed. External services were simulated.`);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
