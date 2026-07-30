# Broadcast Package v2 — Plan 2: Match-Flow Scenes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the four match-flow scenes (gameplay-hud, map-pick, hero-bans, map-intro) onto the v2 design system and the overlay-core runtime, plus the remaining plumbing they need (hero-render loader, color-extraction hardening, the shared top-frame/event-header/map-pips components).

**Architecture:** Every scene becomes a `defineOverlay({el, key, render, shell, deps})` consumer with a real shell/render split (shell = entrance-animated chrome that mounts once; render = data into the trailing container). Scene visuals are ported from the APPROVED mockups in `docs/superpowers/specs/` (v7/v8 HUD, v4 map board, ban-reveal-map-intro) — implementers port mockup markup/CSS and adapt it to theme-v2 tokens + components-v2 builders; they do not invent layouts. New shared components land in `overlays/components-v2.js` with their first consumer in the very next task.

**Tech Stack:** vanilla JS overlays (OBS browser sources, Chromium 103+), Express server, React dashboard (Task 1 only), vitest.

**References (implementers MUST read what their task lists):**
- Design spec: `docs/superpowers/specs/2026-07-29-obs-scene-redesign-design.md` (§2 tokens/rules, §3 HUD, §4 match flow, §7 animation model)
- Approved mockups: `docs/superpowers/specs/hud-layout-v7.html` (side plates + ban wings), `hud-layout-v8.html` (center band), `map-pick-v4.html` + `map-pick-bans.html` (map board + live-column bans), `ban-reveal-map-intro.html` (ban reveal + map intro)
- Foundation APIs: `overlays/overlay-core.js` header docstring (the contract), `overlays/lower-third.html` (migration example — NOTE its `el: document.body` shortcut does NOT apply here; these scenes pass `#root`), `overlays/components-v2.js`, `overlays/theme-v2.css`, `overlays/pinwheel.js`, `overlays/theme-helpers.js` (`findCurrentMapIndex`/`findCurrentMap`/`mapStripClass`/`hexToAlpha`/`proxyImg` — the current-map helper ALREADY EXISTS, use it, do not reimplement)

**Hard constraints (from `.claude` memory `obs-overlay-constraints` — all still apply):**
- Scene inline scripts: ES2019-safe (template literals/`const`/arrows OK — existing convention) but **NO `?.`, NO `??`**. Shared `overlays/*.js` files stay ES5 + CJS guard.
- All remote images through `proxyImg`/`safeImg`; hero portraits arrive pre-proxied from `/api/heroes`.
- No Google Fonts / CDN links in restyled scenes — replace with `<link rel="stylesheet" href="./fonts-v2.css">` + `<link rel="stylesheet" href="./theme-v2.css">` (BOTH; the @font-face lives in fonts-v2.css).
- Entrance animations must replay via state-sync's `#root` visibility replay: every restyled scene's animated chrome lives under `<div id="root">`, and `el: document.getElementById('root')` is passed to defineOverlay. No retained transforms on page wrappers.
- `{root}` on any new sendFile; never reload browser sources on scene switch.
- Mobile legibility floor (spec §2): key text ≥28px, labels ≥22px, info icons ≥44px, ban tiles 56px (84px on map-board live column).

**Out of scope (Plan 3):** caster/cam scenes, full-screens, stinger, scene collection v2, caster-cam-frame component, version bump/release. The v2 package RELEASES ONLY after Plan 3 — merged Plan 2 work sits unreleased on master, and that is intended.

---

### Task 1: Color-extraction vibrancy hardening (dashboard)

**Files:** Create `src/lib/color-extract.js`, Test `src/lib/color-extract.test.js`, Modify `src/App.jsx` (extractColorFromLogo, lines 9–54)

The extraction already skips transparent + near-white/near-black pixels and weights saturation (spec §8 mostly done). Remaining gap: a large desaturated (gray) cluster can still win on count, and the failure fallback is itself gray `#6b7280`. Spec: "reject near-gray, fallback to element accent."

