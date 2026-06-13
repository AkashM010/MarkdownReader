/**
 * Preview module — handles the markdown-to-HTML rendering pipeline using marked,
 * then runs mermaid on the rendered output.
 */
import { marked } from 'marked';
import alertExtension from './extensions/alerts.js';
import mermaidExtension from './extensions/mermaid-renderer.js';
import mermaid from 'mermaid';

let preview = null;
let renderStatus = null;
let previewLoading = null;

let renderTimeout = null;
let isRendering = false;

// Register custom marked extensions once
marked.use({
  extensions: [alertExtension, mermaidExtension],
  gfm: true,
  breaks: false,
});

export function initPreview(elements) {
  preview = elements.preview;
  renderStatus = elements.renderStatus;
  previewLoading = elements.previewLoading;
}

export function scheduleRender(content) {
  clearTimeout(renderTimeout);
  renderStatus.textContent = 'Scheduled...';
  renderTimeout = setTimeout(() => render(content), 150);
}

export async function renderNow(content) {
  await render(content);
}

async function render(raw) {
  if (isRendering) return;
  isRendering = true;
  renderStatus.textContent = 'Rendering...';
  previewLoading.classList.add('active');

  try {
    const markdown = raw || '*Start typing your Markdown...*';
    const html = await marked.parse(markdown);
    preview.innerHTML = html;

    // Render mermaid diagrams
    await renderMermaidDiagrams();

    renderStatus.textContent = '✓ Rendered';
  } catch (err) {
    console.error('Render error:', err);
    preview.innerHTML = `<div style="padding:16px;color:var(--alert-caution-text);background:var(--alert-caution-bg);border-radius:8px;border:1px solid var(--alert-caution-border);">
      <strong>⚠️ Error rendering Markdown:</strong><br>${err.message}
    </div>`;
    renderStatus.textContent = '✗ Error';
  } finally {
    isRendering = false;
    previewLoading.classList.remove('active');
  }
}

async function renderMermaidDiagrams() {
  const elements = preview.querySelectorAll('.mermaid');
  if (elements.length === 0) return;

  try {
    await mermaid.run({ querySelector: '.mermaid' });
  } catch (err) {
    console.warn('Mermaid render error:', err.message);
    preview.querySelectorAll('.mermaid').forEach(el => {
      if (!el.querySelector('svg')) {
        const code = el.textContent;
        el.outerHTML = `<div class="mermaid-error" style="padding:12px 16px;border:1px solid var(--alert-caution-border);border-radius:8px;background:var(--alert-caution-bg);color:var(--alert-caution-text);font-size:13px;margin:16px 0;">
          ⚠️ Failed to render Mermaid diagram: <code style="display:block;margin-top:4px;white-space:pre;overflow-x:auto;">${code}</code>
        </div>`;
      }
    });
  }
}
