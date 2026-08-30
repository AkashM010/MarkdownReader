/**
 * Recent files — remembers FileSystemFileHandles in IndexedDB so a document
 * can be reopened from a list (one permission click) instead of the picker.
 *
 * fileIO.js announces handles via the `md-file-handle` event; this module
 * never imports it back, so there is no circular dependency.
 */
import { openHandle } from './fileIO.js';

const DB_NAME = 'read-your-md';
const STORE = 'recent';
const MAX_RECENT = 10;

let button = null;
let menu = null;
let list = null;
let showToast = null;

const supported =
  typeof window.showOpenFilePicker === 'function' && typeof indexedDB !== 'undefined';

export function initRecent(elements, toastFn) {
  button = elements.button;
  menu = elements.menu;
  list = elements.list;
  showToast = toastFn;

  if (!supported) {
    button.hidden = true;
    return;
  }

  button.addEventListener('click', async (e) => {
    e.stopPropagation();
    const open = !menu.classList.contains('open');
    if (open) {
      document.dispatchEvent(new CustomEvent('md-header-menu-open', { detail: { menu } }));
      await renderList();
    }
    menu.classList.toggle('open', open);
    button.setAttribute('aria-expanded', String(open));
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
  });
  menu.addEventListener('click', async (e) => {
    const clear = e.target.closest('[data-recent-clear]');
    if (clear) {
      closeMenu();
      await clearRecent();
      showToast('Recent files cleared');
      return;
    }
    const item = e.target.closest('[data-recent-id]');
    if (!item) return;
    closeMenu();
    await reopen(Number(item.dataset.recentId));
  });

  document.addEventListener('md-file-handle', (e) => {
    const handle = e.detail?.handle;
    if (handle) remember(handle).catch((err) => console.warn('Recent files:', err));
  });
}

function closeMenu() {
  if (!menu) return;
  menu.classList.remove('open');
  button.setAttribute('aria-expanded', 'false');
}

// ──────────────────────────────────────
// IndexedDB
// ──────────────────────────────────────

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const result = fn(store);
    t.oncomplete = () => resolve(result?.result ?? result);
    t.onerror = () => reject(t.error);
  });
}

async function all() {
  const db = await openDb();
  const rows = await tx(db, 'readonly', (s) => s.getAll());
  db.close();
  return (rows || []).sort((a, b) => b.lastOpened - a.lastOpened);
}

export async function remember(handle) {
  const db = await openDb();
  const rows = (await tx(db, 'readonly', (s) => s.getAll())) || [];
  let existing = null;
  for (const row of rows) {
    try {
      if (await handle.isSameEntry(row.handle)) {
        existing = row;
        break;
      }
    } catch {
      // Ignore stale rows.
    }
  }
  const record = { name: handle.name, handle, lastOpened: Date.now() };
  if (existing) record.id = existing.id;
  await tx(db, 'readwrite', (s) => s.put(record));

  // Trim to the newest MAX_RECENT
  const after = ((await tx(db, 'readonly', (s) => s.getAll())) || []).sort((a, b) => b.lastOpened - a.lastOpened);
  for (const row of after.slice(MAX_RECENT)) {
    await tx(db, 'readwrite', (s) => s.delete(row.id));
  }
  db.close();
}

export async function clearRecent() {
  const db = await openDb();
  await tx(db, 'readwrite', (s) => s.clear());
  db.close();
}

async function forget(id) {
  const db = await openDb();
  await tx(db, 'readwrite', (s) => s.delete(id));
  db.close();
}

// ──────────────────────────────────────
// UI
// ──────────────────────────────────────

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

async function renderList() {
  let rows = [];
  try {
    rows = await all();
  } catch (err) {
    console.warn('Recent files:', err);
  }
  list.innerHTML = '';
  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'recent-empty';
    empty.textContent = 'No recent files yet';
    list.appendChild(empty);
    return;
  }
  for (const row of rows) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'tb-menu-item recent-item';
    item.setAttribute('role', 'menuitem');
    item.dataset.recentId = String(row.id);
    item.innerHTML = `<span class="recent-name"></span><span class="tb-kbd recent-time"></span>`;
    item.querySelector('.recent-name').textContent = row.name;
    item.querySelector('.recent-time').textContent = relativeTime(row.lastOpened);
    list.appendChild(item);
  }
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'tb-menu-item recent-clear';
  clear.setAttribute('role', 'menuitem');
  clear.dataset.recentClear = 'true';
  clear.textContent = 'Clear list';
  list.appendChild(clear);
}

async function reopen(id) {
  const rows = await all();
  const row = rows.find((r) => r.id === id);
  if (!row) return;
  const handle = row.handle;
  try {
    // Origin-private handles have no permission API; user-picked ones do.
    const hasPermissionApi = typeof handle.queryPermission === 'function';
    let perm = hasPermissionApi ? await handle.queryPermission({ mode: 'readwrite' }) : 'granted';
    if (perm !== 'granted') perm = await handle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') {
      // Fall back to read-only access so the document can at least be viewed.
      let readPerm = await handle.queryPermission({ mode: 'read' });
      if (readPerm !== 'granted') readPerm = await handle.requestPermission({ mode: 'read' });
      if (readPerm !== 'granted') {
        showToast('Permission needed to reopen that file', 3000);
        return;
      }
    }
    await openHandle(handle);
  } catch (err) {
    console.warn('Reopen failed:', err);
    if (err?.name === 'NotFoundError') {
      await forget(id);
      showToast('That file was moved or deleted — removed from recent', 3500);
    } else {
      showToast('Could not reopen file', 3000);
    }
  }
}
