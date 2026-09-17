/**
 * Confirm dialog — asks before an action destroys work.
 *
 * Promise-based: resolves to the id of the chosen action, or 'cancel' if
 * the user dismissed it. Built in JS rather than markup because it is
 * summoned rarely and always with different wording (same approach as the
 * update banner in view.js).
 *
 * Follows the same modal conventions as the shortcuts overlay: Escape and
 * a backdrop click cancel, Tab is trapped inside, and focus returns to
 * whatever opened it.
 */

let overlay = null;
let titleEl = null;
let messageEl = null;
let actionsEl = null;
let lastFocus = null;
let settle = null;

function build() {
  overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.id = 'confirmOverlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="dialog dialog-sm" role="dialog" aria-modal="true"
         aria-labelledby="confirmTitle" aria-describedby="confirmMessage">
      <div class="dialog-head">
        <div><h2 id="confirmTitle"></h2></div>
      </div>
      <div class="dialog-body">
        <p class="confirm-message" id="confirmMessage"></p>
      </div>
      <div class="dialog-actions"></div>
    </div>`;
  document.body.appendChild(overlay);

  titleEl = overlay.querySelector('#confirmTitle');
  messageEl = overlay.querySelector('#confirmMessage');
  actionsEl = overlay.querySelector('.dialog-actions');

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close('cancel');
  });

  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close('cancel');
      return;
    }
    if (e.key !== 'Tab') return;
    const focusables = [...overlay.querySelectorAll('button')].filter(
      (el) => !el.disabled && el.offsetParent !== null
    );
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
}

function close(result) {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  const done = settle;
  settle = null;
  if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  lastFocus = null;
  if (done) done(result);
}

/**
 * @param {object}   opts
 * @param {string}   opts.title
 * @param {string}   opts.message
 * @param {Array<{id:string,label:string,variant?:'primary'|'danger'}>} opts.actions
 *        Listed left to right. The last one receives initial focus, so put
 *        the safe choice there — a destructive action should never be one
 *        stray Enter away.
 * @returns {Promise<string>} the chosen action's id, or 'cancel'
 */
export function askConfirm({ title, message, actions }) {
  if (!overlay) build();

  // A second call while one is open cancels the first rather than
  // stacking dialogs or silently dropping its promise.
  if (!overlay.hidden) close('cancel');

  titleEl.textContent = title;
  messageEl.textContent = message;
  actionsEl.replaceChildren();

  for (const action of actions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'action-btn' +
      (action.variant === 'primary' ? ' primary' : '') +
      (action.variant === 'danger' ? ' danger' : '');
    btn.textContent = action.label;
    btn.addEventListener('click', () => close(action.id));
    actionsEl.appendChild(btn);
  }

  lastFocus = document.activeElement;
  overlay.hidden = false;
  actionsEl.lastElementChild?.focus();

  return new Promise((resolve) => {
    settle = resolve;
  });
}
