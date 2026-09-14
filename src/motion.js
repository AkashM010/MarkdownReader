/**
 * Motion module — the app's choreography layer.
 *
 * Four behaviours, all optional and all reversible:
 *   1. Boot sequence   — a staged entrance, once per session.
 *   2. Preview reveals — blocks rise in as they enter the viewport.
 *   3. Magnetic pull   — two focal controls lean toward the cursor.
 *   4. Theme wipe      — a circular View Transition from the toggle.
 *
 * Safety contract: nothing here may leave content hidden or unusable.
 * Every hiding class is applied by this module and removed by it, with a
 * failsafe timer behind each one, so a thrown error or an unsupported API
 * degrades to "no animation" rather than "no content".
 */

// ──────────────────────────────────────
// Reduced motion — read live, not once
// ──────────────────────────────────────
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const coarseQuery = window.matchMedia('(pointer: coarse)');

const prefersReduced = () => reduceQuery.matches;

// ──────────────────────────────────────
// 1 · Boot choreography
// The stage assembles once per browsing session. Re-running it on every
// reload turns a flourish into a toll, so a session flag gates it.
// ──────────────────────────────────────
const BOOT_FLAG = 'rym:booted';
const BOOT_TOTAL = 1900; // ms — longest delay + duration, plus slack

function runBootSequence() {
  if (prefersReduced()) return;

  let alreadyBooted = false;
  try {
    alreadyBooted = sessionStorage.getItem(BOOT_FLAG) === '1';
    sessionStorage.setItem(BOOT_FLAG, '1');
  } catch {
    // Private mode or blocked storage: play the sequence, just don't remember.
  }
  if (alreadyBooted) return;

  // Stagger indices drive the CSS animation-delay calc()
  document.querySelectorAll('.header-actions > *').forEach((el, i) => {
    el.style.setProperty('--boot-i', String(i));
  });
  document.querySelectorAll('.toolbar .tb-group > *').forEach((el, i) => {
    el.style.setProperty('--boot-i', String(i));
  });

  document.body.classList.add('is-booting');

  const finish = () => {
    document.body.classList.remove('is-booting');
    document.querySelectorAll('[style*="--boot-i"]').forEach((el) => {
      el.style.removeProperty('--boot-i');
    });
  };

  // Failsafe: the class comes off on a timer, never on an animation event
  // that might not fire (element removed, animation skipped, tab hidden).
  setTimeout(finish, BOOT_TOTAL);
}

// ──────────────────────────────────────
// 2 · Preview reveals
//
// The preview re-renders on a debounce while typing. Animating every
// re-render would make the document twitch under the cursor, so reveals are
// armed explicitly — on boot and whenever a new document is loaded — and
// disarm themselves after one pass.
// ──────────────────────────────────────
const REVEAL_MAX_BLOCKS = 160;  // long documents skip the effect entirely
const REVEAL_FAILSAFE = 20000;  // ms — absolute backstop, never a reset

let revealArmed = false;
let revealObserver = null;
let revealFailsafe = null;

/** Arm reveals for the next render pass. Safe to call repeatedly. */
export function armPreviewReveals() {
  if (prefersReduced()) return;
  revealArmed = true;
}

function clearPending(root) {
  root.querySelectorAll('.reveal-pending').forEach((el) => {
    el.classList.remove('reveal-pending');
  });
}

/**
 * Stop the current pass and show everything immediately.
 * The observer is disconnected first: once a block has been forced visible,
 * a later intersection must not re-apply an animation that starts at
 * opacity 0, which would read as an unexplained flash.
 */
function abortReveals(root) {
  if (revealObserver) {
    revealObserver.disconnect();
    revealObserver = null;
  }
  clearTimeout(revealFailsafe);
  detachPassedSweep();
  if (root) clearPending(root);
}

// --- Sweep for blocks that were jumped over -------------------------------
// A jump (restoring a scroll position, an outline click, a locate) can move
// a pending block from below the fold to above it without its intersection
// ratio ever crossing the threshold — so the observer is never called and
// the block would stay hidden above the reader. This sweep watches for that
// and shows anything the viewport has already passed.
let sweepScroller = null;
let sweepFrame = null;

