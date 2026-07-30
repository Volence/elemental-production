# Dashboard Layer Audit — v1.3.7 (read-only)

Reviewed: `src/App.jsx`, `src/pages/{MatchHub,Theming,ProductionControls,Settings}.jsx`, cross-checked against `server/server.js`, `server/faceit-merge.js`, `overlays/theme-helpers.js`.

## 1. State-handling patterns inventory

**App.jsx** — `state` is the single fetched/SSE-broadcast copy (fine, canonical). `currentScene`/`scenes`/`obsConnected`/`customFonts` are pure-UI/derived (a). `extractedLogosRef` dedup guard (a). The auto-extract effect (148-171) *writes* server state from a broadcast-triggered effect — not a wipe bug, but it and Theming's own extractor are redundant (see §2).

**Theming.jsx** — the pattern the v1.3.7 fix established, done correctly:
- `local` (36) = **(b) mirror with sync effect**. Sync at 38-43 is guarded by `dirty` — the correct wipe-proof pattern. `updateSilent` (52) lets logo extraction mutate the form without setting `dirty`, so broadcasts still resync. This is the reference implementation; no wipe bug.
- `TeamColorSection.extractedColor` (285) = (a) pure-UI display.
- Minor: `resetToDefault` (91) does not clear the `teams.*.color` overrides it may have set earlier, so a reset theme can still be locked against FACEIT.

**MatchHub.jsx** — mixed:
- `matchUrl` (34) = **(c) orphaned→fixed**. This is the FACEIT-URL-lost bug; now backed by `state.faceitMatchUrl` with a fill-if-empty resync (73-75). Correct, but the resync only runs on `state.faceitMatchUrl` change (eslint-disabled dep) — if the producer clears the box then remounts, it won't refill until the server value changes. Acceptable.
- `selectedMapIdx` (41) = **(b) mirror with sync effect** (66-69), guarded by equality check. Fine, though it duplicates `state.selectedMapIdx` and is written on nearly every map interaction.
- `heroes` (37), `mapImages` (38) = (a) fetched catalogs.
- `banTeam`, `showMapPicker`, `showNewMatchConfirm`, `logoUploadTarget` = (a) pure-UI.

**ProductionControls.jsx** — several (b) mirrors that poll their own source of truth (OBS) rather than server broadcast, which is correct for OBS-owned data but means they can drift from `state`:
- `audioSources` (25), `scenes`/`currentScene` (26-27), `obsStats`, `replayStatus`, `preflight` = (a/b) OBS-polled, fine.
- `currentScene` (27) is a **(b) mirror of `state.currentScene`** with sync effect (67-76) — fine.
- `capturedThumbs` (30) = (a) localStorage UI cache.
- `camDebounceRef = {}` (101) — **see §5, it's not a ref and the debounce is broken.**

**Settings.jsx** — heavy **(c)/(b) territory**, the most fragile page:
- `obsHost/obsPort/obsPassword` (31-33), `flythroughDir`, `flythroughFallback`, `mapMusicDir`, `bgMusicDir`, `bgMusicSelected`, `castersBgMusicSelected` — all **(b) mirrors initialized once from `state.*` in `useState(...)`** with **no sync effect**. Unlike Theming, these never resync to broadcasts; they rely on the explicit-Save + dirty-tracking model (`dirtyFields`). Safe only because the page warns on navigate-away (App.jsx 207). If another producer changes these, this form shows stale values with no indication.
- `hotkeys` (16) = (b) mirror *with* a proper sync effect (20-23) that resets on `state.hotkeys` change — but that effect will silently discard in-progress edits if a broadcast lands (no `dirty` guard like Theming). Low-frequency field, low risk.
- The one-time loader uses `useState(() => {...})` (74) as a run-once side-effect — an anti-pattern (should be `useEffect`); re-runs on remount and fires fetches from a state initializer.

## 2. Duplicated server logic

