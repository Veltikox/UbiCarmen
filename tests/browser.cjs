const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:8000';
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=', 'base64');

async function main() {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  let passed = 0;
  async function check(name, fn) {
    await fn();
    passed++;
    console.log(`PASS ${name}`);
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ contentType: 'image/png', body: pixel }));
    await page.route('https://embed.waze.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<html lang="es"><title>Waze test fixture</title><p>External service test fixture</p></html>' }));
    await page.goto(baseURL, { waitUntil: 'networkidle' });

    await check('initial route renders one line, its outline and three references', async () => {
      assert.equal(await page.locator('#route-select option').count(), 3);
      assert.equal(await page.locator('#route-name').textContent(), 'Campus III');
      assert.equal(await page.locator('.leaflet-overlay-pane path').count(), 5);
      assert.equal(await page.locator('.leaflet-overlay-pane path[stroke="#24775d"]').count(), 1);
      assert.equal(await page.locator('#reference-list li').count(), 3);
      assert.equal(await page.locator('#map-status').isVisible(), false);
      assert.equal(await page.locator('#waze-frame').getAttribute('src'), null);
    });

    await check('selection removes the previous line, markers and popup, and changes colors', async () => {
      const previous = await page.locator('.leaflet-overlay-pane path[stroke="#24775d"]').elementHandle();
      await page.locator('.leaflet-overlay-pane path.leaflet-interactive').last().click({ force: true });
      await page.selectOption('#route-select', 'laguna');
      assert.equal(await previous.evaluate((element) => element.isConnected), false);
      assert.equal(await page.locator('#route-name').textContent(), 'Laguna de Términos');
      assert.equal(await page.locator('.leaflet-overlay-pane path[stroke="#24775d"]').count(), 0);
      assert.equal(await page.locator('.leaflet-overlay-pane path[stroke="#b56530"]').count(), 1);
      await page.locator('.leaflet-popup').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.route-dot').first().evaluate((node) => getComputedStyle(node).backgroundColor), 'rgb(181, 101, 48)');
      for (const key of ['costera', 'campus', 'laguna', 'costera', 'campus']) {
        await page.selectOption('#route-select', key);
        assert.equal(await page.locator('.leaflet-overlay-pane path').count(), 5);
        const expectedColor = await page.evaluate((key) => window.UbiCarmenRoutes[key].color, key);
        assert.equal(await page.locator(`.leaflet-overlay-pane path[stroke="${expectedColor}"]`).count(), 1);
        assert.equal(await page.locator(`.leaflet-overlay-pane path[fill="${expectedColor}"]`).count(), 3);
      }
    });

    await check('Waze is lazy loaded and follows the selection without starting car navigation', async () => {
      await page.click('#traffic-view-button');
      assert.equal(await page.locator('#waze-panel').isVisible(), true);
      assert.equal(await page.locator('#route-map').isVisible(), false);
      assert.equal(await page.locator('#traffic-view-button').getAttribute('aria-pressed'), 'true');
      const initial = await page.locator('#waze-frame').getAttribute('src');
      assert.equal(new URL(initial).hostname, 'embed.waze.com');
      await page.selectOption('#route-select', 'costera');
      const src = new URL(await page.locator('#waze-frame').getAttribute('src'));
      const link = new URL(await page.locator('#waze-link').getAttribute('href'));
      assert.notEqual(src.href, initial);
      assert.equal(link.hostname, 'www.waze.com');
      assert.equal(src.searchParams.get('lat'), link.searchParams.get('lat'));
      assert.equal(src.searchParams.get('lon'), link.searchParams.get('lon'));
      assert.equal(link.searchParams.has('navigate'), false);
      await page.click('#route-view-button');
      assert.equal(await page.locator('#route-map').isVisible(), true);
      assert.equal(await page.locator('#waze-panel').isVisible(), false);
      assert.equal(await page.locator('#legend-name').textContent(), 'Ruta Costera');
      assert.equal(await page.locator('.leaflet-overlay-pane path').count(), 5);
    });

    await check('zoom and centering controls work', async () => {
      await page.waitForTimeout(300);
      const line = page.locator('.leaflet-overlay-pane path[stroke="#7358a5"]');
      const initial = await line.boundingBox();
      await page.click('.leaflet-control-zoom-in');
      await page.waitForTimeout(350);
      const zoomed = await line.boundingBox();
      assert.notEqual(zoomed.width, initial.width);
      await page.click('#center-map');
      await page.waitForTimeout(350);
      const centered = await line.boundingBox();
      // Leaflet can move its internal SVG origin while preserving screen geometry.
      for (const key of ['x', 'y', 'width', 'height']) {
        assert.ok(Math.abs(centered[key] - initial[key]) <= 1, `Center did not restore ${key}`);
      }
    });

    await check('mobile and narrow layouts fit the screen and keep the selector working', async () => {
      for (const width of [390, 320, 768]) {
        await page.setViewportSize({ width, height: 844 });
        await page.selectOption('#route-select', 'laguna');
        const layout = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
        assert.ok(layout.scroll <= layout.width, `Horizontal overflow at ${width}px`);
        assert.equal(await page.locator('#route-name').textContent(), 'Laguna de Términos');
        const mapBox = await page.locator('#route-map').boundingBox();
        assert.ok(mapBox.width > 200 && mapBox.height >= 400);
        // All references must remain inside the map after responsive recentering.
        await page.waitForFunction(() => {
          const box = document.getElementById('route-map').getBoundingClientRect();
          return [...document.querySelectorAll('.leaflet-overlay-pane path[fill="#b56530"]')].every((marker) => {
            const point = marker.getBoundingClientRect();
            return point.left >= box.left && point.right <= box.right && point.top >= box.top && point.bottom <= box.bottom;
          });
        });
      }
    });

    await check('keyboard selection and traffic shortcut remain accessible', async () => {
      await page.locator('#route-select').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#route-name').textContent(), 'Laguna de Términos');
      await page.click('#show-traffic');
      assert.equal(await page.locator('#waze-panel').isVisible(), true);
      assert.equal(await page.locator('#traffic-view-button').evaluate((node) => document.activeElement === node), true);
      assert.deepEqual(errors, []);
    });

    await check('tile failures keep a visible and actionable error', async () => {
      const broken = await browser.newPage();
      await broken.route('https://tile.openstreetmap.org/**', (route) => route.abort());
      await broken.goto(baseURL, { waitUntil: 'networkidle' });
      assert.equal(await broken.locator('#map-status').isVisible(), true);
      assert.match(await broken.locator('#map-status').textContent(), /conexión/);
      await broken.selectOption('#route-select', 'costera');
      assert.equal(await broken.locator('#route-name').textContent(), 'Ruta Costera');
      assert.ok(await broken.locator('#waze-link').getAttribute('href'));
      await broken.close();
    });

    await check('missing map library preserves the route selector and external Waze link', async () => {
      const broken = await browser.newPage();
      const brokenErrors = [];
      broken.on('pageerror', (error) => brokenErrors.push(error.message));
      await broken.route('**/leaflet.js', (route) => route.abort());
      await broken.goto(baseURL, { waitUntil: 'networkidle' });
      assert.match(await broken.locator('#map-status').textContent(), /iniciar el mapa/);
      await broken.selectOption('#route-select', 'laguna');
      assert.equal(await broken.locator('#route-name').textContent(), 'Laguna de Términos');
      assert.equal(await broken.locator('#center-map').isDisabled(), true);
      assert.ok(await broken.locator('#waze-link').getAttribute('href'));
      assert.deepEqual(brokenErrors, []);
      await broken.close();
    });
    console.log(`${passed} browser checks passed.`);
  } finally {
    await browser.close();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
