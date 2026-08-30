const { test, expect } = require('../helpers.cjs');

test.describe('Regression — pre-existing features still work', () => {
  test('RG-01 toolbar formatting commands', async ({ app }) => {
    await app.boot();
    await app.setContent('word');
    await app.setCaret(0, 4);
    await app.page.click('[data-cmd="bold"]');
    expect(await app.content()).toBe('**word**');
    await app.page.click('[data-cmd="bold"]');
    expect(await app.content()).toBe('word');
    await app.setCaret(0, 4);
    await app.page.click('[data-cmd="ul"]');
    expect(await app.content()).toBe('- word');
    await app.page.click('[data-cmd="task"]');
    expect(await app.content()).toBe('- [ ] word');
    await app.page.click('[data-cmd="ol"]');
    expect(await app.content()).toBe('1. word');
    await app.page.click('[data-cmd="quote"]');
    expect(await app.content()).toBe('> word');
    await app.page.click('[data-menu="heading"]');
    await app.page.click('[data-cmd="heading"][data-arg="2"]');
    expect(await app.content()).toBe('## > word');
  });

  test('RG-02 formatting keyboard shortcuts', async ({ app }) => {
    await app.boot();
    await app.setContent('abc');
    await app.setCaret(0, 3);
    await app.press('Control+b');
    expect(await app.content()).toBe('**abc**');
    await app.setContent('abc');
    await app.setCaret(0, 3);
    await app.press('Control+i');
    expect(await app.content()).toBe('*abc*');
    await app.setContent('x');
    await app.setCaret(0, 1);
    await app.press('Control+e');
    expect(await app.content()).toBe('`x`');
    await app.setContent('t');
    await app.setCaret(0, 1);
    await app.press('Control+k');
    expect(await app.content()).toBe('[t](https://)');
    await app.setContent('l');
    await app.setCaret(1);
    await app.press('Control+Shift+8');
    expect(await app.content()).toBe('- l');
    await app.press('Control+Shift+7');
    expect(await app.content()).toBe('1. l');
    await app.press('Control+Shift+L');
    expect(await app.content()).toBe('- [ ] l');
    await app.press('Control+Shift+.');
    expect(await app.content()).toBe('> l');
  });

  test('RG-02b italic applied on already-bold text (pre-existing quirk, observed)', async ({ app }) => {
    await app.boot();
    await app.setContent('**abc**');
    await app.setCaret(2, 5);
    await app.press('Control+i');
    const c = await app.content();
    test.info().annotations.push({ type: 'observed', description: `Ctrl+I on the inner text of **abc** → "${c}"` });
    expect.soft(c, 'italic on bold text should nest, not strip a bold marker').toBe('***abc***');
  });

  test('RG-03 undo/redo via buttons and shortcuts', async ({ app }) => {
    await app.boot();
    await app.setContent('a');
    await app.setContent('ab');
    await app.setContent('abc');
    await app.page.click('#undoBtn');
    expect(await app.content()).toBe('ab');
    await app.press('Control+z');
    expect(await app.content()).toBe('a');
    await app.page.click('#redoBtn');
    expect(await app.content()).toBe('ab');
    await app.press('Control+y');
    expect(await app.content()).toBe('abc');
    await expect(app.page.locator('#redoBtn')).toBeDisabled();
  });

  test('RG-04 theme toggle (button + Ctrl+Shift+D) persists and re-themes diagrams', async ({ app }) => {
    await app.boot();
    await app.page.click('#themeToggle');
    await expect(app.page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(app.toast()).toHaveText('Switched to light mode');
    await app.waitRendered();
    expect(await app.page.locator('#preview .mermaid').innerHTML()).toContain('#ccfbf1');
    await app.page.reload();
    await app.page.waitForSelector('#editor');
    await expect(app.page.locator('html')).toHaveAttribute('data-theme', 'light');
    await app.press('Control+Shift+D');
    await expect(app.page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('RG-05 autosave restores the draft and file name after reload', async ({ app }) => {
    await app.boot();
    await app.openViaInput('draft.md', '# Draft');
    await app.setContent('# Draft edited');
    await app.page.waitForTimeout(1200);
    await app.page.reload();
    await app.page.waitForSelector('#editor');
    await expect(app.toast()).toHaveText('Restored your last draft');
    expect(await app.content()).toBe('# Draft edited');
    await expect(app.page.locator('#fileNameBadge')).toHaveText('draft.md');
    await expect(app.page.locator('#autosaveStatus')).toHaveText(/saved/i);
  });

  test('RG-06 open via file input updates badge, content, title, toast', async ({ app }) => {
    await app.boot();
    await app.openViaInput('readme.md', '# Read Me\n\nbody');
    await expect(app.page.locator('#preview h1')).toHaveText('Read Me');
    await expect(app.page).toHaveTitle('Read Me · Read Your MD');
    await expect(app.toast()).toHaveText('Opened readme.md');
    await expect(app.page.locator('#fileNameBadge')).not.toHaveClass(/dirty/);
  });

  test('RG-07 two-way locate still maps blocks to lines', async ({ app }) => {
    await app.boot();
    await app.setContent('# One\n\npara one\n\n## Two\n\npara two');
    await app.page.locator('#preview h2').click();
    expect(await app.caretLine()).toBe(5);
    await app.setCaret(0);
    await app.page.locator('#editor').click({ position: { x: 100, y: 10 } });
    await app.page.waitForTimeout(200);
    const opacity = await app.page.locator('.preview-marker').evaluate((e) => e.style.opacity);
    expect(opacity).toBe('1');
  });

  test('RG-08 outline builds from headings and jumps on click', async ({ app }) => {
    await app.boot();
    await app.page.click('#outlineToggle');
    const items = app.page.locator('#outlineList .outline-item');
    expect(await items.count()).toBeGreaterThan(5);
    await items.last().click();
    await app.page.waitForTimeout(600);
    expect(await app.page.locator('#previewContent').evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  });

  test('RG-09 editor → preview scroll sync', async ({ app }) => {
    await app.boot();
    await app.page.locator('#editor').evaluate((e) => {
      e.scrollTop = e.scrollHeight;
    });
    await app.page.waitForTimeout(300);
    expect(await app.page.locator('#previewContent').evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  });

  test('RG-10 code block copy button', async ({ app, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await app.boot();
    await app.page.locator('.code-copy').first().click();
    await expect(app.page.locator('.code-copy').first()).toHaveClass(/copied/);
    expect(await app.page.evaluate(() => navigator.clipboard.readText())).toContain('function fibonacci');
  });

  test('RG-11 GitHub alerts render and a broken mermaid diagram degrades gracefully', async ({ app }) => {
    await app.boot();
    await expect(app.page.locator('#preview .markdown-alert')).toHaveCount(5);
    await app.setContent('```mermaid\ngraph TD\n  A --> \n  ==> broken\n```');
    await expect(app.page.locator('#renderStatus')).toHaveText('Diagram error');
    await expect(app.page.locator('#preview .render-error')).toHaveCount(1);
  });

  test('RG-12 narrow viewport: stacked layout, no horizontal overflow, reader mode still works', async ({ app }) => {
    await app.page.setViewportSize({ width: 420, height: 800 });
    await app.boot();
    expect(await app.page.locator('.main-container').evaluate((e) => getComputedStyle(e).flexDirection)).toBe('column');
    const overflow = await app.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const offenders = await app.page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(e).position !== 'fixed')
        .slice(0, 10)
        .map((e) => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${typeof e.className === 'string' && e.className ? '.' + e.className.split(' ')[0] : ''} right=${Math.round(e.getBoundingClientRect().right)}`)
    );
    test.info().annotations.push({ type: 'observed', description: `horizontal overflow ${overflow}px at 420px; elements past the right edge: ${offenders.join(' | ') || 'none'}` });
    expect(overflow, 'page scrolls horizontally on a 420px viewport').toBeLessThanOrEqual(0);
    await test.info().attach('mobile-editor.png', { body: await app.page.screenshot(), contentType: 'image/png' });
    await app.page.click('#readerBtn');
    await expect(app.page.locator('#editorPane')).toBeHidden();
    await expect(app.page.locator('#preview h1').first()).toBeVisible();
    await test.info().attach('mobile-reader.png', { body: await app.page.screenshot(), contentType: 'image/png' });
  });

  test('RG-13 visual: desktop dark & light screenshots attached for review', async ({ app }) => {
    await app.boot();
    await app.press('Control+h');
    await app.page.keyboard.type('Ctrl');
    await test.info().attach('desktop-dark-find.png', { body: await app.page.screenshot(), contentType: 'image/png' });
    await app.press('Escape');
    await app.page.click('#themeToggle');
    await app.waitRendered();
    await app.page.click('#helpBtn');
    await test.info().attach('desktop-light-help.png', { body: await app.page.screenshot(), contentType: 'image/png' });
    await app.press('Escape');
    await app.page.click('#exportBtn');
    await test.info().attach('desktop-light-export-menu.png', { body: await app.page.screenshot(), contentType: 'image/png' });
  });

  test('RG-14 divider drag resizes panes', async ({ app }) => {
    await app.boot();
    const before = (await app.page.locator('#editorPane').boundingBox()).width;
    const div = await app.page.locator('#divider').boundingBox();
    await app.page.mouse.move(div.x + 2, div.y + 100);
    await app.page.mouse.down();
    await app.page.mouse.move(div.x - 200, div.y + 100, { steps: 8 });
    await app.page.mouse.up();
    const after = (await app.page.locator('#editorPane').boundingBox()).width;
    expect(after).toBeLessThan(before - 100);
  });

  test('RG-15 line numbers track the line count', async ({ app }) => {
    await app.boot();
    await app.setContent('a\nb\nc\nd');
    await expect(app.page.locator('#lineNumbers')).toHaveText(/^1\n2\n3\n4$/);
  });

  test('RG-16 Escape closes toolbar menus; opening a toolbar menu closes a header menu', async ({ app }) => {
    await app.boot();
    await app.page.click('[data-menu="alert"]');
    await expect(app.page.locator('[data-menu="alert"] + .tb-menu')).toHaveClass(/open/);
    await app.press('Escape');
    await expect(app.page.locator('[data-menu="alert"] + .tb-menu')).not.toHaveClass(/open/);
    await app.page.click('#exportBtn');
    await app.page.click('[data-menu="heading"]');
    await expect(app.page.locator('#exportMenu')).not.toHaveClass(/open/);
  });

  test('RG-17 raw HTML in markdown is rendered as-is (pre-existing behaviour, documented as a risk)', async ({ app }) => {
    await app.boot();
    await app.setContent('<img src=x onerror="window.__rawhtml=1">');
    await app.page.waitForTimeout(500);
    const ran = await app.page.evaluate(() => window.__rawhtml);
    test.info().annotations.push({ type: 'observed', description: `inline event handler in an opened document executed: ${ran === 1}` });
  });

  test('RG-18 Ctrl+S with no file handle opens the native save picker (cannot be automated) — documented', async ({ app }) => {
    await app.boot();
    const hasFS = await app.page.evaluate(() => typeof window.showSaveFilePicker === 'function');
    test.info().annotations.push({ type: 'manual', description: `showSaveFilePicker available: ${hasFS}; verify Ctrl+S / Ctrl+Shift+S manually` });
  });
});