| Logic | Dashboard | Server / shared helper | Drift risk |
|---|---|---|---|
| **Active-ban map index** | `MatchHub.getActiveBanMapIdx` (235-242) | `server.getActiveBanIdx` (734-743) | **HIGH — already drifted.** Server returns `upcoming` then `length-1`; dashboard returns `maps.length` (out of range!) when last map completed, and has no `upcoming` branch. Different results → §5 bug. |
| **"Current/display map" index** | `MatchHub.autoActiveIdx` (101-108) **and** the inline `isSelected` in the map slot (610-612) — **two more variants** | `overlays/theme-helpers.findCurrentMapIndex` (97-102), `server.js:228` | **HIGH.** Three dashboard copies all express "which map is live" slightly differently and none matches the shared `findCurrentMapIndex`. Should consume one shared helper. |
| **heroBans ↔ perMapBans conversion** | `MatchHub.heroBansForMap` (88-97) + inline rebuild in `toggleBan` (263-277) | `server.computeHeroBans` (745-752) + `buildPerMapBans` (701-726) | **HIGH.** Dashboard re-derives team1Ban/team2Ban and ban1/ban2 client-side; server does the same on every sync. The picker→ban-side assignment is reimplemented in the picker `onChange` (791-804). |
| **Hero name normalization** | `MatchHub.normalizeHeroName` (6) / `findHeroByName` (10) | `theme-helpers.normHeroName` (72) / `findHeroEntry` (77); `server.heroNameToKey` (688) | MEDIUM. Three near-identical copies. Server's `heroNameToKey` keeps hyphens while dashboard strips to alnum — subtly different outputs; only aligned by luck. |
| **Score mutation on map win** | MatchHub inline (708-751): win/swap/undo adjust `teams.*.score` by hand | `server.js` score/advance endpoints + FACEIT `computedScore` | MEDIUM. In FACEIT mode these hand-edits aren't override-flagged, so the next sync recomputes score from FACEIT and can revert them. |
| **Logo color extraction** | `App.extractColorFromLogo` (9-54) **and** `Theming.TeamColorSection` effect (287-344) | — | LOW/MEDIUM. Same 40-line canvas-bucketing algorithm copy-pasted twice; will drift when the redesign touches one. Extract to a shared util. |
| **Scene name list / icons fallback** | `App.js:190`, `ProductionControls:311` (identical 13-name array) | server scene collection | LOW. Duplicated hardcoded fallback list. |

**Single source of truth:** ban/map-index and heroBans logic should live server-side only; the dashboard should read `state.heroBans`/`state.selectedMapIdx` and POST intents, not recompute. Normalization + color extraction should be shared modules imported by both dashboard and overlays.

## 3. Component size / health

- `ConfirmModal` 22, `StatusBar` 59, `FolderBrowser` 169 — healthy.
- `Theming` 374 — OK; already well-factored into `ColorField`/`GradientField`/`TeamColorSection`.
- `Settings` 803 — large but mostly flat JSX cards. Highest-value split: **extract `MusicDirCard`** (the flythrough/map-music/bg-music blocks 343-566 are three near-identical dir-picker+scan+list cards ≈ copy-paste); one `<DirectoryCard>` component removes ~150 lines. Also **`OverlayUrlList`** and **`StreamDeckEndpoints`** (568-709) are pure static-data maps → trivially extractable.
- `ProductionControls` 980 — natural seams: **`ReplayControls`** (323-393), **`StreamHealthBar`** (398-440), **`AudioMixer`** (816-977, includes a copy-pasted grouped/ungrouped source renderer — the two blocks 871-892 & 944-965 are identical, extract `<AudioSourceRow>`), **`SceneGrid`** (477-594).
- `MatchHub` 1049 — biggest. Highest-value splits: **`MapSeries`/`MapSlot`** (607-824, ~215 lines with 3 inline IIFEs), **`PlayerStatsPanel`** (941-1013), **`OverrideBanner`** (429-466), **`HeroBanGrid`** (843-938). The 🔒 override-release span is copy-pasted 6× in Team Setup (485-530) — extract `<OverrideLock path=... />`.

Top 3-5: `MatchHub → MapSlot`, `MatchHub → PlayerStatsPanel`, `ProductionControls → AudioMixer/AudioSourceRow`, `Settings → DirectoryCard`, shared `useOverrides`/`OverrideLock` helper.

## 4. updateState / API audit

