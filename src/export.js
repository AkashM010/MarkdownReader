/**
 * Export module — print / save as PDF, standalone HTML export, and
 * copy-as-rich-text of the rendered preview.
 */
import mermaid from 'mermaid';
import { getEditorContent } from './editor.js';
import { getFileName } from './fileIO.js';
import { getTheme } from './theme.js';
import { updateMermaidTheme } from './mermaid.js';
import { headingText } from './preview.js';

let preview = null;
let showToast = null;
let menuBtn = null;
let menu = null;

export function initExport(elements, toastFn) {
  preview = elements.preview;
  menuBtn = elements.button;
  menu = elements.menu;
  showToast = toastFn;

  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !menu.classList.contains('open');
    if (open) document.dispatchEvent(new CustomEvent('md-header-menu-open', { detail: { menu } }));
    menu.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
  });
  // D14: only one header menu open at a time
  document.addEventListener('md-header-menu-open', (e) => {
    if (e.detail?.menu !== menu) closeMenu();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.hdr-dropdown')) closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      printPreview();
    }
  });
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-export]');
    if (!item) return;
    closeMenu();
    runExport(item.dataset.export);
  });
}

function closeMenu() {
  if (!menu) return;
  menu.classList.remove('open');
  menuBtn.setAttribute('aria-expanded', 'false');
}

export function runExport(kind) {
  if (kind === 'print') return printPreview();
  if (kind === 'html') return exportHtml();
  if (kind === 'copy') return copyRich();
  if (kind === 'copymd') return copyMarkdown();
}

// ──────────────────────────────────────
// Print / PDF — print the light theme so paper looks right
// ──────────────────────────────────────

let printing = false;
const PRINT_RESTORE_FALLBACK_MS = 10000; // if print() itself never returns control
const PRINT_RESTORE_GRACE_MS = 2000; // after print() returns without an afterprint

/**
 * Paper is always light, but the on-screen theme is never touched: the
 * print stylesheet swaps the palette under @media print, and diagrams —
 * which bake their colors into the SVG — get light-palette copies that
 * exist only while printing.
 */
export async function printPreview() {
  if (printing) return;
  printing = true;
  let fallback = null;
  const cleanup = () => {
    window.removeEventListener('afterprint', cleanup);
    clearTimeout(fallback);
    preview.querySelectorAll('.mermaid-print').forEach((n) => n.remove());
    preview.querySelectorAll('.mermaid.has-print-copy').forEach((n) => n.classList.remove('has-print-copy'));
    printing = false;
  };
  window.addEventListener('afterprint', cleanup);
  // D13: if print() itself never returns control, release the latch anyway.
  fallback = setTimeout(cleanup, PRINT_RESTORE_FALLBACK_MS);
  await preparePrintDiagrams();
  setTimeout(() => {
    // Browsers block inside print() while the dialog is open; afterprint
    // normally cleans up. If it never fires, clean up shortly after
    // print() returns.
    try {
      window.print();
    } finally {
      clearTimeout(fallback);
      fallback = setTimeout(cleanup, PRINT_RESTORE_GRACE_MS);
    }
  }, 80);
}

/** Light-palette copies of every diagram, shown only under @media print. */
async function preparePrintDiagrams() {
  const nodes = [...preview.querySelectorAll('.mermaid[data-source]')];
  if (nodes.length === 0 || getTheme() === 'light') return; // already light
  updateMermaidTheme('light');
  try {
    let i = 0;
    for (const node of nodes) {
      try {
        const { svg } = await mermaid.render(`print-diagram-${i++}`, node.dataset.source);
        const copy = document.createElement('div');
        copy.className = 'mermaid-print';
        copy.setAttribute('aria-hidden', 'true');
        copy.innerHTML = svg;
        node.insertAdjacentElement('afterend', copy);
        node.classList.add('has-print-copy');
      } catch {
        // Keep the on-screen rendering for this diagram.
      }
    }
  } finally {
    updateMermaidTheme(getTheme());
  }
}

// ──────────────────────────────────────
// Snapshot of the rendered preview, cleaned of app chrome
// ──────────────────────────────────────

async function previewSnapshotNode() {
  const clone = preview.cloneNode(true);
  clone.querySelectorAll('.code-copy').forEach((el) => el.remove());
  clone.querySelectorAll('[data-line]').forEach((el) => {
    el.removeAttribute('data-line');
    el.removeAttribute('data-line-end');
  });
  // D16: keep heading anchors (md-*) so in-document links keep working.
  clone.querySelectorAll('[id]').forEach((el) => {
    if (!el.closest('.mermaid') && !el.id.startsWith('md-')) el.removeAttribute('id');
  });
  // D6: exports have no KaTeX stylesheet, so keep only the MathML rendering
  // (browsers render it natively) and drop the CSS-dependent HTML copy.
  clone.querySelectorAll('.katex-html').forEach((el) => el.remove());
  await withLightDiagrams(clone); // needs data-source — strip app attributes afterwards
  clone.querySelectorAll('.mermaid').forEach((el) => {
    el.removeAttribute('data-source');
    el.removeAttribute('data-mermaid-key');
    el.removeAttribute('data-processed');
  });
  return clone;
}