function detachPassedSweep() {
  if (sweepScroller) {
    sweepScroller.removeEventListener('scroll', onSweepScroll);
    sweepScroller = null;
  }
  if (sweepFrame) {
    cancelAnimationFrame(sweepFrame);
    sweepFrame = null;
  }
}

function onSweepScroll() {
  if (sweepFrame) return;
  sweepFrame = requestAnimationFrame(() => {
    sweepFrame = null;
    if (!sweepScroller) return;
    const top = sweepScroller.getBoundingClientRect().top;
    const pending = document.querySelectorAll('#preview > .reveal-pending');
    pending.forEach((el) => {
      if (el.getBoundingClientRect().bottom <= top) {
        // Off-screen above: reveal it plainly, with no animation to play.
        el.classList.remove('reveal-pending');
        if (revealObserver) revealObserver.unobserve(el);
      }
    });
    if (pending.length === 0) detachPassedSweep();
  });
}

function attachPassedSweep(scroller) {
  detachPassedSweep();
  sweepScroller = scroller;
  scroller.addEventListener('scroll', onSweepScroll, { passive: true });
}

function applyReveals() {
  const preview = document.getElementById('preview');
  if (!preview) return;

  // Tear down any previous pass before starting a new one.
  abortReveals(preview);

  if (prefersReduced() || !('IntersectionObserver' in window)) {
    clearPending(preview);
    return;
  }

  const scroller = document.getElementById('previewContent');
  // No layout box means no scrolling will ever happen and nothing would
  // come into view — leave the document alone.
  if (!scroller || scroller.clientHeight === 0) {
    clearPending(preview);
    return;
  }

  const all = Array.from(preview.children).filter(
    (el) => el.nodeType === 1 && !el.classList.contains('front-matter')
  );

  // Past a few screens of content the effect stops reading as intentional
  // and starts costing layout work on every scroll.
  if (all.length === 0 || all.length > REVEAL_MAX_BLOCKS) {
    clearPending(preview);
    return;
  }

  // Only content *below* the current viewport is revealed on approach.
  // Anything already on screen or scrolled past must render immediately:
  // a restored document can open scrolled to the middle or the end, and
  // hiding everything above the fold would blank most of the document
  // behind an upward scroll the reader has no reason to perform.
  const fold = scroller.getBoundingClientRect().bottom;
  const blocks = all.filter((el) => el.getBoundingClientRect().top >= fold);

  all.forEach((el) => el.classList.remove('reveal-in', 'reveal-pending'));
  if (blocks.length === 0) return;

  blocks.forEach((el) => el.classList.add('reveal-pending'));

  revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.remove('reveal-pending');
        el.classList.add('reveal-in');
        observer.unobserve(el);
      });
    },
    { root: document.getElementById('previewContent'), rootMargin: '0px 0px -8% 0px', threshold: 0.01 }
  );

  blocks.forEach((el) => revealObserver.observe(el));
  attachPassedSweep(scroller);

  // Below-fold blocks are *meant* to stay pending until they are scrolled
  // to, so "nothing revealed yet" is not evidence of a fault and must not
  // trigger a reset. This is an absolute backstop instead: long after the
  // effect has stopped being interesting, anything still pending is shown
  // outright, so no block can be left invisible by a missed callback.
  revealFailsafe = setTimeout(() => abortReveals(preview), REVEAL_FAILSAFE);
}

// ──────────────────────────────────────
// 3 · Magnetic pull
//
// Applied to exactly two focal controls. More than that and the interface
// feels unstable rather than responsive. Pointer-only: a magnet has no
// meaning on touch, and it is skipped entirely under reduced motion.
// ──────────────────────────────────────
const PULL_STRENGTH = 0.28;
const PULL_MAX = 6; // px — never let the control leave its own hit box

