const { test, expect } = require('../helpers.cjs');
const APP_VERSION = 'v' + require('../../../package.json').version;

test.describe('Phase 1 — Reader mode', () => {
  test('RM-01 button toggles reader mode: editor hidden, preview full width, aria-pressed, toast', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await page.click('#readerBtn');
    await expect(page.locator('body')).toHaveClass(/reader-mode/);
    await expect(page.locator('#readerBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#editorPane')).toBeHidden();
    await expect(page.locator('#divider')).toBeHidden();
    await expect(app.toast()).toHaveText(/Reader mode/);
    const [pane, container] = await Promise.all([
      page.locator('#previewPane').boundingBox(),
      page.locator('.main-container').boundingBox(),
    ]);
    expect(pane.width).toBeGreaterThan(container.width * 0.9);
    await page.click('#readerBtn');
    await expect(page.locator('body')).not.toHaveClass(/reader-mode/);
    await expect(page.locator('#editorPane')).toBeVisible();
    await expect(app.toast()).toHaveText('Editor restored');
    app.expectNoErrors();
  });

  test('RM-02 Ctrl+\\ toggles reader mode on and off', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await page.locator('#editor').focus();
    await app.press('Control+\\');
    await expect(page.locator('body')).toHaveClass(/reader-mode/);
    await app.press('Control+\\');
    await expect(page.locator('body')).not.toHaveClass(/reader-mode/);
  });

  test('RM-03 reader mode persists across reload (on and off)', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await page.click('#readerBtn');
    await expect(page.locator('body')).toHaveClass(/reader-mode/);
    await page.reload();
    await page.waitForSelector('#editor', { state: 'attached' }); // editor is display:none in reader mode
    await expect(page.locator('body')).toHaveClass(/reader-mode/);
    await expect(page.locator('#readerBtn')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#editorPane')).toBeHidden();
    await page.click('#readerBtn');
    await page.reload();
    await page.waitForSelector('#editor', { state: 'attached' });
    await expect(page.locator('body')).not.toHaveClass(/reader-mode/);
    await expect(page.locator('#editorPane')).toBeVisible();
  });

  test('RM-04 after dragging the divider, reader mode still gives the preview the full width', async ({ app }) => {
    await app.boot();
    const { page } = app;
    const div = await page.locator('#divider').boundingBox();
    await page.mouse.move(div.x + div.width / 2, div.y + div.height / 2);
    await page.mouse.down();
    await page.mouse.move(div.x + 250, div.y + div.height / 2, { steps: 5 });
    await page.mouse.up();
    const before = await page.locator('#previewPane').boundingBox();
    const container = await page.locator('.main-container').boundingBox();
    expect(before.width).toBeLessThan(container.width * 0.6);
    await page.click('#readerBtn');
    const after = await page.locator('#previewPane').boundingBox();
    expect(after.width).toBeGreaterThan(container.width * 0.9);
  });

  test('RM-05 diagrams survive the reader-mode layout change', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await page.click('#readerBtn');
    await page.waitForTimeout(800); // resize handler debounce (500ms) + render
    await app.waitRendered();
    await expect(page.locator('#preview .mermaid svg')).toHaveCount(1);
    await expect(page.locator('#renderStatus')).toHaveText('Rendered');
    app.expectNoErrors();
  });

  test('RM-06 Ctrl+F in reader mode must not leave an invisible/stale find bar behind', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await page.click('#readerBtn');
    await app.press('Control+f');
    const barVisibleInReader = await page.locator('#findBar').isVisible();
    await page.click('#readerBtn');
    test.info().annotations.push({ type: 'observed', description: `find bar visible while in reader mode: ${barVisibleInReader}` });
    await expect(page.locator('#findBar'), 'a find bar opened invisibly in reader mode is left open when the editor returns').toBeHidden();
  });

  test('RM-07 Ctrl+Shift+\\ does not toggle reader mode', async ({ app }) => {
    await app.boot();
    await app.page.locator('#editor').focus();
    await app.press('Control+Shift+\\');
    await expect(app.page.locator('body')).not.toHaveClass(/reader-mode/);
  });

  test('RM-08 outline, theme toggle and diagrams still work in reader mode', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await page.click('#readerBtn');
    await page.click('#outlineToggle');
    await expect(page.locator('#outlinePanel')).toHaveClass(/open/);
    await expect(page.locator('#outlineList .outline-item').first()).toBeVisible();
    await page.click('#themeToggle');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await app.waitRendered();
    await expect(page.locator('#preview .mermaid svg')).toHaveCount(1);
    app.expectNoErrors();
  });

  test('RM-09 clicking a preview block in reader mode does not throw', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await page.click('#readerBtn');
    await page.locator('#preview h2').first().click();
    await page.waitForTimeout(300);
    app.expectNoErrors();
  });

  test('RM-10 formatting shortcuts are inert in reader mode (editor hidden)', async ({ app }) => {
    await app.boot();
    await app.setContent('abc');
    await app.setCaret(0, 3);
    await app.page.click('#readerBtn');
    await app.press('Control+b');
    expect(await app.content()).toBe('abc');
  });
});

