/**
 * Format module — formatting toolbar + keyboard shortcuts for the editor.
 *
 * Every command edits the textarea with setRangeText and then dispatches an
 * `input` event, so rendering, undo history, autosave, dirty state, and the
 * locate marker all update through the normal path. Commands are toggles
 * where that makes sense (bold on bold text un-bolds it, bullets on a
 * bulleted block remove them) and operate on every line of a selection.
 */
let editor = null;
let toolbar = null;

const PLACEHOLDER = {
  bold: 'bold text',
  italic: 'italic text',
  strike: 'strikethrough',
  code: 'code',
};

// Prefix detectors for line-level toggles
const LINE_PREFIX = {
  quote: { text: '> ', test: /^> / },
  ul: { text: '- ', test: /^[-*+] (?!\[[ xX]\] )/ },
  task: { text: '- [ ] ', test: /^[-*+] \[[ xX]\] / },
};
const ANY_BLOCK_PREFIX = /^(> |[-*+] \[[ xX]\] |[-*+] |\d+[.)] )/;
const HEADING_PREFIX = /^#{1,6} /;

const COMMANDS = {
  heading: (level) => setHeading(Number(level)),
  bold: () => wrapInline('**', '**', 'bold'),
  italic: () => wrapInline('*', '*', 'italic'),
  strike: () => wrapInline('~~', '~~', 'strike'),
  code: () => wrapInline('`', '`', 'code'),
  quote: () => toggleLinePrefix('quote'),
  ul: () => toggleLinePrefix('ul'),
  task: () => toggleLinePrefix('task'),
  ol: () => toggleOrdered(),
  link: () => insertLink(false),
  image: () => insertLink(true),
  table: () =>
    insertBlock(
      '| Column 1 | Column 2 | Column 3 |\n|----------|----------|----------|\n| Cell     | Cell     | Cell     |\n| Cell     | Cell     | Cell     |'
    ),
  codeblock: () => insertCodeBlock(),
  hr: () => insertBlock('---'),
  alert: (type) => insertBlock(`> [!${type}]\n> `),
  mermaid: () =>
    insertBlock('```mermaid\ngraph TD\n    A[Start] --> B{Decision}\n    B -->|Yes| C[Done]\n    B -->|No| D[Retry]\n    D --> B\n```'),
};

export function initFormat(elements) {
  editor = elements.editor;
  toolbar = elements.toolbar;

  // Keep the editor's focus and selection when a toolbar button is pressed.
  toolbar.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) e.preventDefault();
  });

  toolbar.addEventListener('click', (e) => {
    const item = e.target.closest('.tb-menu-item');
    if (item) {
      closeMenus();
      run(item.dataset.cmd, item.dataset.arg);
      return;
    }
    const btn = e.target.closest('button[data-cmd], button[data-menu]');
    if (!btn) return;
    if (btn.dataset.menu) {
      toggleMenu(btn);
      return;
    }
    run(btn.dataset.cmd, btn.dataset.arg);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.tb-dropdown')) closeMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenus();
  });

  editor.addEventListener('keydown', onShortcut);
  editor.addEventListener('keydown', onEditingKeys);
}

// ──────────────────────────────────────
// Smart lists: Enter continues a list, Tab / Shift+Tab indent it
// ──────────────────────────────────────

const LIST_LINE = /^(\s*)([-*+] \[[ xX]\] |[-*+] |(\d+)([.)]) |> )(.*)$/;

function onEditingKeys(e) {
  if (e.isComposing || e.keyCode === 229) return; // D11: IME composition
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (continueList()) e.preventDefault();
  } else if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    if (e.shiftKey) outdent();
    else indent();
  }
}