function makeMagnetic(el) {
  if (!el) return;

  let frame = null;
  let px = 0;
  let py = 0;

  const onMove = (e) => {
    if (prefersReduced() || coarseQuery.matches) return;
    px = e.clientX;
    py = e.clientY;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      const r = el.getBoundingClientRect();
      const dx = (px - r.left - r.width / 2) * PULL_STRENGTH;
      const dy = (py - r.top - r.height / 2) * PULL_STRENGTH;
      const clamp = (v) => Math.max(-PULL_MAX, Math.min(PULL_MAX, v));
      el.style.setProperty('--pull-x', `${clamp(dx).toFixed(2)}px`);
      el.style.setProperty('--pull-y', `${clamp(dy).toFixed(2)}px`);
    });
  };

  const release = () => {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = null;
    }
    el.classList.remove('is-pulling');
    el.style.setProperty('--pull-x', '0px');
    el.style.setProperty('--pull-y', '0px');
  };

  el.classList.add('is-magnetic');
  el.addEventListener('pointerenter', () => {
    if (prefersReduced() || coarseQuery.matches) return;
    el.classList.add('is-pulling');
  });
  el.addEventListener('pointermove', onMove);
  // Always reverse the tween — a fast exit must not strand the control.
  el.addEventListener('pointerleave', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('blur', release);
}

// ──────────────────────────────────────
// 4 · Theme wipe
//
// A circular View Transition that originates at the control the user
// pressed, so the new theme reads as spreading from their own action.
// Falls back to an immediate swap where the API is absent.
// ──────────────────────────────────────
/**
 * Runs `apply` inside a circular View Transition originating at `origin`.
 *
 * Returns nothing on purpose: startViewTransition invokes its callback
 * asynchronously, after it has snapshotted the page, so any value produced
 * inside `apply` is not available to this function's caller. Callers that
 * need to know the outcome must derive it themselves before calling.
 *
 * @param {() => void} apply  Mutates the DOM to the new state.
 * @param {Element} [origin]  Element the wipe should radiate from.
 */
export function withThemeTransition(apply, origin) {
  const canTransition =
    typeof document.startViewTransition === 'function' && !prefersReduced();

  if (!canTransition) {
    apply();
    return;
  }

  if (origin) {
    const r = origin.getBoundingClientRect();
    const x = ((r.left + r.width / 2) / window.innerWidth) * 100;
    const y = ((r.top + r.height / 2) / window.innerHeight) * 100;
    document.documentElement.style.setProperty('--theme-x', `${x.toFixed(1)}%`);
    document.documentElement.style.setProperty('--theme-y', `${y.toFixed(1)}%`);
  }

  document.startViewTransition(apply);
}

// ──────────────────────────────────────
// 5 · Toolbar overflow affordance
// A scrollable toolbar with no visible edge looks like a complete toolbar
// that happens to be missing buttons.
// ──────────────────────────────────────
function initToolbarOverflow() {
  const wrap = document.querySelector('.editor-toolbar-wrap');
  const toolbar = document.getElementById('toolbar');
  if (!wrap || !toolbar) return;

  const update = () => {
    const overflowing =
      toolbar.scrollWidth - toolbar.clientWidth - toolbar.scrollLeft > 4;
    wrap.classList.toggle('is-overflowing', overflowing);
  };

  toolbar.addEventListener('scroll', update, { passive: true });
  if ('ResizeObserver' in window) {
    new ResizeObserver(update).observe(toolbar);
  } else {
    window.addEventListener('resize', update);
  }
  update();
}

// ──────────────────────────────────────
// Entry point
// ──────────────────────────────────────
export function initMotion() {
  runBootSequence();
  initToolbarOverflow();

  makeMagnetic(document.getElementById('saveBtn'));
  makeMagnetic(document.querySelector('.logo-mark'));

  // A render only animates when something armed it.
  document.addEventListener('md-rendered', () => {
    if (!revealArmed) return;
    revealArmed = false;
    applyReveals();
  });

  // Opening a file, restoring a draft or picking a recent document all
  // replace the whole document — that earns a reveal pass; typing does not.
  document.addEventListener('md-document-loaded', armPreviewReveals);

  // If the user turns reduced motion on mid-session, drop everything
  // currently in flight rather than waiting for the next interaction.
  reduceQuery.addEventListener('change', () => {
    if (!prefersReduced()) return;
    document.body.classList.remove('is-booting');
    abortReveals(document.getElementById('preview'));
    document.querySelectorAll('.is-magnetic').forEach((el) => {
      el.style.setProperty('--pull-x', '0px');
      el.style.setProperty('--pull-y', '0px');
    });
  });

  // The first document of the session gets the reveal treatment.
  armPreviewReveals();
}
