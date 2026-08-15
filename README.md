# Elemental Production Companion

Desktop application for managing Overwatch esports broadcasts. Controls OBS scenes, overlays, and production elements from a single panel.

![Electron](https://img.shields.io/badge/Electron-41-47848F?logo=electron)
![Node](https://img.shields.io/badge/Node-20+-339933?logo=nodedotjs)
![License](https://img.shields.io/badge/License-Private-red)

## Features

- **Match Hub** — Team management, map picks, hero bans, scores
- **Scene Control** — One-click OBS scene switching with live preview thumbnails
- **Dynamic Overlays** — 15+ browser source overlays with real-time WebSocket sync
- **FACEIT Integration** — Auto-import match data, teams, and rosters
- **Replay System** — Save and cycle instant replay clips between maps
- **Media Management** — Map flythrough videos, map-specific music, background music
- **Caster Management** — Names, camera feeds, lobby overlays

## Download

Grab the latest release from the [Releases](https://github.com/Volence/elemental-production/releases) page:
- **Windows**: `Elemental.Production.Setup.x.x.x.exe`
- **Linux**: `Elemental.Production-x.x.x.AppImage`

## First-Time Setup

1. Download and run the app
2. Go to **Settings** → enter your OBS WebSocket password
3. Configure folder paths for flythrough videos (`.mp4`/`.webm`/`.mov`) and map music
4. **Settings → Season Map Pool** — tick the maps that are legal this league
   season (persisted; the Map Pool scene shows a configure hint until you do)
5. Download the OBS scene collection from **Settings → OBS Scene Setup**
   (Linux or Windows button) and import it: OBS → Scene Collection → Import.
   Migrating from an existing setup? See
   `docs/scene-collection-v2-migration.md` for the `--carry-from` flow that
   preserves your cam URLs and media file paths.
6. Set up the branded **stinger transition** — see below.
7. Check the **pre-flight checklist** at the top of Production Controls
   before going live — it verifies OBS, scene sources, casters, music,
   flythroughs, and the map pool in one glance.

## Stinger Transition

The ELMT stinger is a 1.3s branded wipe (two counter-spinning pinwheels, a
four-colour trail band, and an `ELMT` wordmark) that plays *over* the cut
between two scenes. It ships pre-rendered as a transparent VP9 WebM so OBS can
drive it natively — replacing the old workaround, where
`stinger-transition.html` was added as its own scene and producers manually cut
to it and back out again once the animation had played.

1. **Settings → OBS Browser Source URLs → 🎬 Stinger (WebM)** → **⬇ Download**
   (saves `stinger-transition.webm`).
2. OBS → **Scene Transitions** dock → **+** → **Stinger** → **Video File** →
   the file you just downloaded.
3. **Transition Point: 550 ms** → **OK**, then select the stinger as the active
   transition. To use it for *specific* scene switches only, leave the default
   as Fade and right-click a scene in the **Scenes** dock → **Transition
   Override** → Stinger.

The transition point is the moment OBS swaps scenes underneath the stinger:
550 ms is where the animation covers the most screen, measured at render time.

### Re-rendering it

The WebM is generated from `overlays/stinger-transition.html`, which stays the
master reference. If the art changes, re-render and commit the result:

```bash
node scripts/render-stinger.mjs
```

Prerequisites: `google-chrome-stable` (headless, drives the capture over CDP)
and `ffmpeg`/`ffprobe` built with `libvpx-vp9` + `yuva420p`. ImageMagick
(`magick` or `convert`) is optional but recommended — without it the script
can't measure the coverage curve, so it falls back to the 550 ms default and
skips the alpha verification passes.

The script prints the measured transition point; keep it in sync with the number
shown in Settings (`STINGER_TRANSITION_POINT_MS` in `src/pages/Settings.jsx`)
and above. Note that every re-render commits a fresh ~4 MB binary into git
history, so re-render when the art actually changes, not to shave a few KB.
The WebM ships once, from `public/` — `vite build` also copies it into `dist/`,
which `package.json` `build.files` excludes so packaged installs carry a single
copy.

## Development

```bash
# Install dependencies
npm install

# Run in web dev mode (Vite + Express)
npm run dev

# Run in Electron dev mode
ELECTRON_RUN_AS_NODE= npm run electron:dev

# Build for distribution
npm run dist:linux   # Linux AppImage
npm run dist:win     # Windows NSIS installer
```

## Architecture

```
├── server/           # Express API + OBS WebSocket bridge
├── src/              # React frontend (Vite)
│   ├── main/         # Electron main process
│   └── pages/        # Panel UI pages
├── overlays/         # Browser source HTML overlays
├── data/             # OBS scene collection, state
└── public/           # Static assets, scene thumbnails
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop | Electron + electron-vite |
| Frontend | React 19, Vite 8 |
| Backend | Express 5, Node.js |
| OBS | obs-websocket-js |
| Build | electron-builder |
| CI/CD | GitHub Actions |
