const { test, expect } = require('../helpers.cjs');

async function enterAt(app, text, caret) {
  await app.setContent(text);
  await app.setCaret(caret ?? text.length);
  await app.press('Enter');
  return app.content();
}

test.describe('Phase 1 — Smart lists (Enter)', () => {
  const cases = [
    ['SL-01 bullet "-" continues', '- item', '- item\n- '],
    ['SL-02 bullet "*" continues', '* item', '* item\n* '],
    ['SL-03 numbered list increments', '1. item', '1. item\n2. '],
    ['SL-03b numbered 9 → 10', '9. item', '9. item\n10. '],
    ['SL-04 open task continues', '- [ ] todo', '- [ ] todo\n- [ ] '],
    ['SL-04b done task continues as an open task', '- [x] done', '- [x] done\n- [ ] '],
    ['SL-04c uppercase X task', '- [X] done', '- [X] done\n- [ ] '],
    ['SL-05 blockquote continues', '> quote', '> quote\n> '],
    ['SL-05b alert callout continues as a quote line', '> [!NOTE]', '> [!NOTE]\n> '],
    ['SL-07 nested bullet keeps its indent', '- a\n  - sub', '- a\n  - sub\n  - '],
    ['SL-07b nested numbered keeps its indent', '1. a\n   1. sub', '1. a\n   1. sub\n   2. '],
    ['SL-10 plain paragraph gets a plain newline', 'hello', 'hello\n'],
    ['SL-17 "-item" (no space) is not a list', '-item', '-item\n'],
    ['SL-17b heading is not a list', '# title', '# title\n'],
    ['SL-17c horizontal rule is not a list', '---', '---\n'],
  ];
  for (const [name, input, want] of cases) {
    test(name, async ({ app }) => {
      await app.boot();
      expect(await enterAt(app, input)).toBe(want);
    });
  }

  test('SL-06 Enter on an empty bullet ends the list (prefix removed, no new line)', async ({ app }) => {
    await app.boot();
    expect(await enterAt(app, '- a\n- ')).toBe('- a\n');
    expect((await app.caret()).start).toBe(4);
  });

  test('SL-06b Enter on an empty numbered / task / quote item ends the list', async ({ app }) => {
    await app.boot();
    expect(await enterAt(app, '1. a\n2. ')).toBe('1. a\n');
    expect(await enterAt(app, '- [ ] a\n- [ ] ')).toBe('- [ ] a\n');
    expect(await enterAt(app, '> a\n> ')).toBe('> a\n');
  });

  test('SL-06c Enter on an empty nested item keeps only the indentation', async ({ app }) => {
    await app.boot();
    expect(await enterAt(app, '- a\n  - ')).toBe('- a\n  ');
  });

  test('SL-08 Enter in the middle of an item splits it into two items', async ({ app }) => {
    await app.boot();
    expect(await enterAt(app, '- hello', 5)).toBe('- hel\n- lo');
    expect((await app.caret()).start).toBe(8);
  });

  test('SL-09 Shift+Enter inserts a plain newline inside a list', async ({ app }) => {
    await app.boot();
    await app.setContent('- item');
    await app.setCaret(6);
    await app.press('Shift+Enter');
    expect(await app.content()).toBe('- item\n');
  });

  test('SL-11 Enter with a selection replaces the selection with a newline (no list magic)', async ({ app }) => {
    await app.boot();
    await app.setContent('- item one');
    await app.setCaret(2, 6);
    await app.press('Enter');
    expect(await app.content()).toBe('- \n one');
  });

  test('SL-15 "+ item" bullets (valid CommonMark) continue too', async ({ app }) => {
    await app.boot();
    expect.soft(await enterAt(app, '+ item'), '"+" bullets are not continued').toBe('+ item\n+ ');
  });

  test('SL-16 "1) item" ordered lists (valid CommonMark) continue too', async ({ app }) => {
    await app.boot();
    expect.soft(await enterAt(app, '1) item'), '"1)" lists are not continued').toBe('1) item\n2) ');
  });

  test('SL-19 Enter during IME composition must not be hijacked', async ({ app }) => {
    await app.boot();
    await app.setContent('- 日本');
    await app.setCaret(4);
    const prevented = await app.page.evaluate(() => {
      const ed = document.getElementById('editor');
      const ev = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true, cancelable: true });
      ed.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    expect(prevented, 'list continuation fired during IME composition (isComposing=true)').toBe(false);
  });

  test('SL-20 a single undo reverts the list continuation', async ({ app }) => {
    await app.boot();
    await enterAt(app, '- item');
    expect(await app.content()).toBe('- item\n- ');
    await app.press('Control+z');
    expect(await app.content()).toBe('- item');
  });

  test('SL-24 Ctrl+Enter / Alt+Enter are left to the browser', async ({ app }) => {
    await app.boot();
    await app.setContent('- item');
    await app.setCaret(6);
    await app.press('Control+Enter');
    await app.press('Alt+Enter');
    expect(await app.content()).not.toContain('\n- ');
  });

  test('SL-25 Enter inside a numbered list inserts the next number without renumbering (documented)', async ({ app }) => {
    await app.boot();
    expect(await enterAt(app, '1. a\n2. b\n3. c', 4)).toBe('1. a\n2. \n2. b\n3. c');
  });

  test('SL-26 Enter at the start of an item leaves an empty item above it', async ({ app }) => {
    await app.boot();
    expect(await enterAt(app, '- hello', 2)).toBe('- \n- hello');
  });

  test('SL-27 list continuation renders correctly in the preview', async ({ app }) => {
    await app.boot();
    await app.setContent('- one');
    await app.setCaret(5);
    await app.press('Enter');
    await app.page.keyboard.type('two');
    await app.waitRendered();
    await expect(app.page.locator('#preview li')).toHaveText(['one', 'two']);
  });
});