function continueList() {
  const { start, end, value } = getSel();
  if (start !== end) return false;
  const ls = value.lastIndexOf('\n', start - 1) + 1;
  const m = LIST_LINE.exec(value.slice(ls, start));
  if (!m) return false;
  const [, indentStr, prefix, num, delim, rest] = m;
  let le = value.indexOf('\n', start);
  if (le === -1) le = value.length;
  const afterCaret = value.slice(start, le);

  // Enter on an empty item ends the list.
  if (rest.trim() === '' && afterCaret.trim() === '') {
    replace(ls, start, indentStr, ls + indentStr.length, ls + indentStr.length);
    return true;
  }

  let next = prefix;
  if (num !== undefined) next = `${Number(num) + 1}${delim} `;
  else if (/^[-*+] \[/.test(prefix)) next = prefix.replace(/\[[ xX]\]/, '[ ]');
  const ins = '\n' + indentStr + next;
  replace(start, start, ins, start + ins.length, start + ins.length);
  return true;
}

function indent() {
  const { start, end, value } = getSel();
  const { ls, le } = lineRange(value, start, end);
  const block = value.slice(ls, le);
  const listy = /^\s*([-*+] |\d+[.)] |> )/.test(block);
  if (start === end && !listy) {
    replace(start, end, '  ', start + 2, start + 2);
    return;
  }
  const out = block.split('\n').map((l) => '  ' + l).join('\n');
  if (start === end) replace(ls, le, out, start + 2, start + 2);
  else replace(ls, le, out, ls, ls + out.length);
}

function outdent() {
  const { start, end, value } = getSel();
  const { ls, le } = lineRange(value, start, end);
  const block = value.slice(ls, le);
  let firstRemoved = 0;
  const out = block
    .split('\n')
    .map((l, i) => {
      const m = /^( {1,2}|	)/.exec(l);
      const removed = m ? m[0].length : 0;
      if (i === 0) firstRemoved = removed;
      return l.slice(removed);
    })
    .join('\n');
  if (out === block) return;
  if (start === end) {
    const caret = Math.max(ls, start - firstRemoved);
    replace(ls, le, out, caret, caret);
  } else {
    replace(ls, le, out, ls, ls + out.length);
  }
}

export function run(cmd, arg) {
  const fn = COMMANDS[cmd];
  if (!fn) return;
  fn(arg);
}

// ──────────────────────────────────────
// Menus
// ──────────────────────────────────────

function toggleMenu(btn) {
  const menu = btn.parentElement.querySelector('.tb-menu');
  const open = !menu.classList.contains('open');
  closeMenus();
  menu.classList.toggle('open', open);
  btn.setAttribute('aria-expanded', String(open));
}

