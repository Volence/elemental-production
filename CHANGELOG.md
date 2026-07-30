# Changelog

## v2.0.0 — Broadcast Package v2

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

### Owner QA batch 2

Second round of owner feedback on the v2 package:

- **Hero bans, derived-consistent.** `heroBans` is now recomputed from
  `(perMapBans, maps, selectedMapIdx)` on server boot (after state load) and
  on every `PATCH /api/state` that touches maps/perMapBans/selectedMapIdx/
  banSwaps, not only at FACEIT poll ticks — a persisted state (server
  restart, idle sync, a match loaded before this fix) no longer gets stuck
  with stale/empty bans. Producer overrides on `heroBans` are still
  respected.
- **Ban Reveal never goes black.** The empty-bans state now keeps the petal
  texture, crest, and "HERO BANS" heading visible with a dimmed "AWAITING
  BANS" chip, instead of hiding the whole scene — a dedicated OBS scene
  should never read as dead air.
- **Map board shows bans on every played map.** All completed columns now
  show their two ban tiles (54px, vs. 84px for the current/last map), not
  just the active one; hero-name captions are dropped from board tiles
  package-wide per owner feedback ("we don't need the names").
- **`activeBanMapIdx` exposed as derived state**, so the Ban Reveal scene and
  the map board always label the same resolved ban map — fixes a mismatch
  where a finished series could show different "active" maps in different
  places.
- **Map-intro redesign.** Replaced the squished top-bar/empty-bottom-bar
  layout with a centered composition: a large map-name hero block with
  `MAP n · MODE` and `MATCH POINT` chips, a team-matchup row around the
  pinwheel score hub, and flanking ban-art tiles — staged entrance
  animations throughout. The flythrough background requirement is dropped
  per owner direction ("we can have anything in the middle").
- **Flythrough HUD gains match context.** casters-flythrough-hud now shows a
  `MAP n · NAME · MODE` chip and a compact matchup strip (logos, names,
  score hub, series pips) centered below the cam frames, without covering
  them.
- **Wider caster deck panels.** `casters-scoreboard.html`'s `.sb-panel` and
  `casters-lobby.html`'s `.lb-panel` are ~200px wider (owner: "a little
  wider for both"), still centered safely inside the 1920 canvas and still
  guarded by `fitPanelToCanvas` on single-cam layouts.
- **Idle-motion package.** Three shared, infinite CSS utilities in
  `theme-v2.css` (owner: "any time there's the logo it shrinks and grows
  just slightly... slight interesting movement"):
  - `.v2-idle-breathe` — a subtle scale pulse (1 → 1.035 → 1, ~4s), applied
    to team logos in the gameplay HUD plates, every caster-deck scene
    (desk/lobby/scoreboard/map-score/flythrough), and map-intro's team
    blocks; series-winner's winner logo gets it via a dedicated wrapping
    span so it doesn't collide with its own reveal entrance.
  - `.v2-idle-glow` and `.v2-idle-spin` — an opacity/brightness pulse and a
    slow 45s rotation, applied together to the neutral pinwheel crests on
    starting-soon, BRB, and end-of-stream (BRB's previously bespoke local
    `petalBreathe` keyframe is retired in favor of the shared utility); the
    live series pip also gets the glow pulse.
  - Idle animations are infinite and class-driven, verified to survive
    `state-sync.js`'s OBS-visibility entrance replay (its stash/restore of
    `style.animation` round-trips them correctly via the empty-string path).
- **Interview transparency re-confirmed.** Gray-backdrop pixel test on
  interview.html: the interviewee window and both caster corner slots
  sample exactly the override gray with no opaque overlay — still fully
  transparent.
### Owner QA batch 3

Third round of owner feedback on the v2 package:

- **Black Ban Reveal root-caused (OBS-side, not overlay code).** The Ban
  Reveal browser source's CEF page instance can wedge at scene-collection
  import — it produces no frames at all (not even injected CSS paints) until
  its page is force-reloaded. The overlay itself was verified rendering
  correctly in isolation and inside OBS after a refresh.
- **"Refresh Overlays" now heals every overlay source.** The
  `/api/overlays/refresh` endpoint enumerates browser sources from OBS by
  URL (`/overlays/`) instead of a hardcoded name list that silently missed
  `Ban Reveal BS` and `Casters Flythrough Hud` — exactly the two scenes the
  owner reported blank. Caster cams (vdo.ninja) are skipped by construction.