async function previewSnapshot() {
  return (await previewSnapshotNode()).innerHTML.trim();
}

/** Re-render mermaid diagrams in the light palette for export targets. */
async function withLightDiagrams(root) {
  const nodes = [...root.querySelectorAll('.mermaid[data-source]')];
  if (nodes.length === 0 || getTheme() === 'light') return;
  updateMermaidTheme('light');
  try {
    let i = 0;
    for (const node of nodes) {
      try {
        const { svg } = await mermaid.render(`export-diagram-${i++}`, node.dataset.source);
        node.innerHTML = svg;
      } catch {
        // Leave the existing rendering in place.
      }
    }
  } finally {
    updateMermaidTheme(getTheme());
  }
}

/**
 * D17: clipboard sanitizers strip SVG <style>, so copied diagrams lose their
 * colors. Rasterize each diagram to a PNG data URL for the rich-text copy.
 */
async function rasterizeDiagrams(root) {
  for (const svg of root.querySelectorAll('.mermaid svg')) {
    try {
      const vb = svg.viewBox?.baseVal;
      const width = Math.ceil(vb?.width || svg.getBoundingClientRect().width || 800);
      const height = Math.ceil(vb?.height || svg.getBoundingClientRect().height || 400);
      const copy = svg.cloneNode(true);
      copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      copy.setAttribute('width', String(width));
      copy.setAttribute('height', String(height));
      copy.removeAttribute('style');
      const xml = new XMLSerializer().serializeToString(copy);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
      });
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const png = canvas.toDataURL('image/png');
      const replacement = document.createElement('img');
      replacement.src = png;
      replacement.alt = 'Diagram';
      replacement.style.maxWidth = '100%';
      svg.replaceWith(replacement);
    } catch {
      // Tainted canvas or unsupported SVG — leave the vector in place.
    }
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function documentTitle() {
  const h1 = preview.querySelector('h1');
  const fromHeading = h1 ? headingText(h1) : '';
  if (fromHeading) return fromHeading;
  return getFileName().replace(/\.[^.]+$/, '') || 'Document';
}

// ──────────────────────────────────────
// Standalone HTML
// ──────────────────────────────────────

