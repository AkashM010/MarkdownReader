const { test, expect } = require('../helpers.cjs');

const PRINT_STUB = () => {
  window.__prints = 0;
  window.__themeAtPrint = null;
  window.__afterprintDelay = 60;
  window.print = () => {
    window.__prints++;
    window.__themeAtPrint = document.documentElement.getAttribute('data-theme');
    if (window.__afterprintDelay >= 0) setTimeout(() => window.dispatchEvent(new Event('afterprint')), window.__afterprintDelay);
  };
};

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test.describe('Phase 1 — Export menu', () => {
  test('EX-01 menu opens/closes: button, outside click, Escape, aria-expanded, 4 actions', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await page.click('#exportBtn');
    await expect(page.locator('#exportMenu')).toHaveClass(/open/);
    await expect(page.locator('#exportBtn')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#exportMenu [data-export]')).toHaveCount(4);
    await page.click('#editor');
    await expect(page.locator('#exportMenu')).not.toHaveClass(/open/);
    await expect(page.locator('#exportBtn')).toHaveAttribute('aria-expanded', 'false');
    await page.click('#exportBtn');
    await app.press('Escape');
    await expect(page.locator('#exportMenu')).not.toHaveClass(/open/);
  });

  test('EX-02 opening the Recent menu closes the Export menu (only one header menu open)', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await page.click('#exportBtn');
    await expect(page.locator('#exportMenu')).toHaveClass(/open/);
    await page.click('#recentBtn');
    await expect(page.locator('#recentMenu')).toHaveClass(/open/);
    await expect(page.locator('#exportMenu'), 'export menu should close when another header menu opens').not.toHaveClass(/open/);
  });
});

test.describe('Phase 1 — Print / PDF', () => {
  test('PR-01 Ctrl+P from dark theme: paper is light, the on-screen theme stays dark', async ({ app }) => {
    await app.boot({ init: PRINT_STUB });
    const { page } = app;
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.evaluate(() => { window.__afterprintDelay = 3000; });
    await app.press('Control+p');
    await expect.poll(() => page.evaluate(() => window.__prints)).toBe(1);
    // The app never flips its theme...
    expect(await page.evaluate(() => window.__themeAtPrint)).toBe('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('#themeLabel')).toHaveText('Dark');
    // ...diagrams get light-palette copies used only while printing...
    await expect(page.locator('#preview .mermaid-print svg')).toHaveCount(1);
    expect(await page.locator('#preview .mermaid-print').innerHTML()).toContain('#ccfbf1');
    // ...and the print media itself is light.
    await page.emulateMedia({ media: 'print' });
    const paper = await page.evaluate(() => ({
      body: getComputedStyle(document.body).backgroundColor,
      text: getComputedStyle(document.querySelector('#preview')).color,
      darkDiagramHidden: getComputedStyle(document.querySelector('#preview .mermaid')).display === 'none',
      lightDiagramShown: getComputedStyle(document.querySelector('#preview .mermaid-print')).display !== 'none',
    }));
    await page.emulateMedia({ media: 'screen' });
    expect(paper).toEqual({ body: 'rgb(255, 255, 255)', text: 'rgb(35, 41, 58)', darkDiagramHidden: true, lightDiagramShown: true });
    // afterprint → copies removed, live dark diagram untouched
    await expect(page.locator('#preview .mermaid-print')).toHaveCount(0, { timeout: 6000 });
    await expect(page.locator('#preview .mermaid svg')).toHaveCount(1);
    expect(await page.locator('#preview .mermaid').innerHTML()).toContain('#134e4a');
    app.expectNoErrors();
  });

  test('PR-02 print from light theme leaves the theme alone; menu item triggers print', async ({ app }) => {
    await app.boot({ init: PRINT_STUB });
    const { page } = app;
    await page.click('#themeToggle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.click('#exportBtn');
    await page.click('[data-export="print"]');
    await expect.poll(() => page.evaluate(() => window.__prints)).toBe(1);
    await page.waitForTimeout(300);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('#exportMenu')).not.toHaveClass(/open/);
  });

  test('PR-03 re-entrancy: a second Ctrl+P during an in-flight print is ignored, printing works again afterwards', async ({ app }) => {
    await app.boot({ init: PRINT_STUB });
    const { page } = app;
    await page.evaluate(() => { window.__afterprintDelay = 600; });
    await app.press('Control+p');
    await app.press('Control+p');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__prints)).toBe(1);
    await page.waitForTimeout(700);
    await app.press('Control+p');
    await expect.poll(() => page.evaluate(() => window.__prints)).toBe(2);
  });

  test('PR-04 Ctrl+Shift+P is not intercepted', async ({ app }) => {
    await app.boot({ init: PRINT_STUB });
    await app.press('Control+Shift+p');
    await app.page.waitForTimeout(300);
    expect(await app.page.evaluate(() => window.__prints)).toBe(0);
  });

  test('PR-05 if afterprint never fires, the app recovers (theme restored, Ctrl+P usable again)', async ({ app }) => {
    await app.boot({ init: PRINT_STUB });
    const { page } = app;
    await page.evaluate(() => { window.__afterprintDelay = -1; });
    await app.press('Control+p');
    await expect.poll(() => page.evaluate(() => window.__prints)).toBe(1);
    await page.waitForTimeout(3000);
    expect.soft(await page.locator('html').getAttribute('data-theme'), 'theme stuck in light after a print without afterprint').toBe('dark');
    await app.press('Control+p');
    await page.waitForTimeout(300);
    expect.soft(await page.evaluate(() => window.__prints), 'print latch never released').toBe(2);
  });

  test('PR-06 print stylesheet hides app chrome and the editor', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await page.emulateMedia({ media: 'print' });
    for (const sel of ['.header', '.status-bar', '#editorPane', '.divider', '.pane-header', '.outline']) {
      await expect(page.locator(sel).first(), sel).toBeHidden();
    }
    await expect(page.locator('#preview')).toBeVisible();
    await page.emulateMedia({ media: 'screen' });
  });

  test('PR-07 Ctrl+P works while the find bar has focus (global shortcut)', async ({ app }) => {
    await app.boot({ init: PRINT_STUB });
    await app.press('Control+f');
    await app.press('Control+p');
    await expect.poll(() => app.page.evaluate(() => window.__prints)).toBe(1);
  });
});

