# Broadcast Package v2 — Plan 3: Casters, Full-Screens, Stinger, Scene Collection v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the remaining 12 scenes (5 caster/cam scenes, between-matches, interview, 3 countdown full-screens, series-winner, lower-third polish), build the real branded stinger, bake cam-cutout coordinates into scene collection v2, and prepare the v2 package release (version bump; push/tag held for the owner).

**Architecture:** Cam scenes adopt the approved **Layout A skeleton** (design spec §5, `casters-layout.html` mockup option A): cams are TRANSPARENT CUTOUTS — the overlay is a frame; caster browser sources sit BEHIND it in OBS. One canonical source of cam-window coordinates (`overlays/cam-layout.js`) feeds both the overlay `camFrame` component and the scene-collection generator, so producer cam sources snap exactly behind the cutouts. Every scene moves onto `defineOverlay` with the shell/render idioms proven in Plan 2 (gameplay-hud is the reference; hero-bans documents the render-output-animation rule). Full-screens go petal-texture + Geist + gradient-underline.

**Tech Stack:** vanilla JS overlays (OBS browser sources, Chromium 103+), Express server (one additive defaultState field), Node script for scene-collection generation, vitest.

**References (implementers MUST read what their task lists):**
- Design spec: `docs/superpowers/specs/2026-07-29-obs-scene-redesign-design.md` (§5 casters, §6 full-screens, §7 transitions, §8 scene collection, §9 deferrals)
- Mockups (UNTRACKED, MAIN checkout only: `/home/volence/elemental/elemental-production/.superpowers/brainstorm/3206334-1785360168/content/`): `casters-layout.html` (Layout A anatomy: cutout frames, name pills, gradient base edge, matchup deck; B is REJECTED — do not build the rail), `style-direction-v2.html` (locked visual language)
- Plan 2 reference scenes (in repo): `overlays/gameplay-hud.html` (shell/render template), `overlays/hero-bans.html` (render-output animation shorthand rule), `overlays/map-intro.html` (topFrame consumer), `overlays/map-pick.html`
- Components: `overlays/components-v2.js`, `overlays/theme-v2.css`, `overlays/pinwheel.js`, `overlays/countdown.js`, `overlays/bg-helper.js`, `overlays/overlay-core.js` docstring, `overlays/theme-helpers.js`

**Hard constraints (unchanged from Plan 2; memory `obs-overlay-constraints`):** scene scripts ES2019-safe, NO `?.`/`??`; shared overlay JS ES5 + CJS guard; all remote images through proxyImg/safeImg; no CDN font links — theme-v2.css + fonts-v2.css both; every scene's animated chrome under `#root` with `el: #root`; render-output animations use FULL inline `animation` shorthand; `fitPanelToCanvas` (zoom) for panels that could crowd 1080 in single-cam layout — cam slots must NEVER move after render; `{root}` on sendFile; mobile floor (key text ≥28px, labels ≥22px, icons ≥44px).

**Carry-overs to land here (from Plan 2 reviews):** topFrame currentMapName fallback upgraded to findCurrentMap semantics; shared `banArtTile` extracted (dedupe hero-bans panelHtml / map-intro banTileDeck); map-intro `#mi-top` width cap; swapSides policy DOCUMENTED as: match-flow scenes with a left/right stage honor it (HUD, map-intro), identity-based scenes ignore it (map-pick, hero-bans) — cam scenes ignore it (casters are not teams).

**Out of scope:** new scenes (spotlight/standings/MVP/sponsor — spec §9), WebM stinger render (spec §123 explicitly defers it; scene collection v2 KEEPS Fade as the active transition — spec §99's "wired as stinger" yields to §123's deferral; the HTML stinger ships as an asset/scene for later), live per-player game data, per-scene state schema additions beyond `casterLayout`. **Push/tag/release is NOT executed by agents** — the final task prepares everything and STOPS for the owner (producer OBS QA gate must pass first).

---

### Task 1: Cam-layout constants + camFrame component + carry-over fixes

