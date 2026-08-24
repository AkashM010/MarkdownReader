/**
 * Outline module — a collapsible table-of-contents panel for the preview.
 * Rebuilds from the rendered headings after every render, highlights the
 * section currently in view, and jumps to a heading on click.
 */
let panel = null;
let list = null;
let toggle = null;
let previewContent = null;
let preview = null;

let headings = []; // [{ el, level, text }]
let lastSignature = null;
let spyFrame = null;

const STORAGE_KEY = 'md-reader-outline';

export function initOutline(elements) {
  panel = elements.panel;
  list = elements.list;
  toggle = elements.toggle;
  previewContent = elements.previewContent;
  preview = elements.preview;

  toggle.addEventListener('click', () => setOpen(!panel.classList.contains('open')));

  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage unavailable — default to closed.
  }
  if (saved === 'open') setOpen(true, false);

  document.addEventListener('md-rendered', rebuild);
  previewContent.addEventListener('scroll', scheduleSpy, { passive: true });
}

function setOpen(open, persist = true) {
  panel.classList.toggle('open', open);
  toggle.classList.toggle('active', open);
  toggle.setAttribute('aria-pressed', String(open));
  // Lets the pane offset overlapping chrome (e.g. the render spinner).
  panel.closest('.pane')?.classList.toggle('outline-open', open);
  if (open) scheduleSpy();
  if (persist) {
    try {
      localStorage.setItem(STORAGE_KEY, open ? 'open' : 'closed');
    } catch {
      // Best-effort.
    }
  }
}

function slugify(text) {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-') || 'section'
  );
}

function rebuild() {
  const used = new Set();
  const fresh = [...preview.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => {
    // Namespaced ids so headings like "Editor" can't collide with app ids.
    const base = `md-${slugify(h.textContent)}`;
    let id = base;
    let n = 1;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    h.id = id;
    return { el: h, level: Number(h.tagName[1]), text: h.textContent.trim() };
  });

  // If the heading structure is unchanged (the common case while typing),
  // keep the existing list DOM — just repoint element refs — so the
  // outline's scroll position and focus survive re-renders.
  const signature = fresh.map((h) => `${h.level}:${h.text}`).join('');
  if (signature === lastSignature) {
    fresh.forEach((h, i) => { headings[i].el = h.el; });
    scheduleSpy();
    return;
  }
  lastSignature = signature;
  headings = fresh;

  const prevScroll = list.scrollTop;
  list.innerHTML = '';
  if (headings.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'outline-empty';
    empty.textContent = 'No headings yet';
    list.appendChild(empty);
    return;
  }

  for (const h of headings) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `outline-item outline-l${h.level}`;
    btn.textContent = h.text || '(untitled)';
    btn.title = h.text || '(untitled)';
    btn.addEventListener('click', () => {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      previewContent.scrollTo({
        top: Math.max(h.el.offsetTop - 16, 0),
        behavior: reduce ? 'auto' : 'smooth',
      });
    });
    list.appendChild(btn);
  }
  list.scrollTop = prevScroll;
  scheduleSpy();
}

function scheduleSpy() {
  if (spyFrame) return;
  spyFrame = requestAnimationFrame(() => {
    spyFrame = null;
    updateActive();
  });
}

function updateActive() {
  if (headings.length === 0 || !panel.classList.contains('open')) return;
  const top = previewContent.scrollTop + 48;
  let activeIdx = 0;
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].el.offsetTop <= top) activeIdx = i;
    else break;
  }
  // At the clamped bottom the last section may be too short to ever reach
  // the top of the viewport — count it as active anyway.
  const maxScroll = previewContent.scrollHeight - previewContent.clientHeight;
  if (maxScroll > 0 && previewContent.scrollTop >= maxScroll - 2) {
    activeIdx = headings.length - 1;
  }
  const items = list.querySelectorAll('.outline-item');
  items.forEach((item, i) => item.classList.toggle('active', i === activeIdx));
}