test.describe('Phase 1 — Tab / Shift+Tab', () => {
  test('TB-01 Tab on a plain line inserts two spaces at the caret', async ({ app }) => {
    await app.boot();
    await app.setContent('ab');
    await app.setCaret(1);
    await app.press('Tab');
    expect(await app.content()).toBe('a  b');
    expect((await app.caret()).start).toBe(3);
  });

  test('TB-02 Tab on a list line indents the whole line; Shift+Tab outdents; caret follows', async ({ app }) => {
    await app.boot();
    await app.setContent('- a\n- b');
    await app.setCaret(7);
    await app.press('Tab');
    expect(await app.content()).toBe('- a\n  - b');
    expect((await app.caret()).start).toBe(9);
    await app.press('Shift+Tab');
    expect(await app.content()).toBe('- a\n- b');
    expect((await app.caret()).start).toBe(7);
  });

  test('TB-03 Tab on a numbered / quote line indents the line', async ({ app }) => {
    await app.boot();
    await app.setContent('1. a');
    await app.setCaret(4);
    await app.press('Tab');
    expect(await app.content()).toBe('  1. a');
    await app.setContent('> q');
    await app.setCaret(3);
    await app.press('Tab');
    expect(await app.content()).toBe('  > q');
  });

  test('TB-04 Shift+Tab removes a single leading space and is a no-op without indentation', async ({ app }) => {
    await app.boot();
    await app.setContent(' - a');
    await app.setCaret(4);
    await app.press('Shift+Tab');
    expect(await app.content()).toBe('- a');
    await app.press('Shift+Tab');
    expect(await app.content()).toBe('- a');
  });

  test('TB-05 multi-line selection: Tab indents every line and keeps the block selected; Shift+Tab reverses', async ({ app }) => {
    await app.boot();
    await app.setContent('- a\n- b\n- c');
    await app.setCaret(0, 11);
    await app.press('Tab');
    expect(await app.content()).toBe('  - a\n  - b\n  - c');
    expect(await app.caret()).toEqual({ start: 0, end: 17 });
    await app.press('Shift+Tab');
    expect(await app.content()).toBe('- a\n- b\n- c');
    expect(await app.caret()).toEqual({ start: 0, end: 11 });
  });

  test('TB-06 Tab with a selection on plain lines indents them (no space insertion)', async ({ app }) => {
    await app.boot();
    await app.setContent('x\ny');
    await app.setCaret(0, 3);
    await app.press('Tab');
    expect(await app.content()).toBe('  x\n  y');
  });

  test('TB-07 Tab inside the Find input moves focus instead of inserting spaces', async ({ app }) => {
    await app.boot();
    await app.setContent('abc');
    await app.press('Control+f');
    await expect(app.page.locator('#findInput')).toBeFocused();
    await app.press('Tab');
    await expect(app.page.locator('#findInput')).not.toBeFocused();
    expect(await app.content()).toBe('abc');
  });

  test('TB-08 Tab edits are undoable', async ({ app }) => {
    await app.boot();
    await app.setContent('- a');
    await app.setCaret(3);
    await app.press('Tab');
    expect(await app.content()).toBe('  - a');
    await app.press('Control+z');
    expect(await app.content()).toBe('- a');
  });

  test('TB-09 Shift+Tab on a tab-indented line (literal \\t) outdents', async ({ app }) => {
    await app.boot();
    await app.setContent('\t- a');
    await app.setCaret(4);
    await app.press('Shift+Tab');
    expect.soft(await app.content(), 'tab-character indentation is not outdented').toBe('- a');
  });

  test('TB-10 nested list produced by Tab renders as a nested list', async ({ app }) => {
    await app.boot();
    await app.setContent('- a\n- b');
    await app.setCaret(7);
    await app.press('Tab');
    await app.waitRendered();
    await expect(app.page.locator('#preview li li')).toHaveCount(1);
  });
});