function closeMenus() {
  toolbar.querySelectorAll('.tb-menu.open').forEach((m) => m.classList.remove('open'));
  toolbar.querySelectorAll('[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}

// ──────────────────────────────────────
// Shortcuts (only while the editor has focus)
// ──────────────────────────────────────

function onShortcut(e) {
  if (e.isComposing || e.keyCode === 229) return;
  const ctrl = e.ctrlKey || e.metaKey;
  let cmd = null;

  if (ctrl && !e.shiftKey && !e.altKey) {
    const k = e.key.toLowerCase();
    if (k === 'b') cmd = 'bold';
    else if (k === 'i') cmd = 'italic';
    else if (k === 'e') cmd = 'code';
    else if (k === 'k') cmd = 'link';
  } else if (ctrl && e.shiftKey && !e.altKey) {
    if (e.code === 'Digit7') cmd = 'ol';
    else if (e.code === 'Digit8') cmd = 'ul';
    else if (e.code === 'Period') cmd = 'quote';
    else if (e.code === 'KeyL') cmd = 'task';
  } else if (e.altKey && e.shiftKey && e.code === 'Digit5') {
    cmd = 'strike';
  }

  if (cmd) {
    e.preventDefault();
    run(cmd);
  }
}

// ──────────────────────────────────────
// Editing primitives
// ──────────────────────────────────────

function getSel() {
  return { start: editor.selectionStart, end: editor.selectionEnd, value: editor.value };
}

function replace(start, end, text, selStart, selEnd) {
  editor.setRangeText(text, start, end, 'preserve');
  editor.setSelectionRange(selStart, selEnd);
  editor.focus();
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Full-line range covering the selection (without a trailing newline). */
function lineRange(value, start, end) {
  const ls = value.lastIndexOf('\n', start - 1) + 1;
  const probe = end > start ? end - 1 : end;
  let le = value.indexOf('\n', probe);
  if (le === -1) le = value.length;
  return { ls, le };
}

function wrapInline(before, after, key) {
  const { start, end, value } = getSel();
  const selected = value.slice(start, end);

  // Selection itself contains the markers → unwrap
  if (
    selected.length >= before.length + after.length &&
    selected.startsWith(before) &&
    selected.endsWith(after)
  ) {
    const inner = selected.slice(before.length, selected.length - after.length);
    replace(start, end, inner, start, start + inner.length);
    return;
  }
  // Markers sit just outside the selection → unwrap
  if (
    value.slice(start - before.length, start) === before &&
    value.slice(end, end + after.length) === after &&
    value[start - before.length - 1] !== before[0] &&
    value[end + after.length] !== after[0]
  ) {
    const from = start - before.length;
    replace(from, end + after.length, selected, from, from + selected.length);
    return;
  }

  const text = selected || PLACEHOLDER[key];
  replace(start, end, before + text + after, start + before.length, start + before.length + text.length);
}

function toggleLinePrefix(kind) {
  const { text: prefix, test } = LINE_PREFIX[kind];
  const { start, end, value } = getSel();
  const { ls, le } = lineRange(value, start, end);
  const lines = value.slice(ls, le).split('\n');
  const content = lines.filter((l) => l.trim() !== '');
  const has = content.length > 0 && content.every((l) => test.test(l));

  const out = lines
    .map((l) => {
      if (has) return l.replace(test, '');
      if (l.trim() === '' && lines.length > 1) return l;
      return prefix + l.replace(ANY_BLOCK_PREFIX, '');
    })
    .join('\n');
  replace(ls, le, out, ls, ls + out.length);
}

function toggleOrdered() {
  const { start, end, value } = getSel();
  const { ls, le } = lineRange(value, start, end);
  const lines = value.slice(ls, le).split('\n');
  const content = lines.filter((l) => l.trim() !== '');
  const has = content.length > 0 && content.every((l) => /^\d+[.)] /.test(l));

  let n = 1;
  const out = lines
    .map((l) => {
      if (has) return l.replace(/^\d+[.)] /, '');
      if (l.trim() === '' && lines.length > 1) return l;
      return `${n++}. ${l.replace(ANY_BLOCK_PREFIX, '')}`;
    })
    .join('\n');
  replace(ls, le, out, ls, ls + out.length);
}

function setHeading(level) {
  const { start, end, value } = getSel();
  const { ls, le } = lineRange(value, start, end);
  const lines = value.slice(ls, le).split('\n');
  const want = level > 0 ? '#'.repeat(level) + ' ' : '';
  const alreadyThatLevel =
    level > 0 && lines.every((l) => l.startsWith(want) && !l.startsWith(want + '#'));

  const out = lines
    .map((l) => {
      const bare = l.replace(HEADING_PREFIX, '');
      return alreadyThatLevel ? bare : want + bare;
    })
    .join('\n');
  replace(ls, le, out, ls, ls + out.length);
}

function insertLink(isImage) {
  const { start, end, value } = getSel();
  const selected = value.slice(start, end);
  const text = selected || (isImage ? 'alt text' : 'link text');
  const url = isImage ? 'image-url' : 'https://';
  const prefix = `${isImage ? '!' : ''}[${text}](`;
  const out = `${prefix}${url})`;
  replace(start, end, out, start + prefix.length, start + prefix.length + url.length);
}

/** Insert block-level markdown on its own lines, padded by blank lines. */
function insertBlock(text) {
  const { start, end, value } = getSel();
  const before = value.slice(0, start);
  const after = value.slice(end);
  const pre = before.length === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const post = after.length === 0 ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const out = pre + text + post;
  const caret = start + pre.length + text.length;
  replace(start, end, out, caret, caret);
}

function insertCodeBlock() {
  const { start, end, value } = getSel();
  const selected = value.slice(start, end);
  const body = selected || 'code';
  const lang = 'language';
  const text = '```' + lang + '\n' + body + '\n```';

  const before = value.slice(0, start);
  const after = value.slice(end);
  const pre = before.length === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const post = after.length === 0 ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const out = pre + text + post;
  const langFrom = start + pre.length + 3;
  replace(start, end, out, langFrom, langFrom + lang.length);
}
