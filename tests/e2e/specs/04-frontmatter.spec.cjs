const { test, expect } = require('../helpers.cjs');

const FM = '---\ntitle: Hello World\ntags: [a, b]\ndraft: "yes"\nempty:\n# a comment\n\ndate-created: 2024-01-01\n---\n# Doc\n\nbody text';

test.describe('Phase 1 — Front matter', () => {
  test('FM-01 leading YAML renders as a Document info card; body renders normally', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await app.setContent(FM);
    const card = page.locator('#preview .front-matter');
    await expect(card).toHaveCount(1);
    await expect(card.locator('.fm-title')).toHaveText('Document info');
    expect(await card.locator('dt').allInnerTexts()).toEqual(['title', 'tags', 'draft', 'empty', 'date-created']);
    expect(await card.locator('dd').allInnerTexts()).toEqual(['Hello World', '[a, b]', 'yes', '—', '2024-01-01']);
    await expect(page.locator('#preview > hr')).toHaveCount(0);
    await expect(page.locator('#preview h1')).toHaveText('Doc');
    await expect(page).toHaveTitle('Doc · Read Your MD');
    expect(await page.locator('#preview').innerText()).not.toContain('title: Hello');
    app.expectNoErrors();
  });

  test('FM-02 line mapping stays intact: card covers lines 1–N, body blocks map to their lines, locate works', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await app.setContent('---\ntitle: X\nb: 2\n---\n# Doc\n\npara');
    const card = page.locator('#preview .front-matter');
    await expect(card).toHaveAttribute('data-line', '1');
    await expect(card).toHaveAttribute('data-line-end', '4');
    await expect(page.locator('#preview h1')).toHaveAttribute('data-line', '5');
    await expect(page.locator('#preview p')).toHaveAttribute('data-line', '7');
    await page.locator('#preview p').click();
    expect(await app.caretLine()).toBe(7);
    await card.locator('.fm-title').click();
    expect(await app.caretLine()).toBe(1);
    await page.locator('#preview h1').click();
    expect(await app.caretLine()).toBe(5);
  });

  test('FM-03 non key/value YAML falls back to a raw block', async ({ app }) => {
    await app.boot();
    await app.setContent('---\ntitle: X\nlist:\n  - one\n  - two\n---\n# Doc');
    const raw = app.page.locator('#preview .front-matter .fm-raw');
    await expect(raw).toHaveCount(1);
    await expect(raw).toContainText('- one');
    await expect(app.page.locator('#preview h1')).toHaveText('Doc');
  });

  test('FM-04 not front matter when it is not at the very top', async ({ app }) => {
    await app.boot();
    await app.setContent('\n---\ntitle: X\n---\n# Doc');
    await expect(app.page.locator('#preview .front-matter')).toHaveCount(0);
    await app.setContent('intro\n\n---\ntitle: X\n---\n# Doc');
    await expect(app.page.locator('#preview .front-matter')).toHaveCount(0);
    await expect(app.page.locator('#preview hr')).toHaveCount(1);
  });

  test('FM-05 unclosed front matter renders as ordinary markdown', async ({ app }) => {
    await app.boot();
    await app.setContent('---\ntitle: X\n# Doc');
    await expect(app.page.locator('#preview .front-matter')).toHaveCount(0);
    await expect(app.page.locator('#preview hr')).toHaveCount(1);
  });

  test('FM-06 front-matter-only document (closing fence at EOF)', async ({ app }) => {
    await app.boot();
    await app.setContent('---\ntitle: X\n---');
    await expect(app.page.locator('#preview .front-matter dd')).toHaveText('X');
    await expect(app.page.locator('#preview hr')).toHaveCount(0);
  });

  test('FM-07 trailing whitespace after the fences is tolerated', async ({ app }) => {
    await app.boot();
    await app.setContent('---  \ntitle: X\n--- \n# Doc');
    await expect(app.page.locator('#preview .front-matter')).toHaveCount(1);
    await expect(app.page.locator('#preview h1')).toHaveText('Doc');
  });

  test('FM-08 values are HTML-escaped (no injection through YAML)', async ({ app }) => {
    await app.boot();
    await app.setContent('---\ntitle: <img src=x onerror="window.__xss=1">\n---\n# Doc');
    await expect(app.page.locator('#preview .front-matter dd')).toContainText('<img src=x');
    expect(await app.page.locator('#preview .front-matter img').count()).toBe(0);
    expect(await app.page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('FM-09 CRLF line endings typed/pasted into the editor still produce the card', async ({ app }) => {
    await app.boot();
    await app.setContent('---\r\ntitle: X\r\n---\r\n# Doc');
    await expect(app.page.locator('#preview .front-matter')).toHaveCount(1);
  });

  test('FM-10 a CRLF (Windows) file opened from disk shows the card immediately on open', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await app.openViaInput('win.md', '---\r\ntitle: Windows\r\n---\r\n# Doc\r\n\r\nbody\r\n');
    await expect(page.locator('#preview h1')).toHaveText('Doc');
    await expect(page.locator('#preview .front-matter'), 'front matter not detected on a CRLF file right after opening').toHaveCount(1);
    await expect(page.locator('#preview hr')).toHaveCount(0);
  });

  test('FM-10b …and the rendering is consistent between file-open and the first edit', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await app.openViaInput('win.md', '---\r\ntitle: Windows\r\n---\r\n# Doc\r\n');
    const before = await page.locator('#preview .front-matter').count();
    await page.locator('#editor').focus();
    await app.setCaret((await app.content()).length);
    await page.keyboard.type(' x');
    await app.waitRendered();
    const after = await page.locator('#preview .front-matter').count();
    test.info().annotations.push({ type: 'observed', description: `front-matter cards: on open=${before}, after first keystroke=${after}` });
    expect(after, 'front matter rendering differs between file-open and first edit').toBe(before);
    expect(after).toBe(1);
  });

  test('FM-11 outline lists the headings after the card', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await app.setContent('---\ntitle: X\n---\n# One\n\n## Two');
    await page.click('#outlineToggle');
    expect(await page.locator('#outlineList .outline-item').allInnerTexts()).toEqual(['One', 'Two']);
  });

  test('FM-12 the sample document\'s mid-document "---" rule is unaffected', async ({ app }) => {
    await app.boot();
    await expect(app.page.locator('#preview hr')).toHaveCount(1);
    await expect(app.page.locator('#preview .front-matter')).toHaveCount(0);
  });

  test('FM-13 word count / reading time include the front matter (documented behaviour)', async ({ app }) => {
    await app.boot();
    await app.setContent('---\ntitle: X\n---\nword');
    await expect(app.page.locator('#wordCountHeader')).toHaveText('5 words');
  });

  test('FM-14 a value containing a colon is kept whole', async ({ app }) => {
    await app.boot();
    await app.setContent('---\ntitle: "Note: read me"\nurl: https://example.com/a:b\n---\n# D');
    expect(await app.page.locator('#preview .front-matter dd').allInnerTexts()).toEqual(['Note: read me', 'https://example.com/a:b']);
  });

  test('FM-15 typing the closing fence live turns the block into a card without errors', async ({ app }) => {
    await app.boot();
    await app.setContent('---\ntitle: X\n--');
    await expect(app.page.locator('#preview .front-matter')).toHaveCount(0);
    await app.setCaret(15);
    await app.page.keyboard.type('-');
    await app.waitRendered();
    await expect(app.page.locator('#preview .front-matter')).toHaveCount(1);
    app.expectNoErrors();
  });
});