- [ ] **Step 1: Failing tests** (`src/lib/color-extract.test.js`):

```js
import { describe, it, expect } from 'vitest';
import { pickBestBucket, ELMT_ACCENT_FALLBACK } from './color-extract.js';

const bucket = (r, g, b, count, satAvg) => ({ r: r * count, g: g * count, b: b * count, count, satScore: satAvg * count });

describe('pickBestBucket', () => {
  it('prefers a saturated bucket over a larger gray one', () => {
    const buckets = { gray: bucket(128, 128, 128, 900, 0.02), red: bucket(220, 40, 40, 120, 0.75) };
    expect(pickBestBucket(buckets)).toBe('#dc2828');
  });
  it('returns the fallback accent when every bucket is near-gray', () => {
    const buckets = { a: bucket(120, 120, 125, 500, 0.03), b: bucket(90, 90, 90, 300, 0.01) };
    expect(pickBestBucket(buckets)).toBe(ELMT_ACCENT_FALLBACK);
  });
  it('returns the fallback accent for empty input', () => {
    expect(pickBestBucket({})).toBe(ELMT_ACCENT_FALLBACK);
  });
});
```

- [ ] **Step 2: Implement `src/lib/color-extract.js`** (this file is dashboard-side React tooling — normal ESM is fine here):

```js
// Bucket scoring for team-color extraction from logos. Pulled out of
// App.jsx so the "vibrant beats big-but-gray" policy is unit-testable.
// A bucket: { r, g, b, count, satScore } (r/g/b are SUMS, satScore is
// summed per-pixel HSL saturation — see extractColorFromLogo).
export const ELMT_ACCENT_FALLBACK = '#25aff4'; // hsl(200 90% 55%), the ELMT blue accent

const MIN_AVG_SATURATION = 0.15; // below this a bucket is "gray" — never a team color

export function pickBestBucket(buckets) {
  let best = null, bestScore = 0;
  for (const b of Object.values(buckets)) {
    if (b.count === 0) continue;
    if (b.satScore / b.count < MIN_AVG_SATURATION) continue; // reject near-gray
    const score = b.satScore * Math.sqrt(b.count);
    if (score > bestScore) { bestScore = score; best = b; }
  }
  if (!best) return ELMT_ACCENT_FALLBACK;
  const r = Math.round(best.r / best.count);
  const g = Math.round(best.g / best.count);
  const b2 = Math.round(best.b / best.count);
  return '#' + [r, g, b2].map((c) => c.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 3: Wire App.jsx.** Import `{ pickBestBucket, ELMT_ACCENT_FALLBACK }`; replace the inline best-bucket loop (lines 35–47) with `resolve(pickBestBucket(buckets))`; replace both `resolve('#6b7280')` failure fallbacks (catch + onerror, lines 48/50) with `resolve(ELMT_ACCENT_FALLBACK)`. Nothing else in App.jsx changes.
- [ ] **Step 4: Tests pass** (`npx vitest run src/lib/color-extract.test.js`), full `npm test` green, `npm run build` (or `npx vite build`) still succeeds so the dashboard bundle isn't broken.
- [ ] **Step 5: Commit.** `fix: color extraction rejects near-gray winners, falls back to brand accent`

---

### Task 2: Hero-render loader + manual-map images (server)

**Files:** Create `server/hero-render-resolver.js`, Test `server/hero-render-resolver.test.js`, Create `data/hero-renders/README.md`, Modify `server/server.js` (proxyHeroes ~1637, `__HERO_DATA__` bootstrap ~141, static mounts ~176, `addMap` handler — find it), Modify `.gitignore`

Mirror of Plan 1's map-image pack, for full-body hero renders (Ban Reveal / Map Intro art). Producers source the images separately; this builds the loader + contract. ALSO closes spec §8 "manual maps get images".

- [ ] **Step 1: Resolver + tests.** Heroes already have canonical keys from OverFast (`dva`, `soldier-76`, `lucio` …) — the filename IS the hero key, no normalization needed (unlike maps). `server/hero-render-resolver.js` mirrors `server/map-image-resolver.js`: `findLocalHeroRender(heroKey, dir)` checks `<key>.png|.webp|.jpg` (that order — renders are usually transparent PNG/WebP), returns filename or null; rejects empty/non-string keys. Tests (mirror `map-image-resolver.test.js`, use `mkdtempSync`): finds png; prefers png over jpg; returns null when absent; null-safe input.
- [ ] **Step 2: Server wiring.** `HERO_RENDERS_DIR = DATA_DIR/hero-renders` created on boot (same pattern as MAP_IMAGES_DIR); `express.static` mount at `/hero-renders`; in `proxyHeroes` (which already rewrites portraits) add per-hero: local render exists → `hero.render = http://localhost:${PORT}/hero-renders/<file>`, else `hero.render = null`. Both `/api/heroes` and the `__HERO_DATA__` bootstrap flow through proxyHeroes already — verify, don't duplicate.
- [ ] **Step 3: `addMap` local image.** Find the manual add-map handler in server.js. When the incoming map has no image, resolve one from the local map pack via `findLocalMapImage(name, MAP_IMAGES_DIR)` (already exists) and set `image` to its `/map-images/<file>` URL; leave `''` only when no local file matches.
- [ ] **Step 4: README** (`data/hero-renders/README.md`): drop-in contract — filename = hero key exactly as `/api/heroes` reports (tell producers to check `http://localhost:3001/api/heroes` for the key list rather than hardcoding all ~52 in the README; give 6 worked examples incl. `dva`, `soldier-76`, `lucio`, `junker-queen`, `wrecking-ball`, `torbjorn`), transparent full-body PNG/WebP ≥900px tall preferred, `.png` > `.webp` > `.jpg` priority, gitignored like map-images. Add the matching `.gitignore` entries.
- [ ] **Step 5: Verify.** `PORT=3996 node server/server.js`: `/api/heroes` entries have `render: null` with empty dir; drop dummy `dva.png` → next request shows local URL, URL serves 200; delete dummy. Manual addMap check via curl if the endpoint allows (read the handler for the path/shape) with a known map name → response/state has a local image URL when `kings-row.png` (dummy) present. Kill server. Full `npm test`.
- [ ] **Step 6: Commit.** `feat: hero-render pack loader + manual maps resolve local images`