- **PATCH without override → clobbered by FACEIT poll:**
  - `eventName` — `MatchHub` 343 & 478 PATCH `{eventName}` with **no override**; server writes `update.eventName = details.competitionName` **unconditionally** (server.js:799, no `isOverridden` guard). Every 15s auto-sync overwrites the producer's event name. **Confirmed clobber.**
  - Map win/swap/undo score edits (708-751) — no `setOverride('teams.teamN.score')`, so FACEIT `computedScore` reverts them on next tick in faceit mode.
  - `mapPickers`/`banSwaps` are persisted (good) but the `maps` picker write (805) doesn't `setOverride('maps')`, while `addMap`/`removeMap` do (218, 226) — inconsistent.
- **Sets override but arguably shouldn't:** `toggleBan` sets `heroBans` override on *any* edit in faceit mode (260) — intended, but combined with the out-of-range push (§5) it can lock a phantom map.
- **Fire-and-forget fetches with no error surfaced to producer:** essentially all non-loadMatch calls — `swapSides` (201), `resetMatch` (202), auto-sync toggle (384), `history/save` (1020), all of ProductionControls' timer/scene/audio/replay/caster calls, interviewee cam (742), all Settings playlist/assign toggles (525-558). Only `loadMatch` (149) and the Settings dir-saves set error state. A failed scene switch or timer start is completely silent on-air.
- **Native dialogs:** none found. `ConfirmModal` used everywhere. Clean.

## 5. Top 10 risk list

1. **MatchHub.jsx:240 + 268-270** — `getActiveBanMapIdx` returns `maps.length` when the last map is completed; `toggleBan`'s `while (perMapBans.length <= mapIdx) perMapBans.push({})` then grows `perMapBans` **one entry past `maps`**, writing a ban for a nonexistent map. That phantom entry + the `heroBans` override lock can display/lock bans no overlay maps to.
2. **ProductionControls.jsx:101** — `const camDebounceRef = {}` is a plain object recreated every render, not a `useRef`. `clearTimeout` always clears `undefined`, so the caster-cam debounce never actually debounces — every keystroke fires a `setBrowserSource` POST 800ms later.
3. **server.js:799 vs MatchHub.jsx:478** — `eventName` clobber: producer-typed event name is overwritten every 15s by FACEIT auto-sync (no override guard on either side).
4. **MatchHub.jsx:101 / 235 / 610** — three inconsistent "current map" implementations; the map highlighted green (`isSelected`, 610-612) can differ from the map `toggleBan` writes to (`getActiveBanMapIdx`), so bans can silently apply to a different map than the one the producer sees selected.
5. **ProductionControls.jsx:148 / 603 / 613** — `state.countdown.*` accessed with no optional chaining; if `countdown` is ever absent the whole Production page throws and unmounts mid-show.
6. **MatchHub.jsx:711-719** — map "Win" buttons increment score locally without `setOverride('teams.teamN.score')`; in FACEIT mode the next sync can drop the manually-awarded point.
7. **Theming.jsx:91-95** — `resetToDefault` writes default theme but never clears `teams.team1.color`/`team2.color` overrides possibly set by a prior save, leaving team colors locked against FACEIT after a "reset".
8. **Settings.jsx:74** — one-time loaders run inside `useState(() => …)` (side effects in a state initializer). On remount they refire; these dir fields never resync to server broadcasts — a second producer's change shows stale with no UI cue.
9. **App.jsx:148-171 & Theming TeamColorSection** — two independent logo-color extractors can race: App PATCHes `theme.team1Color` while Theming holds a `dirty` form that ignores the broadcast, so the dashboard form and the on-air value diverge until the form is saved/reset.
10. **ProductionControls.jsx:851-856** — group "mute all" loops `await toggleMute` sequentially with the toggle target computed from stale `groupSources` captured at render; rapid clicks or a server-side change can leave a group half-muted with no error.

**Honest positives:** Theming's dirty-guarded sync is the correct fix and a good template; override plumbing in MatchHub (`overrideField`, release buttons, banner) is coherent; no banned native dialogs; OBS-owned state is correctly polled rather than mirrored through server broadcasts.
