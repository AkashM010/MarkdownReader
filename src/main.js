/**
 * Main entry point — wires together all modules.
 */
import { initTheme, setTheme, toggleTheme, loadSavedTheme } from './theme.js';
import { updateMermaidTheme } from './mermaid.js';
import { initEditor, setEditorContent, getEditorContent, updateAll } from './editor.js';
import { initPreview, scheduleRender, renderNow, invalidateMermaidCache } from './preview.js';
import { initFileIO, markDirty, getFileName, restoreFileName } from './fileIO.js';
import { initPersistence, loadDraft, scheduleAutosave, flushDraft } from './persistence.js';
import { initScrollSync } from './scrollsync.js';
import { initOutline } from './outline.js';

// ──────────────────────────────────────
// Default content
// ──────────────────────────────────────
const defaultContent = `# A quiet place to write

Write on the left, read on the right. This document walks through everything the reader can render — edit it freely, or drop any \`.md\` file onto the window to open it. Your work autosaves to this browser as you type, and opened files can be saved back in place with \`Ctrl+S\`.

## Typography

Prose is set in a proper reading face, so **bold**, *italic*, and [links](https://commonmark.org) sit comfortably in long-form text. Inline code like \`marked.parse()\` switches to a monospace face, and block quotes get room to breathe:

> The best way to predict the future is to create it.
> — *Peter Drucker*

## Code

Fenced blocks get a language label and a copy button:

\`\`\`javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10)); // 55
\`\`\`

## Callouts

GitHub-flavored alerts render as styled admonitions:

> [!NOTE]
> Useful information that users should know, even when skimming.

> [!TIP]
> Helpful advice for doing things better or more easily.

> [!IMPORTANT]
> Key information users need to achieve their goal.

> [!WARNING]
> Urgent info that needs immediate user attention to avoid problems.

> [!CAUTION]
> Advises about risks or negative outcomes.

## Diagrams

Mermaid blocks become live diagrams, themed to match the app:

\`\`\`mermaid
graph TD
    A[Start] --> B{Ready?}
    B -->|Yes| C[Process]
    B -->|No| D[Wait]
    D --> B
    C --> E{Valid?}
    E -->|Yes| F[Done]
    E -->|No| G[Fix]
    G --> B
\`\`\`

## Tables

| Feature | Status | Priority |
|---------|--------|----------|
| Markdown parsing | Complete | High |
| Mermaid support | Complete | High |
| GitHub alerts | Complete | Medium |
| Dark mode | Complete | Low |

## Task lists

- [x] Create project structure
- [x] Implement markdown rendering
- [x] Add mermaid diagram support
- [ ] Write documentation
- [ ] Deploy to production

---

## Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| \`Ctrl+O\` | Open a file |
| \`Ctrl+S\` | Save (in place when a file is open) |
| \`Ctrl+Shift+S\` | Save as... |
| \`Ctrl+Z\` / \`Ctrl+Y\` | Undo / redo |
| \`Ctrl+Shift+D\` | Toggle dark or light mode |
`;

// ──────────────────────────────────────
// DOM references
// ──────────────────────────────────────
const $ = (id) => document.getElementById(id);

const editorEl = $('editor');
const previewEl = $('preview');
const lineNumbersEl = $('lineNumbers');
const lineNumEl = $('lineNum');
const colNumEl = $('colNum');
const charCountEl = $('charCount');
const wordCountHeaderEl = $('wordCountHeader');
const renderStatusEl = $('renderStatus');
const previewLoadingEl = $('previewLoading');
const themeToggleEl = $('themeToggle');
const themeLabelEl = $('themeLabel');
const dividerEl = $('divider');
const saveBtnEl = $('saveBtn');
const openBtnEl = $('openBtn');
const fileInputEl = $('fileInput');
const toastEl = $('toast');

// ──────────────────────────────────────
// Toast helper
// ──────────────────────────────────────
let toastTimeout = null;

function showToast(message, duration = 2000) {
  clearTimeout(toastTimeout);
  toastEl.textContent = message;
  toastEl.classList.add('show');
  toastTimeout = setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
}

// ──────────────────────────────────────
// Resizable divider (orientation-aware:
// row layout resizes widths, stacked layout resizes heights)
// ──────────────────────────────────────
let isDragging = false;
let dragVertical = false;
let dragStart = 0;
let startSize = 0;

function isColumnLayout() {
  const container = document.querySelector('.main-container');
  return getComputedStyle(container).flexDirection === 'column';
}

function beginDrag(clientX, clientY) {
  isDragging = true;
  dragVertical = isColumnLayout();
  const rect = $('editorPane').getBoundingClientRect();
  dragStart = dragVertical ? clientY : clientX;
  startSize = dragVertical ? rect.height : rect.width;
  dividerEl.classList.add('active');
}

function moveDrag(clientX, clientY) {
  const container = document.querySelector('.main-container');
  const rect = container.getBoundingClientRect();
  const total = dragVertical ? rect.height : rect.width;
  const delta = (dragVertical ? clientY : clientX) - dragStart;
  const percent = Math.min(Math.max(((startSize + delta) / total) * 100, 20), 80);
  $('editorPane').style.flex = `0 0 ${percent}%`;
  $('previewPane').style.flex = `0 0 ${100 - percent}%`;
}

