/**
 * File I/O module — open and save Markdown files.
 * Uses the File System Access API where available (Chromium browsers) so
 * Save writes back to the original file in place; falls back to
 * <input type="file"> and blob downloads elsewhere.
 */
import { getEditorContent, setEditorContent, updateAll } from './editor.js';
import { renderNow, setStatus } from './preview.js';
import { flushDraft } from './persistence.js';

let fileInput = null;
let previewLoading = null;
let fileNameBadge = null;
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
  showToast = toastFn;

  elements.saveBtn.addEventListener('click', () => saveFile());
  elements.openBtn.addEventListener('click', () => openFile());

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

/** Restore the document name from an autosaved draft (no file handle). */
export function restoreFileName(name) {
  if (name) currentFileName = name;
  updateFileBadge();
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
    const content = e.target.result;
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

async function saveFile() {
  if (supportsFS) {
    if (fileHandle) {
      await writeToHandle(fileHandle);
    } else {
      await saveFileAs();
    }
  } else {
    downloadFile();
  }
}

async function saveFileAs() {
  if (!supportsFS) {
    downloadFile();
    return;
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: currentFileName,
      types: FILE_TYPES,
    });
    await writeToHandle(handle);
  } catch (err) {
    if (err?.name !== 'AbortError') {
      console.warn('Save failed:', err);
      showToast('Could not save file', 3000);
    }
  }
}

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
  } catch (err) {
    if (err?.name === 'AbortError') return;
    console.warn('Save failed:', err);
    showToast(
      err?.name === 'NotAllowedError' ? 'Write permission denied' : 'Could not save file',
      3000
    );
  }
}

function downloadFile() {
  const content = getEditorContent();
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
