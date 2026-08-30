const { test, expect } = require('../helpers.cjs');
const APP_VERSION = 'v' + require('../../../package.json').version;

test.describe('Cross-browser (Firefox / WebKit fallbacks) @xbrowser', () => {
  test('XB-01 boots and renders the sample document (diagram + math) without page errors @xbrowser', async ({ app }) => {
    await app.boot();
    await expect(app.page.locator('#preview h1').first()).toHaveText('A quiet place to write');
    await expect(app.page.locator('#preview .mermaid svg')).toHaveCount(1);
    await expect(app.page.locator('#preview .katex').first()).toBeVisible();
    await expect(app.page.locator('#appVersion')).toHaveText(APP_VERSION);
    app.expectNoErrors();
  });

  test('XB-02 Recent-files control is hidden where the File System Access API is missing @xbrowser', async ({ app }) => {
    await app.boot();
    const hasFS = await app.page.evaluate(() => typeof window.showOpenFilePicker === 'function');
    test.skip(hasFS, 'browser supports the File System Access API');
    await expect(app.page.locator('#recentBtn')).toBeHidden();
  });

  test('XB-03 reader mode, help overlay and spellcheck toggle @xbrowser', async ({ app }) => {
    await app.boot();
    await app.page.locator('#editor').focus();
    await app.press('Control+\\');
    await expect(app.page.locator('body')).toHaveClass(/reader-mode/);
    await app.press('Control+\\');
    await app.press('Control+/');
    await expect(app.page.locator('#helpOverlay')).toBeVisible();
    await app.press('Escape');
    await app.page.click('#spellBtn');
    expect(await app.page.locator('#editor').evaluate((e) => e.spellcheck)).toBe(true);
  });

  test('XB-04 find & replace @xbrowser', async ({ app }) => {
    await app.boot();
    await app.setContent('cat dog cat');
    await app.setCaret(0);
    await app.press('Control+f');
    await app.page.keyboard.type('cat');
    await expect(app.page.locator('#findCount')).toHaveText('1/2');
    await app.page.click('#findToggleReplace');
    await app.page.fill('#replaceInput', 'cow');
    await app.page.click('#replaceAll');
    expect(await app.content()).toBe('cow dog cow');
  });

  test('XB-05 smart lists and Tab @xbrowser', async ({ app }) => {
    await app.boot();
    await app.setContent('- item');
    await app.setCaret(6);
    await app.press('Enter');
    expect(await app.content()).toBe('- item\n- ');
    await app.press('Tab');
    expect(await app.content()).toBe('- item\n  - ');
  });

  test('XB-06 front matter card @xbrowser', async ({ app }) => {
    await app.boot();
    await app.setContent('---\ntitle: X\n---\n# Doc');
    await expect(app.page.locator('#preview .front-matter dd')).toHaveText('X');
    await expect(app.page.locator('#preview h1')).toHaveText('Doc');
  });

  test('XB-07 Ctrl+S downloads a .md copy where in-place saving is unavailable @xbrowser', async ({ app }) => {
    await app.boot();
    const hasFS = await app.page.evaluate(() => typeof window.showOpenFilePicker === 'function');
    test.skip(hasFS, 'browser supports the File System Access API');
    await app.setContent('# dl');
    const { name, body } = await app.download(() => app.press('Control+s'));
    expect(name).toBe('untitled.md');
    expect(body).toBe('# dl');
    await expect(app.toast()).toHaveText('Downloaded untitled.md');
  });

  test('XB-08 Export HTML download @xbrowser', async ({ app }) => {
    await app.boot();
    await app.page.click('#exportBtn');
    const { name, body } = await app.download(() => app.page.click('[data-export="html"]'));
    expect(name).toBe('untitled.html');
    expect(body).toContain('<article class="md">');
  });

  test('XB-09 image paste via clipboard event @xbrowser', async ({ app }) => {
    await app.boot();
    await app.setContent('');
    const r = await app.pasteImage().catch((e) => ({ error: String(e) }));
    if (r.error) {
      test.info().annotations.push({ type: 'observed', description: 'synthetic paste unsupported here: ' + r.error });
      return;
    }
    await expect(app.toast()).toHaveText('Image embedded');
    expect(await app.content()).toContain('data:image/png;base64,');
  });

  test('XB-10 print flow leaves the on-screen theme alone @xbrowser', async ({ app }) => {
    await app.boot({
      init: () => {
        window.__prints = 0;
        window.print = () => {
          window.__prints++;
          setTimeout(() => window.dispatchEvent(new Event('afterprint')), 50);
        };
      },
    });
    await app.press('Control+p');
    await expect.poll(() => app.page.evaluate(() => window.__prints)).toBe(1);
    await expect(app.page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('XB-11 file open via input and tab title @xbrowser', async ({ app }) => {
    await app.boot();
    await app.openViaInput('x.md', '# Cross\n\nbody');
    await expect(app.page).toHaveTitle('Cross · Read Your MD');
  });
});
