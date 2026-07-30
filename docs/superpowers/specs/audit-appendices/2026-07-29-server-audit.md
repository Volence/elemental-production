# SERVER LAYER AUDIT — Elemental Production (post-v1.3.7)

## 1. Responsibility inventory of `server.js` (2152 lines)

| Lines | Section | Description |
|---|---|---|
| 1–52 | Bootstrap | dotenv, express/cors, serve `dist/` SPA |
| 54–136 | **Overlay serving** | `noCacheHeaders`, base64 `overlayImageCache`, `/overlays/:file` (inlines images + injects state/hero bootstrap into HTML) |
| 132–136 | Static mounts | `/overlays` `/assets` `/fonts` `/cache` |
| 138–167 | **SSE + broadcast** | `sseClients` Set, `/api/events`, heartbeat, `broadcast()` |
| 169–327 | **OBS auto-sync** | `lastSyncedState`, `downloadToLocal`, `syncToOBS` (font/casters/flythrough/music/cams), `hideAudioSourceVideo` |
| 329–354 | **Timer** | `countdownInterval`, `startCountdown`/`stopCountdownInterval` |
| 356–374 | State API | GET/PATCH `/api/state`, reset |
| 376–440 | **Image proxy** | `proxyImageUrl`, disk-cached `/api/proxy-image` |
| 442–675 | OBS API | hotkeys, status, connect, scenes, text/image/browser/visibility, setup-overlays, transition, screenshot, force-sync, swap-sides, fonts/install, transform |
| 677–752 | **FACEIT helpers** | `heroNameToKey`, `buildPerMapBans`, `getActiveBanIdx`, `computeHeroBans` |
| 754–933 | FACEIT load/refresh | `/api/faceit/match` (one-shot loader), `/api/faceit/refresh`, stats |
| 935–1066 | **FACEIT poll** | `faceitPollTick`, start/stop, auto-sync routes |
| 1068–1093 | Overrides API | set / clear / clear-all |
| 1095–1205 | Maps / flythroughs / map-music | list + directory setters |
| 1206–1345 | Preflight + OBS stats | |
| 1347–1423 | Replay buffer | |
| 1425–1573 | Dir browser, scene-collection, bg-music + `advancePlaylist` | |
| 1575–1888 | Heroes, timer routes, score/map/streamdeck quick actions | |
| 1889–2050 | OBS source/audio, history, uploads | |
| 2052–2152 | Startup: `loadState`, `BROWSER_SOURCES`, OBS connect, media-end handlers, SPA catch-all, listen |

**Entanglement (shared mutable module state + cross-calls):**
- `syncToOBS` + `lastSyncedState` (mutable, line 172) is called from ~12 sites (poll, timer tick, every mutating route). Any route resetting `lastSyncedState = {}` (615, 627) affects all others. This is the single most-shared mutable object.
- `faceitPollInterval` (937) is the source of truth for auto-sync but a **duplicate** flag `state.faceitAutoSync` is persisted separately — they desync (see §5).
- `broadcast` + `getState`/`setState` are called from essentially every route; state, SSE, and OBS are effectively one tangled unit.
- `startCountdown` reads/writes state, broadcasts, AND calls `syncToOBS` from inside its `setInterval` (339–342) — timer entangled with OBS + SSE.

## 2. State contract (as actually implemented)

**Merge (`state.js` 116–120, 212–223):** `setState(partial)` deep-merges *plain objects* recursively; **arrays and primitives are replaced wholesale**; `null`/`undefined` in source overwrite target (no skip). There is no way to delete a key via setState. `loadState` deep-merges disk over a fresh `defaultState` clone (159–171) so new default keys appear on upgrade — but **removed keys in defaults persist from disk forever**.

**Persistence:** debounced 300ms, atomic temp+rename (179–200), flushed on exit/SIGINT/SIGTERM. Every `setState` persists — including the 1s countdown tick and 15s poll.

**Override grammar:** dotted string paths (`'teams.team1.name'`, `'maps'`) stored in `state.overrides{}`. `isOverridden(path)` is a flat string lookup (149–151) — **no wildcard / prefix semantics**; `'teams'` does not cover `'teams.team1.name'`.

**Who broadcasts:** routes broadcast manually after `setState`; there is **no broadcast-on-setState** — easy to forget (see violations).

