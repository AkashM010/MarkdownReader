// Independent verification of the v2.0.1 fixes where the base suite only
// observed the old behaviour or never asserted the decided one (D2, D4, D6,
// D7, D8, D10, D13, D20, D22, D28, D29, D30).
const { test, expect, PREVIEW } = require('../helpers.cjs');

const textWithoutMath = (page, i) =>
  page.locator('#preview p').nth(i).evaluate((p) => {
    const c = p.cloneNode(true);
    c.querySelectorAll('.katex, .katex-display').forEach((k) => k.remove());
    return c.textContent.replace(/\s+/g, ' ').trim();
  });

test.describe('v2.0.1 fix verification', () => {
  test('FX-D4 currency before math: the price stays text and the formula renders (no red error)', async ({ app }) => {
    await app.boot();
    await app.setContent('Pay $5 and $x^2$ now.\n\nPay $5 and $10 or $x$ now.\n\nCosts $5 and $10 today.\n\nLiteral \\$x\\$ here.');
    await expect(app.page.locator('#preview .katex-error')).toHaveCount(0);
    await expect(app.page.locator('#preview .katex')).toHaveCount(2);
    expect(await textWithoutMath(app.page, 0)).toBe('Pay $5 and now.');
    expect(await textWithoutMath(app.page, 1)).toBe('Pay $5 and $10 or now.');
    expect(await textWithoutMath(app.page, 2)).toBe('Costs $5 and $10 today.');
    expect(await textWithoutMath(app.page, 3)).toBe('Literal $x$ here.');
    app.expectNoErrors();
  });

  test('FX-D8 Ctrl+F / Ctrl+H in reader mode leave reader mode and focus the bar', async ({ app }) => {
    await app.boot();
    await app.page.click('#readerBtn');
    await expect(app.page.locator('body')).toHaveClass(/reader-mode/);
    await app.press('Control+f');
    await expect(app.page.locator('body')).not.toHaveClass(/reader-mode/);
    await expect(app.page.locator('#readerBtn')).toHaveAttribute('aria-pressed', 'false');
    await expect(app.page.locator('#findBar')).toBeVisible();
    await expect(app.page.locator('#findInput')).toBeFocused();
    await app.press('Escape');
    await expect(app.page.locator('#findBar')).toBeHidden();
    await app.page.click('#readerBtn');
    await app.press('Control+h');
    await expect(app.page.locator('body')).not.toHaveClass(/reader-mode/);
    await expect(app.page.locator('#replaceRow')).toBeVisible();
    // Ctrl+H on a closed bar focuses the query field (VS Code convention); FR-18 covers the open-bar case.
    await expect(app.page.locator('#findInput')).toBeFocused();
  });

  test('FX-D20 Escape with focus in the editor closes an open find bar', async ({ app }) => {
    await app.boot();
    await app.setContent('abc');
    await app.press('Control+f');
    await app.page.keyboard.type('a');
    await app.page.locator('#editor').focus();
    await app.press('Escape');
    await expect(app.page.locator('#findBar')).toBeHidden();
  });

  test('FX-D7 Ctrl+Z in the Find box undoes the field, not the document; undo still works after a mouse Replace', async ({ app }) => {
    await app.boot();
    await app.setContent('one');
    await app.setCaret(3);
    await app.page.keyboard.type(' two');
    await app.press('Control+f');
    await app.page.keyboard.type('abc');
    await app.press('Control+z');
    expect(await app.content()).toBe('one two');
    const q = await app.page.inputValue('#findInput');
    test.info().annotations.push({ type: 'observed', description: `find box after Ctrl+Z: "${q}"` });
    expect(q).not.toBe('abc');
    // Mouse-driven Replace, then Ctrl+Z must revert the replacement.
    await app.page.fill('#findInput', 'two');
    await app.page.click('#findToggleReplace');
    await app.page.fill('#replaceInput', 'three');
    await app.page.click('#replaceOne');
    expect(await app.content()).toBe('one three');
    await app.press('Control+z');
    expect(await app.content()).toBe('one two');
  });

  test('FX-D22 clicking "Aa" hands focus back to the query so Enter advances', async ({ app }) => {
    await app.boot();
    await app.setContent('a b a');
    await app.setCaret(0);
    await app.press('Control+f');
    await app.page.keyboard.type('a');
    await app.page.click('#findCase');
    await expect(app.page.locator('#findInput')).toBeFocused();
    await app.press('Enter');
    await expect(app.page.locator('#findCount')).toHaveText('2/2');
  });

  test('FX-D2 drafts larger than the localStorage sync copy persist (IndexedDB) and restore after reload', async ({ app }) => {
    await app.boot();
    const big = '# Big draft\n\n' + 'lorem ipsum '.repeat(130000); // ~1.5 M chars, above the 900 KB sync copy
    await app.setContent(big);
    await expect(app.page.locator('#autosaveStatus')).toHaveText(/^Draft saved/, { timeout: 15000 });
    await app.page.waitForTimeout(1200);
    await app.page.reload();
    await app.page.waitForSelector('#editor');
    await expect(app.toast()).toHaveText('Restored your last draft');
    expect((await app.content()).length).toBe(big.length);
    await expect(app.page.locator('#autosaveStatus')).not.toHaveClass(/paused/);
  });

  test('FX-D2b when every draft store fails, the status bar and a toast say autosave is paused', async ({ app }) => {
    await app.boot({
      init: () => {
        Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (k, v) {
          if (k === 'md-reader-draft') throw new DOMException('quota', 'QuotaExceededError');
          return orig.call(this, k, v);
        };
      },
    });
    await app.setContent('# paused test');
    await expect(app.page.locator('#autosaveStatus')).toHaveText(/Autosave paused/, { timeout: 8000 });
    await expect(app.page.locator('#autosaveStatus')).toHaveClass(/paused/);
    await expect(app.toast()).toHaveText(/Autosave paused/);
    app.expectNoErrors();
  });

  test('FX-D6 HTML export renders math once (MathML only); rich copy carries the TeX source', async ({ app, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await app.boot();
    await app.setContent('# M\n\nInline $E=mc^2$ and\n\n$$\n\\int_0^1 x\n$$');
    await app.page.click('#exportBtn');
    const { body } = await app.download(() => app.page.click('[data-export="html"]'));
    expect(body).toContain('<math');
    expect(body).not.toContain('katex-html');
    const view = await context.newPage();
    await view.setContent(body);
    const info = await view.evaluate(() => {
      // MathML lays out each token as its own box, so innerText separates them; strip all whitespace.
      const norm = (s) => s.replace(/\s+/g, '').normalize('NFKC');
      const anns = [...document.querySelectorAll('annotation')].map((a) => getComputedStyle(a).display);
      const katexInner = [...document.querySelectorAll('.katex')].map((k) => norm(k.innerText));
      return { body: norm(document.body.innerText), anns, katexInner, mathCount: document.querySelectorAll('math').length };
    });
    await view.close();
    test.info().annotations.push({ type: 'observed', description: JSON.stringify(info).slice(0, 400) });
    expect(info.mathCount).toBe(2);
    expect(info.anns.every((d) => d === 'none'), 'TeX source annotation must not be displayed').toBeTruthy();
    expect(info.katexInner[0].split('mc').length - 1, 'inline formula must appear exactly once').toBe(1);
    await app.page.click('#exportBtn');
    await app.page.click('[data-export="copy"]');
    await expect(app.toast()).toHaveText('Copied as rich text');
    const clip = await app.readClipboard();
    expect(clip['text/html']).toContain('E=mc^2');
    expect(clip['text/html']).not.toContain('katex');
  });

  test('FX-D13 print restores the theme when print() returns and the latch releases without afterprint', async ({ app }) => {
    await app.boot({
      init: () => {
        window.__prints = 0;
        window.print = () => { window.__prints++; };
      },
    });
    await app.press('Control+p');
    await expect.poll(() => app.page.evaluate(() => window.__prints)).toBe(1);
    await expect(app.page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 5000 });
    // Without afterprint the latch releases 2 s after print() returns (PR-03 relies on
    // presses inside that window being ignored), so wait it out before printing again.
    await app.page.waitForTimeout(2300);
    await app.press('Control+p');
    await expect.poll(() => app.page.evaluate(() => window.__prints), { timeout: 15000 }).toBe(2);
  });

  test('FX-D28 sanitizer strips active content but keeps legitimate markup', async ({ app }) => {
    await app.boot();
    await app.setContent(
      [
        '<img src=x onerror="window.__rawhtml=1">',
        '<a href="javascript:alert(1)">j</a>',
        '<script>window.__s=1</script>',
        '- [x] done',
        '![i](data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==)',
        '$x$',
        '> [!NOTE]\n> n',
        '```mermaid\ngraph TD\nA-->B\n```',
        '<details><summary>s</summary>body</details>',
        '## Head',
      ].join('\n\n')
    );
    await app.page.waitForTimeout(400);
    expect(await app.page.evaluate(() => [window.__rawhtml, window.__s])).toEqual([null, null].map(() => undefined));
    expect(await app.page.locator('#preview a[href^="javascript:"]').count()).toBe(0);
    expect(await app.page.locator('#preview img[onerror]').count()).toBe(0);
    expect(await app.page.locator('#preview script').count()).toBe(0);
    await expect(app.page.locator('#preview input[type="checkbox"]')).toHaveCount(1);
    expect(await app.page.locator('#preview input[type="checkbox"]').isChecked()).toBe(true);
    await expect(app.page.locator('#preview img[src^="data:image/gif"]')).toHaveCount(1);
    await expect(app.page.locator('#preview .katex math')).toHaveCount(1);
    await expect(app.page.locator('#preview .markdown-alert-note svg')).toHaveCount(1);
    await expect(app.page.locator('#preview .mermaid svg')).toHaveCount(1);
    await expect(app.page.locator('#preview details summary')).toHaveText('s');
    await expect(app.page.locator('#preview h2#md-head')).toHaveCount(1);
    await expect(app.page.locator('#preview > [data-line]').first()).toBeAttached();
    await expect(app.page.locator('#renderStatus')).toHaveText('Rendered');
    app.expectNoErrors();
  });

  test('FX-D29 Meta+Shift+D toggles the theme like Ctrl+Shift+D', async ({ app }) => {
    await app.boot();
    await app.press('Meta+Shift+D');
    await expect(app.page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('FX-D10 service worker waits for the app before updating (prompt mode), first install still controls the page', async ({ app }) => {
    const sw = await (await app.page.request.get(PREVIEW + 'sw.js')).text();
    expect(sw).toContain('SKIP_WAITING');
    expect(sw).toContain('clientsClaim');
    await app.boot({ url: PREVIEW });
    await app.page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
    let loads = 0;
    app.page.on('load', () => loads++);
    await app.page.waitForTimeout(3000);
    expect(loads).toBe(0);
  });

  test('FX-D30 manifest declares focus-existing launch handling', async ({ app }) => {
    const m = await (await app.page.request.get(PREVIEW + 'manifest.webmanifest')).json();
    expect(m.launch_handler).toEqual({ client_mode: 'focus-existing' });
  });

  test('FX-D30b a multi-file launch opens the first file and tells the user', async ({ app }) => {
    await app.boot({
      url: PREVIEW,
      init: () => {
        Object.defineProperty(window, 'launchQueue', { value: { setConsumer: (fn) => { window.__lq = fn; } }, configurable: true });
      },
    });
    await app.makeOpfsFile('first.md', '# First');
    await app.makeOpfsFile('second.md', '# Second');
    await app.page.evaluate(() => window.__lq({ files: [window.__h['first.md'], window.__h['second.md']] }));
    await expect(app.page.locator('#fileNameBadge')).toHaveText('first.md');
    const toast = await app.toast().innerText();
    test.info().annotations.push({ type: 'observed', description: `toast on 2-file launch: "${toast}"` });
    expect(toast).toMatch(/first|1 of 2|only|opened/i);
  });
});
