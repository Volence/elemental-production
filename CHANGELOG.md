# Changelog

## v1.4.0 — Broadcast Package v2

The full v2 broadcast package: every OBS overlay scene restyled onto the v2 design
system (petal texture, Geist type, gradient-underline chrome, pinwheel motif) and
a shared runtime to support it. Delivered across three plans:

- **Plan 1 — Foundation:** design tokens (`theme-v2.css`, `fonts-v2.css`), the
  `defineOverlay`/`overlay-core.js` render runtime, shared v2 components
  (`components-v2.js`), the pinwheel SVG helper, countdown engine consolidation,
  and the local-first asset pack (fonts + petal texture served from disk, no CDN
  links — required for the OBS browser-source sandbox).
- **Plan 2 — Match scenes:** gameplay HUD, map pick, hero bans, map intro, and
  lower-third restyled onto the v2 runtime, establishing the shell/render and
  render-output-animation patterns every later scene follows.
- **Plan 3 — Casters, full-screens, stinger, scene collection v2:**
  - Caster/cam scenes (casters desk, scoreboard, lobby, map-score,
    flythrough-hud) rebuilt on Layout A: cams are transparent cutouts framed by
    the overlay, with cam geometry centralized in `overlays/cam-layout.js` — the
    single source of truth for both the overlay frames and the OBS scene
    collection.
  - Between-matches, interview, starting-soon, BRB, end-of-stream,
    series-winner, and lower-third polished to the v2 language.
  - A real branded pinwheel stinger-transition scene (WebM render deferred —
    the HTML scene is the master for a future capture; scene collection v2
    keeps Fade as the active transition).
  - **Scene collection v2**: cam source transforms baked to sit exactly behind
    the canonical cutout rects (`scripts/build-scene-collection-v2.mjs`), plus
    a producer migration note at `docs/scene-collection-v2-migration.md`.
  - Countdown and team-color-extraction hardening carried over from review
    passes.

17 overlay scenes total, all served and console-clean; cam-cutout rects and
transparency verified against `CAM_LAYOUTS` on every cam scene; countdown
scenes confirmed ticking; Plan 2 scenes regression-checked against the shared
runtime changes underneath them.

### Known follow-ups
- Producer asset sourcing: map-images and hero-renders still need real source
  art in production (placeholders/fallbacks work correctly in the meantime).
- WebM stinger capture from the new pinwheel stinger-transition scene (spec
  explicitly deferred this; the scene is usable today as a manually-switched
  transition).
- Manual OBS QA gate (cutout alignment, un-inlined backgrounds on cold switch,
  entrance replays, countdown modes) must pass before this goes live — see the
  release checklist.
