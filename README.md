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
3. Configure folder paths for flythrough videos and map music
4. Import the OBS scene collection from `data/Elemental_Production.json`

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