### Violations / inconsistencies
- **Undeclared state fields written ad-hoc** (never in `defaultState`): `obsConnection` (489), `faceitLastSync`/`faceitLastSyncError` (794–795, 1020, 1027), `casterLayout` (1797, defaulted inline `|| 2` at 1794), `countdown.target` (1610). These bypass the "contract is the default shape" assumption and won't survive a `resetState`.
- **Manual score writes set NO override**: `/api/score/increment` (1673), `/api/map-win` (1773) mutate `teams.*.score` directly. In FACEIT mode the next `faceitPollTick` recomputes score from map winners (1011–1012) via `buildTeamsUpdate` and **clobbers the manual score 15s later** unless `teams.teamN.score` was independently overridden by the dashboard.
- **`/api/map/advance` (1692) sets `maps` without the `maps` override** → poll's `buildMapsUpdate` (997) runs the non-overridden branch and replaces the list wholesale from FACEIT.
- **`perMapBans` written unconditionally** (817, 892, 1007) with no override check — a client PATCH to `perMapBans` is always overwritten next tick; only `banSwaps`/`mapPickers` survive. Contract for producer ban edits is implicit and undocumented.
- **`/api/brb` (1877) partial countdown omits `startedAt`** — deep-merge keeps the *stale* previous `startedAt`, so the BRB timer computes elapsed against a wrong/`null` origin (real bug, §5).
- **Double / conditional broadcasts:** `/api/obs/scene` (515) and `/api/scene/:name` (525) broadcast `getState()` **even when `setScene` failed** (`ok===false`, no state change) — spurious broadcast. `startCountdown` broadcasts every second AND the completion path broadcasts again (341, 346).
- **Loader vs poll color divergence:** one-shot loader resets `teams.*.color` to `#3b82f6`/`#ef4444` unless overridden (830, 838), but poll's `buildTeamsUpdate` **never** touches color (preserves current). Fresh-load wipes a theme-derived color; poll doesn't.
- **`resetState` (`/api/state/reset`) does not `stopFaceitPoll`** — a running poll keeps ticking after a full reset until it self-heals on the next no-match tick.

## 3. Duplicated / diverging logic

- **"current map" resolution diverges:** `syncToOBS` uses `current → upcoming → maps[0]` (228–230) and **ignores `selectedMapIdx`**; `getActiveBanIdx` uses `selectedMapIdx → current → upcoming → maps.length-1` (734–743). Different fallback tail (first vs last) *and* selectedMap is honored for bans but not for flythrough/music. Producer selecting a non-live map desyncs bans from the flythrough shown.
- **Three near-identical FACEIT map-building blocks:** loader (766–780), refresh (873–886), poll (965–986). Only the poll version has forward-only status/winner preservation (`STATUS_RANK`, 964–978); loader and refresh **demote freely**. `buildMapsUpdate`/`buildTeamsUpdate` were extracted for the poll only — loader & refresh still inline their own logic → the v1.3.7 fix is not uniformly applied.
- **`BROWSER_SOURCES` duplicated & divergent:** module-level list (2057) has **14** entries incl. `'Casters Flythrough HUD'`; `/api/overlays/refresh` (1864) hardcodes its **own 13-entry** list missing that source → refresh never busts that overlay's cache.
- **Swap-sides duplicated:** `/api/obs/swap-sides` (624, clears `lastSyncedState`) vs `/api/swap` (1702, does not) — same toggle, different side-effects.
- **`buildPerMapBans`/`computeHeroBans` (701–752):** contract is testable in principle (pure), but `buildPerMapBans` bakes in a picker *heuristic* (map1→faction1, later→prev loser) mixed with correction layering — hard to unit-test cleanly because picker inference and swap-application are entangled in one map callback. Prime candidate for the `faceit-merge.js` treatment.

## 4. Decomposition proposal (priority-ordered)

