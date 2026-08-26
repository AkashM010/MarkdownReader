/**
 * Preview module — handles the markdown-to-HTML rendering pipeline using marked,
 * then runs mermaid on the rendered output.
 *
 * Emits `md-render-start` on `document` just before the preview DOM is
 * replaced and `md-rendered` after each completed render so decoupled
 * modules (outline, scroll sync) can react.
 */
import { marked } from 'marked';
import hljs from 'highlight.js/lib/common';
import alertExtension from './extensions/alerts.js';
import mermaidExtension from './extensions/mermaid-renderer.js';
import mermaid from 'mermaid';

let preview = null;
let renderStatus = null;
let previewLoading = null;

let renderTimeout = null;
let isRendering = false;
let pendingContent = null;

// Rendered mermaid SVGs, keyed by theme + diagram source. Re-rendering a
// diagram is expensive; typing elsewhere in the document should not redraw
// unchanged diagrams on every keystroke.
const mermaidCache = new Map();
const MERMAID_CACHE_MAX = 50;

const COPY_ICON = '<svg class="icon-copy" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_ICON = '<svg class="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
const ERROR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Register custom marked extensions once
marked.use({
  extensions: [alertExtension, mermaidExtension],
  gfm: true,
  breaks: false,
  renderer: {
    // Wrap fenced code blocks in a card with a language bar, copy button,
    // and syntax highlighting.
    code({ text, lang }) {
      const language = (lang || '').trim().split(/\s+/)[0];
      let body;
      if (language && hljs.getLanguage(language)) {
        try {
          body = hljs.highlight(text, { language }).value;
        } catch {
          body = escapeHtml(text);
        }
      } else {
        body = escapeHtml(text);
      }
      return `<div class="code-block">
        <div class="code-block-bar">
          <span class="code-lang">${escapeHtml(language || 'text')}</span>
          <button class="code-copy" type="button" aria-label="Copy code">${COPY_ICON}${CHECK_ICON}<span class="code-copy-label">Copy</span></button>
        </div>
        <pre><code class="hljs">${body}</code></pre>
      </div>`;
    },
  },
});

export function initPreview(elements) {
  preview = elements.preview;
  renderStatus = elements.renderStatus;
  previewLoading = elements.previewLoading;

  // Copy-to-clipboard for code blocks (event delegation survives re-renders)
  preview.addEventListener('click', handleCopyClick);
}

export function setStatus(state, text) {
  if (!renderStatus) return;
  renderStatus.dataset.state = state;
  renderStatus.textContent = text;
}

/** Drop all cached mermaid SVGs (e.g. when the container width changes). */
export function invalidateMermaidCache() {
  mermaidCache.clear();
}

async function handleCopyClick(e) {
  const btn = e.target.closest('.code-copy');
  if (!btn) return;
  const codeEl = btn.closest('.code-block')?.querySelector('pre code');
  if (!codeEl) return;

  const text = codeEl.innerText;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    btn.classList.add('copied');
    const label = btn.querySelector('.code-copy-label');
    if (label) label.textContent = 'Copied';
    setTimeout(() => {
      btn.classList.remove('copied');
      if (label) label.textContent = 'Copy';
    }, 1600);
  } catch (err) {
    console.warn('Copy failed:', err);
  }
}

export function scheduleRender(content) {
  clearTimeout(renderTimeout);
  setStatus('busy', 'Rendering');
  renderTimeout = setTimeout(() => render(content), 150);
}

export async function renderNow(content) {
  await render(content);
}

