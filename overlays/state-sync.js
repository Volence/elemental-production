/**
 * State Sync — Resilient state delivery for OBS browser sources.
 *
 * OBS's embedded Chromium has a shared connection pool (~6 per host).
 * With 13+ browser sources, SSE connections get starved. Instead, we use
 * pure polling with jitter to prevent thundering herd.
 *
 * Also re-triggers entrance animations when OBS shows/hides browser sources.
 *
 * Usage in overlays:
 *   <script src="./state-sync.js"></script>
 *   <script>
 *     stateSync(function(state) { ... });
 *   </script>
 */

(function() {
  var API = 'http://localhost:3001';
  var BASE_INTERVAL = 1500;   // Poll every 1.5s
  var JITTER = 1000;          // Random jitter up to 1s
  var callbacks = [];
  var lastStateJSON = '';

  function notify(state) {
    var json = JSON.stringify(state);
    if (json === lastStateJSON) return;
    lastStateJSON = json;
    for (var i = 0; i < callbacks.length; i++) {
      try { callbacks[i](state); } catch(e) { console.error('[state-sync] error:', e); }
    }
  }

  function poll() {
    fetch(API + '/api/state')
      .then(function(r) { return r.json(); })
      .then(function(state) {
        notify(state);
        setTimeout(poll, BASE_INTERVAL + Math.random() * JITTER);
      })
      .catch(function() {
        setTimeout(poll, 3000 + Math.random() * 2000);
      });
  }

  // Start polling with random initial delay
  setTimeout(poll, Math.random() * 500);

  window.stateSync = function(callback) {
    callbacks.push(callback);
    if (lastStateJSON) {
      try { callback(JSON.parse(lastStateJSON)); } catch(e) {}
    }
  };

  // ── Entrance animation replay ──
  // When OBS shows this browser source (page becomes visible), replay the
  // entrance animation on #root so it looks smooth on each scene transition.
  function replayAnimation() {
    var root = document.getElementById('root');
    if (!root) return;
    var origAnim = root.style.animation || root.getAttribute('data-anim') || '';
    if (!origAnim) return;
    // Store original for future replays
    if (!root.getAttribute('data-anim')) root.setAttribute('data-anim', origAnim);
    // Force reflow to restart animation
    root.style.animation = 'none';
    void root.offsetHeight; // trigger reflow
    root.style.animation = origAnim;
  }

  // OBS browser sources fire visibilitychange when shown/hidden
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) {
      replayAnimation();
    }
  });

  // Also listen for OBS-specific events (obsSourceActiveChanged)
  // OBS injects window.obsstudio for browser sources
  if (typeof window.obsstudio !== 'undefined') {
    window.obsstudio.onActiveChange = function(active) {
      if (active) replayAnimation();
    };
    window.obsstudio.onVisibilityChange = function(visible) {
      if (visible) replayAnimation();
    };
  }

  // Fallback: if obsstudio isn't available yet, try to hook it later
  window.addEventListener('obsSourceActiveChanged', function(e) {
    if (e.detail && e.detail.active) replayAnimation();
  });
  window.addEventListener('obsSourceVisibleChanged', function(e) {
    if (e.detail && e.detail.visible) replayAnimation();
  });
})();
