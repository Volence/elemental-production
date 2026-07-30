# Code Health Audit — Elemental Production (post-v1.3.7, pre-redesign)

**Date:** 2026-07-29 · **Method:** three parallel read-only audits (server / dashboard / overlays), full reports appended below.
**Purpose:** decide what structure the Broadcast Package v2 redesign (spec `2026-07-29-obs-scene-redesign-design.md`) must build first, and surface latent bugs before they become producer reports.

## Verdict

The code is **not messy — it's under-walled**. Style is consistent, comments are good, and the intent is always readable. The problems are structural and they all rhyme:

1. **The state contract is implicit.** Deep-merge semantics, dotted override paths, arrays-replace-wholesale — real rules, written nowhere, enforced never. Every sync-clobbering bug (v1.3.7's and the new ones below) is a path that honored a different version of these rules.
2. **"Which map is current?" has ~6 implementations** across server (`syncToOBS`, `getActiveBanIdx`), dashboard (`autoActiveIdx`, `getActiveBanMapIdx`, inline `isSelected`), and overlays (now unified on `findCurrentMapIndex`). They disagree in the fallback tail — the green-highlighted map can differ from the map ban edits write to and from the flythrough shown. This is almost certainly the real "Clear Bans cleared my chosen map" report.
3. **17 overlays reimplement the same scaffolding** with 3 incompatible renderKey idioms, 6 `loadHeroes` copies (one of which can blank an overlay permanently), 6 divergent ban-tile markups, 5 hardcoded caster-slot geometries. The redesign must not copy this forward 17 more times.
4. **`server.js` (2,152 lines) is a composition problem**, not a quality problem — `faceit-merge.js` is the extraction template; 5 more extractions get it to a composition root.

## A. Live bugs found by the audit (nobody has reported these yet)

Priority-ordered "bug batch 2" candidates; all small, none blocked by the redesign:

| # | Bug | Where | Failure on air |
|---|-----|-------|----------------|
| A1 | `eventName` clobbered every 15s | `server.js:799` (no override guard) + `MatchHub.jsx:343,478` (no override set) | Producer-typed event title reverts mid-broadcast |
| A2 | hero-bans overlay can go permanently blank | `hero-bans.html:101-102` (`loadHeroes` has no `.catch`) | One failed /api/heroes fetch → scene renders nothing until manual refresh |
| A3 | Scoreboard map-selector buttons do nothing | `casters-scoreboard.html:444` (`switchMap` never resets `lastRenderKey`) | Casters can't switch the displayed map |
| A4 | Schedule/interview team logos unproxied | `starting-soon.html:227,233`, `interview.html:131` | Logos intermittently missing in OBS (the exact CDN-drop failure proxyImg exists for) |
| A5 | BRB timer computes against stale `startedAt` | `server.js:1877` (partial countdown merge omits it) | BRB countdown wrong or frozen |
| A6 | Score quick-actions reverted by poll | `server.js:1673,1773` + MatchHub map-win buttons (no score override set) | Manually awarded points vanish within 15s in FACEIT mode |
| A7 | Auto-sync flag lies after restart | `state.faceitAutoSync` persisted true, poll not restarted on boot | Dashboard shows "Auto Sync ON" while nothing polls |
| A8 | HUD team bars replay slide-in on every score change | `gameplay-hud.html:272-273` (entrance anim + full innerHTML rebuild) | Bars visibly re-animate mid-game (absorbed by redesign if preferred) |
| A9 | Caster-cam debounce never debounces | `ProductionControls.jsx:101` (plain object, not useRef) | Every keystroke fires an OBS setBrowserSource call |
| A10 | Malformed stats frame latches renderKey | `casters-scoreboard.html:233→284` (early return after key set) | Scoreboard freezes on a transient bad frame |
| A11 | Reset doesn't stop the FACEIT poll | `server.js:1726` | Post-reset, poll re-advances maps until it self-stops |
| A12 | `resetToDefault` leaves color overrides locked | `Theming.jsx:91-95` | "Reset" theme still blocks FACEIT colors |

Also flagged, dual-purpose (fix feeds redesign): team logos stored unproxied in state (`faceit-merge.js`/loader), the overlay image-inlining regex running over `<script>` bodies (`server.js:95`, silent JS-corruption hazard), and the 8MB `ELMT_BG` being base64-inlined into 11 overlay payloads (~11MB each — the redesign's texture helper must serve it as a cached URL instead).

## B. Structural work — folds into redesign foundation phase

**Overlays (build BEFORE restyling any scene):**
1. `overlay-core.js` base runtime — defineOverlay({key, render, deps}): one renderKey idiom, dep loading with automatic key-reset + hard catch. Kills A2/A3/A10 by construction. ES5, no `?.` in new shared code.
2. Render-vs-reflow split — entrance-animated shells render once; data updates touch data nodes only. Kills A8; prerequisite for the persistent morph top-frame.
3. Shared components: ban-tile, team-plate, map-series-slot, branding header, caster-cam-frame (slot geometry as data), countdown module, texture/background helper (URL not base64), proxy-by-default image helper, pinwheel SVG.

**Server:**
4. Extract `obs-sync.js`, `faceit-sync.js` (loader/refresh/poll unified on faceit-merge + one forward-only map builder), `bans.js` (+ canonical `resolveActiveMapIdx` shared everywhere), `overlay-render.js`, route groups. server.js becomes a composition root.
5. State contract hardening: every ad-hoc field into `defaultState` (`obsConnection`, `faceitLastSync*`, `casterLayout`, `countdown.target`), a written contract doc, `setStateAndBroadcast` helper, vitest coverage for merge/override semantics.
6. One "current map / active ban map" resolver consumed by server + dashboard + overlays (dashboard stops recomputing; POSTs intents instead).

**Dashboard (opportunistic, as redesign touches pages):**
7. Extract MapSlot, PlayerStatsPanel, OverrideLock (copy-pasted 6×), AudioSourceRow, DirectoryCard; shared logo-color-extraction util (two copies today); surface fetch failures (nearly all control actions fail silently today).

## C. What's genuinely fine (verified, don't churn)

`res.sendFile` root discipline; image proxy blocklisting; OBS reconnect guards; atomic state persistence; Theming's dirty-guard pattern (the new reference implementation); override plumbing UX in MatchHub; no native dialogs anywhere; lower-third.html as the model overlay (textContent updates, no innerHTML rebuild).

---

# Appendix 1 — Server layer audit (full report)

*(verbatim from the server auditor)*

... see `docs/superpowers/specs/audit-appendices/2026-07-29-server-audit.md`

# Appendix 2 — Dashboard layer audit (full report)

... see `docs/superpowers/specs/audit-appendices/2026-07-29-dashboard-audit.md`

# Appendix 3 — Overlays layer audit (full report)

... see `docs/superpowers/specs/audit-appendices/2026-07-29-overlays-audit.md`
