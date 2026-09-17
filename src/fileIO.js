/**
 * File I/O module — open and save Markdown files.
 * Uses the File System Access API where available (Chromium browsers) so
 * Save writes back to the original file in place; falls back to
 * <input type="file"> and blob downloads elsewhere.
 */
import { getEditorContent, setEditorContent, updateAll } from './editor.js';
import { renderNow, setStatus, headingText } from './preview.js';
import { flushDraft } from './persistence.js';
import { askConfirm } from './confirm.js';

let fileInput = null;
let previewLoading = null;
let fileNameBadge = null;
let editorEl = null;
let showToast = null;

let fileHandle = null;
let currentFileName = 'untitled.md';
let isDirty = false;

const supportsFS = typeof window.showOpenFilePicker === 'function';

const FILE_TYPES = [
  {
    description: 'Markdown',
    accept: {
      'text/markdown': ['.md', '.markdown', '.mdown'],
      'text/plain': ['.txt'],
    },
  },
];

export function initFileIO(elements, toastFn) {
  fileInput = elements.fileInput;
  previewLoading = elements.previewLoading;
  fileNameBadge = elements.fileNameBadge || null;
  editorEl = elements.editor || null;
  showToast = toastFn;

  elements.saveBtn.addEventListener('click', () => saveFile());
  elements.openBtn.addEventListener('click', () => openFile());
  elements.newBtn?.addEventListener('click', () => newFile());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      loadFile(file);
    }
    fileInput.value = '';
  });

  // Drag and drop — only intercept file drags, so native text
  // drag-and-drop inside the textarea keeps working.
  document.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
  });
  document.addEventListener('drop', handleDrop);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 's') {
      e.preventDefault();
      if (e.shiftKey) {
        saveFileAs();
      } else {
        saveFile();
      }
    } else if (key === 'o') {
      e.preventDefault();
      openFile();
    } else if (key === 'n' && e.altKey) {
      // Ctrl+N and Ctrl+Shift+N belong to the browser (new window,
      // new incognito window) and cannot be prevented from a tab, so
      // the new-document shortcut takes the next free combination.
      e.preventDefault();
      newFile();
    }
  });

  // Warn before closing only when a real file has unsaved changes
  // (scratch drafts are already covered by autosave).
  window.addEventListener('beforeunload', (e) => {
    if (isDirty && fileHandle) {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  updateFileBadge();
}

/** Called by the editor pipeline whenever the content changes. */
export function markDirty() {
  if (!isDirty) {
    isDirty = true;
    updateFileBadge();
  }
}

export function getFileName() {
  return currentFileName;
}

/** Let listeners (recent files) know a real file handle is in play. */
function announceHandle(handle) {
  if (!handle) return;
  document.dispatchEvent(new CustomEvent('md-file-handle', { detail: { handle } }));
}

/** Open a FileSystemFileHandle (installed-app file launch, recent files). */
export async function openHandle(handle) {
  // Errors (e.g. NotFoundError for a moved/deleted file) propagate so the
  // caller can react specifically (D3).
  const file = await handle.getFile();
  loadFile(file, handle);
}

/** Restore the document name from an autosaved draft (no file handle). */
export function restoreFileName(name) {
  if (name) currentFileName = name;
  updateFileBadge();
}

// ──────────────────────────────────────
// New
// ──────────────────────────────────────

/** Work that would be lost by starting over. An empty buffer is not work. */
function hasUnsavedWork() {
  return isDirty && getEditorContent().trim().length > 0;
}

/**
 * Start a blank document. Asks first when that would discard edits —
 * autosave protects the draft only until the next document replaces it,
 * so "New" is genuinely destructive and cannot be silent.
 */
export async function newFile() {
  if (hasUnsavedWork()) {
    const choice = await askConfirm({
      title: 'Start a new document?',
      message: fileHandle
        ? `${currentFileName} has unsaved changes. They will be lost unless you save first.`
        : 'This draft has never been saved to a file. Starting a new document will clear it.',
      // Safe choice last: it takes the initial focus, so a stray Enter
      // cannot discard the document.
      actions: [
        { id: 'discard', label: 'Discard', variant: 'danger' },
        { id: 'cancel', label: 'Cancel' },
        { id: 'save', label: 'Save first', variant: 'primary' },
      ],
    });
    if (choice === 'cancel') return;
    // A cancelled or failed save must not take the document with it.
    if (choice === 'save' && !(await saveFile())) return;
  }

  setEditorContent('');
  currentFileName = 'untitled.md';
  fileHandle = null;
  isDirty = false;
  updateFileBadge();
  updateAll();
  renderNow('');
  flushDraft();
  editorEl?.focus();
  showToast('New document');
}

// ──────────────────────────────────────
// Open
// ──────────────────────────────────────

async function openFile() {
  if (!supportsFS) {
    fileInput.click();
    return;
  }
  try {
    const [handle] = await window.showOpenFilePicker({
      types: FILE_TYPES,
      multiple: false,
    });
    const file = await handle.getFile();
    loadFile(file, handle);
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.warn('Open failed:', err);
      showToast('Could not open file', 3000);
    }
  }
}

function loadFile(file, handle = null) {
  previewLoading.classList.add('active');
  setStatus('busy', 'Loading');
  const reader = new FileReader();
  reader.onload = (e) => {
    // Normalise Windows line endings so the first render matches the
    // textarea's LF value (front matter, line mapping) — D5.
    const content = String(e.target.result).replace(/\r\n?/g, '\n');
    setEditorContent(content);
    currentFileName = file.name;
    fileHandle = handle;
    isDirty = false;
    updateFileBadge();
    updateAll();
    renderNow(content);
    flushDraft();
    showToast(`Opened ${file.name}`);
    previewLoading.classList.remove('active');
    announceHandle(handle);
  };
  reader.onerror = () => {
    previewLoading.classList.remove('active');
    showToast('Error reading file', 3000);
  };
  reader.readAsText(file);
}

function handleDrop(e) {
  if (!e.dataTransfer?.types?.includes('Files')) return;
  e.preventDefault();
  const file = e.dataTransfer.files?.[0];
  const name = file?.name?.toLowerCase() || '';
  const isMarkdown = ['.md', '.markdown', '.txt', '.mdown'].some((ext) => name.endsWith(ext));
  if (!file) return;
  if (!isMarkdown) {
    showToast('Please drop a .md file', 2000);
    return;
  }

  const item = e.dataTransfer.items?.[0];
  if (item?.getAsFileSystemHandle) {
    // Capture a writable handle so the dropped file can be saved in place.
    item
      .getAsFileSystemHandle()
      .then((handle) => loadFile(file, handle?.kind === 'file' ? handle : null))
      .catch(() => loadFile(file));
  } else {
    loadFile(file);
  }
}

// ──────────────────────────────────────
// Save
// ──────────────────────────────────────

/**
 * What to put in the save picker's name field for a document that has
 * never been saved. "untitled.md" tells the user nothing; their own H1
 * usually names the file better than they would at the prompt.
 */
function suggestedFileName() {
  if (currentFileName !== 'untitled.md') return currentFileName;
  const h1 = document.querySelector('#preview h1');
  const title = h1 ? headingText(h1) : '';
  const slug = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug ? `${slug}.md` : currentFileName;
}

/** @returns {Promise<boolean>} whether the document is now on disk. */
async function saveFile() {
  if (!supportsFS) return downloadFile();
  return fileHandle ? writeToHandle(fileHandle) : saveFileAs();
}

/** @returns {Promise<boolean>} */
async function saveFileAs() {
  if (!supportsFS) return downloadFile();
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: suggestedFileName(),
      types: FILE_TYPES,
    });
    return await writeToHandle(handle);
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.warn('Save failed:', err);
      showToast('Could not save file', 3000);
    }
    return false;
  }
}

