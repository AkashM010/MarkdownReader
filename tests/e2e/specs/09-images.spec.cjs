const { test, expect } = require('../helpers.cjs');

const IMG_RE = /!\[([^\]]*)\]\((data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+)\)/;

test.describe('Phase 6 — Images', () => {
  test('IM-01 pasting an image embeds it at the caret with blank-line padding and renders it', async ({ app }) => {
    await app.boot();
    await app.setContent('# Title\n\ntext');
    await app.setCaret(13);
    const r = await app.pasteImage();
    expect(r.prevented).toBe(true);
    await expect(app.toast()).toHaveText('Image embedded');
    const c = await app.content();
    expect(c).toMatch(/^# Title\n\ntext\n\n!\[pasted image\]\(data:image\/png;base64,[A-Za-z0-9+/=]+\)\n$/);
    await app.waitRendered();
    const img = app.page.locator('#preview img');
    await expect(img).toHaveCount(1);
    await expect(img).toHaveAttribute('alt', 'pasted image');
    expect(await img.evaluate((i) => i.naturalWidth)).toBe(8);
    const { start } = await app.caret();
    expect(c.slice(start)).toBe('\n');
    app.expectNoErrors();
  });

  test('IM-02 paste in the middle of a line splits the line with blank lines around the image', async ({ app }) => {
    await app.boot();
    await app.setContent('hello world');
    await app.setCaret(5);
    await app.pasteImage();
    await expect(app.toast()).toHaveText('Image embedded');
    expect(await app.content()).toMatch(/^hello\n\n!\[pasted image\]\(data:[^)]+\)\n\n world$/);
  });

  test('IM-03 paste into an empty document adds no leading blank lines', async ({ app }) => {
    await app.boot();
    await app.setContent('');
    await app.pasteImage();
    await expect(app.toast()).toHaveText('Image embedded');
    expect(await app.content()).toMatch(/^!\[pasted image\]\(data:[^)]+\)\n$/);
  });

  test('IM-04 paste replaces a selection', async ({ app }) => {
    await app.boot();
    await app.setContent('keep REMOVE keep');
    await app.setCaret(5, 11);
    await app.pasteImage();
    await expect(app.toast()).toHaveText('Image embedded');
    const c = await app.content();
    expect(c).not.toContain('REMOVE');
    expect(c).toMatch(/^keep \n\n!\[pasted image\]/);
  });

  test('IM-05 dropping an image file uses the file name (without extension) as alt text', async ({ app }) => {
    await app.boot();
    await app.setContent('');
    await app.dropFile({ name: 'My Photo.final.jpg', type: 'image/jpeg' });
    await expect(app.toast()).toHaveText('Image embedded');
    const m = IMG_RE.exec(await app.content());
    expect(m[1]).toBe('My Photo.final');
    expect(m[2].startsWith('data:image/jpeg;base64,')).toBeTruthy();
  });

  test('IM-06 brackets in the file name are stripped from the alt text', async ({ app }) => {
    await app.boot();
    await app.setContent('');
    await app.dropFile({ name: 'shot [v2].png', type: 'image/png' });
    await expect(app.toast()).toHaveText('Image embedded');
    expect(IMG_RE.exec(await app.content())[1]).toBe('shot v2');
  });

  test('IM-07 dropping an image on the preview pane still inserts it at the editor caret', async ({ app }) => {
    await app.boot();
    await app.setContent('abc');
    await app.setCaret(3);
    await app.dropFile({ target: '#preview', name: 'p.png', type: 'image/png' });
    await expect(app.toast()).toHaveText('Image embedded');
    expect(await app.content()).toMatch(/^abc\n\n!\[p\]\(data:image\/png/);
    await expect(app.page.locator('#fileNameBadge')).toHaveText('untitled.md');
  });

  test('IM-08 images over 1 MB embed with a size warning', async ({ app }) => {
    await app.boot();
    await app.setContent('');
    const r = await app.dropFile({ name: 'big.png', type: 'image/png', size: 1.5 * 1024 * 1024 });
    expect(r.size).toBeGreaterThan(1024 * 1024);
    await expect(app.toast()).toHaveText(/Embedded a 1\.5 MB image/);
    expect((await app.content()).length).toBeGreaterThan(1.9 * 1024 * 1024);
  });

  test('IM-09 a .md drop still opens the document (not treated as an image)', async ({ app }) => {
    await app.boot();
    await app.dropFile({ name: 'doc.md', type: 'text/markdown', content: '# Dropped doc' });
    await expect(app.page.locator('#fileNameBadge')).toHaveText('doc.md');
    await expect(app.page.locator('#preview h1')).toHaveText('Dropped doc');
    await expect(app.toast()).toHaveText('Opened doc.md');
    expect(await app.content()).toBe('# Dropped doc');
  });

  test('IM-10 a non-image, non-markdown drop is rejected with a hint', async ({ app }) => {
    await app.boot();
    await app.setContent('x');
    await app.dropFile({ name: 'report.pdf', type: 'application/pdf', content: '%PDF' });
    await expect(app.toast()).toHaveText('Please drop a .md file');
    expect(await app.content()).toBe('x');
  });

  test('IM-11 plain text paste is untouched', async ({ app }) => {
    await app.boot();
    await app.setContent('');
    await app.page.locator('#editor').focus();
    const prevented = await app.page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'plain text');
      const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
      document.getElementById('editor').dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(prevented).toBe(false);
    await app.page.keyboard.insertText('typed text');
    expect(await app.content()).toBe('typed text');
    await app.waitRendered();
    await expect(app.page.locator('#preview p')).toHaveText('typed text');
  });

  test('IM-12 an image paste is a single undo step', async ({ app }) => {
    await app.boot();
    await app.setContent('base');
    await app.setCaret(4);
    await app.pasteImage();
    await expect(app.toast()).toHaveText('Image embedded');
    expect(await app.content()).toContain('data:image');
    await app.press('Control+z');
    expect(await app.content()).toBe('base');
  });

  test('IM-13 SVG images embed as data:image/svg+xml and render without executing scripts', async ({ app }) => {
    await app.boot();
    await app.setContent('');
    await app.dropFile({
      name: 'logo.svg',
      type: 'image/svg+xml',
      content: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>window.__svgxss=1</script><rect width="10" height="10"/></svg>',
    });
    await expect(app.toast()).toHaveText('Image embedded');
    expect(await app.content()).toContain('data:image/svg+xml;base64,');
    await app.waitRendered();
    await expect(app.page.locator('#preview img')).toHaveCount(1);
    expect(await app.page.evaluate(() => window.__svgxss)).toBeUndefined();
  });

  const readDraft = (page) => page.evaluate(async () => {
    const fromDb = await new Promise((resolve) => {
      const q = indexedDB.open('read-your-md-drafts', 1);
      q.onerror = () => resolve(null);
      q.onsuccess = () => {
        const db = q.result;
        if (!db.objectStoreNames.contains('drafts')) return resolve(null);
        const r = db.transaction('drafts').objectStore('drafts').get('current');
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      };
    });
    const local = JSON.parse(localStorage.getItem('md-reader-draft') || 'null');
    const newest = [fromDb, local].filter(Boolean).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
    return newest ? newest.content : '';
  });

  test('IM-14 embedding a large image must not silently break autosave (storage quota)', async ({ app }) => {
    await app.boot();
    await app.setContent('# Big');
    await expect.poll(() => readDraft(app.page)).toBe('# Big');
    await app.dropFile({ name: 'huge.png', type: 'image/png', size: 4.5 * 1024 * 1024 });
    await expect(app.toast()).toHaveText(/Embedded a 4\.5 MB image/);
    const len = (await app.content()).length;
    expect(len).toBeGreaterThan(5 * 1024 * 1024);
    await expect.poll(async () => (await readDraft(app.page)).length, { timeout: 15000 }).toBe(len);
    const status = await app.page.locator('#autosaveStatus').innerText();
    test.info().annotations.push({ type: 'observed', description: `editor length ${len}, autosave status "${status}"` });
    expect(status, 'status must reflect the successful save').toMatch(/^Draft saved/);
  });

  test('IM-15 word/char counters and reading time stay sane after an embed', async ({ app }) => {
    await app.boot();
    await app.setContent('one two');
    await app.setCaret(7);
    await app.pasteImage();
    await expect(app.toast()).toHaveText('Image embedded');
    // Image markup is not prose: the counter ignores it.
    await expect(app.page.locator('#wordCountHeader')).toHaveText('2 words');
    await expect(app.page.locator('#readTime')).toHaveText('1 min');
  });

  test('IM-16 dropping an image while the Find box has focus still targets the editor caret', async ({ app }) => {
    await app.boot();
    await app.setContent('abc');
    await app.setCaret(3);
    await app.press('Control+f');
    await app.dropFile({ target: '#findInput', name: 'f.png', type: 'image/png' });
    await expect(app.toast()).toHaveText('Image embedded');
    expect(await app.content()).toMatch(/^abc\n\n!\[f\]\(data:image\/png/);
    await expect(app.page.locator('#findInput')).toHaveValue('');
  });

  test('IM-17 dropping a .md and an image together: which wins? (observed)', async ({ app }) => {
    await app.boot();
    await app.setContent('');
    await app.page.evaluate(async () => {
      const dt = new DataTransfer();
      dt.items.add(new File(['# md'], 'a.md', { type: 'text/markdown' }));
      dt.items.add(new File([new Uint8Array(10)], 'b.png', { type: 'image/png' }));
      document.getElementById('editor').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await app.page.waitForTimeout(300);
    const c = await app.content();
    test.info().annotations.push({
      type: 'observed',
      description: c.startsWith('![') ? 'image inserted, .md ignored' : c === '# md' ? '.md opened, image ignored' : 'other: ' + c.slice(0, 40),
    });
  });

  test('IM-18 a very large embedded image makes typing sluggish? (perf observation)', async ({ app }) => {
    await app.boot();
    await app.setContent('');
    await app.dropFile({ name: 'huge.png', type: 'image/png', size: 3 * 1024 * 1024 });
    await expect(app.toast()).toHaveText(/Embedded a 3\.0 MB image/);
    await app.waitRendered();
    await app.setCaret(0);
    const t0 = Date.now();
    await app.page.keyboard.type('abcdefghij');
    await app.waitRendered();
    const ms = Date.now() - t0;
    const mem = await app.page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
    test.info().annotations.push({ type: 'observed', description: `10 keystrokes with a 4 MB data-URL in the doc took ${ms} ms; JS heap ${mem} MB` });
    expect(ms).toBeLessThan(15000);
  });
});