---

### Task 3: Shared components — eventHeader, mapPips, topFrame; banTile size option

**Files:** Modify `overlays/components-v2.js`, `overlays/components-v2.test.js`, `overlays/theme-helpers.test.js`

ES5 + string-building + `escapeHtml` on every text field, exactly like the existing builders. Port visual structure from the mockups (v8 center band, v7 plates) — read them first.

- [ ] **Step 1: Failing tests** (add to `components-v2.test.js`):

```js
import { eventHeader, mapPips, topFrame, banTile } from './components-v2.js';

describe('eventHeader', () => {
  it('renders event name with gradient underline', () => {
    const html = eventHeader({ eventName: 'FACEIT S8 <b>' });
    expect(html).toContain('v2-underline');
    expect(html).toContain('FACEIT S8 &lt;b&gt;');
  });
});

describe('mapPips', () => {
  const maps = [
    { name: 'Busan', status: 'completed', winner: 'team1' },
    { name: "King's Row", status: 'current', winner: null },
  ];
  it('renders one pip per map padded to bestOf, winner-colored / live / dark', () => {
    const html = mapPips({ maps, bestOf: 3, team1Color: '#123456', team2Color: '#654321' });
    expect((html.match(/v2-pip/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('#123456');       // winner fill
    expect(html).toContain('v2-pip-live');   // white-glow live pip
    expect(html).toContain('v2-pip-empty');  // unplayed pad
  });
  it('shows 2-3 letter abbreviations', () => {
    const html = mapPips({ maps, bestOf: 2, team1Color: '#111111', team2Color: '#222222' });
    expect(html).toContain('BUS');
    expect(html).toContain('KIN');
  });
});

describe('topFrame', () => {
  const opts = {
    team1: { name: 'FIRE', logo: 'a.png', score: 2, color: '#f00' },
    team2: { name: 'ICE', logo: 'b.png', score: 1, color: '#00f' },
    eventName: 'ELMT League', bestOf: 5,
    maps: [{ name: 'Busan', status: 'current', winner: null }],
    hubText: '2·1',
  };
  it('composes plates, medallion hub, event pill and pips', () => {
    const html = topFrame(opts);
    expect(html).toContain('FIRE');
    expect(html).toContain('ICE');
    expect(html).toContain('2·1');            // pinwheel hub
    expect(html).toContain('ELMT League');
    expect(html).toContain('v2-pip');
  });
  it('renders ban wings when given, hides when null', () => {
    const wings = { team1: [{ portrait: 'x.png', heroName: 'Genji' }], team2: [] };
    expect(topFrame({ ...opts, banWings: wings })).toContain('v2-ban-tile');
    expect(topFrame({ ...opts, banWings: null })).not.toContain('v2-ban-tile');
  });
  it('swapSides flips which team renders left', () => {
    const html = topFrame({ ...opts, swapSides: true });
    expect(html.indexOf('ICE')).toBeLessThan(html.indexOf('FIRE'));
  });
});

describe('banTile size option', () => {
  it('accepts a size override for the 84px map-board tiles', () => {
    const html = banTile({ portrait: 'x.png', heroName: 'Ana', teamColor: '#f00', size: 84 });
    expect(html).toContain('84px');
  });
});
```