test.describe('Phase 1 — Help / about overlay', () => {
  test('HP-01 Ctrl+/ opens, shows version, Escape closes, focus returns to editor', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await page.locator('#editor').focus();
    await app.press('Control+/');
    await expect(page.locator('#helpOverlay')).toBeVisible();
    await expect(page.locator('#helpVersion')).toHaveText(APP_VERSION);
    await expect(page.locator('#helpOverlay .dialog-close')).toBeFocused();
    await app.press('Escape');
    await expect(page.locator('#helpOverlay')).toBeHidden();
    await expect(page.locator('#editor')).toBeFocused();
  });

  test('HP-02 Ctrl+/ toggles the overlay closed; help button and close button work', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await app.press('Control+/');
    await expect(page.locator('#helpOverlay')).toBeVisible();
    await app.press('Control+/');
    await expect(page.locator('#helpOverlay')).toBeHidden();
    await page.click('#helpBtn');
    await expect(page.locator('#helpOverlay')).toBeVisible();
    await page.click('#helpOverlay .dialog-close');
    await expect(page.locator('#helpOverlay')).toBeHidden();
  });

  test('HP-03 clicking the backdrop closes; clicking inside the dialog does not', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await page.click('#helpBtn');
    await page.locator('#helpOverlay h2').click();
    await expect(page.locator('#helpOverlay')).toBeVisible();
    await page.locator('#helpOverlay').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#helpOverlay')).toBeHidden();
  });

  test('HP-04 shortcut list documents the v2 shortcuts', async ({ app }) => {
    await app.boot();
    const text = await app.page.locator('#helpOverlay').innerText();
    for (const s of ['Ctrl+\\', 'Ctrl+P', 'Ctrl+F', 'Ctrl+H', 'Ctrl+/', 'Tab']) expect(text).toContain(s);
  });

  test('HP-05 dialog is labelled for assistive tech', async ({ app }) => {
    await app.boot();
    const d = app.page.locator('#helpOverlay .dialog');
    await expect(d).toHaveAttribute('role', 'dialog');
    await expect(d).toHaveAttribute('aria-modal', 'true');
    await expect(d).toHaveAttribute('aria-labelledby', 'helpTitle');
  });

  test('HP-06 focus stays inside the modal when tabbing (focus trap)', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await page.click('#helpBtn');
    for (let i = 0; i < 4; i++) await app.press('Tab');
    const inside = await page.evaluate(() => document.getElementById('helpOverlay').contains(document.activeElement));
    expect(inside, 'focus escaped the modal dialog').toBeTruthy();
  });

  test('HP-07 Escape closes only the help overlay, not an open find bar underneath', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await app.press('Control+f');
    await app.press('Control+/');
    await expect(page.locator('#helpOverlay')).toBeVisible();
    await app.press('Escape');
    await expect(page.locator('#helpOverlay')).toBeHidden();
    await expect(page.locator('#findBar')).toBeVisible();
  });
});

