/**
 * Locate module — keeps a "current block" pinpointed in BOTH panes.
 *
 * - The preview block containing the editor caret gets a soft marker that
 *   follows the caret (and is scrolled into view if it is off-screen).
 * - Clicking a block in the preview (or an outline entry, via the
 *   `md-locate` event) moves the caret to that block's source lines, scrolls
 *   the editor there, and highlights exactly those lines.
 *
 * Blocks come from the `data-line` / `data-line-end` attributes the preview
 * stamps on its top-level elements.
 */
import { scrollEditorTo, scrollPreviewTo } from './scrollsync.js';

let editor = null;
let editorWrapper = null;
let preview = null;
let previewContent = null;

let editorMarker = null;
let previewMarker = null;

let blocks = []; // [{ el, start, end }]
let current = null;
let updateFrame = null;
let editorMarkerFrame = null;
let metrics = null;

export function initLocate(elements) {
  editor = elements.editor;
  editorWrapper = elements.editorWrapper;
  preview = elements.preview;
  previewContent = elements.previewContent;

  editorMarker = document.createElement('div');
  editorMarker.className = 'editor-marker';
  editorMarker.setAttribute('aria-hidden', 'true');
  editorWrapper.appendChild(editorMarker);

  previewMarker = document.createElement('div');
  previewMarker.className = 'preview-marker';
  previewMarker.setAttribute('aria-hidden', 'true');
  previewContent.insertBefore(previewMarker, previewContent.firstChild);

  // Caret tracking
  ['keyup', 'mouseup', 'input'].forEach((type) =>
    editor.addEventListener(type, () => scheduleUpdate(true))
  );
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === editor) scheduleUpdate(true);
  });
  editor.addEventListener('scroll', scheduleEditorMarker, { passive: true });

  // Preview interactions
  preview.addEventListener('click', onPreviewClick);
  document.addEventListener('md-locate', (e) => locateBlock(e.detail?.el));

  // Layout / content changes
  document.addEventListener('md-rendered', () => {
    rebuildBlocks();
    scheduleUpdate(false);
  });
  window.addEventListener('resize', () => {
    metrics = null;
    scheduleUpdate(false);
  });
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => positionPreviewMarker()).observe(preview);
  }
}

// ──────────────────────────────────────
// Block model
// ──────────────────────────────────────

function rebuildBlocks() {
  blocks = [];
  for (const el of preview.querySelectorAll(':scope > [data-line]')) {
    const start = Number(el.dataset.line);
    const end = Number(el.dataset.lineEnd) || start;
    blocks.push({ el, start, end });
  }
}

function caretLine() {
  const pos = editor.selectionStart;
  const value = editor.value;
  let line = 1;
  for (let i = value.indexOf('\n'); i !== -1 && i < pos; i = value.indexOf('\n', i + 1)) line++;
  return line;
}

function lineStartOffset(line) {
  const value = editor.value;
  let offset = 0;
  for (let l = 1; l < line; l++) {
    const next = value.indexOf('\n', offset);
    if (next === -1) return value.length;
    offset = next + 1;
  }
  return offset;
}

function findBlock(line) {
  let found = null;
  for (const b of blocks) {
    if (b.start <= line) found = b;
    else break;
  }
  return found;
}

// ──────────────────────────────────────
// Updates
// ──────────────────────────────────────

function scheduleUpdate(fromCaret) {
  if (updateFrame) return;
  updateFrame = requestAnimationFrame(() => {
    updateFrame = null;
    update(fromCaret);
  });
}

function update(fromCaret) {
  if (blocks.length === 0) rebuildBlocks();
  const block = findBlock(caretLine());
  const changed = !current || !block || current.start !== block.start || current.el !== block.el;
  current = block;
  positionEditorMarker();
  positionPreviewMarker();
  if (changed && fromCaret && block) ensurePreviewVisible(block);
}

function getMetrics() {
  if (!metrics) {
    const cs = getComputedStyle(editor);
    const lh = parseFloat(cs.lineHeight);
    const pt = parseFloat(cs.paddingTop);
    metrics = {
      lineHeight: Number.isFinite(lh) && lh > 0 ? lh : 22,
      paddingTop: Number.isFinite(pt) ? pt : 0,
    };
  }
  return metrics;
}

function scheduleEditorMarker() {
  if (editorMarkerFrame) return;
  editorMarkerFrame = requestAnimationFrame(() => {
    editorMarkerFrame = null;
    positionEditorMarker();
  });
}

function positionEditorMarker() {
  if (!current) {
    editorMarker.style.opacity = '0';
    return;
  }
  const { lineHeight, paddingTop } = getMetrics();
  const top = paddingTop + (current.start - 1) * lineHeight - editor.scrollTop;
  const height = (current.end - current.start + 1) * lineHeight;
  editorMarker.style.transform = `translateY(${top}px)`;
  editorMarker.style.height = `${height}px`;
  editorMarker.style.opacity = '1';
}

function positionPreviewMarker() {
  if (!current || !current.el.isConnected) {
    previewMarker.style.opacity = '0';
    return;
  }
  const r = current.el.getBoundingClientRect();
  const c = previewContent.getBoundingClientRect();
  previewMarker.style.top = `${r.top - c.top + previewContent.scrollTop - 6}px`;
  previewMarker.style.left = `${r.left - c.left - 18}px`;
  previewMarker.style.width = `${r.width + 36}px`;
  previewMarker.style.height = `${r.height + 12}px`;
  previewMarker.style.opacity = '1';
}

function ensurePreviewVisible(block) {
  const r = block.el.getBoundingClientRect();
  const c = previewContent.getBoundingClientRect();
  const above = r.top < c.top + 8;
  const below = r.bottom > c.bottom - 8;
  if (!above && !below) return;
  scrollPreviewTo(r.top - c.top + previewContent.scrollTop - 24);
}

// ──────────────────────────────────────
// Locate from the preview
// ──────────────────────────────────────

function onPreviewClick(e) {
  if (e.target.closest('a, button, input, textarea, select, .code-copy')) return;
  const selection = window.getSelection();
  if (selection && selection.toString().length > 0) return; // user was selecting text
  const el = e.target.closest('#preview > [data-line]');
  if (el) locateBlock(el);
}

function flash(el) {
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

/** Move the caret to a preview block's source and highlight it in both panes. */
export function locateBlock(el) {
  if (!el) return;
  if (blocks.length === 0) rebuildBlocks();
  let block = blocks.find((b) => b.el === el);
  if (!block && el.dataset?.line) {
    const line = Number(el.dataset.line);
    block = blocks.find((b) => b.start === line) || null;
  }
  if (!block) return;

  const offset = lineStartOffset(block.start);
  editor.setSelectionRange(offset, offset);

  // Park the block in the upper third of the editor viewport.
  const { lineHeight, paddingTop } = getMetrics();
  const lineTop = paddingTop + (block.start - 1) * lineHeight;
  scrollEditorTo(lineTop - editor.clientHeight * 0.3);

  // Hand keyboard focus to the editor on non-touch devices (a touch device
  // would pop the on-screen keyboard).
  if (window.matchMedia('(pointer: fine)').matches) editor.focus();

  current = block;
  positionEditorMarker();
  positionPreviewMarker();
  flash(editorMarker);
  flash(previewMarker);
}
