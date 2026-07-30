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

### Owner QA batch 1

First round of owner feedback on the v2 package, landed pre-release:

- **Brand-color crests.** Neutral scenes (starting-soon, BRB, end-of-stream,
  series-winner waiting state, caster scenes without a matchup) now render the
  pinwheel medallion in the four elmt.gg brand colors instead of a generic
  accent; match-context medallions (HUD, map-pick, map-intro, casters deck)
  keep team colors.
- **Gray-logo team color.** Logos that fail the saturation gate on every color
  bucket now fall back to a silver/gray neutral derived from the logo itself,
  instead of the generic blue accent color.
- **Map-board / HUD polish.** Map-board pills drop the redundant "· WON"
  suffix and shrink slightly; the gameplay HUD center band loses the
  duplicate map-name pill; caster scenes drop the "CASTED BY" subtitle.
- **Scoreboard title fix.** The casters-scoreboard title now always resolves
  the real map name from state instead of occasionally printing the FACEIT
  hex map id.
- **Finished-match bans.** Hero bans and map-board ban chips now resolve to
  the current-or-last-played map, so a completed series still shows its final
  map's bans instead of going blank.
- **Centered between-matches window.** The between-matches cam window is
  recentered with equal side margins and pushed clear of the event header so
  nothing overlaps or clips.
- **Interview caster slots.** The interview scene gains two corner camera
  slots for casters (with name pills), baked into the OBS scene collection
  generator.
- **Ban Reveal OBS scene.** The scene-collection generator now creates a "Ban
  Reveal" scene (idempotently) if one doesn't already exist in the target
  collection.
- **Settings carryover.** The generator supports `--carry-from <path>` to
  copy cam browser-source URLs and media-source file paths from an existing
  producer OBS collection into the regenerated v2 collection, by source name.
- **Dashboard quick-clear.** The Interview / Guest Cam panel gets a "Clear"
  button that resets the interviewee (name, cam URL, visibility, team, role,
  label) to empty in one click.
