const { test, expect } = require('../helpers.cjs');

const DOC = 'alpha beta Alpha gamma alpha\nbeta\nALPHA end';
// "alpha" matches at 0, 11, 23, 35 (case-insensitive)

const sel = (app) =>
  app.page.evaluate(() => {
    const e = document.getElementById('editor');
    return e.value.slice(e.selectionStart, e.selectionEnd);
  });

test.describe('Phase 2 — Find', () => {
  test('FR-01 Ctrl+F opens the bar with focus in the query field; replace row hidden', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.press('Control+f');
    await expect(app.page.locator('#findBar')).toBeVisible();
    await expect(app.page.locator('#findInput')).toBeFocused();
    await expect(app.page.locator('#replaceRow')).toBeHidden();
    await expect(app.page.locator('#findCount')).toHaveText('');
  });

  test('FR-02 live count and current-match selection (case-insensitive by default)', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.setCaret(0);
    await app.press('Control+f');
    await app.page.keyboard.type('alpha');
    await expect(app.page.locator('#findCount')).toHaveText('1/4');
    expect(await sel(app)).toBe('alpha');
    expect(await app.caret()).toEqual({ start: 0, end: 5 });
  });

  test('FR-03 Enter / Shift+Enter / buttons cycle through matches and wrap both ways', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.setCaret(0);
    await app.press('Control+f');
    await app.page.keyboard.type('alpha');
    await app.press('Enter');
    await expect(app.page.locator('#findCount')).toHaveText('2/4');
    expect(await sel(app)).toBe('Alpha');
    await app.press('Enter');
    await app.press('Enter');
    await expect(app.page.locator('#findCount')).toHaveText('4/4');
    expect(await sel(app)).toBe('ALPHA');
    await app.press('Enter');
    await expect(app.page.locator('#findCount')).toHaveText('1/4');
    await app.press('Shift+Enter');
    await expect(app.page.locator('#findCount')).toHaveText('4/4');
    await app.page.click('#findPrev');
    await expect(app.page.locator('#findCount')).toHaveText('3/4');
    await app.page.click('#findNext');
    await expect(app.page.locator('#findCount')).toHaveText('4/4');
  });

  test('FR-04 match-case toggle narrows the results and recomputes the position', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.setCaret(0);
    await app.press('Control+f');
    await app.page.keyboard.type('alpha');
    await app.page.click('#findCase');
    await expect(app.page.locator('#findCase')).toHaveAttribute('aria-pressed', 'true');
    await expect(app.page.locator('#findCount')).toHaveText('1/2');
    // Clicking "Aa" leaves focus on the button (Enter there re-toggles it) — a UX nit; refocus the query field.
    const focusedAfterToggle = await app.page.evaluate(() => document.activeElement.id);
    test.info().annotations.push({ type: 'observed', description: `focus after clicking Aa: #${focusedAfterToggle} (query field would be friendlier)` });
    await app.page.locator('#findInput').focus();
    await app.press('Enter');
    expect(await app.caret()).toEqual({ start: 23, end: 28 });
    await app.page.click('#findCase');
    await expect(app.page.locator('#findCount')).toHaveText(/\/4$/);
  });

  test('FR-05 no match shows 0/0 with the no-match style; clearing the query clears the count', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.press('Control+f');
    await app.page.keyboard.type('zzz');
    await expect(app.page.locator('#findCount')).toHaveText('0/0');
    await expect(app.page.locator('#findCount')).toHaveClass(/no-match/);
    await app.page.fill('#findInput', '');
    await expect(app.page.locator('#findCount')).toHaveText('');
    await expect(app.page.locator('#findCount')).not.toHaveClass(/no-match/);
  });

  test('FR-06 the editor selection seeds the query (single line only)', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.setCaret(17, 22);
    await app.press('Control+f');
    await expect(app.page.locator('#findInput')).toHaveValue('gamma');
    await expect(app.page.locator('#findCount')).toHaveText('1/1');
    await app.press('Escape');
    await app.setCaret(0, 30);
    await app.press('Control+f');
    await expect(app.page.locator('#findInput')).toHaveValue('gamma');
  });

  test('FR-07 search starts from the caret, wrapping to the top when needed', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.setCaret(12);
    await app.press('Control+f');
    await app.page.keyboard.type('alpha');
    await expect(app.page.locator('#findCount')).toHaveText('3/4');
    await app.press('Escape');
    await app.setCaret(40);
    await app.press('Control+f');
    await app.page.fill('#findInput', 'beta');
    await expect(app.page.locator('#findCount')).toHaveText('1/2');
  });

  test('FR-08 Escape and the close button close the bar and return focus to the editor', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.press('Control+f');
    await app.press('Escape');
    await expect(app.page.locator('#findBar')).toBeHidden();
    await expect(app.page.locator('#editor')).toBeFocused();
    await app.press('Control+f');
    await app.page.click('#findClose');
    await expect(app.page.locator('#findBar')).toBeHidden();
  });

  test('FR-09 literal matching for regex metacharacters and unicode', async ({ app }) => {
    await app.boot();
    await app.setContent('cost $x^2$ (a) [b] a.c a\\c ünïcode 🙂🙂 a*c');
    await app.press('Control+f');
    for (const [q, n] of [['$x^2$', 1], ['(a)', 1], ['[b]', 1], ['a.c', 1], ['a\\c', 1], ['ünïcode', 1], ['🙂', 2], ['a*c', 1], ['.', 1]]) {
      await app.page.fill('#findInput', q);
      await expect(app.page.locator('#findCount'), q).toHaveText(`1/${n}`);
    }
  });

  test('FR-10 far matches are scrolled into view', async ({ app }) => {
    await app.boot();
    const lines = Array.from({ length: 300 }, (_, i) => `line ${i + 1}`);
    lines[249] = 'line 250 needle';
    await app.setContent(lines.join('\n'));
    await app.setCaret(0);
    await app.press('Control+f');
    await app.page.keyboard.type('needle');
    await expect(app.page.locator('#findCount')).toHaveText('1/1');
    const geo = await app.page.evaluate(() => {
      const ed = document.getElementById('editor');
      const cs = getComputedStyle(ed);
      const lh = parseFloat(cs.lineHeight);
      const pt = parseFloat(cs.paddingTop);
      return { scrollTop: ed.scrollTop, clientHeight: ed.clientHeight, lineTop: pt + 249 * lh, lh };
    });
    expect(geo.scrollTop).toBeGreaterThan(0);
    expect(geo.lineTop).toBeGreaterThanOrEqual(geo.scrollTop);
    expect(geo.lineTop + geo.lh).toBeLessThanOrEqual(geo.scrollTop + geo.clientHeight);
  });

  test('FR-11 count keeps up while the document changes underneath', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.press('Control+f');
    await app.page.keyboard.type('alpha');
    await expect(app.page.locator('#findCount')).toHaveText(/\/4$/);
    await app.page.evaluate(() => {
      const ed = document.getElementById('editor');
      ed.value += '\nalpha alpha';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(app.page.locator('#findCount')).toHaveText(/\/6$/);
    await expect(app.page.locator('#findBar')).toBeVisible();
  });

  test('FR-12 Ctrl+F while the bar is open keeps the query the user typed', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.setCaret(0);
    await app.press('Control+f');
    await app.page.keyboard.type('ALPHA');
    await expect(app.page.locator('#findCount')).toHaveText('1/4');
    await app.press('Control+f');
    await expect(app.page.locator('#findInput'), 'query was overwritten by the current match text').toHaveValue('ALPHA');
  });

  test('FR-13 Ctrl+Z while typing in the Find box does not undo the document', async ({ app }) => {
    await app.boot();
    await app.setContent('one');
    await app.page.locator('#editor').focus();
    await app.setCaret(3);
    await app.page.keyboard.type(' two');
    expect(await app.content()).toBe('one two');
    await app.press('Control+f');
    await app.page.keyboard.type('abc');
    await app.press('Control+z');
    expect(await app.content(), 'document was undone by Ctrl+Z inside the Find field').toBe('one two');
  });

  test('FR-14 keyboard: Tab from the query field reaches the bar controls (no trap)', async ({ app }) => {
    await app.boot();
    await app.press('Control+f');
    await app.press('Tab');
    const id = await app.page.evaluate(() => document.activeElement.id);
    expect(['findPrev', 'findNext', 'findCase', 'findToggleReplace', 'findClose', 'findCount']).toContain(id);
  });

  test('FR-15 bar controls have accessible names', async ({ app }) => {
    await app.boot();
    for (const id of ['findInput', 'replaceInput', 'findPrev', 'findNext', 'findToggleReplace', 'findClose']) {
      const name = await app.page.locator('#' + id).getAttribute('aria-label');
      expect(name, id).toBeTruthy();
    }
  });

  test('FR-16 Escape with focus in the editor while the bar is open (observed behaviour)', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.press('Control+f');
    await app.page.keyboard.type('alpha');
    await app.page.locator('#editor').focus();
    await app.press('Escape');
    const hidden = await app.page.locator('#findBar').isHidden();
    test.info().annotations.push({ type: 'observed', description: `Escape in editor with find open → bar hidden=${hidden}` });
  });

  test('FR-17 performance: a 200 KB document searches instantly', async ({ app }) => {
    await app.boot();
    await app.setContent('lorem ipsum dolor sit amet needle '.repeat(6000));
    await app.press('Control+f');
    const t0 = Date.now();
    await app.page.fill('#findInput', 'needle');
    await expect(app.page.locator('#findCount')).toHaveText('1/6000');
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  test('FR-18 Ctrl+H when the bar is already open focuses the Replace field', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.press('Control+f');
    await app.page.keyboard.type('alpha');
    await app.press('Control+h');
    await expect(app.page.locator('#replaceRow')).toBeVisible();
    await expect(app.page.locator('#replaceInput'), 'Ctrl+H should put the caret in the Replace field').toBeFocused();
  });
});

