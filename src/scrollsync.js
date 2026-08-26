/**
 * Scroll sync module — keeps the editor and preview aligned in BOTH
 * directions.
 *
 * The preview stamps its top-level elements with `data-line` (the source
 * line each block started on). Because the editor uses wrap="off", one
 * logical line equals one visual line, so editor scrollTop maps cleanly to
 * a source line and back; we interpolate between the two nearest mapped
 * blocks to convert positions.
 *
 * Feedback-loop protection is symmetric: each side records the exact
 * scrollTop it assigns to the other, and the matching scroll event is
 * consumed instead of being treated as user input.
 */
let editor = null;
let previewContent = null;
let preview = null;

let map = []; // [{ line, top }]
let syncFrame = null;
let reverseFrame = null;
let rebuildFrame = null;
let renderInProgress = false;
let expectedPreviewScrollTop = null;
let expectedEditorScrollTop = null;
let lastManualPreviewScroll = 0;

const MANUAL_SCROLL_GRACE_MS = 2000;

export function initScrollSync(elements) {
  editor = elements.editor;
  previewContent = elements.previewContent;
  preview = elements.preview;

  editor.addEventListener('scroll', () => {
    if (expectedEditorScrollTop !== null && Math.abs(editor.scrollTop - expectedEditorScrollTop) <= 2) {
      // Our own reverse-sync assignment arriving.
      expectedEditorScrollTop = null;
      return;
    }
    expectedEditorScrollTop = null;
    requestSync();
  }, { passive: true });

  // Distinguish user scrolls of the preview from programmatic/clamp ones so
  // a re-render doesn't yank the preview away from where the user put it.
  previewContent.addEventListener('scroll', () => {
    if (expectedPreviewScrollTop !== null && Math.abs(previewContent.scrollTop - expectedPreviewScrollTop) <= 1) {
      // Our own forward-sync assignment arriving.
      expectedPreviewScrollTop = null;
      return;
    }
    if (renderInProgress) {
      // Browser clamp from the DOM swap shrinking scrollHeight — not a user scroll.
      return;
    }
    expectedPreviewScrollTop = null;
    lastManualPreviewScroll = Date.now();
    requestReverseSync();
  }, { passive: true });

  document.addEventListener('md-render-start', () => {
    renderInProgress = true;
  });

  // After each render the DOM (and offsets) are new: rebuild the map and
  // re-align — unless the user just scrolled the preview themselves.
  document.addEventListener('md-rendered', () => {
    renderInProgress = false;
    rebuildMap();
    if (Date.now() - lastManualPreviewScroll > MANUAL_SCROLL_GRACE_MS) {
      requestSync();
    }
  });

  // Layout can change without a render (divider drag, outline toggle,
  // window resize, images/fonts loading) — refresh cached geometry.
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(scheduleRebuild);
    ro.observe(preview);
  }
  window.addEventListener('resize', () => {
    cachedMetrics = null;
    scheduleRebuild();
  });
}

/** Programmatic editor scroll that won't be mistaken for user input. */
export function scrollEditorTo(top) {
  const max = Math.max(editor.scrollHeight - editor.clientHeight, 0);
  const target = Math.min(Math.max(top, 0), max);
  if (Math.abs(editor.scrollTop - target) < 2) return;
  expectedEditorScrollTop = target;
  editor.scrollTop = target;
}

/** Programmatic preview scroll; treated as user intent for the re-sync grace. */
export function scrollPreviewTo(top) {
  const max = Math.max(previewContent.scrollHeight - previewContent.clientHeight, 0);
  const target = Math.min(Math.max(top, 0), max);
  lastManualPreviewScroll = Date.now();
  if (Math.abs(previewContent.scrollTop - target) < 2) return;
  expectedPreviewScrollTop = target;
  previewContent.scrollTop = target;
}

function scheduleRebuild() {
  if (rebuildFrame) return;
  rebuildFrame = requestAnimationFrame(() => {
    rebuildFrame = null;
    rebuildMap();
  });
}

function rebuildMap() {
  map = [];
  for (const el of preview.querySelectorAll(':scope > [data-line]')) {
    map.push({ line: Number(el.dataset.line), top: el.offsetTop });
  }
}