function endDrag() {
  if (!isDragging) return;
  isDragging = false;
  dividerEl.classList.remove('active');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

dividerEl.addEventListener('mousedown', (e) => {
  beginDrag(e.clientX, e.clientY);
  document.body.style.cursor = dragVertical ? 'row-resize' : 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  moveDrag(e.clientX, e.clientY);
});

document.addEventListener('mouseup', endDrag);

dividerEl.addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  beginDrag(touch.clientX, touch.clientY);
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (!isDragging) return;
  const touch = e.touches[0];
  moveDrag(touch.clientX, touch.clientY);
}, { passive: true });

document.addEventListener('touchend', endDrag, { passive: true });

// ──────────────────────────────────────
// Cursor-tracking border glow on panes (rAF-throttled)
// ──────────────────────────────────────
document.querySelectorAll('.pane').forEach((pane) => {
  let glowFrame = null;
  let px = 0;
  let py = 0;
  pane.addEventListener('pointermove', (e) => {
    px = e.clientX;
    py = e.clientY;
    if (glowFrame) return;
    glowFrame = requestAnimationFrame(() => {
      glowFrame = null;
      const rect = pane.getBoundingClientRect();
      pane.style.setProperty('--mx', `${px - rect.left}px`);
      pane.style.setProperty('--my', `${py - rect.top}px`);
    });
  });
});

// ──────────────────────────────────────
// Edge-light sweep: runs once around a pane on boot and whenever
// it becomes the active pane (CSS animates .pane.ignite::before).
// ──────────────────────────────────────
function ignite(pane) {
  pane.classList.remove('ignite');
  void pane.offsetWidth; // restart the animation if it was mid-flight
  pane.classList.add('ignite');
}

document.querySelectorAll('.pane').forEach((pane, i) => {
  pane.addEventListener('focusin', () => ignite(pane));
  pane.addEventListener('animationend', (e) => {
    if (e.animationName === 'edge-sweep') pane.classList.remove('ignite');
  });
  setTimeout(() => ignite(pane), 450 + i * 180);
});

// ──────────────────────────────────────
// Theme toggle wrapper
// ──────────────────────────────────────
function toggleThemeWithFeedback() {
  const next = toggleTheme();
  showToast(`Switched to ${next} mode`);
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
    e.preventDefault();
    toggleThemeWithFeedback();
  }
});

// ──────────────────────────────────────
// Initialize everything
// ──────────────────────────────────────

// 1. Theme
initTheme(themeToggleEl, themeLabelEl, (theme) => {
  updateMermaidTheme(theme);
  // Re-render so already-drawn diagrams pick up the new palette
  // (mermaid bakes colors into each SVG at render time).
  if (previewEl.querySelector('.mermaid, .render-error')) {
    renderNow(getEditorContent());
  }
});
themeToggleEl.addEventListener('click', toggleThemeWithFeedback);
const savedTheme = loadSavedTheme();
setTheme(savedTheme);
updateMermaidTheme(savedTheme);

// 2. Editor
initEditor(
  {
    editor: editorEl,
    lineNumbers: lineNumbersEl,
    lineNum: lineNumEl,
    colNum: colNumEl,
    charCount: charCountEl,
    wordCountHeader: wordCountHeaderEl,
    undoBtn: $('undoBtn'),
    redoBtn: $('redoBtn'),
  },
  {
    onInput: () => {
      scheduleRender(getEditorContent());
      markDirty();
      scheduleAutosave();
    },
  }
);

// 3. Preview
initPreview({
  preview: previewEl,
  renderStatus: renderStatusEl,
  previewLoading: previewLoadingEl,
});

// 3b. Scroll sync + outline
initScrollSync({
  editor: editorEl,
  previewContent: $('previewContent'),
  preview: previewEl,
});
initOutline({
  panel: $('outlinePanel'),
  list: $('outlineList'),
  toggle: $('outlineToggle'),
  previewContent: $('previewContent'),
  preview: previewEl,
});

// 4. File I/O
initFileIO(
  {
    saveBtn: saveBtnEl,
    openBtn: openBtnEl,
    fileInput: fileInputEl,
    previewLoading: previewLoadingEl,
    renderStatus: renderStatusEl,
    fileNameBadge: $('fileNameBadge'),
  },
  showToast
);

// 5. Autosave (draft persistence)
initPersistence($('autosaveStatus'), () => ({
  content: getEditorContent(),
  fileName: getFileName(),
}));

// 6. Content: restore the autosaved draft, else the welcome document
const draft = loadDraft();
if (draft) {
  setEditorContent(draft.content);
  restoreFileName(draft.fileName);
  showToast('Restored your last draft');
} else {
  setEditorContent(defaultContent);
}
updateAll();
scheduleRender(getEditorContent());
flushDraft();

// 7. Window resize handler for mermaid re-render
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (previewEl.querySelector('.mermaid')) {
      // Cached SVGs bake in the old container width — drop them so the
      // re-render actually reflows the diagrams.
      invalidateMermaidCache();
      renderNow(getEditorContent());
    }
  }, 500);
});
