/**
 * Find & Replace — a floating bar over the editor.
 *
 * Matches are computed over the textarea value; the current match is shown
 * as the textarea selection (and scrolled into view), with a live counter.
 * Replacements go through setRangeText + an `input` event so history,
 * autosave, and rendering all follow.
 */
import { scrollEditorTo } from './scrollsync.js';
import { isReaderMode, setReaderMode } from './view.js';

let editor = null;
let bar = null;
let findInput = null;
let replaceInput = null;
let replaceRow = null;
let countEl = null;
let caseBtn = null;
let toggleReplaceBtn = null;

let matches = []; // [{ start, end }]
let current = -1;
let caseSensitive = false;
let lastQuery = '';

export function initFind(elements) {
  editor = elements.editor;
  bar = elements.bar;
  findInput = elements.findInput;
  replaceInput = elements.replaceInput;
  replaceRow = elements.replaceRow;
  countEl = elements.count;
  caseBtn = elements.caseBtn;
  toggleReplaceBtn = elements.toggleReplaceBtn;

  // Buttons in the bar never take focus: the editor selection (or the
  // caret in the query box) stays where it is, and Chrome cannot discard a
  // selection we set during the click.
  bar.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) e.preventDefault();
  });

  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      open(false);
    } else if (ctrl && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      open(true);
    } else if (
      e.key === 'Escape' &&
      !bar.hidden &&
      (bar.contains(document.activeElement) || document.activeElement === editor)
    ) {
      // D20: Escape closes the bar from the editor too (VS Code convention)
      e.preventDefault();
      close();
    }
  });

  findInput.addEventListener('input', () => search({ fromCaret: true }));
  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) prev();
      else next();
    }
  });
  replaceInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) replaceAll();
      else replaceOne();
    }
  });

  elements.prevBtn.addEventListener('click', prev);
  elements.nextBtn.addEventListener('click', next);
  elements.closeBtn.addEventListener('click', close);
  // Mouse-driven replacements hand focus to the editor so Ctrl+Z / Ctrl+Y
  // act on the document (in the boxes, undo belongs to the box — D7).
  elements.replaceOneBtn.addEventListener('click', () => {
    replaceOne();
    editor.focus();
  });
  elements.replaceAllBtn.addEventListener('click', () => {
    replaceAll();
    editor.focus();
  });
  caseBtn.addEventListener('click', () => {
    caseSensitive = !caseSensitive;
    caseBtn.setAttribute('aria-pressed', String(caseSensitive));
    search({ fromCaret: true });
    findInput.focus(); // D22: Enter keeps advancing matches
  });
  toggleReplaceBtn.addEventListener('click', () => setReplaceVisible(replaceRow.hidden));

  // Keep results fresh while the document changes underneath the bar.
  editor.addEventListener('input', () => {
    if (!bar.hidden && lastQuery) search({ keepCurrent: true, silent: true });
  });
}

// ──────────────────────────────────────
// Open / close
// ──────────────────────────────────────

export function open(withReplace) {
  // D8: the bar lives in the editor pane — leave reader mode to search.
  if (isReaderMode()) setReaderMode(false, true);

  const wasHidden = bar.hidden;
  bar.hidden = false;
  setReplaceVisible(withReplace || !replaceRow.hidden);

  // D18: seed the query from a single-line selection only when opening.
  if (wasHidden) {
    const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    if (sel && !sel.includes('\n') && sel.length <= 200) findInput.value = sel;
  }

  // D19: Ctrl+H on an already-open bar moves focus to the Replace box.
  if (withReplace && !wasHidden) {
    replaceInput.focus();
    replaceInput.select();
  } else {
    findInput.focus();
    findInput.select();
  }
  search({ fromCaret: true });
}

export function close() {
  bar.hidden = true;
  matches = [];
  current = -1;
  editor.focus();
}

function setReplaceVisible(show) {
  replaceRow.hidden = !show;
  toggleReplaceBtn.setAttribute('aria-pressed', String(show));
  if (show && !bar.hidden && document.activeElement !== findInput) replaceInput.focus();
}