/** @returns {Promise<boolean>} */
async function writeToHandle(handle) {
  try {
    const writable = await handle.createWritable();
    await writable.write(getEditorContent());
    await writable.close();
    fileHandle = handle;
    currentFileName = handle.name;
    isDirty = false;
    updateFileBadge();
    flushDraft();
    showToast(`Saved ${currentFileName}`);
    announceHandle(handle);
    return true;
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.warn('Save failed:', err);
      showToast(
        err?.name === 'NotAllowedError' ? 'Write permission denied' : 'Could not save file',
        3000
      );
    }
    return false;
  }
}

/**
 * Fallback for browsers without the File System Access API (Firefox,
 * Safari). They offer no way to ask where a file should go, so the best
 * available behaviour is a download with a name worth keeping.
 * @returns {boolean}
 */
function downloadFile() {
  const content = getEditorContent();
  if (currentFileName === 'untitled.md') currentFileName = suggestedFileName();
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  isDirty = false;
  updateFileBadge();
  flushDraft();
  showToast(`Downloaded ${currentFileName}`);
  return true;
}

// ──────────────────────────────────────
// Filename badge
// ──────────────────────────────────────

function updateFileBadge() {
  if (!fileNameBadge) return;
  fileNameBadge.textContent = currentFileName;
  fileNameBadge.classList.toggle('dirty', isDirty);
  if (fileHandle) {
    fileNameBadge.title = `Editing ${currentFileName} — Ctrl+S saves in place`;
  } else if (supportsFS) {
    fileNameBadge.title = `${currentFileName} — Ctrl+S chooses where to save`;
  } else {
    fileNameBadge.title = `${currentFileName} — Ctrl+S downloads a copy`;
  }
}
