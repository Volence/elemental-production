# Changelog

## v2.1.0 — Producer feedback batch

Sixteen items straight from producer bug reports and requests after the v2
package went live: thirteen fixes, a real OBS stinger transition, a new Final
Stats scene, and an animation pass.

### Do this once after updating

1. **Re-import the OBS scene collection** — Settings → OBS Scene Setup →
   download (Linux or Windows) → OBS → Scene Collection → Import. This is what
   brings in the new **Final Stats** scene. Migrating an existing collection?
   Use the `--carry-from` flow in `docs/scene-collection-v2-migration.md` so
   your cam URLs and media paths survive. Don't want to re-import? The same doc
   has the manual recipe: add a scene named **Final Stats** with a browser
   source **Final Stats BS** at `http://localhost:3001/overlays/final-stats.html`
   (1920×1080) and drop it in after Map Score.
2. **Set up the stinger transition** — Settings → OBS Browser Source URLs →
   🎬 Stinger (WebM) → ⬇ Download, then OBS → Scene Transitions → **+** →
   **Stinger** → pick the file → **Transition Point: 550 ms**. Full walkthrough
   in the README.
3. **Nothing to do for artwork.** Hero renders and map images now ship inside
   the app and are copied into your user-data folder on first launch. Anything
   you have already dropped in yourself still wins — the shipped pack never
   overwrites your files.

### Fixed

- **Map Intro / Casters Flythrough now follow the map that's actually live.**
  Clicking ▶ Play on a new map demotes the previous one, so only one map is
  ever "current" — the state that made the intro keep naming the old map. The
  app, the server, and the overlays all enforce (and self-heal) this now, so
  old saved states clean themselves up too.
- **"Relinquish All" actually puts you back on FACEIT data.** It now
  re-derives the series scores, un-freezes the hero bans, and re-syncs OBS —
  previously it only deleted the override flags, leaving frozen bans and stale
  scores on air. Manually-added maps are preserved.
- **"Start OBS first" is no longer a rule.** Map Pool, Ban Reveal and Casters
  Flythrough browser sources were missing from the auto-heal list (and one
  name was misspelled), and the heal only ran once at app boot. All overlay
  browser sources are now refreshed on *every* OBS connect and reconnect, so
  opening OBS after the app — or restarting OBS mid-show — heals every source
  within a few seconds without touching anything.
- **The top scene toolbar shows every scene.** It wraps onto a second row
  instead of hiding buttons off the right edge, knows all sixteen v2 scene
  names when OBS is closed, and re-fetches the real scene list the moment OBS
  connects. Every scene has its own icon.
- **Crisp ban strike-through.** The red slash across banned heroes was a
  percentage-based gradient, which blurred into a ~78px smear at Ban Reveal
  size. It's now a hard-edged line that stays sharp on both the big reveal and
  the small deck tiles.
- **Hero renders ship with the app.** Packaged installs had an empty image
  folder and fell back to tiny face icons — all 52 full-body hero renders are
  now bundled and seeded on first launch. Your own drop-ins take precedence.
- **Neon Junction and King's Row map art ship too.** OverFast has no Neon
  Junction screenshot at all, and King's Row was falling back to a 110×55
  FACEIT thumbnail. Both now ship as high-resolution local art.
- **Map Pool scene reflects reality.** Maps played from outside the season
  pool now correctly gray out their mode column, completed pool maps get a
  **PLAYED** marker (keeping their color and score tag), Clash is a supported
  mode, maps with no art get a readable name placeholder, and the pool editor
  in Settings no longer double-adds or phantom-unchecks maps with apostrophes
  (King's Row).
- **King's Row art resolves everywhere.** Map Pick, Map Score and Casters
  Lobby matched map names literally, so the curly apostrophe in "King's Row"
  (and accents like Paraíso) never matched the catalog. All three now
  normalize names the same way; the FACEIT fallback also prefers the large
  image over the thumbnail.
- **Readable text on bright team colors.** Any text sitting on a team-color
  fill (score boxes, winner pips, the BANNED chip, map score chips) now picks
  black or white by measured contrast, so gold/lime/cyan team colors are no
  longer white-on-white. Raw team-colored *text* on dark backgrounds gets the
  matching legibility floor.
- **Per-map score entry for manual and scrim matches.** Each map card in Match
  Hub has a score field (e.g. `2-1`) that renders on all four score-showing
  overlays — previously only FACEIT matches could show map scores.
- **"IF NEEDED" watermark removed** from decider map cards; the decider can be
  played regardless of series state. The DECIDER pill and dimming stay.

### Added

- **Real OBS stinger transition.** The branded pinwheel wipe now ships as a
  pre-rendered transparent WebM (VP9 with alpha, 1.3s) that OBS drives
  natively — download it from Settings, add it as a Stinger transition with a
  Transition Point of **550 ms**. This replaces the old workaround of cutting
  to a stinger *scene* by hand. `overlays/stinger-transition.html` remains the
  master; `node scripts/render-stinger.mjs` re-renders the WebM.
- **Final Stats scene.** A post-series board on the caster desk layout: every
  played map's stats aggregated into one series total per player (elims,
  deaths, K/D recomputed from totals, final blows, damage, healing), team
  totals, the series score, and a chip per played map. Requires the scene
  collection re-import (or the manual scene add) described above.
- **Animation pass.** Map Pool cards cascade in, the lower third pill has a
  live idle glow, Final Stats totals count up on entrance, and the BANNED chip
  pulses.

## v2.0.2 — Map Intro tracks the live map

- **Map Intro / Casters Flythrough showed the previous map's name all series**
  (producer bug report: "map name does not update after map 1 despite changing
  the map and clicking play"). Both scenes labeled their map from
  `activeBanMapIdx` — the hero-*ban* resolver's index, which intentionally
  freezes while a heroBans override is held (any manual ban edit in FACEIT
  mode sets one) and falls back to the last *completed* map between maps. The
  scenes now derive the map from live series progression (current → next
  upcoming → last played), so the intro always names the map about to be
  played and updates the moment ▶ Play is clicked. Ban Reveal and Map Pick
  keep the ban-resolver index on purpose — there the subject *is* the bans.
- On-air workaround for older builds: release the 🔒 heroBans override
  (Overrides banner, or `POST /api/overrides/clear` with
  `{"path":"heroBans"}`), then change any map field to force a re-derive.

## v2.0.1 — Import self-heal

- **Auto re-sync after a scene-collection import.** Importing the downloaded
  collection replaces every media source with the JSON's blank-path version,
  but the app's change-guarded OBS sync cache still said "already pushed" —
  so flythroughs and music went silent until an app restart (producer bug
  report). The server now listens for OBS's `CurrentSceneCollectionChanged`
  event, clears the sync cache, and re-pushes everything (media paths, cam
  URLs, browser-source URLs) two seconds after the switch.
- **⚡ Force Sync button.** The existing `/api/obs/force-sync` endpoint gets
  a visible button in Production Controls — the manual lever for the same
  full re-push, for any case where OBS-side settings were wiped or drifted.
- Reminder that pairs with this fix: media auto-loading needs the folder
  paths configured in **Settings** on THAT machine (flythroughs dir, music
  dir + selected files) — app state is per-machine, and the pre-flight
  checklist calls out anything missing.

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
- ~~WebM stinger capture from the new pinwheel stinger-transition scene (spec
  explicitly deferred this; the scene is usable today as a manually-switched
  transition).~~ **Done in v2.1.0** — shipped as a pre-rendered transparent
  VP9 WebM plus a render script.
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