function requestSync() {
  if (syncFrame) return;
  syncFrame = requestAnimationFrame(() => {
    syncFrame = null;
    syncNow();
  });
}

function requestReverseSync() {
  if (reverseFrame) return;
  reverseFrame = requestAnimationFrame(() => {
    reverseFrame = null;
    reverseSyncNow();
  });
}

/** Shared geometry guards; returns null when sync is meaningless. */
function getBounds() {
  if (map.length === 0) rebuildMap();
  if (map.length === 0) return null;
  const maxEditorScroll = editor.scrollHeight - editor.clientHeight;
  const maxPreviewScroll = previewContent.scrollHeight - previewContent.clientHeight;
  // Without overflow on both sides there is no position to map.
  if (maxEditorScroll <= 0 || maxPreviewScroll <= 0) return null;
  return { maxEditorScroll, maxPreviewScroll };
}

/** The virtual end-of-document map entry used as the upper bracket. */
function endEntry() {
  return {
    line: editor.value.split('\n').length + 1,
    top: preview.offsetTop + preview.scrollHeight,
  };
}

/* Editor → preview */
function syncNow() {
  const bounds = getBounds();
  if (!bounds) return;
  const { maxEditorScroll, maxPreviewScroll } = bounds;

  let target;
  if (editor.scrollTop <= 1) {
    target = 0;
  } else if (editor.scrollTop >= maxEditorScroll - 1) {
    target = maxPreviewScroll;
  } else {
    const { lineHeight, paddingTop } = getMetrics();
    const topLine = Math.max((editor.scrollTop - paddingTop) / lineHeight + 1, 1);

    // Find the mapped blocks bracketing the top visible line.
    let a = map[0];
    let b = null;
    for (let i = 0; i < map.length; i++) {
      if (map[i].line <= topLine) {
        a = map[i];
        b = map[i + 1] || null;
      } else {
        break;
      }
    }
    if (!b) b = endEntry();

    const span = Math.max(b.line - a.line, 1);
    const ratio = Math.min(Math.max((topLine - a.line) / span, 0), 1);
    target = a.top + ratio * (b.top - a.top) - 16;
  }

  const clamped = Math.min(Math.max(target, 0), maxPreviewScroll);
  if (Math.abs(previewContent.scrollTop - clamped) < 2) return;
  expectedPreviewScrollTop = clamped;
  previewContent.scrollTop = clamped;
}

/* Preview → editor (inverse of syncNow) */
function reverseSyncNow() {
  const bounds = getBounds();
  if (!bounds) return;
  const { maxEditorScroll, maxPreviewScroll } = bounds;

  let target;
  const st = previewContent.scrollTop;
  if (st <= 1) {
    target = 0;
  } else if (st >= maxPreviewScroll - 1) {
    target = maxEditorScroll;
  } else {
    const pos = st + 16;

    // Find the mapped blocks bracketing the preview position.
    let a = map[0];
    let b = null;
    for (let i = 0; i < map.length; i++) {
      if (map[i].top <= pos) {
        a = map[i];
        b = map[i + 1] || null;
      } else {
        break;
      }
    }
    if (!b) b = endEntry();

    const { lineHeight, paddingTop } = getMetrics();
    const span = Math.max(b.top - a.top, 1);
    const ratio = Math.min(Math.max((pos - a.top) / span, 0), 1);
    const line = a.line + ratio * (b.line - a.line);
    target = (line - 1) * lineHeight + paddingTop;
  }

  const clamped = Math.min(Math.max(target, 0), maxEditorScroll);
  if (Math.abs(editor.scrollTop - clamped) < 2) return;
  expectedEditorScrollTop = clamped;
  editor.scrollTop = clamped;
}

let cachedMetrics = null;
function getMetrics() {
  if (!cachedMetrics) {
    const cs = getComputedStyle(editor);
    const lh = parseFloat(cs.lineHeight);
    const pt = parseFloat(cs.paddingTop);
    cachedMetrics = {
      lineHeight: Number.isFinite(lh) && lh > 0 ? lh : 22,
      paddingTop: Number.isFinite(pt) ? pt : 0,
    };
  }
  return cachedMetrics;
}
