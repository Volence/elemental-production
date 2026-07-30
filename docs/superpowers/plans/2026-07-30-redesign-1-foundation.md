# Broadcast Package v2 — Plan 1: Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared infrastructure every redesigned scene consumes — design tokens, petal texture delivery, the neon pinwheel component, ban-tile/team-plate components, the overlay runtime (`overlay-core.js`), and the asset pack — so the 17-scene restyle (Plans 2–3) never duplicates scaffolding.

**Architecture:** New shared files in `overlays/` (classic browser scripts, ES5-flavored, guarded CJS exports for vitest — the pattern proven in `theme-helpers.js`). Server gains one route change (texture served as cached static URL, not base64-inlined). No scene is restyled in this plan; instead ONE scene (`lower-third.html`, the smallest) is migrated onto the runtime as a proving ground.

**Tech Stack:** vanilla JS overlays (OBS browser sources), Express server, vitest.

**References (implementers MUST read):**
- Design spec: `docs/superpowers/specs/2026-07-29-obs-scene-redesign-design.md` (§2 tokens/rules, §8 plumbing)
- Audit: `docs/superpowers/specs/audit-appendices/2026-07-29-overlays-audit.md` (§4 shopping list — this plan implements items 1–3, 6–9)
- Pinwheel petal paths: `../elemental-website/src/components/TeamBrandingGuide/TeamBrandingGuide.tsx` (PETALS array, viewBox `130 130 740 740`, p/s color groups)
- Hard constraints: `.claude` memory `obs-overlay-constraints` — recorded at top of the bug-batch plan (`2026-07-29-bug-batch.md`); all still apply. New shared JS: NO `?.`, NO arrows, NO top-level import/export.

**Out of scope:** restyling scenes (Plans 2–3), server decomposition (`obs-sync.js`/`faceit-sync.js`/`bans.js` — separate hygiene plan), scene collection v2, hero full-body renders and high-res map pack acquisition (Task 8 builds the *loader*; sourcing the images is a producer/owner task tracked separately). The remaining shared components from the audit shopping list (map-series-slot, branding/event header, caster-cam-frame) land in Plan 2 alongside their first consuming scenes — building them without a consumer invites guessed APIs.

---

### Task 1: Design tokens stylesheet (`overlays/theme-v2.css`)

**Files:** Create `overlays/theme-v2.css`

- [ ] **Step 1: Create the token sheet.** Exact content:

```css
/* ELMT Broadcast Package v2 — design tokens.
   Source of truth: docs/superpowers/specs/2026-07-29-obs-scene-redesign-design.md §2.
   Team colors are set at runtime by applyTheme() (--team1-color/--team2-color);
   everything else is static brand. */
:root {
  /* Element accents (elmt.gg) */
  --elmt-red: hsl(0 85% 60%);
  --elmt-gold: hsl(45 95% 55%);
  --elmt-green: hsl(140 70% 50%);
  --elmt-blue: hsl(200 90% 55%);
  /* Surfaces */
  --panel-bg: rgba(8, 10, 15, 0.92);
  --panel-border: 1px solid rgba(255, 255, 255, 0.12);
  --panel-radius: 3px; /* sharp corners — approved; do not round */
  /* Type */
  --font-v2: 'Geist Sans', 'Inter', 'Segoe UI', system-ui, sans-serif;
  /* Accent line */
  --grad4: linear-gradient(90deg, var(--elmt-red), var(--elmt-gold), var(--elmt-green), var(--elmt-blue));
}

.v2-panel {
  background: var(--panel-bg);
  border: var(--panel-border);
  border-radius: var(--panel-radius);
}

.v2-underline {
  height: 2px;
  border-radius: 1px;
  background: var(--grad4);
}

/* Team wash: apply with class + inline --wash-color (set from team color) */
.v2-wash-left { background: linear-gradient(100deg, var(--wash-color), transparent 68%); }
.v2-wash-right { background: linear-gradient(260deg, var(--wash-color), transparent 68%); }

/* Petal texture background — image URL is injected by bg helper (Task 2),
   NOT base64-inlined (audit risk #7: 8MB payload per scene). */
.v2-texture-bg {
  background-color: #000;
  background-image: var(--texture-url, none);
  background-size: cover;
  background-position: center;
}

/* Mobile legibility floor (spec §2): key text >=28px, labels >=22px,
   info icons >=44px, ban tiles 56px. Enforced by component defaults below,
   documented here for reviewers. */
.v2-ban-tile { width: 56px; height: 56px; border-radius: var(--panel-radius); }
```