test.describe('Phase 1 — Spellcheck toggle', () => {
  test('SP-01 off by default, toggles on/off with toast, persists across reload', async ({ app }) => {
    await app.boot();
    const { page } = app;
    expect(await page.locator('#editor').evaluate((e) => e.spellcheck)).toBe(false);
    await page.click('#spellBtn');
    await expect(page.locator('#spellBtn')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.locator('#editor').evaluate((e) => e.spellcheck)).toBe(true);
    await expect(app.toast()).toHaveText('Spellcheck on');
    await page.reload();
    await page.waitForSelector('#editor');
    expect(await page.locator('#editor').evaluate((e) => e.spellcheck)).toBe(true);
    await expect(page.locator('#spellBtn')).toHaveAttribute('aria-pressed', 'true');
    await page.click('#spellBtn');
    await expect(app.toast()).toHaveText('Spellcheck off');
    await page.reload();
    await page.waitForSelector('#editor');
    expect(await page.locator('#editor').evaluate((e) => e.spellcheck)).toBe(false);
  });
});

test.describe('Phase 1 — Tab title from H1', () => {
  test('TT-01 title follows the first H1, falls back when there is none, updates live', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await app.setContent('# My Notes\n\ntext');
    await expect(page).toHaveTitle('My Notes · Read Your MD');
    await app.setContent('## Only H2\n\ntext');
    await expect(page).toHaveTitle('Read Your MD');
    await app.setContent('');
    await expect(page).toHaveTitle('Read Your MD');
    await app.setContent('# **Bold** and `code` title');
    await expect(page).toHaveTitle('Bold and code title · Read Your MD');
    await app.setContent('para\n\n# Later H1');
    await expect(page).toHaveTitle('Later H1 · Read Your MD');
  });

  test('TT-02 title with an H1 containing math is not duplicated/tripled', async ({ app }) => {
    await app.boot();
    await app.setContent('# Energy $E=mc^2$\n\ntext');
    const title = await app.page.title();
    const occurrences = title.split('mc').length - 1;
    expect(occurrences, `title was: "${title}"`).toBeLessThanOrEqual(1);
  });

  test('TT-03 outline entry for a heading containing math shows the formula once', async ({ app }) => {
    await app.boot();
    const { page } = app;
    await app.setContent('# Energy $E=mc^2$\n\ntext');
    await page.click('#outlineToggle');
    const text = await page.locator('#outlineList .outline-item').first().innerText();
    expect(text.split('mc').length - 1, `outline entry was: "${text}"`).toBeLessThanOrEqual(1);
  });

  test('TT-04 title text is HTML-safe (no markup leaks)', async ({ app }) => {
    await app.boot();
    await app.setContent('# A <b>bold</b> &amp; title');
    const title = await app.page.title();
    expect(title).not.toContain('<');
  });
});

test.describe('Phase 1 — Reading time', () => {
  const words = (n) => Array.from({ length: n }, (_, i) => 'w' + i).join(' ');
  for (const [n, want] of [[0, '0 min'], [1, '1 min'], [199, '1 min'], [200, '1 min'], [299, '1 min'], [300, '2 min'], [1000, '5 min'], [2500, '13 min']]) {
    test(`RT-01 ${n} words → "${want}"`, async ({ app }) => {
      await app.boot();
      await app.setContent(words(n));
      await expect(app.page.locator('#readTime')).toHaveText(want);
      await expect(app.page.locator('#wordCountHeader')).toHaveText(`${n} word${n === 1 ? '' : 's'}`);
    });
  }

  test('RT-02 updates while typing', async ({ app }) => {
    await app.boot();
    await app.setContent('');
    await expect(app.page.locator('#readTime')).toHaveText('0 min');
    await app.page.locator('#editor').focus();
    await app.page.keyboard.type('hello world');
    await expect(app.page.locator('#readTime')).toHaveText('1 min');
  });
});
