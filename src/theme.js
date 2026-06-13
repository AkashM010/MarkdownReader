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

  themeToggle.addEventListener('click', toggleTheme);
}

export function getTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}

export function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (themeToggle) {
    themeToggle.textContent = theme === 'dark' ? '🌙' : '☀️';
  }
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