- [ ] **Step 2: Implement.**
  - `eventHeader(opts)`: `{eventName, subtitle}` → dark pill/block with escaped event name, `.v2-underline` bar, optional subtitle line. Class prefix `v2-event-`.
  - `mapPips(opts)`: `{maps, bestOf, team1Color, team2Color}` → `.v2-pips` row; per map a `.v2-pip`: completed → inline `background` = winner's color; current → `.v2-pip-live` (white border/glow); upcoming → dark; pad to `bestOf` with `.v2-pip v2-pip-empty`. Abbreviation = first 3 letters of the normalized first word, uppercased (accent-strip via the same NFD technique as `normHeroName` — an ES5 local helper, do NOT depend on theme-helpers at require time). Colors escaped.
  - `topFrame(opts)`: `{team1, team2, eventName, bestOf, maps, banWings, hubText, swapSides}`. `swapSides` swaps which team object renders on the left FIRST, then: `[left teamPlate + optional left wing] [center: event pill above, pinwheelSVG({color1: leftColor, color2: rightColor, size: 62, hubText}) medallion, map pill (current map name via a passed `currentMapName` opt or derived from maps' `status==='current'`) + mapPips below-right per v8] [right wing + right teamPlate]`. Uses existing `teamPlate` (linework on) and `banTile` for wings (56px). Returns one `.v2-top-frame` flex row. Document: scene CSS owns absolute positioning/scale of `.v2-top-frame`; component owns internal layout only.
  - `banTile`: add optional `opts.size` (number) → inline `width/height` (+ scaled font on the name plate) overriding the 56px class default.
