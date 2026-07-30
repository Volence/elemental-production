/**
 * Overlay Core — the one true render loop for Broadcast v2 scenes.
 *
 * Every scene used to hand-roll its own `lastRenderKey` dedup, deps loading and
 * entrance-animation guards, and several got it subtly wrong (key latched on a
 * skipped frame; deps racing the first render so portraits never appeared;
 * entrance animations replaying on every data change). This unifies all of it.
 *
 *   defineOverlay({
 *     el:       Element | function() -> Element   (REQUIRED; mount root — shell
 *                                                   builds into it and the render
 *                                                   container is appended inside)
 *     key:      function(state) -> array          (JSON.stringify'd; key EXACTLY
 *                                                   what render reads)
 *     render:   function(state, container)        (fires only when key changes
 *                                                   AND deps are loaded)
 *     validate: function(state) -> bool           (optional; strict false = skip
 *                                                   WITHOUT committing the key)
 *     deps:     [function() -> Promise]           (optional; e.g. loadHeroes)
 *     shell:    function(el)                      (optional; runs ONCE — the
 *                                                   entrance-animated chrome that
 *                                                   must NOT rebuild on data)
 *   }, opts) -> { forceRender: fn, ready: Promise }
 *
 * Render container: created once and appended as the LAST CHILD of `el`, AFTER
 * everything `shell` builds. Scene CSS must position that trailing container
 * (it holds all of render's volatile output) — the first migrator (Task 6)
 * needs to account for this ordering.
 *
 * Error handling: if key() or render() throws, the exception surfaces to
 * state-sync.js's per-callback try/catch — it's logged, the frame is dropped,
 * and the next poll retries. `validate` is the first-class way to guard against
 * malformed/partial state; don't rely on throwing from render for control flow.
 *
 * ES5 classic script: production omits `opts` and defineOverlay wires the global
 * `stateSync(update)` itself. Tests pass `opts._stateSync` to inject a fake.
 * The visibility-replay behaviour in state-sync.js is untouched by this runtime.
 */
function defineOverlay(config, opts) {
  opts = opts || {};

  // Prefer the injected seam (tests); otherwise the global from state-sync.js.
  var stateSyncFn = opts._stateSync ||
    (typeof stateSync !== 'undefined' ? stateSync :
      (typeof window !== 'undefined' ? window.stateSync : null));

  var validate = config.validate;
  var deps = config.deps || [];

  // ── Commit-point + replay state ──
  // lastKey is committed ONLY at a genuine render point (never on a skipped or
  // invalid frame) so a corrected later frame with the same key still repaints.
  // lastState is stashed on every frame BEFORE the dedup/validate guards so
  // forceRender can replay the most recent state (the switchMap escape hatch).
  var lastKey = null;
  var hasKey = false;
  var lastState = null;
  var hasState = false;

  // Shell + volatile container. The mount root is resolved lazily (at first
  // render) so `el` can be a function that reads the DOM after it exists.
  var elResolved = false;
  var elValue = null;
  var shellReady = false;
  var container = null;
  var rendering = false; // re-entrancy latch (see doRender)

  function resolveEl() {
    if (!elResolved) {
      elResolved = true;
      elValue = (typeof config.el === 'function') ? config.el() : config.el;
    }
    return elValue;
  }

  function makeContainer() {
    if (typeof document !== 'undefined' && document.createElement) {
      return document.createElement('div');
    }
    return { innerHTML: '' }; // headless (test) fallback
  }

  // Shell runs exactly once, before the first render. render then always paints
  // into a dedicated child container, so its innerHTML rebuilds never touch the
  // entrance-animated shell (the render-vs-reflow split).
  function ensureShell() {
    if (shellReady) return;
    shellReady = true;
    var mount = resolveEl();
    if (config.shell) config.shell(mount);
    container = makeContainer();
    if (mount && mount.appendChild) mount.appendChild(container);
  }

  function doRender(state) {
    ensureShell();
    // Ignore a re-entrant forceRender() called from inside render itself —
    // otherwise it would recurse to a stack overflow. render runs once per
    // commit; a repaint request from within is a no-op.
    if (rendering) return;
    rendering = true;
    try {
      config.render(state, container);
    } finally {
      rendering = false;
    }
  }

  function update(state) {
    // Stash BEFORE any guard so forceRender always has the latest frame.
    lastState = state;
    hasState = true;

    // Strict false = skip; do NOT commit the key (no latch). A truthy or
    // undefined validate is treated as "allowed".
    if (validate && validate(state) === false) return;

    var key = JSON.stringify(config.key(state));
    if (hasKey && key === lastKey) return; // unchanged → dedup

    // Genuine render point: commit the key here and only here.
    lastKey = key;
    hasKey = true;
    doRender(state);
  }

  // Load every dep with a per-dep catch so one failure yields its fallback and
  // never blocks registration (the hero-bans lesson). Dep results aren't passed
  // to render — deps mutate scene-level state (heroData, maps) that render reads.
  function loadDeps() {
    var settled = [];
    for (var i = 0; i < deps.length; i++) {
      settled.push(runDep(deps[i]));
    }
    return Promise.all(settled);
  }

  function runDep(dep) {
    try {
      return Promise.resolve(dep()).catch(function() { return undefined; });
    } catch (e) {
      return Promise.resolve(undefined); // synchronous throw → fallback too
    }
  }

  var ready = loadDeps().then(function() {
    // Defensive: clear the key before wiring stateSync so the first post-deps
    // frame ALWAYS repaints. Today stateSync is wired only on the line below,
    // so no frame can arrive before deps settle — but a future refactor that
    // wires stateSync earlier (streaming states during dep load) would hit the
    // deps-racing-first-render bug without this reset (a frame seen pre-deps
    // must not suppress the render that finally has its data).
    hasKey = false;
    if (stateSyncFn) stateSyncFn(update);
  });

  return {
    // Re-run render with the last seen state even when the key is unchanged.
    // Safe no-op before any state has arrived. Routes through update so the
    // validate guard still applies; hasKey is cleared so the dedup can't block.
    forceRender: function() {
      if (!hasState) return;
      hasKey = false;
      update(lastState);
    },
    // Resolves once deps have settled and stateSync is wired. Mainly a test /
    // coordination aid; production scenes don't need it.
    ready: ready
  };
}

// CJS export guard so Vitest can import defineOverlay; harmless in the browser
// where `module` is undefined and this block never runs (see theme-helpers.js).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { defineOverlay: defineOverlay };
}
