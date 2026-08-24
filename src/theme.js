/**
 * Theme management for dark/light mode.
 * Persists preference to localStorage and provides initialization.
 */
let themeToggle = null;
let themeLabel = null;
let onThemeChange = null;

export function initTheme(toggleEl, labelEl, onToggle) {
  themeToggle = toggleEl;
  themeLabel = labelEl;
  onThemeChange = onToggle;
  // Note: the toggle button's click handler is bound by the caller
  // (main.js) so it can add user feedback around toggleTheme().
}

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

export function setTheme(theme) {
  // The toggle's sun/moon icons flip via CSS keyed off this attribute.
  document.documentElement.setAttribute('data-theme', theme);
  if (themeLabel) {
    themeLabel.textContent = theme === 'dark' ? 'Dark' : 'Light';
  }
  localStorage.setItem('md-reader-theme', theme);
  if (onThemeChange) onThemeChange(theme);
}

export function toggleTheme() {
  const current = getTheme();
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

export function loadSavedTheme() {
  return localStorage.getItem('md-reader-theme') || 'dark';
}
