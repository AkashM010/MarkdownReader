// New document — the button, the shortcut, and the guard that stands
// between a click and someone's unsaved work.
const { test, expect } = require('../helpers.cjs');

const dialog = (page) => page.locator('#confirmOverlay');
const action = (page, label) =>
  page.locator('#confirmOverlay .dialog-actions button', { hasText: label });

test.describe('New document', () => {
  test('ND-01 a pristine document starts over with no prompt', async ({ app }) => {
    const { page } = app;
    await app.boot();
    await page.click('#newBtn');
    await expect(dialog(page)).toBeHidden();
    expect(await app.content()).toBe('');
    await expect(page.locator('#fileNameBadge')).toHaveText('untitled.md');
    await expect(app.toast()).toHaveText('New document');
    app.expectNoErrors();
  });

  test('ND-02 the caret lands in the editor, ready to type', async ({ app }) => {
    const { page } = app;
    await app.boot();
    await page.click('#newBtn');
    await expect.poll(() => page.evaluate(() => document.activeElement?.id)).toBe('editor');
  });

  test('ND-03 unsaved work is not discarded silently', async ({ app }) => {
    const { page } = app;
    await app.boot();
    await app.setContent('# Draft\n\nwork worth keeping');
    await page.click('#newBtn');
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator('#confirmTitle')).toHaveText('Start a new document?');
    // Safe choice takes focus: Enter must never be the destructive one.
    await expect.poll(() => page.evaluate(() => document.activeElement?.textContent)).toBe(
      'Save first'
    );
    app.expectNoErrors();
  });

  test('ND-04 Cancel keeps the document exactly as it was', async ({ app }) => {
    const { page } = app;
    await app.boot();
    await app.setContent('# Draft\n\nwork worth keeping');
    await page.click('#newBtn');
    await action(page, 'Cancel').click();
    await expect(dialog(page)).toBeHidden();
    expect(await app.content()).toContain('work worth keeping');
  });

  test('ND-05 Escape cancels, like every other overlay', async ({ app }) => {
    const { page } = app;
    await app.boot();
    await app.setContent('# Draft\n\nwork worth keeping');
    await page.click('#newBtn');
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    expect(await app.content()).toContain('work worth keeping');
  });

  test('ND-06 Discard clears the document and resets the name', async ({ app }) => {
    const { page } = app;
    await app.boot();
    await app.setContent('# Draft\n\nwork worth keeping');
    await page.click('#newBtn');
    await action(page, 'Discard').click();
    await expect(dialog(page)).toBeHidden();
    await expect.poll(() => app.content()).toBe('');
    await expect(page.locator('#fileNameBadge')).toHaveText('untitled.md');
  });

  test('ND-07 a cancelled save leaves the document alone', async ({ app }) => {
    const { page } = app;
    await app.boot();
    // Picker that the user dismisses — the document must survive it.
    await page.evaluate(() => {
      window.showSaveFilePicker = async () => {
        throw Object.assign(new Error('dismissed'), { name: 'AbortError' });
      };
    });
    await app.setContent('# Draft\n\nwork worth keeping');
    await page.click('#newBtn');
    await action(page, 'Save first').click();
    await expect(dialog(page)).toBeHidden();
    expect(await app.content()).toContain('work worth keeping');
    app.expectNoErrors();
  });

  test('ND-08 Ctrl+Alt+N starts a new document', async ({ app }) => {
    const { page } = app;
    await app.boot();
    await app.setContent('# Draft\n\nsomething');
    await page.keyboard.press('Control+Alt+KeyN');
    await expect(dialog(page)).toBeVisible();
    await action(page, 'Discard').click();
    await expect.poll(() => app.content()).toBe('');
  });

  test('ND-09 the save picker is pre-filled from the document heading', async ({ app }) => {
    const { page } = app;
    await app.boot();
    await page.evaluate(() => {
      window.__suggested = null;
      window.showSaveFilePicker = async (opts) => {
        window.__suggested = opts.suggestedName;
        throw Object.assign(new Error('x'), { name: 'AbortError' });
      };
    });
    await app.setContent('# Quarterly Report\n\nbody');
    await page.click('#saveBtn');
    await expect
      .poll(() => page.evaluate(() => window.__suggested))
      .toBe('quarterly-report.md');
  });

  test('ND-10 a heading with no usable characters falls back to untitled.md', async ({ app }) => {
    const { page } = app;
    await app.boot();
    await page.evaluate(() => {
      window.__suggested = null;
      window.showSaveFilePicker = async (opts) => {
        window.__suggested = opts.suggestedName;
        throw Object.assign(new Error('x'), { name: 'AbortError' });
      };
    });
    await app.setContent('# ---\n\nbody');
    await page.click('#saveBtn');
    await expect.poll(() => page.evaluate(() => window.__suggested)).toBe('untitled.md');
  });

  test('ND-11 @xbrowser the header never clips a control, 320px to 1440px', async ({ app }) => {
    const { page } = app;
    await app.boot();
    for (const width of [320, 380, 480, 520, 620, 768, 1100, 1440]) {
      await page.setViewportSize({ width, height: 760 });
      await page.waitForTimeout(150);
      const state = await page.evaluate(() => {
        const h = document.querySelector('.header');
        const hr = h.getBoundingClientRect();
        const reachable = (sel) => {
          const e = document.querySelector(sel);
          if (!e || e.offsetParent === null) return false;
          const r = e.getBoundingClientRect();
          return r.right <= hr.right + 0.5 && r.left >= hr.left - 0.5;
        };
        return {
          overflow: h.scrollWidth - h.clientWidth,
          // These three must survive every width — the rest may be shed.
          essentials: ['#newBtn', '#openBtn', '#saveBtn', '#themeToggle'].every(reachable),
        };
      });
      expect(state.overflow, `header overflows at ${width}px`).toBeLessThanOrEqual(1);
      expect(state.essentials, `an essential control is clipped at ${width}px`).toBe(true);
    }
  });
});
