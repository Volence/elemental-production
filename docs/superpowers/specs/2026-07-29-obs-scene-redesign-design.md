# ELMT Broadcast Package v2 — OBS Scene Redesign

**Date:** 2026-07-29
**Status:** Approved by Volence (brainstorm session with visual companion; mockups in `.superpowers/brainstorm/3206334-1785360168/content/`)
**Scope:** All viewer-facing overlays in `overlays/`, scene transitions, OBS scene collection v2, and the supporting server/dashboard plumbing. Producer-dashboard-only bugs are tracked separately (see §10).

## 1. Goals

- Replace the "chunky" look with a package that visually matches elmt.gg (producers' words: char icons and icons too small, clunky, overall ugliness).
- Every scene reads on a phone-sized stream view, not just fullscreen 1080p.
- Caster cams become transparent cutouts — the overlay is a frame, cams sit behind it.
- Transitions feel intentional: branded stinger + entrance animations + persistent-element morphs between match scenes.
- All 17 scenes get the treatment in one package so nothing looks out of place.
- No new scenes this round (explicitly deferred by Volence); the Ban Reveal is an upgrade of the existing `hero-bans.html`.

## 2. Design language ("Team Glow")

Source of truth: elmt.gg (Geist Sans, pure black, hairline borders, 4 element accents) — verified against the live site homepage, /teams, /teams/oblivion, /matches, /calendar, /staff.

**Tokens**

| Token | Value |
|---|---|
| Panel background | `rgba(8,10,15,0.92)` |
| Panel border | `1px solid rgba(255,255,255,0.12)` (or team color at ~45% alpha) |
| Corner radius | 3px (sharp; user rejected rounded and swoosh-cut shapes) |
| Type | Geist Sans (bundle woff2 in asset pack; fallback Inter/system) |
| Accent red | `hsl(0 85% 60%)` |
| Accent gold | `hsl(45 95% 55%)` |
| Accent green | `hsl(140 70% 50%)` |
| Accent blue | `hsl(200 90% 55%)` |
| Gradient underline | `linear-gradient(90deg, red, gold, green, blue)`, 2px, used as neutral accent |
| Team wash | `linear-gradient(100deg, <teamColor>/0.38, transparent 68%)` over etched petal linework |
| Petal linework | Faint curved strokes (as in current `LeftTeam_1.png`), regenerated as inline SVG so it tints per team |

**Global rules**

- Every otherwise-black/blank background uses the `ELMT_BG` petal texture (`overlays/ELMT_BG_1920x1080.png`, 4000×2250 source). No plain black voids anywhere.
- **Mobile legibility floor** (stream watched at ~⅓ scale on phones): key text ≥28px air, secondary labels ≥22px, information-carrying icons ≥44px, ban tiles 56px standard. Anything below the floor must be redundant via color/shape (e.g. winner pips read by hue alone).
- Team colors drive all team-owned elements. Extraction fixes in §8 are a hard prerequisite — the package looks broken if extraction returns dull/hardcoded colors.
- The ELMT pinwheel (exact 8 petal paths from `elemental-website/src/components/TeamBrandingGuide/TeamBrandingGuide.tsx`, viewBox `130 130 740 740`) is the recurring motif, rendered in the site's "neon" style (stroke + ~25% fill + glow). Petal color mapping: p-group = team 1 color, s-group = team 2 color (same primary/secondary mapping the website generator uses).

## 3. Gameplay HUD (`gameplay-hud.html`)

Measured game-UI zones at 1920×1080 (from producer screenshots; verify against fresh captures during implementation):

- Game side player rows: from y≈112 down, x≈40–585 (mirrored right).
- Game center objective panel: x≈710–1205, y≈65–200.
- Our budget: side plates within y<110; center band within y<62; gap columns x≈590–710 (mirrored) are free.

**Side team plates** (v7 design): sharp-cornered dark panels, inline SVG petal linework under a team-color wash, 44px team logo, team name ~30px, score ~52px with team-color glow. Attached full-height **ban wing** on the inner end: 56px hero-portrait tiles with red slash and a team-color edge stripe. No baked PNG backgrounds — `LeftTeam_1.png`/`RightTeam_1.png` are retired; linework + wash render live so they tint per team.

**Center band** (v8 design), horizontal, nothing stacked below the medallion:
`[event pill: league name · BOx]` — `[62px neon pinwheel medallion, series score in hub]` — `[map pill: current map name + gradient underline · winner pips]`.
Winner pips: one per map, filled with winner's team color, white glow = live map, dark = unplayed; 2–3 letter map abbreviations inside as a desktop bonus (color carries the info on mobile).

Fixes absorbed: wrong ticker underline colors (`.strip-map.won-t1/t2` logic rebuilt with the pips), stale current-map fallback (§8 helper).

## 4. Match flow: Map Board → Ban Reveal → Map Intro → HUD

A persistent top frame (team plates + center crest) stays mounted across these scenes and **morphs** (position/scale transitions on the shared elements) instead of cutting. Ban wings hide on scenes where bans are shown bigger elsewhere.

**Map Board (`map-pick.html`)** — approved v4 + live-map-bans variant:
- Header: one aligned row — team logo/name/score chips flanking the neon pinwheel crest (hub centered on the name line), event title + gradient underline hanging below the crest.
- 5 (or BOx) map columns on the petal texture: high-res map art, `MAP n · MODE` chip, winner columns get team-color border/wash + circled winner logo + map score, live column gets white glow border + LIVE chip (name ~40px air), decider dimmed "IF NEEDED".
- Footer per column: map name (~34px air) + team-color picker pill (`FIRE PICK · WON` / `THUNDER PICK` / `DECIDER`).
- Hero bans appear **only on the live column**, ~84px tiles, appearing as they lock in.
- Dynamic column count follows series length, same pattern the ban panels use.

**Ban Reveal (`hero-bans.html`, upgraded)** — full-screen beat after bans lock, EWC-style:
- Petal texture, team-color washes bleeding in from each side, HERO BANS + map context under a small crest.
- **Base layout: one banned hero per team** (current norm in most divisions) — two large face-off render panels. Layout scales to N bans per team by splitting each side, map-column style.
- Panel: full-body hero render, team-color bottom wash, red slash sweep, BANNED chip, role icon + hero name plate (~34px).
- Entrance: panels slam in from their team's side, slash sweeps, names punch in. Holds 10–15s.

**Map Intro (`map-intro.html`)** — over the flythrough video, replacing the white card:
- Top frame stays mounted (continuity from HUD; ban wings hidden here).
- Lower deck: ban render tiles flanking a dark score deck — team logos + names, `ATTACK FIRST` / `MAP PICK` tags, series score around a mini pinwheel hub.
- Chips above: `MATCH POINT` (when applicable) + `MAP n · NAME · MODE`.
- Map name/mode always resolve via the shared current-map helper (kills the two stale-map-name bug reports).

## 5. Caster & cam scenes

Applies to `casters.html`, `casters-lobby.html`, `casters-scoreboard.html`, `casters-map-score.html`, `casters-flythrough-hud.html`, `between-matches.html`, `interview.html` — every scene with a cam.

- **Layout A skeleton**: cams as **transparent cutouts** (overlay = frame; caster sources sit behind). Frame: hairline border, gradient-underline base edge, name pill hanging off the frame bottom.
- Two equal cams high-center for the standard desk; variants keep the same skeleton and swap the deck below: matchup/series deck (casters), scoreboard panel, lobby bans panel, map-score strip, schedule row (between-matches).
- Petal texture background everywhere; event header with gradient underline top-center.
- Cam window coordinates are canonical constants shared between overlay CSS and scene collection v2, so producer cam sources snap exactly behind the cutouts. Existing constraint honored: overlay panels must not move cam slots after render (`fitPanelToCanvas()` zoom rule).
- `between-matches.html` event title gets `max-width` + fit-to-box (fixes the overflow bug by design).

## 6. Full-screen scenes

All on petal texture + Geist + gradient underline system, entrance animations via the existing replay mechanism:

- **Starting soon / BRB / End of stream**: big Geist heading, countdown (large mono digits), schedule (starting-soon), socials row. Timer UI honors the countdown-mode fixes (dashboard bug batch).
- **Series winner**: winner-color pinwheel spins up + petal glow burst behind winning team logo/name; score line beneath.
- **Interview / Lower third**: pill + underline language, role/team chips from the site's chip vocabulary.
- **Stinger (`stinger-transition.html`)**: real branded stinger — full-size neon pinwheel spin-wipe with gradient trail sweeping the frame, replacing the placeholder "E". Wired as the OBS stinger transition in scene collection v2. HTML/CSS implementation first; optional WebM render later if producers want OBS-native stinger files.

## 7. Transitions & animation model

- Scene-to-scene: branded stinger (above) for hard switches.
- Within the match-flow scenes: persistent top frame elements morph (translate/scale) between their per-scene positions — this is the "scene morphs into the next" effect. Implemented by keeping shared elements in each overlay at coordinated coordinates and animating on scene activation (existing `state-sync.js` visibility replay drives it; no OBS plugins required).
- Entrance animations per scene stay on the existing replay system (`animations.css` + `state-sync.js`); tightened timings, staggered panel entrances (`.delay-*`).
- Idle life: subtle petal-glow breathing on live elements (live map petal/pip, score on change), respecting "no retained transforms on page wrappers".

## 8. Plumbing prerequisites

- **Asset pack** (bundled, served locally — OBS constraint: no CDN hotlinks, use existing proxy/inline rules):
  - High-res map images for all OW2 maps (fixes blurry King's Row/Antarctic; replaces OverFast screenshots as primary, OverFast stays fallback).
  - Full-body hero renders for Ban Reveal / Map Intro (portraits keep flowing through the heroes API for tiles).
  - Geist Sans woff2, regenerated petal-linework SVG, ELMT_BG texture.
- **Current-map helper** in `theme-helpers.js`: `current || next upcoming || last played` — used by every overlay (replaces the `status==='current' || maps[0]` pattern in map-intro/map-pick/gameplay-hud). Kills both stale-map-name reports.
- **Manual maps get images**: `addMap()` resolves the map's image from the local pack instead of `image: ''`.
- **Team color extraction**: vibrancy-biased dominant-color pick (prefer saturated/bright clusters, reject near-black/near-gray, fallback to element accent), server stops overwriting colors on the 15s FACEIT poll, "Auto from logo" un-tick persists (dashboard bug batch). Package depends on this.
- **Scene collection v2** (`data/obs-scene-collection*.json`): new cam source positions behind cutouts, stinger transition wired, versioned with a one-time producer re-import note (approved).
- All overlay work honors existing OBS constraints: ES2019-safe JS, `proxyImg()` for remote images, `lastRenderKey` reset for late async data, `{root}` on `sendFile`, no overlay reloads on scene switch.

## 9. Explicitly deferred

- New scenes (player spotlight, standings/bracket, MVP, sponsor rotator) — revisit after the redesign ships.
- WebM-rendered stinger file (HTML stinger ships first).
- Any live per-player game data (ult/HP) — not available externally; the game's spectator UI renders that layer.

## 10. Related but separate: bug batch

Tracked as tasks #4–#5 (this session's triage; not part of this spec's scope but several overlay bugs are absorbed by the redesign above): countdown-until timer mode, FACEIT link lost on tab switch, 15s poll clobbering `maps`/`score`/`color` overrides, "Auto from logo" reset, clear-bans nuking the chosen map. The dashboard bug batch should land **before** the redesign so the new package launches on stable plumbing.

## 11. Rollout

1. Dashboard/server bug batch (tasks #4–#5 where not absorbed here).
2. Design-system foundation: tokens + texture + type + pinwheel component in `theme-helpers.js` / shared CSS.
3. Gameplay HUD, then Map Board / Ban Reveal / Map Intro (the match flow), then caster scenes + scene collection v2, then full-screens + stinger.
4. Producer re-import of scene collection v2 with migration note; version bump.
