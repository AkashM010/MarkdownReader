/**
 * Editor module — manages the textarea, line numbers, cursor position stats,
 * and undo/redo history stack.
 */

// ──────────────────────────────────────
// Editor state
// ──────────────────────────────────────
let editor = null;
let lineNumbers = null;
let lineNum = null;
let colNum = null;
let charCount = null;
let wordCountHeader = null;
let readTime = null;
let onInput = null;

// ──────────────────────────────────────
// Undo/Redo history stack
// ──────────────────────────────────────
const MAX_HISTORY = 150;
const MAX_HISTORY_BYTES = 24 * 1024 * 1024;
let history = [];
let historyIndex = -1;
let isUndoRedoing = false;
let undoBtn = null;
let redoBtn = null;

export function initEditor(elements, callbacks) {
  editor = elements.editor;
  lineNumbers = elements.lineNumbers;
  lineNum = elements.lineNum;
  colNum = elements.colNum;
  charCount = elements.charCount;
  wordCountHeader = elements.wordCountHeader;
  readTime = elements.readTime || null;
  onInput = callbacks.onInput;
  undoBtn = elements.undoBtn || null;
  redoBtn = elements.redoBtn || null;

  editor.addEventListener('input', handleInput);
  editor.addEventListener('scroll', syncScroll);
  editor.addEventListener('click', updateStats);
  editor.addEventListener('keyup', updateStats);

  if (undoBtn) undoBtn.addEventListener('click', undo);
  if (redoBtn) redoBtn.addEventListener('click', redo);

  // (Tab / Shift+Tab / Enter list handling lives in format.js.)

  // Keyboard shortcuts for undo/redo (global, also works when not focused on editor)
  document.addEventListener('keydown', handleUndoRedoShortcuts);
}

export function setEditorContent(content) {
  editor.value = content;
  updateAll();
  pushHistory();
}

export function getEditorContent() {
  return editor.value;
}

export function updateLineNumbers() {
  const lines = editor.value.split('\n');
  const count = lines.length;
  const numbers = Array.from({ length: count }, (_, i) => i + 1).join('\n');
  lineNumbers.textContent = numbers;
}

export function updateStats() {
  const text = editor.value;
  const cursorPos = editor.selectionStart;
  const textBefore = text.substring(0, cursorPos);
  const lines = textBefore.split('\n');

  const currentLine = lines.length;
  const currentCol = lines[lines.length - 1].length + 1;
  const totalChars = text.length;
  // Count prose, not image/link syntax (D27)
  const prose = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
  const words = prose.trim() ? prose.trim().split(/\s+/).length : 0;

  lineNum.textContent = currentLine;
  colNum.textContent = currentCol;
  charCount.textContent = totalChars;
  wordCountHeader.textContent = `${words} word${words !== 1 ? 's' : ''}`;
  if (readTime) {
    // ~200 words per minute
    readTime.textContent = words === 0 ? '0 min' : `${Math.max(1, Math.round(words / 200))} min`;
  }
}

export function syncScroll() {
  if (lineNumbers) lineNumbers.scrollTop = editor.scrollTop;
}

export function updateAll() {
  updateLineNumbers();
  updateStats();
  syncScroll();
}

// ──────────────────────────────────────
// History stack
// ──────────────────────────────────────

/**
 * Push the current editor state onto the undo stack.
 * Trims redo entries beyond the current index, enforces MAX_HISTORY,
 * and updates button states.
 */
export function pushHistory() {
  // Trim any redo entries beyond current index
  history = history.slice(0, historyIndex + 1);

  const snapshot = {
    content: editor.value,
    cursorPos: editor.selectionStart,
  };

  // Don't push if identical to the last entry
  const last = history[history.length - 1];
  if (last && last.content === snapshot.content) {
    return;
  }

  history.push(snapshot);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
  // D2: also cap by bytes so huge documents (embedded images) do not
  // multiply into hundreds of megabytes of snapshots.
  let bytes = history.reduce((n, h) => n + h.content.length, 0);
  while (history.length > 1 && bytes > MAX_HISTORY_BYTES) {
    bytes -= history[0].content.length;
    history.shift();
  }
  historyIndex = history.length - 1;
  updateUndoRedoButtons();
}

/**
 * Undo: step back one entry in history.
 */
export function undo() {
  if (historyIndex <= 0) return;
  historyIndex--;
  restoreState(history[historyIndex]);
}

/**
 * Redo: step forward one entry in history.
 */
export function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex++;
  restoreState(history[historyIndex]);
}

/**
 * Check whether undo is currently available.
 */
export function canUndo() {
  return historyIndex > 0;
}

/**
 * Check whether redo is currently available.
 */
export function canRedo() {
  return historyIndex < history.length - 1;
}

function restoreState(entry) {
  isUndoRedoing = true;
  editor.value = entry.content;
  editor.selectionStart = editor.selectionEnd = entry.cursorPos;
  updateAll();
  if (onInput) onInput();
  updateUndoRedoButtons();
  isUndoRedoing = false;
}

function updateUndoRedoButtons() {
  if (undoBtn) undoBtn.disabled = !canUndo();
  if (redoBtn) redoBtn.disabled = !canRedo();
}

function handleUndoRedoShortcuts(e) {
  // D7: leave native undo alone in other fields (find/replace boxes, etc.)
  const active = document.activeElement;
  if (
    active &&
    active !== editor &&
    (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)
  ) {
    return;
  }
  // Ctrl+Z: Undo
  if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
    e.preventDefault();
    undo();
    return;
  }
  // Ctrl+Y or Ctrl+Shift+Z: Redo
  if ((e.ctrlKey || e.metaKey) && ((e.key === 'y' || e.key === 'Y') || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
    e.preventDefault();
    redo();
    return;
  }
}

// ──────────────────────────────────────
// Input handling
// ──────────────────────────────────────

function handleInput() {
  updateLineNumbers();
  updateStats();
  if (onInput && !isUndoRedoing) onInput();
  if (!isUndoRedoing) {
    pushHistory();
  }
}
