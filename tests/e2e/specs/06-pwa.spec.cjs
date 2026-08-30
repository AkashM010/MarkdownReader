const { test, expect, PREVIEW } = require('../helpers.cjs');
const APP_VERSION = 'v' + require('../../../package.json').version;

const waitPrecached = (page) =>
  page.waitForFunction(
    async () => {
      const keys = await caches.keys();
      const k = keys.find((n) => /precache/.test(n));
      if (!k) return false;
      const c = await caches.open(k);
      return (await c.keys()).length >= 75;
    },
    null,
    { timeout: 90000 }
  );

test.describe('Phase 3 — PWA (production build on :4199)', () => {
  test('PW-01 manifest is linked, well-formed, and its icons are real PNGs', async ({ app }) => {
    await app.boot({ url: PREVIEW });
    const href = await app.page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('/manifest.webmanifest');
    const m = await (await app.page.request.get(PREVIEW + 'manifest.webmanifest')).json();
    expect(m.name).toBe('Read Your MD');
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.icons.map((i) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBeTruthy();
    expect(m.file_handlers[0].action).toBe('/');
    expect(m.file_handlers[0].accept['text/markdown']).toEqual(['.md', '.markdown', '.mdown']);
    expect(m.file_handlers[0].accept['text/plain']).toEqual(['.txt']);
    for (const i of m.icons) {
      const r = await app.page.request.get(PREVIEW + i.src);
      expect(r.status(), i.src).toBe(200);
      expect(r.headers()['content-type']).toContain('image/png');
      const buf = await r.body();
      expect(buf.slice(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    }
  });

  test('PW-02 service worker registers, precaches the shell (~81 files) and announces offline readiness', async ({ app }) => {
    await app.boot({ url: PREVIEW });
    const { page } = app;
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.ready.then(() => true));
    await waitPrecached(page);
    const n = await page.evaluate(async () => {
      const keys = await caches.keys();
      const k = keys.find((x) => /precache/.test(x));
      return (await (await caches.open(k)).keys()).length;
    });
    test.info().annotations.push({ type: 'observed', description: `precache entries: ${n}` });
    expect(n).toBeGreaterThanOrEqual(75);
    await expect(app.toast()).toHaveText('Ready to work offline');
    await expect(page.locator('#appVersion')).toHaveText(APP_VERSION);
    expect(app.infos.some((t) => t.includes('Read Your MD ' + APP_VERSION))).toBeTruthy();
    app.expectNoErrors();
  });

  test('PW-03 fully offline reload: shell, preview, diagrams (incl. lazy diagram chunks) and math all work', async ({ app, context }) => {
    await app.boot({ url: PREVIEW });
    const { page } = app;
    await waitPrecached(page);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await page.waitForSelector('#editor', { timeout: 30000 });
    await expect(page.locator('#renderStatus')).toHaveAttribute('data-state', 'done', { timeout: 30000 });
    await expect(page.locator('#preview h1').first()).toHaveText('A quiet place to write');
    await expect(page.locator('#preview .mermaid svg')).toHaveCount(1);
    await expect(page.locator('#preview .katex').first()).toBeVisible();
    // Diagram types whose renderers are lazily-loaded chunks.
    await app.setContent('```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n\n```mermaid\npie\n  "a": 1\n  "b": 2\n```\n\n$$\n\\sum_{i=1}^n i\n$$');
    await expect(page.locator('#preview .mermaid svg')).toHaveCount(2);
    await expect(page.locator('#preview .katex-display')).toHaveCount(1);
    await expect(page.locator('#renderStatus')).toHaveText('Rendered');
    await context.setOffline(false);
  });

  test('PW-04 a returning visit does not reload-loop', async ({ app }) => {
    await app.boot({ url: PREVIEW });
    await waitPrecached(app.page);
    let loads = 0;
    app.page.on('load', () => loads++);
    await app.page.reload();
    await app.page.waitForSelector('#editor');
    await app.page.waitForTimeout(4000);
    expect(loads).toBe(1);
  });

  test('PW-05 "Install as an app" appears when the browser offers install, and reacts to install events', async ({ app }) => {
    await app.boot({ url: PREVIEW });
    const { page } = app;
    await page.click('#helpBtn');
    const hiddenAttr = await page.locator('#installBtn').evaluate((b) => b.hidden);
    const visible = await page.locator('#installBtn').isVisible();
    test.info().annotations.push({
      type: 'observed',
      description: `before synthetic event: hidden attribute=${hiddenAttr}, visible=${visible} (visible while hidden=true ⇒ CSS display overrides [hidden]; visible with hidden=false ⇒ the browser fired a real beforeinstallprompt)`,
    });
    expect(visible === !hiddenAttr, 'the [hidden] attribute does not actually hide the install button (CSS display rule overrides it)').toBeTruthy();
    await page.evaluate(() => {
      const ev = new Event('beforeinstallprompt');
      window.__prompted = 0;
      ev.prompt = () => { window.__prompted++; };
      ev.userChoice = Promise.resolve({ outcome: 'accepted' });
      window.dispatchEvent(ev);
    });
    await expect(page.locator('#installBtn')).toBeVisible();
    await page.click('#installBtn');
    await expect.poll(() => page.evaluate(() => window.__prompted)).toBe(1);
    await expect(page.locator('#installBtn')).toBeHidden();
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(app.toast()).toHaveText(/Installed/);
  });

  test('PW-05b dismissing the install prompt keeps the app usable', async ({ app }) => {
    await app.boot({ url: PREVIEW });
    const { page } = app;
    await page.evaluate(() => {
      const ev = new Event('beforeinstallprompt');
      ev.prompt = () => {};
      ev.userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(ev);
    });
    await page.click('#helpBtn');
    await page.click('#installBtn');
    await page.waitForTimeout(200);
    app.expectNoErrors();
  });

  test('PW-06 files launched via "Open with" (launchQueue) open in the editor and land in Recent', async ({ app }) => {
    await app.boot({
      url: PREVIEW,
      init: () => {
        Object.defineProperty(window, 'launchQueue', { value: { setConsumer: (fn) => { window.__lq = fn; } }, configurable: true });
      },
    });
    const { page } = app;
    expect(await page.evaluate(() => typeof window.__lq)).toBe('function');
    await app.makeOpfsFile('launched.md', '# Launched\n\nvia file handler');
    await page.evaluate(() => window.__lq({ files: [window.__h['launched.md']] }));
    await expect(page.locator('#fileNameBadge')).toHaveText('launched.md');
    await expect(page.locator('#preview h1')).toHaveText('Launched');
    await expect(page).toHaveTitle('Launched · Read Your MD');
    await page.click('#recentBtn');
    await expect(page.locator('#recentList .recent-name')).toHaveText(['launched.md']);
  });

  test('PW-07 launchQueue with no files is ignored gracefully', async ({ app }) => {
    await app.boot({
      url: PREVIEW,
      init: () => {
        Object.defineProperty(window, 'launchQueue', { value: { setConsumer: (fn) => { window.__lq = fn; } }, configurable: true });
      },
    });
    await app.page.evaluate(() => window.__lq({ files: [] }));
    await app.page.evaluate(() => window.__lq({}));
    await app.page.waitForTimeout(200);
    await expect(app.page.locator('#fileNameBadge')).toHaveText('untitled.md');
    app.expectNoErrors();
  });

  test('PW-08 Google Fonts are runtime-cached after an online visit (soft: needs internet)', async ({ app }) => {
    await app.boot({ url: PREVIEW });
    await app.page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 }).catch(() => {});
    // Runtime caches only fill once the SW controls the page: revisit.
    await app.page.reload();
    await app.page.waitForSelector('#editor');
    await app.page.waitForTimeout(2500);
    const keys = await app.page.evaluate(() => caches.keys());
    test.info().annotations.push({ type: 'observed', description: 'caches: ' + keys.join(', ') });
    expect.soft(keys.some((k) => k.includes('google-fonts'))).toBeTruthy();
  });

  test('PW-09 production bundle: no dev-only paths, manifest linked, SW has precache + skipWaiting + font routes', async ({ app }) => {
    const html = await (await app.page.request.get(PREVIEW)).text();
    expect(html).toContain('rel="manifest"');
    expect(html).not.toContain('/src/main.js');
    const sw = await (await app.page.request.get(PREVIEW + 'sw.js')).text();
    expect(sw).toContain('precacheAndRoute');
    expect(sw).toContain('skipWaiting');
    // The URL patterns are emitted as regex literals, so the dots are backslash-escaped.
    expect(sw).toMatch(/fonts\\?\.googleapis\\?\.com/);
    expect(sw).toMatch(/fonts\\?\.gstatic\\?\.com/);
  });

  test('PW-10 precache list has no duplicate URLs', async ({ app }) => {
    const sw = await (await app.page.request.get(PREVIEW + 'sw.js')).text();
    const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
    const dupes = urls.filter((u, i) => urls.indexOf(u) !== i);
    test.info().annotations.push({ type: 'observed', description: `entries ${urls.length}, duplicates: ${dupes.join(', ') || 'none'}` });
    expect.soft(dupes, 'duplicate precache entries (icons listed via both includeAssets and globPatterns)').toEqual([]);
  });
});