test.describe('Phase 2 — Replace', () => {
  test('RP-01 Ctrl+H opens with the replace row; toggle button hides/shows it', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.press('Control+h');
    await expect(app.page.locator('#findBar')).toBeVisible();
    await expect(app.page.locator('#replaceRow')).toBeVisible();
    await expect(app.page.locator('#findToggleReplace')).toHaveAttribute('aria-pressed', 'true');
    await app.page.click('#findToggleReplace');
    await expect(app.page.locator('#replaceRow')).toBeHidden();
    await app.page.click('#findToggleReplace');
    await expect(app.page.locator('#replaceRow')).toBeVisible();
  });

  test('RP-02 Replace one replaces the current match and advances; undo reverts step by step', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.setCaret(0);
    await app.press('Control+h');
    await app.page.fill('#findInput', 'alpha');
    await app.page.fill('#replaceInput', 'X');
    await expect(app.page.locator('#findCount')).toHaveText('1/4');
    await app.page.click('#replaceOne');
    expect(await app.content()).toBe('X beta Alpha gamma alpha\nbeta\nALPHA end');
    await expect(app.page.locator('#findCount')).toHaveText('1/3');
    expect(await sel(app)).toBe('Alpha');
    await app.page.click('#replaceOne');
    expect(await app.content()).toBe('X beta X gamma alpha\nbeta\nALPHA end');
    await expect(app.page.locator('#findCount')).toHaveText('1/2');
    await app.press('Control+z');
    expect(await app.content()).toBe('X beta Alpha gamma alpha\nbeta\nALPHA end');
    await app.press('Control+z');
    expect(await app.content()).toBe(DOC);
  });

  test('RP-03 Replace All replaces every match, reports the count, is undoable/redoable, re-renders', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.press('Control+h');
    await app.page.fill('#findInput', 'alpha');
    await app.page.fill('#replaceInput', 'Z');
    await app.page.click('#replaceAll');
    expect(await app.content()).toBe('Z beta Z gamma Z\nbeta\nZ end');
    await expect(app.page.locator('#findCount')).toHaveText('Replaced 4');
    await expect(app.page.locator('#findCount')).not.toHaveClass(/no-match/);
    await app.press('Control+z');
    expect(await app.content()).toBe(DOC);
    await app.press('Control+y');
    expect(await app.content()).toBe('Z beta Z gamma Z\nbeta\nZ end');
    await app.waitRendered();
    await expect(app.page.locator('#preview')).toContainText('Z beta Z gamma Z');
  });

  test('RP-04 Replace All respects match case', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.press('Control+h');
    await app.page.fill('#findInput', 'alpha');
    await app.page.click('#findCase');
    await app.page.fill('#replaceInput', 'Z');
    await app.page.click('#replaceAll');
    expect(await app.content()).toBe('Z beta Alpha gamma Z\nbeta\nALPHA end');
    await expect(app.page.locator('#findCount')).toHaveText('Replaced 2');
  });

  test('RP-05 replacement text containing the query does not loop', async ({ app }) => {
    await app.boot();
    await app.setContent('a a a');
    await app.setCaret(0);
    await app.press('Control+h');
    await app.page.fill('#findInput', 'a');
    await app.page.fill('#replaceInput', 'aa');
    await app.page.click('#replaceOne');
    expect(await app.content()).toBe('aa a a');
    await expect(app.page.locator('#findCount')).toHaveText('3/4');
    await app.page.click('#replaceAll');
    expect(await app.content()).toBe('aaaa aa aa');
    await expect(app.page.locator('#findCount')).toHaveText('Replaced 4');
  });

  test('RP-06 empty replacement deletes matches; Enter / Ctrl+Enter in the replace box', async ({ app }) => {
    await app.boot();
    await app.setContent('x-y-z');
    await app.setCaret(0);
    await app.press('Control+h');
    await app.page.fill('#findInput', '-');
    await app.page.locator('#replaceInput').focus();
    await app.press('Enter');
    expect(await app.content()).toBe('xy-z');
    await app.press('Control+Enter');
    expect(await app.content()).toBe('xyz');
  });

  test('RP-07 Replace with no matches is a no-op without errors', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.press('Control+h');
    await app.page.fill('#findInput', 'nope');
    await app.page.fill('#replaceInput', 'X');
    await app.page.click('#replaceOne');
    await app.page.click('#replaceAll');
    expect(await app.content()).toBe(DOC);
    app.expectNoErrors();
  });

  test('RP-08 Replace one at the last match wraps to the first', async ({ app }) => {
    await app.boot();
    await app.setContent('a b a');
    await app.setCaret(4);
    await app.press('Control+h');
    await app.page.fill('#findInput', 'a');
    await expect(app.page.locator('#findCount')).toHaveText('2/2');
    await app.page.fill('#replaceInput', 'Q');
    await app.page.click('#replaceOne');
    expect(await app.content()).toBe('a b Q');
    await expect(app.page.locator('#findCount')).toHaveText('1/1');
    expect(await app.caret()).toEqual({ start: 0, end: 1 });
  });

  test('RP-09 replace marks the document dirty and autosaves the new text', async ({ app }) => {
    await app.boot();
    await app.openViaInput('r.md', DOC);
    await expect(app.page.locator('#fileNameBadge')).not.toHaveClass(/dirty/);
    await app.press('Control+h');
    await app.page.fill('#findInput', 'alpha');
    await app.page.fill('#replaceInput', 'W');
    await app.page.click('#replaceAll');
    await expect(app.page.locator('#fileNameBadge')).toHaveClass(/dirty/);
    await expect
      .poll(() => app.page.evaluate(() => JSON.parse(localStorage.getItem('md-reader-draft') || '{}').content), { timeout: 5000 })
      .toBe('W beta W gamma W\nbeta\nW end');
  });

  test('RP-10 Replace one when the caret was moved elsewhere first re-selects the tracked match, then replaces it', async ({ app }) => {
    await app.boot();
    await app.setContent(DOC);
    await app.setCaret(0);
    await app.press('Control+h');
    await app.page.fill('#findInput', 'beta');
    await app.page.fill('#replaceInput', 'Q');
    await app.setCaret(36); // user clicks near the end of the document
    await app.page.click('#replaceOne');
    // First press: nothing replaced; the tracked match is re-selected so the user sees it.
    expect(await app.content()).toBe(DOC);
    const sel = await app.page.evaluate(() => { const ed = document.getElementById('editor'); return ed.value.slice(ed.selectionStart, ed.selectionEnd); });
    expect(sel).toBe('beta');
    await app.page.click('#replaceOne');
    expect(await app.content()).toBe('alpha Q Alpha gamma alpha\nbeta\nALPHA end');
  });
});