// ──────────────────────────────────────
// Search
// ──────────────────────────────────────

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function search({ fromCaret = false, keepCurrent = false, silent = false } = {}) {
  const q = findInput.value;
  lastQuery = q;
  matches = [];
  if (q) {
    const re = new RegExp(escapeRegExp(q), caseSensitive ? 'g' : 'gi');
    const value = editor.value;
    let m;
    while ((m = re.exec(value)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) re.lastIndex++;
    }
  }

  if (matches.length === 0) {
    current = -1;
    updateCount();
    return;
  }

  if (keepCurrent && current >= 0) {
    current = Math.min(current, matches.length - 1);
  } else if (fromCaret) {
    const caret = editor.selectionStart;
    const idx = matches.findIndex((x) => x.start >= caret);
    current = idx === -1 ? 0 : idx;
  } else {
    current = 0;
  }
  updateCount();
  if (!silent) showCurrent();
}

function updateCount() {
  countEl.textContent = matches.length ? `${current + 1}/${matches.length}` : findInput.value ? '0/0' : '';
  countEl.classList.toggle('no-match', Boolean(findInput.value) && matches.length === 0);
}

function showCurrent() {
  if (current < 0 || !matches[current]) return;
  const { start, end } = matches[current];
  editor.setSelectionRange(start, end);
  revealSelection(start);
}

function revealSelection(pos) {
  const cs = getComputedStyle(editor);
  const lineHeight = parseFloat(cs.lineHeight) || 22;
  const paddingTop = parseFloat(cs.paddingTop) || 0;
  let line = 1;
  const v = editor.value;
  for (let i = v.indexOf('\n'); i !== -1 && i < pos; i = v.indexOf('\n', i + 1)) line++;
  const lineTop = paddingTop + (line - 1) * lineHeight;
  const viewTop = editor.scrollTop;
  const viewBottom = viewTop + editor.clientHeight;
  if (lineTop < viewTop + lineHeight || lineTop + lineHeight > viewBottom - lineHeight) {
    scrollEditorTo(lineTop - editor.clientHeight * 0.35);
  }
}

export function next() {
  if (matches.length === 0) return search({ fromCaret: true });
  current = (current + 1) % matches.length;
  updateCount();
  showCurrent();
}

export function prev() {
  if (matches.length === 0) return search({ fromCaret: true });
  current = (current - 1 + matches.length) % matches.length;
  updateCount();
  showCurrent();
}

// ──────────────────────────────────────
// Replace
// ──────────────────────────────────────

function applyEdit(start, end, text, selStart, selEnd) {
  editor.setRangeText(text, start, end, 'preserve');
  editor.setSelectionRange(selStart, selEnd);
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}

export function replaceOne() {
  if (matches.length === 0) return search({ fromCaret: true });
  if (current < 0) current = 0;
  const { start, end } = matches[current];

  // D21: never replace something the user is not looking at — if the
  // editor selection drifted away from the current match, re-select it
  // first and let the next press do the replacement.
  if (editor.selectionStart !== start || editor.selectionEnd !== end) {
    showCurrent();
    return;
  }

  const text = replaceInput.value;
  applyEdit(start, end, text, start + text.length, start + text.length);
  // The input handler re-ran the search silently; advance to the match
  // that now sits after the replacement.
  const idx = matches.findIndex((x) => x.start >= start + text.length);
  current = matches.length === 0 ? -1 : idx === -1 ? 0 : idx;
  updateCount();
  showCurrent();
}

export function replaceAll() {
  if (!lastQuery) return;
  const re = new RegExp(escapeRegExp(lastQuery), caseSensitive ? 'g' : 'gi');
  const value = editor.value;
  const text = replaceInput.value;
  const count = matches.length;
  if (count === 0) return;
  const out = value.replace(re, () => text);
  const caret = Math.min(editor.selectionStart, out.length);
  applyEdit(0, value.length, out, caret, caret);
  countEl.textContent = `Replaced ${count}`;
  countEl.classList.remove('no-match');
}
