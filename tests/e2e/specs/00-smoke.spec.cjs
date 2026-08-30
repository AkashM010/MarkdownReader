const { test, expect } = require('../helpers.cjs');
const APP_VERSION = 'v' + require('../../../package.json').version;

test.describe('Smoke', () => {
  test('S-01 app boots, default document renders, no page errors', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await expect(page.locator('#preview h1').first()).toHaveText('A quiet place to write');
    await expect(page.locator('#renderStatus')).toHaveText('Rendered');
    await expect(page.locator('#preview .mermaid svg')).toHaveCount(1);
    await expect(page.locator('#preview .katex').first()).toBeVisible();
    app.expectNoErrors();
  });

  test('S-02 package version shown in status bar, help dialog, and console.info', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await expect(page.locator('#appVersion')).toHaveText(APP_VERSION);
    await expect(page.locator('#helpVersion')).toHaveText(APP_VERSION);
    expect(app.infos.some((t) => t.includes('Read Your MD ' + APP_VERSION)), 'console.info boot line: ' + app.infos.join(' | ')).toBeTruthy();
  });

  test('S-03 all v2 controls are present with the correct initial state', async ({ app }) => {
    await app.boot();
    const { page } = app;
    for (const id of ['readerBtn', 'exportBtn', 'recentBtn', 'helpBtn', 'spellBtn', 'readTime', 'appVersion']) {
      await expect(page.locator('#' + id), id).toBeVisible();
    }
    await expect(page.locator('#findBar')).toBeHidden();
    await expect(page.locator('#helpOverlay')).toBeHidden();
    await expect(page.locator('#installBtn')).toBeHidden();
    await expect(page.locator('#readerBtn')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#spellBtn')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#exportMenu')).not.toHaveClass(/open/);
  });

  test('S-04 tab title derives from H1 and reading time is populated on boot', async ({ app }) => {
    await app.boot();
    await expect(app.page).toHaveTitle('A quiet place to write · Read Your MD');
    await expect(app.page.locator('#readTime')).toHaveText(/^\d+ min$/);
    await expect(app.page.locator('#readTime')).not.toHaveText('0 min');
  });

  test('S-05 no duplicate element ids in the DOM', async ({ app }) => {
    await app.boot();
    const dupes = await app.page.evaluate(() => {
      const seen = new Map();
      document.querySelectorAll('[id]').forEach((el) => seen.set(el.id, (seen.get(el.id) || 0) + 1));
      return [...seen].filter(([, n]) => n > 1).map(([id]) => id);
    });
    expect(dupes).toEqual([]);
  });

  test('S-06 sample document documents the new shortcuts and the \\$ escape', async ({ app }) => {
    await app.boot();
    const c = await app.content();
    expect(c).toContain('Ctrl+F');
    expect(c).toContain('Ctrl+P');
    expect(c).toContain('Reader mode');
    expect(c).toContain('\\$');
  });

  test('S-07 dev boot: service-worker registration does not spam the console', async ({ app }) => {
    await app.boot();
    await app.page.waitForTimeout(1000);
    test.info().annotations.push({ type: 'observed', description: 'warnings: ' + (app.warnings.join(' | ') || 'none') });
    app.expectNoErrors();
  });
});