- **Map Intro hub truly centered.** The matchup band is a `1fr|auto|1fr`
  grid, pinning score + pinwheel to the exact page center regardless of
  team-name/tag/ban-tile widths (a centered flex row let asymmetric sides
  shove the hub visibly off the map name's axis). Map Intro's background
  remains fully transparent — the "opaque" look in QA was the owner's
  `Map Flythrough` media source having an empty file path.
- **Between Matches UP NEXT strip.** The schedule-empty fallback is a proper
  horizontal band — bordered UP NEXT label, team-color accent caps, logos,
  and a VS chip pinned to the center of the matchup area — replacing the
  stacked 3-up panel layout that stranded a tiny label top-left and a
  floating "VS" at the far right of a mostly-empty bar.
- **Idle-motion eye candy extended.** Map Pick chip logos + crest medallion,
  Hero Bans heading medallion, and Interview team-chip logos join the
  idle-motion package (breathe on leaf logos, glow on crests — per the
  documented transform-collision rules).
- **Frozen-bans diagnosis.** A leftover `heroBans` producer override was
  freezing bans empty while `perMapBans` held real FACEIT data — cleared
  in-session; the derived resolver immediately surfaced the real bans
  (Ban Reveal, Map Intro bookends, map-board tiles all confirmed live).
- **Full-body hero renders, full roster.** `data/hero-renders/` now holds
  official OW2 full-body standing renders for all 52 heroes (WebP with
  alpha, sourced from the Overwatch wiki's Blizzard render set — filenames
  follow the existing `<hero-key>` drop-in contract, so `/api/heroes`
  picked them up with zero code changes). Ban Reveal and Map Intro's ban
  tiles show standing characters instead of portrait medallions.
- **Character idle sway.** New `v2-idle-sway` idle-motion utility (slow
  bob + sub-degree tilt, 7 s) applied to the ban art leaf at reveal scale —
  Ban Reveal's banned heroes gently idle while the scene holds. Deck-scale
  tiles (Map Intro bookends) deliberately stay still.
- **Gameplay HUD rebuilt as "Full Frame" (Concept D, owner-approved).** The
  three floating regions are replaced by a two-tier OWCS-style top frame:
  tier 1 (edge to edge, 54 px) carries ban chips (hero portrait + BAN tag),
  team logo/name, and team-colored score boxes flanking a center keystone
  chip (crest + "MAP n · NAME" + "FIRST TO x · MODE" + gradient underline
  with a ~32 s shimmer sweep); tier 2 (38 px, sides only — the game's
  objective UI span stays open) carries the event/season strip and the
  named map track (shared mapPips) with a live-map PICK tag. Score boxes
  play a one-shot pop+glow only when that team's score actually changed
  (scene-local diff — unrelated data ticks can't replay it).
- **Season Map Pool feature.** New `state.mapPool` (persisted like all
  state), a Settings → Season Map Pool editor (checkbox grid grouped by
  mode from `/api/maps`, saved via PATCH so it survives restarts), a new
  `map-pool.html` overlay (mode columns; played maps grayscale with the
  picker's badge + final round score; live map lit with a LIVE tag; empty
  pool shows a configure hint instead of dead air; footer = series pips +
  format chip), and a "Map Pool" OBS scene (generator ensure between Map
  Pick and Ban Reveal + live obs-websocket injection, both with caster
  audio). Map-name matching is normalization-tolerant (typographic vs
  ASCII apostrophes — "King's Row" from FACEIT matches "King’s Row" from
  the OverFast catalog).
- **Ban Reveal carries caster audio.** The Ban Reveal scene now includes
  `Caster 1`, `Caster 2`, and `Casters Background Music`, copied from Map
  Pick's items (same offscreen-tiny-scale audio trick, same transforms) —
  added to the live collection via obs-websocket (no re-import needed) and
  to the generator as an idempotent ensure step (RawNum-safe deep copy).

- **Map Intro legibility scrim.** The flythrough behind Map Intro is
  arbitrary footage; a bright frame could wash out the eyebrow/title. A
  center radial scrim now guarantees local contrast behind the beat while
  fading to nothing at the edges (verified against a worst-case white
  background); eyebrow contrast bumped.
- **`.mov` flythroughs recognized.** The flythrough directory scan accepts
  `.mov`/`.m4v` alongside `.mp4`/`.webm` (the producer's recorder outputs
  QuickTime; OBS's ffmpeg source plays it natively).
- **Legibility floor for team-colored text.** New `legibleColor()` helper
  (theme-helpers) lifts a color's HSL lightness to a floor while keeping its
  hue — dark auto-extracted colors (a navy like `#140251`) stay "their
  color" but become readable on the near-black ground. Applied where team
  colors paint TEXT: series-winner name/score/champion chip (plus a gentler
  floor on the big petals), map-intro tags + hub scores, flythrough hub
  scores. Fills, washes and swatches keep the true team color.
- **Two-color logo extraction.** The color extractor now also picks the
  logo's SECOND most prominent distinct color (`pickTwoColors` — same
  vibrant-beats-big-but-gray scoring, with a minimum RGB distance so a
  neighboring shade of the primary never counts). Auto-extraction stores it
  as `theme.teamNColorAlt`; the Series Winner pinwheel's secondary petals
  use it, so the crest shows two real parts of the winning logo (falling
  back to a darker shade of the primary for single-color logos).
- **Canonical scene-list order.** The generator now enforces the owner's
  show-flow scene order (Starting, Casters, Map Pool, Map Pick, Ban Reveal,
  Map Intro, Casters Flythrough, Gameplay, desk scenes, Between Matches,
  BRB, Interview, Series Winner, Ending); unknown producer scenes keep
  their relative order at the end.
- **Single-match schedule uses the UP NEXT strip.** A schedule with exactly
  one entry now renders the horizontal UP NEXT strip (accent colors matched
  by team name, neutral for unknown teams) instead of falling into the 3-up
  stacked panel layout that looked broken at full width.
- **Deterministic scene-item z-order.** The generator now stable-sorts every
  scene's items into the v2 convention — video feeds (game capture,
  flythrough, replay, cams) at the bottom, the overlay browser source above
  them, audio-only sources on top — and the same ordering was applied to the
  live collection over obs-websocket. This fixes the long-standing Between
  Matches defect where the overlay sat below the Replay source, leaving the
  replay's overspill unmasked.
- **Stadium maps filtered from the Season Map Pool editor.** Stadium-only
  maps (Arena Victoriae, Gogadoro, Wuxing University, Place Lacroix,
  Redwood Dam) carry normal competitive gamemodes in the OverFast catalog,
  so they leaked into the picker; curated exclusion list added. Aatlis and
  Neon Junction were verified as real OWCS 2026 competitive maps and stay.

