# Overlay Layer Audit — Elemental Production

Scope: 17 scenes in `overlays/`, shared `theme-helpers.js` / `state-sync.js` / `animations.css`, and the inlining route in `server/server.js:79-131`. Read-only; nothing changed.

## 1. Scaffolding duplication map

| Duplicated block | Files (count) | Drift |
|---|---|---|
| **update()+renderKey skip** | 10 use `lastRenderKey`+`JSON.stringify` (hero-bans, gameplay-hud, map-pick, casters, map-intro, casters-lobby, casters-scoreboard, casters-map-score, casters-flythrough-hud, series-winner); 3 use a hand-rolled `buildKey` string (brb, starting-soon, between-matches); 4 have **no key** (interview, end-of-stream, lower-third, stinger). = **3 incompatible idioms** for one concern. |
| **loadHeroes()** | 6 (hero-bans:96, gameplay-hud:291, map-pick:169, map-intro:126, casters-scoreboard:213, casters-lobby:205) | **Worst divergence:** 5 copies are `heroData = window.__HERO_DATA__ \|\| fetch(...).catch(()=>[])`; **hero-bans:101-102 has no `.catch`** and `await res.json()` — a failed `/api/heroes` fetch rejects, so `loadHeroes().then(()=>stateSync(update))` never registers and the overlay renders **nothing, ever**. |
| **getHeroPortrait()** | 6, byte-identical | none |
| **heroNameToKey()** | 3 (map-pick, casters-scoreboard, casters-lobby), identical | none |
| **loadMaps()+getMapScreenshot()+loadMapsWithRetry()** | 3 (map-pick:173-353, casters-lobby:208-418, casters-map-score:143-297), near-identical | none |
| **Ban-icon markup** | 6 divergent structures: hero-bans `.ban-icon`, gameplay-hud `.ban-icon` (no name), map-intro `.ban-chip`, map-pick `.ban-hero`+`.ban-tag`, casters-scoreboard `.ban-icon`+`✕`, casters-lobby `.mini-ban`+`✕` | high |
| **Branding block** (org.png+divider+event-name) | ~11 copies | medium (2 markup shapes) |
| **Caster cam-slot + label + layout(0/1/2)** | 5 (casters, casters-lobby, scoreboard, map-score, flythrough) — every copy hardcodes different slot px (560×330 / 600×360 / 420×230 / 700×410 / 501×282) | high |
| **Countdown engine** (getRemaining/tick/formatTime/startLocalTick) | 3 near-identical (brb:87-113, starting-soon:160-179, between-matches ~130-155) | low |
| **Team-plate & map-series-slot** | 4-6 divergent copies each (map-pick, casters-lobby, gameplay-hud, map-intro, casters-map-score) | high |

## 2. Constraint compliance sweep

- **Unproxied external image — `starting-soon.html:227` & `:233`**: `src="${match.team1Logo}"` / `${match.team2Logo}` (schedule logos, external). The identical data is proxied in `between-matches.html:195,202` — this is the drifted copy. (Its fallback rows at :243,:249 *do* use proxyImg — inconsistent within the same file.)
- **Unproxied external image — `interview.html:131`**: `src="${teamLogo}"` (`state.interviewee.teamLogo`).
- (Not violations: `hero.portrait` is pre-proxied server-side by `proxyHeroes` at server.js:1579-1585. `org.png`/bg pngs are local, inlined by the route.)
- **Risky modern syntax in a SHARED file — `theme-helpers.js:5-6`**: optional chaining `state.teams?.team1?.color`. Tolerated today but the foundation runtime must not add more. (state-sync.js is clean; module.exports guard at theme-helpers:120 is fine.)
- **Animation replay on data poll (innerHTML)**: `gameplay-hud.html:272-273` `.team-bar.left/right { transform; animation: slideIn ... both }` — `update()` rebuilds full innerHTML whenever `state.teams` (contains score) changes, so **both team bars replay their slide-in on every score change**. Same class: casters-lobby `.map-card` slideUp (:78) rebuilt on roster/stat change, casters-scoreboard slideUp panel (:73) rebuilt on every `playerStats` change.
- **lastRenderKey reset after async**: correctly handled everywhere it matters (map-pick:346, casters-lobby:411, casters-map-score:290). No missing resets. The one gap is interaction-state, see §3 (switchMap).
- **Retained wrapper transforms**: none harmful — all `#root` entrance animations resolve to identity, so `position:fixed` children are safe.

## 3. renderKey audit (mismatches only)