- [ ] **Step 2: Commit.** `git add overlays/theme-v2.css && git commit -m "feat: v2 design tokens stylesheet"`

---

### Task 2: Texture + font served as cached URLs (kills the 8MB inlining)

**Files:** Modify `server/server.js` (`/overlays/:file` inlining route, ~lines 79–131), Create `overlays/bg-helper.js`

- [ ] **Step 1: Exclude big backgrounds from inlining.** Read the inlining route. Add an exclusion list so `ELMT_BG_1920x1080.png`, `LeftTeam_1.png`, `RightTeam_1.png` are never base64-inlined (they're being retired / served by URL):

```js
// Never inline large background art — scenes reference these by URL so the
// browser caches ONE copy instead of a base64 clone per scene (~8MB each).
const INLINE_EXCLUDE = new Set(['ELMT_BG_1920x1080.png', 'LeftTeam_1.png', 'RightTeam_1.png']);
```
and skip replacement when the matched filename is in the set. Verify `/overlays` static mount already serves these files directly (it does — audit §inventory line 132-136); confirm cache headers on the static mount allow caching (read `noCacheHeaders` usage — it must NOT apply to the static PNGs; if it does, scope the no-cache headers to `.html` responses only and say so in the commit body).

- [ ] **Step 2: Create `overlays/bg-helper.js`** (classic script, ES5):

```js
// Applies the v2 petal-texture background to an element by URL (never base64).
function applyTextureBg(el) {
  el.classList.add('v2-texture-bg');
  el.style.setProperty('--texture-url', "url('./ELMT_BG_1920x1080.png')");
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { applyTextureBg: applyTextureBg };
}
```

- [ ] **Step 3: Verify.** `PORT=3996 node server/server.js` background; `curl -s localhost:3996/overlays/between-matches.html | wc -c` — response must be dramatically smaller than before IF that scene references the bg (compare against `git stash`-free method: fetch the same route from the still-running production app? NO — instead check: `curl -s localhost:3996/overlays/between-matches.html | grep -c 'base64'` and confirm no ELMT_BG base64 blob; then `curl -s -o /dev/null -w "%{http_code} %{size_download}\n" localhost:3996/overlays/ELMT_BG_1920x1080.png` returns 200 with ~8MB and a cacheable response). Kill server.
- [ ] **Step 4: Commit.** `fix: serve big background art by cached URL instead of per-scene base64 (audit risk)`

---

### Task 3: Pinwheel component (`overlays/pinwheel.js`)

**Files:** Create `overlays/pinwheel.js`, Test `overlays/pinwheel.test.js`

- [ ] **Step 1: Write failing tests** (`overlays/pinwheel.test.js`):

```js
import { describe, it, expect } from 'vitest';
import { pinwheelSVG } from './pinwheel.js';

describe('pinwheelSVG', () => {
  it('renders 8 petals with p-group in color1 and s-group in color2', () => {
    const svg = pinwheelSVG({ color1: '#ff0000', color2: '#0000ff' });
    const strokes = svg.match(/stroke="#ff0000"/g) || [];
    const strokes2 = svg.match(/stroke="#0000ff"/g) || [];
    expect(strokes.length).toBe(4);
    expect(strokes2.length).toBe(4);
    expect(svg).toContain('viewBox="130 130 740 740"');
  });
  it('supports hub content and size', () => {
    const svg = pinwheelSVG({ color1: '#f00', color2: '#00f', size: 62, hubText: '2·1' });
    expect(svg).toContain('2·1');
    expect(svg).toContain('width="62"');
  });
  it('escapes nothing weird into markup (no undefined)', () => {
    expect(pinwheelSVG({ color1: '#f00', color2: '#00f' })).not.toContain('undefined');
  });
});
```

- [ ] **Step 2: Implement.** Copy the EXACT 8 petal path strings from `TeamBrandingGuide.tsx` PETALS array (p,p,s,s,p,p,s,s order) into a module-level array. API (ES5, no template literals with nested interpolation beyond simple concat):

```js
// Neon-style ELMT pinwheel. Exact petal geometry from the website's
// TeamBrandingGuide (org.ai extraction). p-group petals take color1
// (team 1), s-group take color2 (team 2) — same mapping the site uses.
function pinwheelSVG(opts) {
  var color1 = opts.color1;
  var color2 = opts.color2;
  var size = opts.size || 62;
  var hubText = opts.hubText || '';
  // ... build svg string: for each petal, stroke=<group color>,
  // fill=<group color at .25 alpha via fill-opacity="0.25">, stroke-width 8,
  // stroke-linejoin round; optional glow via
  // style="filter: drop-shadow(0 0 4px <color1>) drop-shadow(0 0 4px <color2>)"
  // on the <svg>; optional hub: <circle> dark fill + <text> hubText centered.
  // Return the complete '<svg ...>...</svg>' string.
}
```
The implementer writes the full function (the petal `d` strings are long — copy verbatim, do not retype). fill-opacity attribute (not rgba concat) keeps arbitrary hex inputs working.

- [ ] **Step 3: Tests pass; visual smoke.** Write a throwaway `overlays/pinwheel-demo.html` that renders `pinwheelSVG({color1:'#ef4444', color2:'#3b82f6', hubText:'2·1'})`, view via the dev server, screenshot with headless Chrome (`google-chrome-stable --headless=new --screenshot=... http://localhost:3996/overlays/pinwheel-demo.html`), confirm it looks like the ELMT pinwheel. DELETE the demo file before committing.
- [ ] **Step 4: Commit.** `feat: neon pinwheel SVG component (real brand geometry, team-color groups)`

---

### Task 4: Ban-tile + team-plate components (`overlays/components-v2.js`)

**Files:** Create `overlays/components-v2.js`, Test `overlays/components-v2.test.js`

- [ ] **Step 1: Failing tests:**

```js
import { describe, it, expect } from 'vitest';
import { banTile, teamPlate } from './components-v2.js';

describe('banTile', () => {
  it('renders portrait via provided src with slash overlay and 56px default', () => {
    const html = banTile({ portrait: 'http://localhost:3001/cache/x.png', heroName: 'Genji', teamColor: '#f00' });
    expect(html).toContain('v2-ban-tile');
    expect(html).toContain('x.png');
    expect(html).toContain('Genji');
  });
  it('renders an empty placeholder when no hero', () => {
    const html = banTile({ portrait: '', heroName: '', teamColor: '#f00' });
    expect(html).toContain('v2-ban-tile');
    expect(html).not.toContain('<img');
  });
});

describe('teamPlate', () => {
  it('renders logo, name, score with team color wash side', () => {
    const html = teamPlate({ side: 'left', name: 'ELMT FIRE', logo: 'l.png', score: 2, color: '#f00' });
    expect(html).toContain('ELMT FIRE');
    expect(html).toContain('v2-wash-left');
    expect(html).toContain('>2<');
  });
  it('escapes team names (no HTML injection from FACEIT names)', () => {
    const html = teamPlate({ side: 'left', name: '<img onerror=x>', logo: '', score: 0, color: '#f00' });
    expect(html).not.toContain('<img onerror');
  });
});
```

- [ ] **Step 2: Implement** (ES5, string-building; include an `escapeHtml` helper used on all text fields — FACEIT team names are untrusted). banTile: `.v2-ban-tile` panel, `<img>` (caller passes an ALREADY-PROXIED portrait — server pre-proxies hero portraits; do not call proxyImg inside, document that contract in a comment), red slash overlay div (linear-gradient 45deg, as in the approved mockups), hero-name plate under the tile when `heroName` given. teamPlate: `.v2-panel` + `.v2-wash-<side>` with `--wash-color` set to `hexToAlpha(color, 0.38)` (reuse theme-helpers' `hexToAlpha` — it's global in overlays; for the vitest import, either export it from theme-helpers (already CJS-guarded) and require it, or accept a pre-computed washColor param — pick one, keep it consistent). Petal linework: accept optional `linework: true` that emits the 3-path faint SVG (curved strokes, from the approved v7 mockup) behind the content.
- [ ] **Step 3: Add `safeImg(src, attrs)`** to the same file (audit shopping-list item 8): returns an `<img>` tag string with the src ALWAYS routed through the global `proxyImg` and attributes escaped — makes unproxied external images structurally impossible in v2 markup. Two tests: external URL gets proxied; local/cache URL passes through untouched (proxyImg's existing localhost guard).
- [ ] **Step 4: Tests pass, lint clean, commit.** `feat: v2 ban-tile, team-plate, and safe-image components`

---

### Task 5: Overlay runtime (`overlays/overlay-core.js`) — the big one

**Files:** Create `overlays/overlay-core.js`, Test `overlays/overlay-core.test.js`

Design (from audit §4.1 + §4.2, and the invariants documented in `casters-scoreboard.html` comments):

```js
// defineOverlay({
//   key: function(state) -> array   (JSON.stringify'd; key EXACTLY what render reads)
//   render: function(state, el)     (called only when key changes AND deps are loaded)
//   validate: function(state) -> bool (optional; false = skip WITHOUT committing key)
//   deps: [function() -> Promise]   (optional; e.g. loadHeroes, loadMaps)
//   shell: function(el)             (optional; runs ONCE — entrance-animated chrome
//                                    that must NOT be rebuilt on data changes)
// })
```

Behavioral contract (each line is a test):
1. render fires on first state and again only when key output changes.
2. `validate(state) === false` → no render AND key not committed (no latch — corrected frame with same key re-renders).
3. deps: all settled before first render (Promise.all with per-dep catch → dep failure yields its fallback value, never blocks registration — the hero-bans lesson); after deps resolve, key is reset so the first post-deps state re-renders.
4. `forceRender()` returned handle: re-runs render with the last seen state even when key is unchanged (the switchMap escape hatch), safe no-op before any state arrived.
5. `shell` runs exactly once before the first render; render receives a dedicated child container so innerHTML rebuilds never touch the shell (render-vs-reflow split — entrance animations don't replay on data changes).
6. Integration with `state-sync.js`: defineOverlay calls the global `stateSync(update)` itself; visibility-replay behavior (`state-sync.js` animation restart) is untouched.

- [ ] **Step 1: Write the failing test file.** Because overlay-core is a classic script with a CJS guard, tests drive it with fake DOM elements (plain objects with innerHTML/appendChild/classList stubs) and a fake stateSync injected via an optional `opts._stateSync` test seam (document: production omits it → global stateSync). Write one test per contract line above (6+ tests), each asserting observable behavior (render call counts, key latch behavior, forceRender semantics). No tautologies.
- [ ] **Step 2: Run tests — FAIL.**
- [ ] **Step 3: Implement `overlay-core.js`** (ES5: var/function; no ?.; CJS guard export of `defineOverlay`). ~120 lines. Include the invariant comments from casters-scoreboard (key committed only at genuine render points; stash last state for forceRender).
- [ ] **Step 4: Tests pass. Commit.** `feat: overlay-core runtime — unified renderKey/deps/shell/forceRender contract`

---

### Task 6: Migrate `lower-third.html` onto the runtime (proving ground)

**Files:** Modify `overlays/lower-third.html`

- [ ] **Step 1:** Read the scene (it's the model citizen — textContent updates). Rewrite its inline script as a `defineOverlay({...})` call: key = the fields it reads, render = existing logic, shell = its static chrome. Add `<script src="./overlay-core.js"></script>` (after theme-helpers, before the inline script). NO visual changes in this task.
- [ ] **Step 2: Verify.** Serve check on PORT=3996: scene 200, renders with seeded state (PATCH a lowerThird title via curl, confirm the served overlay updates on poll — use headless Chrome screenshot before/after the PATCH). Entrance animation still replays on OBS visibility (manual check note for producer QA; cannot automate here).
- [ ] **Step 3: Commit.** `refactor: lower-third runs on overlay-core (proving ground, no visual change)`

---

### Task 7: Countdown module (`overlays/countdown.js`)

**Files:** Create `overlays/countdown.js`, Test `overlays/countdown.test.js`

- [ ] **Step 1: Failing tests** for the pure parts: `getRemaining(countdownState, nowMs)` (running: duration - elapsed from startedAt; paused: stored remaining; clamped ≥0) and `formatTime(seconds)` ('MM:SS', pads). Extract expected behavior by READING the three existing copies (brb:87-113, starting-soon:160-179, between-matches ~130-155) — if they disagree, match the majority and note the divergence in the commit body.
- [ ] **Step 2: Implement** (ES5 + CJS guard): `getRemaining`, `formatTime`, and `startLocalTick(el, getState, opts)` (1s interval that textContent-updates a node — impure, untested, thin).
- [ ] **Step 3: Point the three scenes' local engines at the module** (script tag + delete their local copies; keep their rendering untouched). Serve-check all three.
- [ ] **Step 4: Commit.** `refactor: shared countdown module replaces 3 overlay-local engines`

---

### Task 8: Asset pack loader (maps + fonts)

**Files:** Create `data/map-images/README.md`, Modify `server/server.js` (`/api/maps` route ~1097), Create `overlays/fonts-v2.css`

- [ ] **Step 1: Local-first map images.** In the `/api/maps` route: after fetching/caching the OverFast list, for each map check `data/map-images/<normalized-name>.jpg|png` (normalize: the same accent/punctuation-stripping as `normalizeHeroName` — implement server-side or reuse; King's Row curly apostrophe must resolve). If a local file exists, set `screenshot` to its served URL (`/api/map-image/<file>` or a static mount — add one for `data/map-images` with `{root}` discipline) instead of the OverFast URL. OverFast stays the fallback.
- [ ] **Step 2: README** documenting the drop-in contract for producers: file naming (normalized names, list all 29 current pool names → expected filenames), recommended resolution (≥1200px wide), and that King's Row + Antarctic Peninsula are the priority (the blurry-map bug reports).
- [ ] **Step 3: Geist font.** Download Geist Sans woff2 (regular/600/800) into `overlays/fonts/` — if network-restricted, create `overlays/fonts-v2.css` with the `@font-face` declarations pointing at the expected filenames plus the system-stack fallback, and note the missing binaries in the commit body as a follow-up item (the token sheet's `--font-v2` already falls back gracefully).
- [ ] **Step 4: Test.** Vitest for the name-normalization resolver (King's Row/curly apostrophe case, accented Paraíso case). Serve check `/api/maps` with an empty `data/map-images` (all OverFast) and with a dummy `kings-row.png` present (local wins).
- [ ] **Step 5: Commit.** `feat: local-first map image pack + v2 font scaffolding`

---

### Task 9: Wrap-up

- [ ] Full `npm test` (expect: 14 baseline + pinwheel 3 + components 4 + core 6+ + countdown + map-resolver ≈ 30+), boot check, eslint baselines.
- [ ] Serve-check every existing scene still 200s and renders (nothing regressed by the inlining exclusion — especially gameplay-hud which referenced LeftTeam_1.png: verify its current CSS still resolves the URL via the static mount).
- [ ] Commit: `feat: broadcast v2 foundation — tokens, texture delivery, pinwheel, components, overlay runtime, asset pack`. NO version bump — foundation ships silently inside the next release with Plan 2.