const EXPORT_CSS = `
:root{color-scheme:light}
body{margin:0;background:#f4f2ec;color:#23293a;font-family:Lora,Georgia,'Times New Roman',serif;line-height:1.75}
.md{max-width:780px;margin:40px auto;padding:48px 56px;background:#fff;border-radius:14px;box-shadow:0 20px 60px -30px rgba(0,0,0,.25);font-size:17px;word-wrap:break-word}
.md h1,.md h2,.md h3,.md h4,.md h5,.md h6{font-family:'Space Grotesk','Segoe UI',system-ui,sans-serif;line-height:1.25;margin:1.6em 0 .6em;letter-spacing:-.01em}
.md h1{font-size:2.1em;border-bottom:2px solid #0d9488;padding-bottom:.3em;margin-top:0}
.md h2{font-size:1.5em;border-bottom:1px solid #e4ded1;padding-bottom:.25em}
.md h3{font-size:1.22em}.md p{margin:0 0 1em}.md a{color:#0d9488}
.md code{font-family:'JetBrains Mono',Consolas,monospace;font-size:.85em;background:rgba(13,148,136,.09);padding:2px 6px;border-radius:5px;color:#0a4f4a}
.md pre{background:#10161f;color:#dfe6ef;padding:16px 18px;overflow-x:auto;margin:0}
.md pre code{background:none;color:inherit;padding:0;font-size:13.5px;line-height:1.65}
.md .code-block{margin:1.2em 0;border-radius:10px;overflow:hidden}
.md .code-block-bar{background:#171f2b;color:#8b98ab;font:600 10.5px/1 Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;padding:9px 14px}
.md blockquote{margin:1em 0;padding:.8em 1.2em;border-left:3px solid #0d9488;background:rgba(13,148,136,.07);border-radius:0 8px 8px 0;color:#5b6371;font-style:italic}
.md blockquote p:last-child{margin:0}
.md table{border-collapse:collapse;width:100%;margin:1.2em 0;font-size:.9em}
.md th,.md td{border:1px solid #e4ded1;padding:9px 13px;text-align:left}
.md th{background:#f3f0e9;font-family:'Space Grotesk','Segoe UI',system-ui,sans-serif}
.md img{max-width:100%;border-radius:8px}.md hr{border:0;height:1px;background:#e4ded1;margin:2em 0}
.md ul,.md ol{padding-left:1.6em}.md li{margin:.3em 0}
.md .mermaid{display:flex;justify-content:center;padding:20px;border:1px solid #e4ded1;border-radius:10px;margin:1.2em 0;overflow-x:auto}
.md .mermaid svg{max-width:100%;height:auto}
.md .katex-display{margin:1em 0;text-align:center}
.md .markdown-alert{margin:1.2em 0;padding:14px 18px;border:1px solid #e4ded1;border-left:3px solid;border-radius:8px}
.md .markdown-alert-title{display:flex;align-items:center;gap:8px;font:600 14px 'Space Grotesk','Segoe UI',system-ui,sans-serif;margin:0 0 .4em}
.md .markdown-alert-title svg{width:15px;height:15px;fill:currentColor}
.md .markdown-alert p{margin:0 0 .4em}.md .markdown-alert p:last-child{margin:0}
.md .markdown-alert-note{border-left-color:#3b82f6}.md .markdown-alert-note .markdown-alert-title{color:#1d4ed8}
.md .markdown-alert-tip{border-left-color:#16a34a}.md .markdown-alert-tip .markdown-alert-title{color:#15803d}
.md .markdown-alert-important{border-left-color:#8b5cf6}.md .markdown-alert-important .markdown-alert-title{color:#6d28d9}
.md .markdown-alert-warning{border-left-color:#d97706}.md .markdown-alert-warning .markdown-alert-title{color:#b45309}
.md .markdown-alert-caution{border-left-color:#dc2626}.md .markdown-alert-caution .markdown-alert-title{color:#b91c1c}
.md .front-matter{margin:0 0 1.6em;padding:14px 18px;border:1px solid #e4ded1;border-radius:10px;background:#faf8f4;font-family:'Space Grotesk','Segoe UI',system-ui,sans-serif;font-size:13.5px}
.md .front-matter .fm-title{font-size:10.5px;letter-spacing:.09em;text-transform:uppercase;color:#99a0ab;margin-bottom:8px}
.md .front-matter dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0}
.md .front-matter dt{color:#5b6371}.md .front-matter dd{margin:0}
.md input[type=checkbox]{margin-right:8px}
.hljs-comment,.hljs-quote{color:#7d8da1;font-style:italic}
.hljs-keyword,.hljs-selector-tag,.hljs-literal,.hljs-built_in,.hljs-doctag{color:#c4b5fd}
.hljs-string,.hljs-regexp,.hljs-addition{color:#86efac}
.hljs-number,.hljs-symbol,.hljs-bullet,.hljs-link{color:#fbbf24}
.hljs-title,.hljs-section,.hljs-name,.hljs-title.function_{color:#7dd3fc}
.hljs-type,.hljs-class .hljs-title,.hljs-title.class_,.hljs-selector-class,.hljs-selector-id{color:#5eead4}
.hljs-attr,.hljs-attribute,.hljs-variable,.hljs-template-variable,.hljs-property,.hljs-params{color:#a5f3fc}
.hljs-meta,.hljs-selector-pseudo,.hljs-operator,.hljs-punctuation{color:#94a3b8}
.hljs-deletion{color:#fca5a5}.hljs-emphasis{font-style:italic}.hljs-strong{font-weight:600}
.md-footer{text-align:center;color:#99a0ab;font:12px 'Space Grotesk','Segoe UI',system-ui,sans-serif;padding:0 0 40px}
@media print{body{background:#fff}.md{box-shadow:none;margin:0;padding:0;max-width:none;border-radius:0}.md-footer{display:none}}
`;

export async function exportHtml() {
  try {
    const body = await previewSnapshot();
    const title = documentTitle();
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${EXPORT_CSS}</style>
</head>
<body>
<article class="md">
${body}
</article>
<footer class="md-footer">Exported from Read Your MD</footer>
</body>
</html>
`;
    const name = getFileName().replace(/\.[^.]+$/, '') + '.html';
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported ${name}`);
  } catch (err) {
    console.warn('Export failed:', err);
    showToast('Export failed', 3000);
  }
}

// ──────────────────────────────────────
// Clipboard
// ──────────────────────────────────────

/**
 * Clipboard targets (mail, Word) ignore MathML and lack KaTeX CSS: replace
 * each formula with its TeX source so the meaning survives the paste.
 */
function mathToText(root) {
  for (const display of root.querySelectorAll('.katex-display')) {
    const tex = display.querySelector('annotation[encoding="application/x-tex"]')?.textContent || display.textContent;
    const p = document.createElement('p');
    p.textContent = `$$ ${tex.trim()} $$`;
    display.replaceWith(p);
  }
  for (const inline of root.querySelectorAll('.katex')) {
    const tex = inline.querySelector('annotation[encoding="application/x-tex"]')?.textContent || inline.textContent;
    const span = document.createElement('span');
    span.textContent = `$${tex.trim()}$`;
    inline.replaceWith(span);
  }
}

export async function copyRich() {
  try {
    const node = await previewSnapshotNode();
    mathToText(node);
    await rasterizeDiagrams(node);
    const body = node.innerHTML.trim();
    const html = `<!doctype html><html><body>${body}</body></html>`;
    const text = getEditorContent();
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      showToast('Copied as rich text');
    } else {
      await navigator.clipboard.writeText(text);
      showToast('Copied markdown (rich text unsupported here)');
    }
  } catch (err) {
    console.warn('Copy failed:', err);
    showToast('Copy failed', 3000);
  }
}

export async function copyMarkdown() {
  try {
    await navigator.clipboard.writeText(getEditorContent());
    showToast('Markdown copied');
  } catch (err) {
    console.warn('Copy failed:', err);
    showToast('Copy failed', 3000);
  }
}