1. **`obs-sync.js`** (low–med risk). Move `syncToOBS`, `lastSyncedState`, `hideAudioSourceVideo`, `downloadToLocal`, `TEXT_SOURCES`/`AUDIO_ONLY_SOURCES`, `BROWSER_SOURCES`, `setupBrowserSources`. ~250 lines. Unblocks redesign of the OBS source contract and kills the shared-mutable `lastSyncedState`. Risk: it reads many state shapes; extract behind a `syncToOBS(state)` pure-ish signature.
2. **`faceit-sync.js`** (med risk). Move loader/refresh/poll into one module that reuses `faceit-merge.js`; collapse the 3 map-build blocks into one forward-only builder. ~350 lines. Unblocks trustworthy poll-vs-load parity and a documented FACEIT→state contract. Risk: this is the on-air hot path.
3. **`bans.js`** (low risk). Move `heroNameToKey`, `buildPerMapBans`, `getActiveBanIdx`, `computeHeroBans` + a canonical `resolveActiveMapIdx` shared with OBS. ~90 lines, pure, unit-testable like `faceit-merge`. Unblocks fixing the current-map divergence in one place.
4. **`state.js` contract hardening** (low risk). Add every ad-hoc field to `defaultState`, add an explicit array-vs-merge doc, expose a `setStateAndBroadcast` helper so broadcasts can't be forgotten. ~60 lines. Unblocks the whole redesign resting on a written contract.
5. **`overlay-render.js`** (low risk). Move `/overlays/:file` HTML inlining, `overlayImageCache`, `getImageDataUri`, bootstrap injection. ~90 lines. Unblocks the visual redesign's overlay-delivery changes without touching API routes.
6. **`routes/obs.js` + `routes/media.js`** (low risk). Group the ~30 thin OBS/audio/replay/music routes off the main file. ~500 lines moved. Mechanical; shrinks `server.js` to a composition root.

## 5. Top 10 risk list

1. **`server.js:1877` `/api/brb`** — partial `countdown` omits `startedAt`; deep-merge keeps stale value → BRB timer ticks against wrong origin (or never, if `startedAt` was null). Compare `/api/timer/start:1608` which sets it.
2. **`server.js:1673`/`1773` (score/map-win) vs `faceitPollTick:1011`** — manual score edits without an override are recomputed and reverted within 15s in FACEIT mode.
3. **`state.js:110` + `server.js:1031`** — `state.faceitAutoSync` is persisted `true` but poll is **not auto-started on boot**; after a server/Electron restart the dashboard shows auto-sync ON while no interval runs. `GET /api/faceit/auto-sync` returns interval truth, contradicting the persisted flag.
4. **`server.js:95`** — HTML overlay image-inlining regex `(?:\.\/)?([A-Za-z0-9_-]+\.(png|jpg|jpeg|svg))` runs over the *entire* file including inline `<script>`/JSON; any matching token in code gets string-replaced → silent overlay JS corruption.
5. **`server.js:1864` `/api/overlays/refresh`** — local 13-entry `BROWSER_SOURCES` misses `'Casters Flythrough HUD'`; that overlay is never cache-busted by the refresh button.
6. **`faceit-merge.js:11` / `server.js:1014`** — team logos (`faction.avatar`) are stored **unproxied**; only heroes go through `proxyImageUrl` (1580). Contradicts the OBS "unreliable CDN fetch" constraint — team logos can fail to load in OBS Chromium mid-broadcast.
7. **`server.js:228` vs `734`** — flythrough/music pick ignores `selectedMapIdx` and falls back to `maps[0]`; bans use `selectedMapIdx`…`maps.length-1`. Producer-selecting a map shows its bans over a different map's flythrough.
8. **`faceitPollTick` (940) vs manual routes** — no locking; a poll tick's `setState(update)` can interleave with a concurrent PATCH/quick-action between its `getState()` (941) and `setState()` (1022), silently dropping the manual edit (read-modify-write race, 82ms+ network window).
9. **`server.js:1726` `/api/reset`** — remaps existing `maps` to `upcoming` but does **not** `stopFaceitPoll`; a live poll can re-advance maps before the next no-match tick stops it.
10. **`state.js:195` persist frequency** — every countdown tick (1s) and poll tick (15s) calls `setState`→`persist` (debounced 300ms) writing the *entire* state JSON; with `playerStats`/`matchHistory` growth this is a steadily growing synchronous write on the hot path. `matchHistory` (2001) is unbounded and never trimmed.

**Confirmed fine:** `res.sendFile` calls all correctly pass `{ root }` (88, 1135, 1465, 2144) — the AppImage dot-dir fix is applied consistently. Image proxy blocklists HTML/JSON before caching (426). OBS reconnect chain (`obs.js:11–38`) correctly guards against stacked listeners. Atomic state persistence (temp+rename) is sound.
