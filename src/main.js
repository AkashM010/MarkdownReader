/**
 * Main entry point — wires together all modules.
 */
import { initTheme, setTheme, loadSavedTheme } from './theme.js';
import { updateMermaidTheme } from './mermaid.js';
import { initEditor, setEditorContent, getEditorContent, updateAll } from './editor.js';
import { initPreview, scheduleRender, renderNow } from './preview.js';
import { initFileIO } from './fileIO.js';

// ──────────────────────────────────────
// Default content
// ──────────────────────────────────────
const defaultContent = `# Welcome to Markdown Reader 📝

A modern, dual-pane Markdown editor with **live preview**, **Mermaid diagrams**, and **GitHub-flavored alerts**.

---

## ✨ Features

- **Live Preview** — See changes instantly as you type
- **Mermaid Diagrams** — Render flowcharts, sequence diagrams, and more
- **GitHub Alerts** — Styled callouts like \`> [!NOTE]\` and \`> [!WARNING]\`
- **Dark/Light Mode** — Toggle between beautiful themes
- **Line Numbers** — Track your position with ease

---

## 📝 Typography

Here's some \`inline code\` and a fenced code block:

\`\`\`javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10)); // 55
\`\`\`

> The best way to predict the future is to create it.
> — *Peter Drucker*

---

## 📋 GitHub Alerts

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

---

## 🔷 Mermaid Diagram

\`\`\`mermaid
graph TD
    A[Start] --> B{Ready?}
    B -->|Yes| C[Process]
    B -->|No| D[Wait]
    D --> B
    C --> E{Valid?}
    E -->|Yes| F[Done ✅]
    E -->|No| G[Fix ❌]
    G --> B
\`\`\`

---

## 📊 Tables

| Feature | Status | Priority |
|---------|--------|----------|
| Markdown Parsing | ✅ Complete | High |
| Mermaid Support | ✅ Complete | High |
| GitHub Alerts | ✅ Complete | Medium |
| Dark Mode | ✅ Complete | Low |

---

## ✅ Task Lists

- [x] Create project structure
- [x] Implement markdown rendering
- [x] Add mermaid diagram support
- [ ] Write documentation
- [ ] Deploy to production
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
// Resizable divider
// ──────────────────────────────────────
let isDragging = false;
let startX = 0;
let startLeftWidth = 0;

dividerEl.addEventListener('mousedown', (e) => {
  isDragging = true;
  startX = e.clientX;
  const editorPane = $('editorPane');
  startLeftWidth = editorPane.getBoundingClientRect().width;
  dividerEl.classList.add('active');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  const container = document.querySelector('.main-container');
  const containerWidth = container.getBoundingClientRect().width;
  const dx = e.clientX - startX;
  const newLeftWidth = startLeftWidth + dx;
  const percent = Math.min(Math.max((newLeftWidth / containerWidth) * 100, 20), 80);
  $('editorPane').style.flex = `0 0 ${percent}%`;
  $('previewPane').style.flex = `0 0 ${100 - percent}%`;
});

document.addEventListener('mouseup', () => {
  if (isDragging) {
    isDragging = false;
    dividerEl.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }
});

dividerEl.addEventListener('touchstart', (e) => {
  const touch = e.touches[0];
  isDragging = true;
  startX = touch.clientX;
  const editorPane = $('editorPane');
  startLeftWidth = editorPane.getBoundingClientRect().width;
  dividerEl.classList.add('active');
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (!isDragging) return;
  const touch = e.touches[0];
  const container = document.querySelector('.main-container');
  const containerWidth = container.getBoundingClientRect().width;
  const dx = touch.clientX - startX;
  const newLeftWidth = startLeftWidth + dx;
  const percent = Math.min(Math.max((newLeftWidth / containerWidth) * 100, 20), 80);
  $('editorPane').style.flex = `0 0 ${percent}%`;
  $('previewPane').style.flex = `0 0 ${100 - percent}%`;
}, { passive: true });

document.addEventListener('touchend', () => {
  if (isDragging) {
    isDragging = false;
    dividerEl.classList.remove('active');
  }
}, { passive: true });

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
});
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
    onInput: () => scheduleRender(getEditorContent()),
  }
);

// 3. Preview
initPreview({
  preview: previewEl,
  renderStatus: renderStatusEl,
  previewLoading: previewLoadingEl,
});

// 4. File I/O
initFileIO(
  {
    saveBtn: saveBtnEl,
    openBtn: openBtnEl,
    fileInput: fileInputEl,
    previewLoading: previewLoadingEl,
    renderStatus: renderStatusEl,
  },
  showToast
);

// 5. Set default content and render
setEditorContent(defaultContent);
updateAll();
scheduleRender(getEditorContent());

// 6. Window resize handler for mermaid re-render
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (previewEl.querySelector('.mermaid')) {
      renderNow(getEditorContent());
    }
  }, 500);
});

console.log('💡 Ctrl+Shift+D: Toggle dark/light mode');