**Files:** Create `overlays/cam-layout.js`, Test `overlays/cam-layout.test.js`, Modify `overlays/components-v2.js`, `overlays/components-v2.test.js`, `overlays/theme-v2.css` (camFrame internals), `overlays/map-intro.html` (#mi-top cap), `server/state.js` (add `casterLayout: 2` to defaultState — additive, scenes already default to 2)

- [ ] **Step 1: `overlays/cam-layout.js`** (ES5 + CJS guard). THE canonical cam-window geometry, consumed by camFrame CSS and Task 9's scene-collection generator. Shape:

```js
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
```
16:10-ish desk windows per the mockup (580×362 ≈ 16:10); EXACT values above are the starting point — the implementer may nudge for visual fit during Task 2 BUT any change must land in this file (never scene CSS) and be flagged in the commit body. CJS-export `CAM_LAYOUTS`.

- [ ] **Step 2: `camFrame(opts)` in components-v2.js** (+tests): `{ rect: {x,y,w,h}, name, accent }` → absolutely-positioned `.v2-cam-frame` at rect (inline position/size styles from the rect — data-driven), TRANSPARENT interior (no background — the cam shows through from behind), hairline border, `.v2-underline` base edge, name pill (`.v2-cam-pill`, escaped name, hangs off the frame bottom per the mockup). Tests: positions from rect appear inline; name escaped; no background-color on the frame interior. theme-v2.css gains `.v2-cam-frame`/`.v2-cam-pill` internals (border, pill styling, underline placement) — geometry stays inline-from-rect.
- [ ] **Step 3: `banArtTile(opts)` consolidation** (carry-over): extract the shared render-vs-portrait + slash + name anatomy from hero-bans `panelHtml` and map-intro `banTileDeck` into components-v2 (`{ renderUrl, portrait, heroName, teamColor, size, animated }` — animated=false → static slash like map-intro; true → sweep with FULL inline shorthand). Rewire BOTH scenes onto it (no visual change — compare screenshots before/after). Tests: render path, portrait fallback path, escaped name, animated flag.
- [ ] **Step 4: topFrame currentMapName fallback** (carry-over): upgrade the internal fallback to findCurrentMap semantics — but components-v2 can't call theme-helpers at require time; implement the same live→next-upcoming→last logic as a private ES5 helper (document it mirrors findCurrentMapIndex). Test: maps with only completed entries → last map's name (not blank).
- [ ] **Step 5: map-intro `#mi-top` cap** (carry-over): `max-width: 1840px` + the event-name ellipsis path already in shared CSS; verify no visual change at normal names.
- [ ] **Step 6:** `casterLayout: 2` added to server/state.js defaultState (comment: scenes defaulted to 2 client-side; now explicit). All tests green (`npx vitest run` — 96 + new ≈ 105+), commit. `feat: cam-layout constants, camFrame + banArtTile components, plan-2 carry-over fixes`

---

### Task 2: Standard caster desk (`overlays/casters.html`) — cam-scene template

**Files:** Modify `overlays/casters.html`

- [ ] **Step 1: Read** the mockup's Layout A (cutout frames + name pills + matchup deck), current scene (153 lines; reads teams colors, casters, casterLayout, eventName; `?bg=transparent` query support — PRESERVE it; hardcoded rainbow accent bars — replaced by gradient-4 underline), gameplay-hud template, camFrame/cam-layout APIs.
- [ ] **Step 2: Rebuild.** Petal texture (applyTextureBg) unless `?bg=transparent`; event header top-center (eventHeader + underline); shell wrappers: `#cd-cams` (cam frames region) + `#cd-deck` (matchup deck, slideUp). Render: camFrame per active cam from `CAM_LAYOUTS.desk[layout===1?'single':'dual']` with `casters[i].name` (layout 0 → no frames, deck centered); matchup deck below cams: team logos/names (≥28px), series score around a small pinwheel hub (size 48, TRUE team colors), `NEXT: <MAP>` chip via findCurrentMap when a map is upcoming/current. key: casters (names), casterLayout, teams (name/logo/score/color), maps (status/name), eventName, theme team colors. defineOverlay + deps none.
- [ ] **Step 3: Verify** (template-level rigor — this is the pattern for Tasks 3–4): seed casters names + layouts 2/1/0, screenshot each layout state, INSPECT (frames at the canonical rects — verify with CDP getBoundingClientRect against CAM_LAYOUTS values; transparent interiors — screenshot over a gray body background like map-intro's bg check; pills + deck correct). Console clean. `npm test`. Keep screenshots (scratchpad casters-v2-*.png).
- [ ] **Step 4: Commit.** `feat: casters desk v2 — cutout cam frames on canonical rects + matchup deck`

---

### Task 3: Scoreboard + lobby caster variants

**Files:** Modify `overlays/casters-scoreboard.html`, `overlays/casters-lobby.html`

Same skeleton as Task 2 (deck swaps per spec §5). BOTH keep their data machinery — this is a reskin of chrome + deck, not a data rewrite.

- [ ] **Step 1: casters-scoreboard.** PRESERVE: the switchMap interactivity (map buttons — on overlay-core, `window.switchMap` sets the local `currentMap` then calls the handle's `forceRender()`; the malformed-round validate case becomes `validate` returning false or an early return WITHOUT key commit — overlay-core gives this for free, document the mapping from the old hand-rolled comments), playerStats table rendering, per-map bans fallback chain, fitPanelToCanvas on the scoreboard panel (post-render), auto-advance on new stats. Restyle: cutout camFrames from `CAM_LAYOUTS.desk` (SAME rects as casters.html — the v1 420×240 divergence dies), v2 panel/type/underline styling for the scoreboard deck, ban tiles via banTile. key: same read-set as v1 (teams, maps, casters, casterLayout, playerStats, bestOf, eventName, selectedMapIdx, heroBans, perMapBans, theme team colors).
- [ ] **Step 2: casters-lobby.** PRESERVE: loadHeroes+loadMaps deps (→ overlay-core deps + forceRender retry per map-pick's pattern), map cards with perMapBans mini-tiles (→ banTile 56px), rosters (avatars proxied), fitPanelToCanvas. Restyle: cutout frames from CAM_LAYOUTS.desk, v2 deck.
- [ ] **Step 3: Verify** both with rich seeded state (playerStats with 2 teams × players; perMapBans), screenshots incl. single-cam layout (fitPanelToCanvas must shrink the deck, NOT move cam frames — CDP-check the frame rects are IDENTICAL before/after panel overflow), switchMap click via CDP → repaint proof. Console clean; npm test; commit.
- [ ] **Step 4: Commit.** `feat: scoreboard + lobby caster variants v2 (shared cutout rects, interactive map switch preserved)`

---

### Task 4: Map-score + flythrough caster variants

**Files:** Modify `overlays/casters-map-score.html`, `overlays/casters-flythrough-hud.html`

- [ ] **Step 1: casters-map-score.** Currently stacks cams VERTICALLY with its own 420×230/560×480 sizes — MOVE to the standard desk skeleton (horizontal duo from CAM_LAYOUTS.desk, deck = map-score strip). The strip: per-map slots (name, mode, status/winner via mapStripClass, roundScore) in v2 panels — reuse mapPips for the compact form plus a wider per-map row; loadMaps dep + retry per the established pattern. layout 0 → centered full-width strip (preserve that behavior).
- [ ] **Step 2: casters-flythrough-hud.** Over-video (transparent, NO texture): camFrame per `CAM_LAYOUTS.flythrough` (legacy OBS-measured coords preserved in cam-layout.js), name pills, event header center-top. Rainbow accent bars → gradient-4 underline. Minimal deck (none — it overlays the flythrough).
- [ ] **Step 3: Verify** (screenshots incl. transparent check over gray for flythrough; rect assertions vs CAM_LAYOUTS). Console; npm test; commit. `feat: map-score + flythrough caster variants v2`

---

### Task 5: Between-matches + interview

**Files:** Modify `overlays/between-matches.html`, `overlays/interview.html`

- [ ] **Step 1: between-matches.** Preserve countdown.js wiring EXACTLY (timer node id `bm-timer-text` + startLocalTick resolver + countdown.visible in the key — read the Plan-1 integration comments), schedule bar data (completed/score1/score2/upNext fields), proxied logos. Restyle: petal texture, cam cutout from `CAM_LAYOUTS.wide.single` + camFrame, v2 schedule row (panels, ≥22px labels), countdown box (large mono digits ≥40px), event header — WITH the spec §5 fix: event title gets `max-width` + ellipsis (the overflow bug, absorbed by design). Move buildKey → defineOverlay key (same read-set).
- [ ] **Step 2: interview.** Preserve interviewee fields + proxied teamLogo. Restyle: petal texture, cam cutout from `CAM_LAYOUTS.interview.single` + camFrame (pill shows interviewee name), player-card → v2 pill + underline chips (role/team chips per the site's chip vocabulary — spec §6), teamColor accents. Give it a real key (it had NONE — rebuilds on every state change; key = interviewee fields + eventName + theme team colors).
- [ ] **Step 3: Verify** both (countdown ticking check on between-matches: PATCH countdown running → timer text updates between screenshots 2s apart; interview with a seeded interviewee incl. teamLogo). Screenshots; console; npm test; commit. `feat: between-matches + interview v2 (cam cutouts, countdown preserved, keyed interview)`

---

### Task 6: Countdown full-screens — starting-soon, brb, end-of-stream

**Files:** Modify `overlays/starting-soon.html`, `overlays/brb.html`, `overlays/end-of-stream.html`

- [ ] **Step 1: starting-soon.** Preserve: countdown.js wiring (id `countdown-timer`), schedule rows (proxied logos — already fixed), eventTitle||matchTitle fallback. Restyle per spec §6: big Geist heading, petal texture, large mono countdown digits, v2 schedule section (up-next emphasis), socials row (keep the existing inline-SVG YouTube/Twitch/Discord icons — restyle to v2 chips; no state schema for socials, hardcoded stays). buildKey → defineOverlay key (same read-set + countdown.visible).
- [ ] **Step 2: brb.** Same treatment: heading, countdown (id `brb-timer-text` preserved), event label, breathe animation on the org logo → subtle petal-glow breathing (spec §7 idle life; NO retained transforms on wrappers).
- [ ] **Step 3: end-of-stream.** "SEE YOU NEXT TIME!" heading, socials row: REPLACE the emoji icons (📺🎮💬🐦) with the same inline-SVG chip row used in starting-soon (emoji render inconsistently in OBS CEF), event badge. Give it a key (eventName — it had none).
- [ ] **Step 4: Verify** all three (countdown ticking on the two timer scenes; screenshots; mobile-floor spot-check on starting-soon). Console; npm test; commit. `feat: countdown full-screens v2 (starting-soon, brb, end-of-stream)`

---

### Task 7: Series-winner + lower-third v2 polish

**Files:** Modify `overlays/series-winner.html`, `overlays/lower-third.html`

- [ ] **Step 1: series-winner.** Preserve winner logic exactly (seriesWinner || score>=ceil(bestOf/2) || waiting state). Restyle per spec §6: winner-color pinwheel spins up behind the winning logo (pinwheelSVG large, winner color both groups or winner+white — judge from style; CSS rotation animation on a wrapper INSIDE #root, full shorthand) + petal glow burst, giant name (keep ~100px, Geist), score line, staged entrances preserved on the v2 elements. Replace 🏆 emoji with a styled chip.
- [ ] **Step 2: lower-third.** Already on overlay-core (Plan 1 proving ground, old visuals). Restyle to v2: pill + gradient underline language (spec §6), Geist, --font-v2 (drop the old --lower-third-gradient/accent bar for the v2 underline; keep the exact same state read-set + key + textContent update discipline — visual-only change).
- [ ] **Step 3: Verify** (series-winner: seeded winner state + waiting state screenshots; lower-third: visible/hidden PATCH cycle). Console; npm test; commit. `feat: series-winner + lower-third v2`

---

### Task 8: Branded stinger (`overlays/stinger-transition.html`)

**Files:** Modify `overlays/stinger-transition.html`

- [ ] **Step 1:** Replace the placeholder "E" with the real brand per spec §6: full-size neon pinwheel (pinwheelSVG, brand accent colors — the 4 element accents, NOT team colors: this plays between arbitrary scenes) spin-wipe: pinwheel scales/rotates up from center covering the frame, gradient-4 trail sweeps across, then out — total ~0.8–1.2s, pure CSS animations, loops NOT (plays once per load; OBS shows the scene briefly). Keep it standalone (no state-sync needed — static art; keep theme-helpers script tag off if unused).
- [ ] **Step 2:** Note in the file header + commit body: OBS native stinger transitions require a media file — the WebM render is EXPLICITLY DEFERRED (spec §123); this scene is usable today as a manually-switched transition scene, and is the master for a future WebM capture. Scene collection v2 keeps Fade (Task 9).
- [ ] **Step 3: Verify** (screenshot mid-animation via CDP virtual time or a delayed capture; inspect). Commit. `feat: branded pinwheel stinger scene (WebM render deferred per spec)`

---

### Task 9: Scene collection v2

**Files:** Create `scripts/build-scene-collection-v2.mjs`, Modify `data/obs-scene-collection.json`, `data/obs-scene-collection-windows.json`, Create `docs/scene-collection-v2-migration.md`

- [ ] **Step 1: Generator script** (Node ESM, runs offline): reads both collection JSONs + `overlays/cam-layout.js` (require via createRequire — it's CJS-guarded ES5), and for each cam-bearing scene writes the Caster 1/Caster 2/Interviewee scene-item transforms to sit EXACTLY behind the canonical cutouts: pos = rect x/y, bounds type OBS_BOUNDS_SCALE_INNER with bounds = rect w/h (cam sources are 1920×1080 browser sources; bounds-scaling fits them into the window). Scene→layout mapping: Casters/Casters Lobby/Casters Scoreboard/Map Score → desk.dual; Casters Flythrough → flythrough.dual; Between Matches → wide.single; Interview → interview.single. Collection `name` → "Elemental Production v2". Idempotent (re-run safe), preserves everything else byte-for-byte (JSON round-trip with stable key order — verify with a diff that ONLY the intended items changed).
- [ ] **Step 2: Run it**, commit the regenerated JSONs + the script. Transitions untouched (Fade stays — stinger WebM deferred).
- [ ] **Step 3: Migration note** (`docs/scene-collection-v2-migration.md`): producer-facing — one-time re-import steps (Scene Collection → Import → select file), what changed (cam sources now sit behind overlay cutouts at exact positions; do NOT hand-move them; how to set each caster's cam URL), the v1 collection stays available, rollback = re-import v1 file.
- [ ] **Step 4: Sanity test** (vitest): script's transform math — given a rect, emitted scene-item has pos/bounds matching; both JSONs parse; every referenced overlay URL exists in overlays/ (catches renames). Commit. `feat: scene collection v2 — cam sources baked behind canonical cutouts + producer migration note`

---

### Task 10: Wrap-up + release prep (NO push/tag)

- [ ] Full `npm test`; `npx vite build`; serve sweep all 17 scenes 200 + console-clean; screenshots of every restyled scene with a rich seed; mobile-floor spot-check on casters + starting-soon; eslint baseline diff (no new categories).
- [ ] Cross-scene consistency pass: all cam scenes' frame rects match CAM_LAYOUTS via CDP assertions; countdown scenes tick; interview/end-of-stream now keyed.
- [ ] **Version bump to 1.4.0** in package.json (the whole v2 package: Plans 1+2+3) + a CHANGELOG/release-notes section listing the package (17 scenes restyled, scene collection v2 + migration note, known follow-ups: producer asset sourcing, WebM stinger).
- [ ] Final commit: `feat: broadcast package v2 — casters, full-screens, stinger, scene collection v2 (v1.4.0)`.
- [ ] **STOP. Do not merge-to-master/push/tag from a subagent.** The controller merges to master; the OWNER decides the release moment (producer OBS QA gate: cutout alignment, un-inlined backgrounds on cold switch, entrance replays, countdown modes — the release checklist from memory).
