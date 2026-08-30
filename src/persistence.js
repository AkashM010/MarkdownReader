/**
 * Persistence module — autosaves the working document so a refresh or
 * accidental tab close never loses work.
 *
 * Storage: IndexedDB is the primary store (no ~5 MB cap, so documents with
 * embedded images survive). Small documents are additionally written to
 * localStorage synchronously, which is guaranteed to complete during
 * tab-close. On load the newer of the two wins. If every store rejects the
 * write, the status bar says so instead of silently claiming success.
 */
const DRAFT_KEY = 'md-reader-draft';
const DB_NAME = 'read-your-md-drafts';
const STORE = 'drafts';
const RECORD_ID = 'current';
const AUTOSAVE_DELAY = 800;
const SYNC_COPY_LIMIT = 900 * 1024; // chars; keep localStorage well under its quota

let statusEl = null;
let getSnapshot = null;
let showToast = null;
let saveTimeout = null;
let writing = false;
let queued = false;
let warnedPaused = false;

export function initPersistence(statusElement, snapshotFn, toastFn) {
  statusEl = statusElement;
  getSnapshot = snapshotFn;
  showToast = toastFn || null;

  // Flush any pending write when the tab is hidden or closing.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimeout) flushDraft();
  });
}

// ──────────────────────────────────────
// IndexedDB
// ──────────────────────────────────────

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

function idbGet() {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, 'readonly');
        const req = t.objectStore(STORE).get(RECORD_ID);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

function idbPut(record) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).put(record);
        t.oncomplete = () => {
          db.close();
          resolve();
        };
        t.onerror = () => {
          db.close();
          reject(t.error);
        };
        t.onabort = () => {
          db.close();
          reject(t.error || new Error('IndexedDB write aborted'));
        };
      })
  );
}

// ──────────────────────────────────────
// Public API
// ──────────────────────────────────────

function readLocal() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    return typeof draft?.content === 'string' ? draft : null;
  } catch {
    return null;
  }
}

/** Newest draft from either store, or null. */
export async function loadDraft() {
  let fromDb = null;
  try {
    fromDb = await idbGet();
    if (fromDb && typeof fromDb.content !== 'string') fromDb = null;
  } catch {
    fromDb = null;
  }
  const fromLocal = readLocal();
  if (fromDb && fromLocal) return (fromDb.savedAt || 0) >= (fromLocal.savedAt || 0) ? fromDb : fromLocal;
  return fromDb || fromLocal;
}

export function scheduleAutosave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(flushDraft, AUTOSAVE_DELAY);
}

export function flushDraft() {
  clearTimeout(saveTimeout);
  saveTimeout = null;
  if (!getSnapshot) return Promise.resolve();
  if (writing) {
    queued = true;
    return Promise.resolve();
  }

  const { content, fileName } = getSnapshot();
  const record = { id: RECORD_ID, content, fileName, savedAt: Date.now() };

  // Synchronous copy for small documents — survives an immediate tab close.
  let localOk = false;
  if (content.length <= SYNC_COPY_LIMIT) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(record));
      localOk = true;
    } catch {
      localOk = false;
    }
  } else {
    // A stale small copy must not outrank the big one on the next load.
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  }

  writing = true;
  return idbPut(record)
    .then(() => markSaved(record.savedAt))
    .catch((err) => {
      if (localOk) {
        markSaved(record.savedAt);
      } else {
        markPaused(err);
      }
    })
    .finally(() => {
      writing = false;
      if (queued) {
        queued = false;
        flushDraft();
      }
    });
}

function markSaved(ts) {
  if (!statusEl) return;
  const date = new Date(ts);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  statusEl.textContent = `Draft saved ${hh}:${mm}`;
  statusEl.classList.remove('paused', 'flash');
  void statusEl.offsetWidth; // restart the flash animation
  statusEl.classList.add('flash');
}

function markPaused(err) {
  console.warn('Autosave failed:', err);
  if (statusEl) {
    statusEl.textContent = 'Autosave paused — too large for browser storage; save to a file';
    statusEl.classList.add('paused');
    statusEl.classList.remove('flash');
  }
  if (showToast && !warnedPaused) {
    warnedPaused = true;
    showToast('Autosave paused: the document is too large for browser storage. Save it to a file (Ctrl+S).', 6000);
  }
}
