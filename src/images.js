/**
 * Images — paste or drop an image and it lands in the document as an
 * embedded (base64 data URL) markdown image at the caret.
 */
let editor = null;
let showToast = null;

const LARGE_IMAGE_BYTES = 1024 * 1024;

export function initImages(elements, toastFn) {
  editor = elements.editor;
  showToast = toastFn;

  editor.addEventListener('paste', (e) => {
    const file = firstImage(e.clipboardData?.files);
    if (!file) return;
    e.preventDefault();
    insertImageFile(file, 'pasted image');
  });

  // Capture phase so image drops anywhere are handled before fileIO's
  // document-level .md drop handler sees them.
  document.addEventListener(
    'drop',
    (e) => {
      const file = firstImage(e.dataTransfer?.files);
      if (!file) return;
      e.preventDefault();
      e.stopPropagation();
      insertImageFile(file, file.name.replace(/\.[^.]+$/, ''));
    },
    true
  );
}

function firstImage(files) {
  if (!files) return null;
  for (const f of files) {
    if (f.type && f.type.startsWith('image/')) return f;
  }
  return null;
}

export function insertImageFile(file, alt) {
  const reader = new FileReader();
  reader.onload = () => {
    insertImageMarkdown(String(reader.result), alt || 'image');
    if (file.size > LARGE_IMAGE_BYTES) {
      showToast(`Embedded a ${(file.size / (1024 * 1024)).toFixed(1)} MB image — large images make the file heavy`, 4000);
    } else {
      showToast('Image embedded');
    }
  };
  reader.onerror = () => showToast('Could not read that image', 3000);
  reader.readAsDataURL(file);
}

function insertImageMarkdown(dataUrl, alt) {
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const value = editor.value;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const text = `![${alt.replace(/[\[\]]/g, '')}](${dataUrl})`;
  const pre = before.length === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const post = after.length === 0 ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const out = pre + text + post;
  const caret = start + pre.length + text.length;
  editor.setRangeText(out, start, end, 'preserve');
  editor.setSelectionRange(caret, caret);
  editor.focus();
  editor.dispatchEvent(new Event('input', { bubbles: true }));
}