| Scene | Reads but NOT keyed → **stale** | Keyed but NOT read → **wasted/glitch** |
|---|---|---|
| gameplay-hud | `state.theme` (used via `applyTheme`) — theme-only edits won't repaint | — |
| casters-lobby | `state.perMapBans` (read at :254/:267) — new map bans never appear | `state.schedule` (keyed :240, never rendered) |
| casters-scoreboard | `currentMap` (local, set by `switchMap`) — **map buttons dead** (see §5) | — |
| between-matches | schedule `team1Logo/team2Logo` (buildKey omits them) — late logos stay blank | — |
| starting-soon | schedule `time`/`label`/order beyond `team1+team2` concat | — |
| interview / end-of-stream | *no key* → full innerHTML rebuild on **every** unrelated state change | — |

All other scenes key ≈ read. `lower-third` is the model citizen (textContent + class toggle, no innerHTML).

## 4. Foundation-phase shopping list (build first, priority order)

1. **Base overlay runtime** (`overlay-core.js`): `defineOverlay({ key(state), render(state, el), deps:[loadHeroes,loadMaps] })` wrapping fetch/poll, one canonical renderKey/skip, async-dep loading with **automatic key-reset after deps resolve**, and a hard `.catch` so a failed dep never blocks `stateSync`. Replaces the 3 key idioms + 6 `loadHeroes` + 3 `loadMaps`/retry copies across all 13 data-driven scenes. Kills the hero-bans no-catch bug and the switchMap/perMapBans staleness class by construction.
2. **Split render vs. reflow**: convention where entrance-animated shells render once and only data nodes update (textContent/targeted innerHTML). Directly fixes the replay glitches; consumed by gameplay-hud, casters-lobby, casters-scoreboard, map-intro. Prereq for the "persistent morph top-frame" — the frame must survive re-renders.
3. **Ban-tile component** (`banTile(heroKey, teamColor, opts)`): one markup for the 6 divergent ban blocks.
4. **Team-plate + map-series-slot components**: replace 4-6 copies each.
5. **Branding/event-header + caster-cam-frame components** (cam slot px as data, never a wrapper transform). Replaces ~11 branding + 5 caster-area copies.
6. **Countdown module** (`countdown.js`): the engine once. Consumers: brb, starting-soon, between-matches.
7. **Texture/background helper + team-color-wash tokens**: single source for the petal texture + washes — **and** stop base64-inlining the 8MB `ELMT_BG_1920x1080.png` into 11 separate HTML payloads; serve as cached URL.
8. **`proxyImg`-by-default image component**: makes unproxied `src=` structurally impossible.
9. **Pinwheel SVG component** (`pinwheel(colors)`): net-new; centralize before 17 scenes copy it.

## 5. Top 10 risk list

1. **hero-bans.html:101-102** — `loadHeroes()` has no `.catch`; a failed `/api/heroes` fetch rejects, `stateSync(update)` never registers → overlay is permanently blank on stream.
2. **casters-scoreboard.html:444** — `switchMap()` sets `currentMap` but never calls `update()` or resets `lastRenderKey`; the poll skips → **map-selector buttons do nothing** until an unrelated state change lands.
3. **casters-lobby.html:254** — reads `state.perMapBans` but it's absent from the renderKey (:238-241) → per-map hero bans never refresh once the panel is drawn.
4. **starting-soon.html:227,233** — schedule team logos bypass `proxyImg` → intermittently missing logos in OBS.
5. **interview.html:131** — interviewee `teamLogo` bypasses `proxyImg` → blank team logo mid-interview.
6. **gameplay-hud.html:272-273** — team bars carry `animation: slideIn ... both`; full innerHTML rebuild on every score change replays the slide → HUD bars visibly re-animate each time a team scores.
7. **server.js:95 + ELMT_BG (8.1 MB)** — the inline regex base64-embeds `ELMT_BG_1920x1080.png` into **11** overlay HTML responses (~11 MB each after base64) plus `LeftTeam_1/RightTeam_1.png` in gameplay-hud; across 13+ browser sources this is a large per-source memory/parse cost.
8. **server.js:95** — regex runs over the whole file incl. JS strings; any external URL whose last path segment collides with a local filename gets silently swapped for the local data URI. Latent, low-probability, hard to debug.
9. **gameplay-hud.html:307 (theme not keyed)** — renderKey omits `state.theme`; live theme/accent edits don't repaint the HUD until teams/maps/bans change.
10. **casters-scoreboard.html:284** — `if (!round || round.teams.length < 2) return;` early-returns *after* `lastRenderKey` was already set (:233), so a transient malformed `playerStats` frame latches the key and blocks re-render of the corrected frame until a different field changes.
