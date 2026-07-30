// Shared countdown engine used by brb.html, starting-soon.html and
// between-matches.html. Those three scenes each hand-rolled an identical
// getRemaining/formatTime pair plus a tick loop; this module dedupes the
// logic. Scenes keep their own rendering (element ids/classes/markup).
//
// countdownState shape (this is `state.countdown` from the poll payload):
//   { running: bool, startedAt: epoch-ms|null, duration: seconds, remaining: seconds, visible: bool }
//
// Reconciliation notes (the 3 original copies were near-identical but not
// pixel-identical — see commit body for the full writeup):
//  - getRemaining: behaviorally equivalent to the scenes' combined
//    getRemaining + update()-time var-priming (the branch structure here
//    merges both, so don't diff it against the old two-line function alone),
//    plus defensive clamping/undefined-state handling the originals didn't
//    need. The Math.max clamps also mean out-of-contract negative `remaining`
//    now renders "00:00" instead of the old garbage/blank.
//  - formatTime: starting-soon.html and between-matches.html (majority) format
//    unconditionally, including 0 -> "00:00". brb.html was the outlier: it
//    special-cased falsy/<=0 input to return ''. Matched the majority here.
//    Visible impact, brb.html only (the other two already showed "00:00"):
//    (1) when countdownVisible is true but duration is 0 (no countdown ever
//    configured), the timer slot now shows "00:00" instead of blank; (2) a
//    RUNNING countdown that reaches zero now holds at "00:00" instead of
//    blanking out at expiry. Counting-down displays are unchanged.

function getRemaining(countdownState, nowMs) {
  if (!countdownState) return 0;
  var running = !!countdownState.running;
  if (!running) {
    return Math.max(0, countdownState.remaining || 0);
  }
  if (!countdownState.startedAt) {
    return Math.max(0, countdownState.duration || 0);
  }
  var elapsed = (nowMs - countdownState.startedAt) / 1000;
  var duration = countdownState.duration || 0;
  return Math.max(0, Math.ceil(duration - elapsed));
}

function pad2(n) {
  n = Math.floor(n);
  return (n < 10 ? '0' : '') + n;
}

function formatTime(seconds) {
  var total = Math.floor(seconds || 0);
  if (total < 0) total = 0;
  var m = Math.floor(total / 60);
  var s = total % 60;
  return pad2(m) + ':' + pad2(s);
}

// Impure, thin: a 1s interval that keeps a single textContent node in sync
// with countdown state. Mirrors how the three scenes actually consume this
// (they re-derive remaining from live state every tick rather than caching
// a value), just moved from a per-frame requestAnimationFrame loop to a 1s
// setInterval since nothing here needs 60fps precision.
//
// `el` may be a DOM node, OR a zero-arg function that resolves one — pass a
// function if the node can be replaced by an innerHTML rebuild between ticks
// (the scenes' buildKey-gated re-renders do exactly this) so the interval
// keeps writing to whatever node is currently live instead of a detached one.
//
// Defensive against interval stacking (the thing v1.3.8 fixed): each call
// clears any interval this module previously started before starting a new
// one, so re-invoking on every poll/update (as the scenes do) never piles up
// timers. CONSTRAINT: the singleton means only ONE live tick per page — a
// second startLocalTick call silently replaces the first. Not multi-timer
// safe; a scene needing two independent countdowns must not use this as-is.
var _tickIntervalId = null;

function startLocalTick(el, getState, opts) {
  opts = opts || {};
  if (_tickIntervalId) {
    clearInterval(_tickIntervalId);
    _tickIntervalId = null;
  }
  if (!el || typeof getState !== 'function') return null;

  function resolveEl() {
    return typeof el === 'function' ? el() : el;
  }

  function render() {
    var node = resolveEl();
    if (!node) return;
    var state = getState();
    var remaining = getRemaining(state, Date.now());
    node.textContent = formatTime(remaining);
  }

  render();
  _tickIntervalId = setInterval(render, opts.intervalMs || 1000);
  return _tickIntervalId;
}

// CJS export guard so Node/Vitest can import these for tests; harmless in the
// browser since `module` is undefined there and this block never executes.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getRemaining: getRemaining,
    formatTime: formatTime,
    startLocalTick: startLocalTick
  };
}
