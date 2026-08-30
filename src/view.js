/**
 * View module — reader mode, the shortcuts/about overlay, spellcheck
 * toggle, and version display.
 */
const READER_KEY = 'md-reader-view';
const SPELL_KEY = 'md-reader-spell';

// Injected by Vite from package.json (see vite.config.js).
export const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

let readerBtn = null;
let helpOverlay = null;
let spellBtn = null;
let editor = null;
let showToast = null;

export function initView(elements, toastFn) {
  readerBtn = elements.readerBtn;
  helpOverlay = elements.helpOverlay;
  spellBtn = elements.spellBtn;
  editor = elements.editor;
  showToast = toastFn;

  // Version
  for (const el of elements.versionEls) el.textContent = `v${VERSION}`;
  console.info(`Read Your MD v${VERSION}`);

  // Reader mode
  readerBtn.addEventListener('click', () => setReaderMode(!isReaderMode(), true));
  setReaderMode(readStored(READER_KEY) === 'on', false);

  // Help overlay
  elements.helpBtn.addEventListener('click', () => openHelp());
  elements.helpClose.addEventListener('click', () => closeHelp());
  helpOverlay.addEventListener('click', (e) => {
    if (e.target === helpOverlay) closeHelp();
  });

  // Spellcheck
  spellBtn.addEventListener('click', () => setSpellcheck(!editor.spellcheck, true));
  setSpellcheck(readStored(SPELL_KEY) === 'on', false);

  // PWA install: the browser hands us a deferred prompt when installable.
  const installBtn = elements.installBtn;
  if (installBtn) {
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installBtn.hidden = false;
    });
    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      installBtn.hidden = true;
      showToast('Installed — find Read Your MD in your apps');
    });
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') installBtn.hidden = true;
      deferredPrompt = null;
    });
  }

  // D15: keep Tab inside the modal dialog
  helpOverlay.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusables = [...helpOverlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => !el.hidden && el.offsetParent !== null);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  document.addEventListener('keydown', (e) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && !e.shiftKey && e.key === '\\') {
      e.preventDefault();
      setReaderMode(!isReaderMode(), true);
    } else if (ctrl && !e.shiftKey && e.key === '/') {
      e.preventDefault();
      helpOverlay.hidden ? openHelp() : closeHelp();
    } else if (e.key === 'Escape' && !helpOverlay.hidden) {
      closeHelp();
    }
  });
}

// ──────────────────────────────────────
// Update banner (D10) — a new service worker is waiting; ask, never force.
// ──────────────────────────────────────

export function showUpdateBanner(onReload) {
  if (document.querySelector('.update-banner')) return;
  const banner = document.createElement('div');
  banner.className = 'update-banner';
  banner.setAttribute('role', 'status');
  const label = document.createElement('span');
  label.textContent = 'A new version of Read Your MD is ready.';
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'action-btn primary';
  reload.textContent = 'Reload';
  reload.addEventListener('click', () => {
    banner.remove();
    onReload();
  });
  const later = document.createElement('button');
  later.type = 'button';
  later.className = 'action-btn';
  later.textContent = 'Later';
  later.addEventListener('click', () => banner.remove());
  banner.append(label, reload, later);
  document.body.appendChild(banner);
}

function readStored(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Best-effort.
  }
}

// ──────────────────────────────────────
// Reader mode
// ──────────────────────────────────────

export function isReaderMode() {
  return document.body.classList.contains('reader-mode');
}

export function setReaderMode(on, announce) {
  document.body.classList.toggle('reader-mode', on);
  readerBtn.setAttribute('aria-pressed', String(on));
  readerBtn.classList.toggle('active', on);
  store(READER_KEY, on ? 'on' : 'off');
  // Layout changed under the preview — let listeners re-measure.
  window.dispatchEvent(new Event('resize'));
  if (announce) showToast(on ? 'Reader mode — Ctrl+\\ to edit again' : 'Editor restored');
}

// ──────────────────────────────────────
// Help overlay
// ──────────────────────────────────────

let lastFocus = null;

function openHelp() {
  lastFocus = document.activeElement;
  helpOverlay.hidden = false;
  helpOverlay.querySelector('.dialog-close')?.focus();
}

function closeHelp() {
  helpOverlay.hidden = true;
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
}

// ──────────────────────────────────────
// Spellcheck
// ──────────────────────────────────────

function setSpellcheck(on, announce) {
  editor.spellcheck = on;
  spellBtn.setAttribute('aria-pressed', String(on));
  store(SPELL_KEY, on ? 'on' : 'off');
  if (announce) {
    showToast(on ? 'Spellcheck on' : 'Spellcheck off');
    // Browsers only re-check on the next edit; nudge the field.
    editor.blur();
    editor.focus();
  }
}