- [ ] **Step 3: Drift-guard tests** (Plan 1 carry-over — justify theme-helpers' CJS exports): in `theme-helpers.test.js`, import `hexToAlpha` and `proxyImg` from `./theme-helpers.js` and assert 2–3 known outputs each (e.g. `hexToAlpha('#ff0000', 0.5) === 'rgba(255, 0, 0, 0.5)'` — READ the implementation for exact spacing first; `proxyImg('https://cdn.x/a.png')` contains `/api/proxy-image?url=`; localhost passes through). These same functions are duplicated privately in components-v2 — the point is both surfaces stay covered.
- [ ] **Step 4: All tests green, eslint no new categories, commit.** `feat: v2 event-header, map-pips, top-frame components + banTile size opt`

---

### Task 4: Gameplay HUD restyle (`overlays/gameplay-hud.html`) — first real shell/render scene

**Files:** Modify `overlays/gameplay-hud.html`

Port `hud-layout-v7.html` (side plates + ban wings) + `hud-layout-v8.html` (center band) onto the live scene. This is the FIRST scene exercising overlay-core's `shell` + render-container path — get the split right; Tasks 5–7 copy it.

- [ ] **Step 1: Read** the current scene, both mockups, overlay-core's docstring, and `state-sync.js` replayAnimation (`#root` scope). Note current state reads (teams, maps, heroBans, swapSides, eventName, bestOf, font.family) and the two audit fixes this restyle absorbs: theme edits not repainting (theme leaves now keyed), team bars replaying slide-in on every score change (killed by the shell split).
- [ ] **Step 2: Rebuild the document.**
  - Head: drop Google Fonts; add `theme-v2.css` + `fonts-v2.css` links (keep `animations.css`, `theme-helpers.js`, add `pinwheel.js`, `components-v2.js`, `overlay-core.js` before `state-sync.js`, inline script last).
  - Body: `<div id="root">` containing THREE positioned, entrance-animated wrapper slots (chrome, built by `shell`): `#hud-left` (slideRight entrance), `#hud-center` (slideDown), `#hud-right` (slideLeft), using `animations.css` keyframes + `.delay-*` staggering — inline `animation:` styles so replayAnimation's `data-anim` restore path works (it handles inline animations; verify against state-sync.js before choosing inline vs class).
  - Layout budget (spec §3): side plates within y<110 full height; center band within y<62; keep clear of game UI at x≈590–710 gap columns. Plates + wings sized so ban tiles are 56px.
  - `defineOverlay({ el: root, shell, key, render, deps: [loadHeroes] })`: `shell` builds the three wrappers ONCE; `render(state, container)` — NOTE: with wrappers in shell, render targets the wrappers by id (`#hud-left .slot-content` etc.), writing `topFrame(...)` output SPLIT across them, or simpler: render writes the whole `topFrame()` into ONE persistent inner div per wrapper. Choose the simplest structure where re-render never recreates the animated wrappers. The trailing overlay-core container may go unused if render writes into shell-built slots — that is FINE and documented in lower-third's notes; position it display:none via scene CSS if it interferes.
  - `key(state)`: `[teams(name/logo/score/color ×2), maps(status/winner/name/roundScore per map), heroBans, swapSides, eventName, bestOf, theme.team1Color, theme.team2Color, font.family]` — exactly what render reads; document per lower-third's comment style.
  - Render data: `topFrame({...})` with `banWings` from `state.heroBans` portraits (via `findHeroEntry(heroData, key)` → pre-proxied portrait), `hubText` = `${t1.score}·${t2.score}`, current map name via `findCurrentMap(state.maps).name`, pips via component. `LeftTeam_1.png`/`RightTeam_1.png` references DELETED (linework now renders live via teamPlate).
- [ ] **Step 3: Verify.** `PORT=3001 node server/server.js` (3001 so the browser polls work — check nothing else is bound first; if busy, note and use curl-only checks on 3996): seed state via PATCH `/api/state` (teams w/ colors + 3 maps w/ one current + heroBans both teams), headless-Chrome screenshot 1920×1080 → inspect: plates within budget zones, wings 56px, medallion + pips present, colors correct. PATCH a score change → re-screenshot → confirm content updated AND entrance animation did NOT visually restart mid-session (compare: the slot wrappers are not rebuilt — assert via `--dump-dom` that wrapper nodes keep a marker attribute set once by shell). Console clean. Kill server.
- [ ] **Step 4: Commit.** `feat: gameplay HUD v2 — team plates + ban wings + center band on overlay-core`

---

### Task 5: Map Board (`overlays/map-pick.html`)

**Files:** Modify `overlays/map-pick.html`

Port `map-pick-v4.html` + the live-map-bans variant (`map-pick-bans.html`).

- [ ] **Step 1: Read** current scene + both mockups. Current deps: loadHeroes + loadMaps + loadMapsWithRetry (hand-rolled forceRender — replace with the runtime's).
- [ ] **Step 2: Rebuild.**
  - Head/scripts: same stack as Task 4 (+ `bg-helper.js`). Shell: `#root` gets `applyTextureBg(root)` petal texture + header row wrapper (scaleIn entrance) + `.map-grid` wrapper.
  - Header (v4): team chips (logo/name/score) flanking the pinwheel crest — reuse `topFrame` WITHOUT ban wings if it fits the v4 header row, otherwise compose `teamPlate` + `pinwheelSVG` + `eventHeader` directly (decide from the mockup; do not force-fit). Event title + `.v2-underline` under the crest.
  - Columns: `bestOf` columns; each: map art `<img>` (from `/api/maps` local-first screenshots via `getMapScreenshot` match — keep that matching logic, it stays scene-local), `MAP n · MODE` chip, states per mockup: winner column = team-color border/wash + circled winner logo + score; live column = white glow border + LIVE chip + name ≥40px; decider = dimmed `IF NEEDED`. Footer: map name ≥34px + picker pill (`<TEAM> PICK` / `· WON` / `DECIDER`) from `state.perMapBans[i].picker` + `mapPickers` overrides already merged server-side.
  - Live-column hero bans: `banTile({..., size: 84})` per locked ban (`perMapBans[current].team1Ban/team2Ban`), only on the live column.
  - `deps: [loadHeroes, loadMaps]`; maps retry: keep a thin 5s retry that on first success calls `handle.forceRender()` (the runtime escape hatch — replaces the hand-rolled `lastRenderKey=''` dance).
  - `key`: teams(name/logo/score/color), maps(name/mode/status/image/winner/roundScore), perMapBans, bestOf, eventName, theme.team1Color/team2Color — exactly what render reads (`heroBans` fallback read stays only if the render still uses it — prefer perMapBans as source of truth, matching current logic).
- [ ] **Step 3: Verify** like Task 4 (seed a BO5 with 2 completed / 1 live incl. bans / 1 upcoming / 1 decider; screenshot; PATCH a ban swap → live column updates without header re-entrance). Kill server.
- [ ] **Step 4: Commit.** `feat: map board v2 — columns, winner/live states, live-column bans`

---

### Task 6: Ban Reveal (`overlays/hero-bans.html`)

**Files:** Modify `overlays/hero-bans.html`

Full-screen reveal beat per `ban-reveal-map-intro.html` mockup (ban-reveal section). Fixes the pre-existing replay gap: the scene gets a `#root` so state-sync's visibility replay finally covers it.

- [ ] **Step 1: Read** current scene + mockup. Current container is `#bans` (NOT `#root`) with a `forwards` fadeIn.
- [ ] **Step 2: Rebuild.**
  - `<div id="root">`; shell: `applyTextureBg` petal texture, both team-color washes (`.v2-wash-left/right` with `--wash-color` from team colors — set inline in render since colors are data), `HERO BANS` heading (Geist, ≥28px), small crest + map-context chip (`MAP n · NAME` via `findCurrentMapIndex`/`findCurrentMap`) — heading/crest chrome in shell, wash colors + chip text in render.
  - Panels: one per banned hero, split per side team1|team2, N-per-team supported (base case 1v1 → two large face-off panels; N>1 splits each side into equal columns, map-column style). Panel: full-body render `hero.render` when present, else portrait fallback (`findHeroEntry` portrait, styled as an oversized centered bust — the mockup shows the fallback treatment; if it doesn't, dark panel + 128px portrait + name), team-color bottom wash, red slash sweep (rgba(255,0,0,·) 45deg — same visual family as banTile's slash), `BANNED` chip, role icon/text + hero name plate ≥34px.
  - Entrance: panels slam from their team's side (`slideLeft`/`slideRight` + `.delay-*`), slash sweeps after (animation-delay), names punch in — all inside `#root` so replay works; panels are rebuilt by render, so their entrance replays on ban CHANGES too — acceptable here (a new ban IS a reveal moment) — document that this is intentional, unlike the Task 4 chrome rule.
  - Ban source: `state.heroBans` (active-map bans, 1/team typical) — same as today. Empty bans → render an empty-state (hidden container), same visibility semantics as today.
  - `defineOverlay({el: root, shell, key, render, deps: [loadHeroes]})`; key: heroBans, teams(name/color ×2), maps(status/name per map — feeds the chip), theme.team1Color/team2Color.
- [ ] **Step 3: Verify:** seed bans both teams → screenshot (portrait-fallback path, since no renders are sourced yet); drop a dummy `data/hero-renders/<key>.png` for one banned hero → confirm the render path displays it (restart-free); delete dummy. PATCH different bans → panels update. Kill server.
- [ ] **Step 4: Commit.** `feat: hero-bans is the full-screen Ban Reveal (renders, slash sweep, replayable)`

---

### Task 7: Map Intro (`overlays/map-intro.html`)

**Files:** Modify `overlays/map-intro.html`

Port the map-intro section of `ban-reveal-map-intro.html`. Sits over the flythrough video — background stays transparent + gradient, NO petal texture.

- [ ] **Step 1: Read** current scene + mockup. Note the current map-NUMBER bug: computed as `t1.score + t2.score + 1`; the restyle uses `findCurrentMapIndex(state.maps) + 1` (works when maps exist; fall back to score-sum only when `state.maps` is empty — document why).
- [ ] **Step 2: Rebuild.**
  - `#root`: top frame = `topFrame({..., banWings: null, hubText: score})` (continuity with HUD — same component, scene CSS positions it at the HUD's coordinates scaled per mockup; spec §7 morph = coordinated coordinates + entrance animation, cross-source FLIP is impossible and NOT attempted).
  - Lower deck (shell wrapper, slideUp entrance): ban render tiles (hero.render || portrait, 2 per side max as today) flanking the dark score deck — team logos + names ≥28px, `ATTACK FIRST` / `MAP PICK` tags (picker from `findCurrentMap(maps).picker`), series score around a mini pinwheel hub (`pinwheelSVG({size: 48, hubText})`).
  - Chips above deck: `MATCH POINT` when either team is one map from clinching — winning threshold is `Math.floor(bestOf / 2) + 1` maps, so the chip shows when `t1.score === threshold - 1 || t2.score === threshold - 1` (BO5: threshold 3, chip at 2) — and `MAP n · NAME · MODE` from `findCurrentMapIndex`/`findCurrentMap`.
  - `defineOverlay` same pattern; key: teams(name/logo/score/color), maps(name/mode/status/picker), heroBans, bestOf, theme.team1Color/team2Color.
- [ ] **Step 3: Verify:** seed → screenshot over a dark page (transparent bg renders black in headless — fine); check MATCH POINT chip logic by PATCHing a 2–1 BO5 state (threshold 3: team1 at 2 → chip shows). Kill server.
- [ ] **Step 4: Commit.** `feat: map intro v2 — top-frame continuity, score deck, current-map chips`

---

### Task 8: Wrap-up

- [ ] Full `npm test` (baseline 62 + color-extract 3 + hero-render resolver ≈4 + components ≈8 → ~77+). `npm run build`/`npx vite build` still green (Task 1 touched the dashboard).
- [ ] Serve-sweep: all 17 scenes 200; headless screenshots of the four restyled scenes with a seeded full state — visually compare against the mockups (side-by-side render of mockup file vs scene); check mobile floor (zoom a screenshot to ⅓ and confirm key text readable).
- [ ] Regression spot-checks: lower-third + the 3 countdown scenes still render (they share components files that changed); `casters-scoreboard`/`casters-lobby` unaffected (they're Plan 3 but load theme-helpers — confirm no export/global broke: serve + console-error check).
- [ ] eslint baseline diff vs pre-plan master (new-category check only).
- [ ] NO version bump. Commit anything outstanding: `feat: broadcast v2 match flow — HUD, map board, ban reveal, map intro`.
