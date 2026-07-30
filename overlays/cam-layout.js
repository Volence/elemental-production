// Canonical cam-cutout windows, 1920x1080 canvas. THE single source of truth:
// overlay frames AND the OBS scene-collection generator both read this file.
// Changing a rect here REQUIRES regenerating scene collection v2 (Task 9
// script) and a producer re-import — never edit one side alone.
// Layout A (approved): two equal cams high-center; single-cam grows centered.
var CAM_LAYOUTS = {
  // Standard caster desk (casters.html) + deck variants (scoreboard/lobby/map-score)
  desk: {
    dual:   [ { x: 330, y: 120, w: 580, h: 362 }, { x: 1010, y: 120, w: 580, h: 362 } ],
    single: [ { x: 610, y: 110, w: 700, h: 437 } ]
  },
  // Over-flythrough frames (casters-flythrough-hud.html) — OBS-measured legacy coords kept
  flythrough: {
    dual:   [ { x: 353, y: 270, w: 501, h: 282 }, { x: 1074, y: 270, w: 501, h: 282 } ],
    single: [ { x: 710, y: 270, w: 501, h: 282 } ]
  },
  // Big single cam area (between-matches.html)
  wide:  { single: [ { x: 200, y: 30, w: 1690, h: 900 } ] },
  // Interview single cam
  interview: { single: [ { x: 580, y: 120, w: 760, h: 520 } ] }
};

// CJS export guard so Node/Vitest can import this for tests and Task 9's
// scene-collection generator (via createRequire); harmless in the browser
// since `module` is undefined there and this block never executes.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CAM_LAYOUTS: CAM_LAYOUTS };
}