async function render(raw) {
  if (isRendering) {
    // Queue the latest content instead of dropping it.
    pendingContent = raw;
    return;
  }
  isRendering = true;
  setStatus('busy', 'Rendering');
  previewLoading.classList.add('active');

  try {
    const markdown = raw || '*Start typing your Markdown...*';
    const tokens = marked.lexer(markdown);
    document.dispatchEvent(new CustomEvent('md-render-start'));
    renderTokens(markdown, tokens);

    // Render mermaid diagrams
    const diagramsOk = await renderMermaidDiagrams();

    if (diagramsOk) {
      setStatus('done', 'Rendered');
    } else {
      setStatus('error', 'Diagram error');
    }
  } catch (err) {
    console.error('Render error:', err);
    preview.innerHTML = `<div class="render-error">${ERROR_ICON}<div><strong>Error rendering Markdown</strong><code>${escapeHtml(err.message)}</code></div></div>`;
    setStatus('error', 'Error');
  } finally {
    isRendering = false;
    previewLoading.classList.remove('active');
    document.dispatchEvent(new CustomEvent('md-rendered'));
  }

  // Chain any content queued while this render ran, and make callers of
  // renderNow() wait for it too.
  if (pendingContent !== null) {
    const next = pendingContent;
    pendingContent = null;
    await render(next);
  }
}

/**
 * Render token-by-token so every top-level element can be stamped with the
 * source line its block started on (data-line, consumed by scroll sync).
 *
 * Each token's start line is located against the original source with an
 * advancing cursor, which stays correct even when the lexer consumes text
 * without emitting a token (link reference definitions), and stamping the
 * elements a token actually produced handles tokens that render zero
 * elements (HTML comments) or several (multi-root raw HTML).
 */
function renderTokens(markdown, tokens) {
  const frag = document.createDocumentFragment();
  const tpl = document.createElement('template');
  let cursor = 0;
  let line = 1;

  for (const tok of tokens) {
    let startLine = line;
    if (tok.raw) {
      const idx = markdown.indexOf(tok.raw, cursor);
      if (idx !== -1) {
        line += countLines(markdown, cursor, idx);
        startLine = line;
        line += countLines(tok.raw, 0, tok.raw.length);
        cursor = idx + tok.raw.length;
      }
    }
    if (tok.type === 'space') continue;

    const body = tok.raw.replace(/\n+$/, '');
    const endLine = startLine + countLines(body, 0, body.length);
    tpl.innerHTML = marked.parser([tok]);
    for (const child of tpl.content.children) {
      child.dataset.line = startLine;
      child.dataset.lineEnd = endLine;
    }
    frag.append(...tpl.content.childNodes);
  }

  preview.replaceChildren(frag);
}

function countLines(str, from, to) {
  let n = 0;
  for (let i = str.indexOf('\n', from); i !== -1 && i < to; i = str.indexOf('\n', i + 1)) n++;
  return n;
}

async function renderMermaidDiagrams() {
  const elements = [...preview.querySelectorAll('.mermaid')];
  if (elements.length === 0) return true;

  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const toRender = [];

  for (const el of elements) {
    // The mermaid extension escapes its output, so textContent is exactly
    // the raw diagram source.
    const key = `${theme}\n${el.textContent}`;
    const cached = mermaidCache.get(key);
    if (cached) {
      // Refresh recency so eviction behaves as LRU.
      mermaidCache.delete(key);
      mermaidCache.set(key, cached);
      el.innerHTML = cached;
      el.setAttribute('data-processed', 'true');
    } else {
      el.dataset.mermaidKey = key;
      toRender.push(el);
    }
  }

  if (toRender.length === 0) return true;

  let ok = true;
  try {
    await mermaid.run({ nodes: toRender });
  } catch (err) {
    ok = false;
    console.warn('Mermaid render error:', err.message);
  }

  // Harvest every diagram that did render — mermaid.run renders all nodes
  // before throwing, so successes in a failed batch still get cached.
  for (const el of toRender) {
    if (el.querySelector('svg') && el.dataset.mermaidKey) {
      mermaidCache.set(el.dataset.mermaidKey, el.innerHTML);
    }
  }
  while (mermaidCache.size > MERMAID_CACHE_MAX) {
    mermaidCache.delete(mermaidCache.keys().next().value);
  }

  if (!ok) {
    preview.querySelectorAll('.mermaid').forEach(el => {
      if (!el.querySelector('svg')) {
        const code = escapeHtml(el.textContent);
        const lineAttr = el.dataset.line ? ` data-line="${el.dataset.line}"` : '';
        el.outerHTML = `<div class="render-error"${lineAttr}>${ERROR_ICON}<div><strong>Failed to render Mermaid diagram</strong><code>${code}</code></div></div>`;
      }
    });
  }
  return ok;
}