test.describe('Phase 1 — Export HTML file', () => {
  const doExport = async (app) => {
    await app.page.click('#exportBtn');
    return app.download(() => app.page.click('[data-export="html"]'));
  };

  test('EH-01 downloads a standalone, self-styled HTML file named after the document', async ({ app }) => {
    await app.boot();
    const { name, body } = await doExport(app);
    expect(name).toBe('untitled.html');
    expect(body.startsWith('<!doctype html>')).toBeTruthy();
    expect(body).toContain('<title>A quiet place to write</title>');
    expect(body).toContain('<style>');
    expect(body).toContain('<article class="md">');
    expect(body).toContain('Exported from Read Your MD');
    expect(body).toContain('<h1');
    expect(body).toContain('class="markdown-alert markdown-alert-note"');
    expect(body).toContain('<table>');
    expect(body).toContain('type="checkbox"');
    expect(body).not.toContain('code-copy');
    expect(body).not.toContain('data-line=');
    expect(body).not.toContain('<script');
    expect(body).toContain('class="mermaid"');
    expect(body).toContain('<svg');
    await expect(app.toast()).toHaveText('Exported untitled.html');
  });

  test('EH-02 file name follows the opened file; title falls back to the file name without an H1', async ({ app }) => {
    await app.boot();
    await app.openViaInput('notes.md', 'just a paragraph, no heading');
    const { name, body } = await doExport(app);
    expect(name).toBe('notes.html');
    expect(body).toContain('<title>notes</title>');
  });

  test('EH-03 title is HTML-escaped', async ({ app }) => {
    await app.boot();
    // Raw <b> is markup in markdown, so the title text is "A bold …"; escaped \< stays literal text.
    await app.setContent('# A <b>bold</b> & "quoted" title');
    let { body } = await doExport(app);
    expect(body).toMatch(/<title>A bold &amp; &quot;quoted&quot; title<\/title>/);
    await app.setContent('# 5 \\< 6 & "q"');
    ({ body } = await doExport(app));
    expect(body).toMatch(/<title>5 &lt; 6 &amp; &quot;q&quot;<\/title>/);
  });

  test('EH-04 diagrams are re-rendered in the light palette; the live preview stays dark; no temp nodes left', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await app.setContent('# D\n\n```mermaid\ngraph TD\n  A-->B\n```');
    await expect(page.locator('#preview .mermaid svg')).toHaveCount(1);
    const before = await page.locator('#preview .mermaid').innerHTML();
    expect(before).toContain('#134e4a');
    const { body } = await doExport(app);
    expect(body).toContain('#ccfbf1');
    expect(body).not.toContain('#134e4a');
    const after = await page.locator('#preview .mermaid').innerHTML();
    expect(after).toContain('#134e4a');
    const stray = await page.locator('[id^="export-diagram"], [id^="dexport-diagram"]').count();
    expect(stray, 'temporary mermaid export nodes left in the live DOM').toBe(0);
  });

  test('EH-05 exporting twice in a row works (no id collisions), including multiple diagrams', async ({ app }) => {
    await app.boot();
    await app.setContent('# D\n\n```mermaid\ngraph TD\n  A-->B\n```\n\n```mermaid\ngraph LR\n  C-->D\n```');
    await expect(app.page.locator('#preview .mermaid svg')).toHaveCount(2);
    const a = await doExport(app);
    const b = await doExport(app);
    expect((a.body.match(/<svg/g) || []).length).toBe(2);
    expect((b.body.match(/<svg/g) || []).length).toBe(2);
    app.expectNoErrors();
  });

  test('EH-06 math in the export renders once (KaTeX styles included, MathML hidden)', async ({ app, context }) => {
    await app.boot();
    await app.setContent('# M\n\nInline $E=mc^2$ here.');
    await expect(app.page.locator('#preview .katex')).toHaveCount(1);
    const { body } = await doExport(app);
    expect(body).toContain('class="katex"');
    const view = await context.newPage();
    await view.setContent(body);
    const info = await view.evaluate(() => {
      const k = document.querySelector('.katex');
      const mm = document.querySelector('.katex-mathml');
      const html = document.querySelector('.katex-html');
      const cs = mm ? getComputedStyle(mm) : null;
      return {
        // NFKC folds the math-italic code points Chrome reports for MathML back to ASCII.
        visibleText: k.innerText.replace(/\s+/g, '').normalize('NFKC'),
        mathmlHidden: !!cs && (cs.position === 'absolute' || cs.display === 'none' || cs.clip !== 'auto'),
        htmlPresent: !!html,
      };
    });
    await view.close();
    // Either strategy is acceptable: MathML-only (rendered natively, no CSS needed)
    // or KaTeX HTML with the MathML copy hidden. Never both visible.
    const single = !info.htmlPresent || info.mathmlHidden;
    expect(single, `exported math shows MathML + HTML twice; visible text: "${info.visibleText}"`).toBeTruthy();
    expect(info.visibleText.split('mc').length - 1).toBe(1);
  });

  test('EH-07 front matter card, alerts and code blocks are styled in the export', async ({ app }) => {
    await app.boot();
    await app.setContent('---\ntitle: X\n---\n# H\n\n> [!TIP]\n> tip\n\n```js\nlet a = 1;\n```');
    const { body } = await doExport(app);
    expect(body).toContain('class="front-matter"');
    expect(body).toContain('.front-matter{');
    expect(body).toContain('markdown-alert-tip');
    expect(body).toContain('hljs');
    expect(body).toContain('.hljs-keyword');
  });

  test('EH-08 export of an empty document still produces a file', async ({ app }) => {
    await app.boot();
    await app.setContent('');
    const { name, body } = await doExport(app);
    expect(name).toBe('untitled.html');
    expect(body).toContain('<article class="md">');
  });

  test('EH-09 export works from reader mode', async ({ app }) => {
    await app.boot();
    await app.page.click('#readerBtn');
    const { body } = await doExport(app);
    expect(body).toContain('<h1');
  });

  test('EH-10 embedded images survive the export', async ({ app }) => {
    await app.boot();
    await app.setContent('# I\n\n![pic](data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==)');
    const { body } = await doExport(app);
    expect(body).toContain('src="data:image/gif;base64,R0lGOD');
  });

  test('EH-11 internal anchor links keep working in the export (heading ids preserved)', async ({ app }) => {
    await app.boot();
    await app.setContent('# Top\n\n[jump](#md-section-two)\n\n## Section two\n\nbody');
    await expect(app.page.locator('#preview #md-section-two')).toHaveCount(1);
    const { body } = await doExport(app);
    expect.soft(body, 'heading ids are stripped, so in-document anchors break in the exported file').toContain('id="md-section-two"');
  });
});

