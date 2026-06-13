/**
 * File I/O module — save to .md download and open .md files from disk.
 */
import { getEditorContent, setEditorContent, updateAll } from './editor.js';
import { renderNow } from './preview.js';

let fileInput = null;
let previewLoading = null;
let renderStatus = null;
let showToast = null;
let currentFileName = 'untitled.md';

export function initFileIO(elements, toastFn) {
  fileInput = elements.fileInput;
  previewLoading = elements.previewLoading;
  renderStatus = elements.renderStatus;
  showToast = toastFn;

  elements.saveBtn.addEventListener('click', saveFile);
  elements.openBtn.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (file) {
      loadFile(file);
    }
    fileInput.value = '';
  });

  // Drag and drop
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', handleDrop);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      saveFile();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) {
      e.preventDefault();
      fileInput.click();
    }
  });
}

function saveFile() {
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
  showToast(`Saved as ${currentFileName}`);
}

function loadFile(file) {
  previewLoading.classList.add('active');
  renderStatus.textContent = 'Loading...';
  const reader = new FileReader();
  reader.onload = (e) => {
    const content = e.target.result;
    setEditorContent(content);
    currentFileName = file.name;
    updateAll();
    renderNow(content);
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
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  const name = file?.name?.toLowerCase() || '';
  if (file && (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt') || name.endsWith('.mdown'))) {
    previewLoading.classList.add('active');
    loadFile(file);
  } else if (file) {
    showToast('Please drop a .md file', 2000);
  }
}
