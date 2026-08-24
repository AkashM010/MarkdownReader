/**
 * Persistence module — autosaves the working document to localStorage
 * so a refresh or accidental tab close never loses work.
 */
const DRAFT_KEY = 'md-reader-draft';
const AUTOSAVE_DELAY = 800;

let statusEl = null;
let getSnapshot = null;
let saveTimeout = null;

export function initPersistence(statusElement, snapshotFn) {
  statusEl = statusElement;
  getSnapshot = snapshotFn;

  // Flush any pending write when the tab is hidden or closing.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimeout) flushDraft();
  });
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (typeof draft?.content !== 'string') return null;
    return draft;
  } catch {
    return null;
  }
}

export function scheduleAutosave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(flushDraft, AUTOSAVE_DELAY);
}

export function flushDraft() {
  clearTimeout(saveTimeout);
  saveTimeout = null;
  if (!getSnapshot) return;
  const { content, fileName } = getSnapshot();
  try {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ content, fileName, savedAt: Date.now() })
    );
    showSavedAt(new Date());
  } catch {
    // Storage unavailable (private mode, quota) — autosave is best-effort.
  }
}

function showSavedAt(date) {
  if (!statusEl) return;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  statusEl.textContent = `Draft saved ${hh}:${mm}`;
  statusEl.classList.remove('flash');
  void statusEl.offsetWidth; // restart the flash animation
  statusEl.classList.add('flash');
}