test.describe('Phase 1 — Copy', () => {
  test('CP-01 Copy as rich text puts HTML + markdown on the clipboard', async ({ app }) => {
    await app.boot();
    await app.setContent('# Hello\n\nSome **bold** text.');
    await app.page.click('#exportBtn');
    await app.page.click('[data-export="copy"]');
    await expect(app.toast()).toHaveText('Copied as rich text');
    const clip = await app.readClipboard();
    expect(clip['text/html']).toContain('<h1');
    expect(clip['text/html']).toContain('<strong>bold</strong>');
    expect(clip['text/html']).not.toContain('data-line');
    // Windows normalises clipboard text to CRLF on read-back; the app wrote LF.
    expect(clip['text/plain'].replace(/\r\n/g, '\n')).toBe('# Hello\n\nSome **bold** text.');
  });

  test('CP-02 Copy markdown copies the raw editor text', async ({ app }) => {
    await app.boot();
    await app.setContent('# Hi\n\n- a\n- b');
    await app.page.click('#exportBtn');
    await app.page.click('[data-export="copymd"]');
    await expect(app.toast()).toHaveText('Markdown copied');
    expect((await app.page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe('# Hi\n\n- a\n- b');
  });

  test('CP-03 rich copy of a diagram carries a self-contained image (PNG survives clipboard sanitizers)', async ({ app }) => {
    await app.boot();
    await app.setContent('```mermaid\ngraph TD\n  A-->B\n```');
    await expect(app.page.locator('#preview .mermaid svg')).toHaveCount(1);
    await app.page.click('#exportBtn');
    await app.page.click('[data-export="copy"]');
    await expect(app.toast()).toHaveText('Copied as rich text');
    const clip = await app.readClipboard();
    const html = clip['text/html'];
    const png = html.includes('<img src="data:image/png');
    const svg = html.includes('<svg');
    test.info().annotations.push({ type: 'observed', description: `png: ${png}; svg: ${svg}` });
    expect(png || svg, 'diagram missing from the rich-text copy').toBeTruthy();
    expect.soft(png, 'diagram should be a PNG so its colors survive the clipboard sanitizer').toBeTruthy();
  });
});
