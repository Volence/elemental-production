# Producer Feedback Features — Design Spec

**Scope:** 5 features + 1 enhancement for the Elemental Production broadcast companion app.

1. Global Hotkeys
2. Connection Status Bar
3. Live Overlay Previews
4. Overlay Theming System (with dynamic team colors)
5. Flythrough Fallback Image

---

## 1. Global Hotkeys

### What it does
Registers system-wide keyboard shortcuts via Electron's `globalShortcut` module so producers can trigger actions without the app being focused — critical during live broadcasts when OBS or a game is in the foreground.

### Actions supported
- **Scene switching** — one hotkey per scene (13 scenes). Defaults: `Ctrl+Shift+1` through `Ctrl+Shift+=` (configurable).
- **Swap sides** — toggles `state.swapSides`. Default: `Ctrl+Shift+S`.

Timer and music controls are deprioritized — timer is used infrequently and music doesn't need hotkeys.

### Architecture

**Electron main process** (`src/main/index.js`):
- Import `globalShortcut` from `electron`.
- On `app.whenReady()`, after server starts, fetch hotkey config from server (`GET /api/hotkeys`).
- Register each binding via `globalShortcut.register(accelerator, callback)`.
- Callbacks send HTTP requests to the Express server (same as the UI does): `POST /api/obs/scene` for scene switching, `PATCH /api/state` for swap sides.
- On `window-all-closed`, call `globalShortcut.unregisterAll()`.

**Server** (`server/server.js`):
- `GET /api/hotkeys` — returns current hotkey configuration from state.
- `PUT /api/hotkeys` — saves updated hotkey bindings, responds with new config.

**State** (`server/state.js`):
- Add `hotkeys` to `defaultState`:
  ```js
  hotkeys: {
    sceneSwitch: {
      'Starting': 'Ctrl+Shift+1',
      'Map Pick': 'Ctrl+Shift+2',
      // ... etc
    },
    swapSides: 'Ctrl+Shift+S',
  }
  ```

**UI** (new section in Theming page):
- Table of action → keybinding with an edit button per row.
- Edit triggers a "press any key combo" capture modal.
- Conflict detection: warn if a binding is already in use.
- Save sends `PUT /api/hotkeys` and the main process re-registers.

**IPC for re-registration:**
- When hotkeys are saved via the API, the server notifies the Electron main process.
- Options: (a) main process polls `/api/hotkeys` periodically, (b) use Electron IPC via `process.send()` from the forked server, (c) main process watches the state file.
- Recommended: The main process fetches `/api/hotkeys` once on startup and re-fetches when the renderer sends an IPC message. Implementation:
  1. Create `src/main/preload.js` exposing a single method: `window.electronAPI = { reloadHotkeys: () => ipcRenderer.send('reload-hotkeys') }`.
  2. Set `preload: path.join(__dirname, 'preload.js')` in BrowserWindow `webPreferences`.
  3. In main process: `ipcMain.on('reload-hotkeys', () => { unregisterAll(); fetchAndRegister(); })`.
  4. In the Theming page, after saving hotkeys: `window.electronAPI?.reloadHotkeys()` (no-op when running in browser dev mode).

### Edge cases
- If the app loses focus and regains it, shortcuts remain registered (that's the point of `globalShortcut`).
- If a binding conflicts with a system shortcut, `globalShortcut.register()` returns `false` — surface this in the UI.
- Unregistering on quit prevents "ghost" shortcuts.

---

## 2. Connection Status Bar

### What it does
A persistent bottom bar across all pages showing live system health: OBS connection, FACEIT API reachability, and active overlay count.

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│  ● OBS Connected     ● FACEIT API OK     📺 14 overlays    │
└─────────────────────────────────────────────────────────────┘
```

- Green dot + "Connected" / Red dot + "Disconnected" for OBS.
- Green dot + "OK" / Red dot + "Unreachable" for FACEIT API.
- Overlay count: number of browser sources currently being served.

### Architecture

**Component:** New `StatusBar.jsx` component, rendered in `App.jsx` below `<main>`, outside the content area so it's always visible regardless of page.

**Data sources:**
- OBS status: already fetched in `App.jsx` via `GET /api/obs/status` → `obsConnected` state. Add polling every 5 seconds to keep it live.
- FACEIT API: new endpoint `GET /api/faceit/status` that does a lightweight ping to the FACEIT API (e.g., checks if the API key is valid). Poll every 30 seconds.
- Overlay count: new endpoint `GET /api/overlays/count` or include in an existing status endpoint. Counts active SSE connections or browser sources from the `BROWSER_SOURCES` map.

**Server additions:**
- `GET /api/faceit/status` — tries a simple FACEIT API call, returns `{ ok: true/false, error?: string }`.
- `GET /api/status` — combined endpoint returning `{ obs: bool, faceit: bool, overlayCount: number }` to reduce polling requests to one.

**Styling:**
- Fixed position at bottom of viewport, `height: 32px`, `z-index: 100`.
- Dark background matching sidebar (`var(--bg-secondary)`), subtle top border.
- Adjust `.main-content` bottom padding to account for the bar.

---

## 3. Live Overlay Previews

### What it does
Replaces the static PNG thumbnails in the Production Controls scene grid with live overlay previews on hover/expand.

### Behavior
1. **Default state:** Static PNG thumbnails (existing behavior, unchanged).
2. **Hover:** After hovering for 300ms (debounce to avoid accidental triggers), the static image crossfades to a live `<iframe>` rendering the actual overlay HTML at the current state.
3. **Leave:** iframe unmounts, returns to static thumbnail.
4. **Click:** Still switches the OBS scene (existing behavior).

### Architecture

**Iframe source:** Each overlay is already served at `/overlays/<name>.html` with state injection and `state-sync.js` polling. An iframe pointed at that URL gets a fully working live overlay — no new server work needed.

**Component changes** (`ProductionControls.jsx`):
- Add `hoveredScene` state tracking which card is hovered.
- On `mouseEnter` with 300ms timeout, set `hoveredScene`.
- On `mouseLeave`, clear timeout and `hoveredScene`.
- When `hoveredScene === name`, render an `<iframe>` instead of the `<img>`:
  ```jsx
  <iframe
    src={`http://localhost:3001/overlays/${overlayFile}.html`}
    style={{
      width: '1920px', height: '1080px',
      transform: `scale(${1/zoom})`, // scale down to thumbnail size
      transformOrigin: '0 0',
      border: 'none', pointerEvents: 'none',
    }}
  />
  ```
- The iframe container clips overflow and uses the same aspect ratio.

**Overlay file mapping:** Extend the existing `thumbFile` map to include overlay HTML filenames:
```js
const overlayFile = {
  'Starting': 'starting-soon',
  'Map Pick': 'map-pick',
  'Gameplay': 'gameplay-hud',
  // ... etc
}[name];
```

**Performance:**
- Only one iframe mounted at a time (the hovered one).
- `pointerEvents: 'none'` prevents the iframe from capturing clicks.
- `state-sync.js` inside the iframe polls every 1.5-2.5s — acceptable for a single preview.
- No iframes mounted when not hovering — zero overhead at rest.

### Edge cases
- Scenes without a corresponding overlay file (e.g., if OBS has custom scenes not in our map) fall back to static thumbnail or text label.
- If the server is down, the iframe shows a blank/error page — but so would the overlays in OBS, so this is actually useful diagnostic info.

---

## 4. Overlay Theming System

### What it does
A new "Theming" page in the sidebar that lets producers customize the visual appearance of all 17 overlay HTML files. Current hardcoded colors/fonts become the default theme, with full override capability.

### 4A. Theme Data Model

**State addition** (`server/state.js` → `defaultState`):
```js
theme: {
  // Global
  accentColor: '#f97316',
  accentGradient: ['#f97316', '#ef4444'],
  backgroundColor: 'rgba(10,10,20,0.9)',
  textColor: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.5)',
  fontFamily: 'Oswald',
  titleFontFamily: 'Bebas Neue',
  orgLogo: './org.png',
  backgroundImage: './ELMT_BG_1920x1080.png',

  // Rainbow bar
  rainbowBar: true,
  rainbowColors: ['#2563eb', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#f97316'],

  // Team colors (defaults match current hardcoded values)
  team1Color: '#3b82f6',
  team1ColorAuto: true,   // true = extract from logo
  team2Color: '#ef4444',
  team2ColorAuto: true,

  // Granular element colors
  countdownColor: '#ffffff',
  countdownLabelBg: ['#f97316', '#ef4444'],
  scheduleRowBg: 'rgba(15,15,25,0.85)',
  scheduleUpNextColor: '#f97316',
  scoreBg: 'rgba(12,15,18,0.92)',
  banLabelTeam1Bg: 'rgba(59,130,246,0.15)',
  banLabelTeam2Bg: 'rgba(239,68,68,0.15)',
  mapWinIndicatorTeam1: '#3b82f6',
  mapWinIndicatorTeam2: '#ef4444',
  lowerThirdBg: ['#f97316', '#ef4444'],
}
```

All current hardcoded values become defaults — existing look is preserved out of the box.

### 4B. Theme Delivery to Overlays

Overlays already receive full state via `state-sync.js` polling. Theme values are part of `state.theme`.

**Overlay-side consumption:** Each overlay's `update(state)` function reads `state.theme` and applies values:
- CSS custom properties injected into `:root` via JavaScript at the top of `update()`:
  ```js
  const t = state.theme || {};
  document.documentElement.style.setProperty('--accent', t.accentColor || '#f97316');
  document.documentElement.style.setProperty('--team1-color', t.team1Color || '#3b82f6');
  // ... etc
  ```
- Overlay CSS refactored to use `var(--accent)` instead of hardcoded `#f97316`, etc.
- Font family applied via inline style on body or relevant elements using `state.theme.fontFamily`.

This approach:
- Requires no server-side changes to overlay serving (state already injected).
- Updates in real-time as theme changes (state-sync polls every 1.5s).
- Each overlay only needs its CSS updated to reference variables instead of hardcoded values.

### 4C. Dynamic Team Colors from Logos

**Color extraction:**
- When a team logo URL is set and `team1ColorAuto` / `team2ColorAuto` is `true`, extract the dominant color.
- Implementation: In the Theming page component, load the logo image into a hidden `<canvas>`, sample pixels, find the most vibrant non-white/non-black color.
- Algorithm: Bucket pixel colors, filter out near-white (lightness > 0.85) and near-black (lightness < 0.15), pick the bucket with highest saturation * count.
- Store extracted color in `state.teams.team1.color` and `state.teams.team2.color`.
- If auto-extract is on and user hasn't overridden, the extracted color flows through to overlays automatically.

**Manual override integration:**
- Works with existing override system. When user manually picks a team color in Theming, it sets `team1ColorAuto: false` and stores the manual color.
- The override chip shows "Team 1 Color" in the overrides panel.
- Clicking X on the chip sets `team1ColorAuto: true` and re-extracts from logo.
- Fallback when no logo: gray (`#6b7280`).

### 4D. Theming Page UI

**New sidebar entry:**
```js
{ id: 'theming', label: 'Theming', icon: '🎨' }
```

**Page layout sections:**

1. **Live Preview** — A small preview window showing a representative overlay (e.g., starting-soon) with current theme applied. Uses an iframe like the hover previews.

2. **Global Settings** — Accent color picker, font selectors (title + body), org logo upload, background image.

3. **Team Colors** — For each team: color swatch showing current color, "Auto from logo" toggle, manual color picker. Shows extracted color vs manual side by side when override is active.

4. **Element Colors** — Expandable sections grouped by overlay type:
   - Countdown & Timers (countdown text, label background)
   - Schedule & Scores (row background, up-next highlight, score background)
   - Bans & Picks (team label backgrounds, win indicators)
   - Lower Third (background gradient)
   - Decorative (rainbow bar toggle, rainbow colors)

5. **Presets** — Save/load named theme presets. "Default" preset is always available and matches current hardcoded values.

6. **Hotkeys** — Hotkey binding configuration table (from Feature 1).

### 4E. Overlay CSS Refactoring

Each overlay needs its hardcoded colors replaced with CSS variables. The variables are set by JavaScript from `state.theme` on each update.

**Variables to define (set in JS, consumed in CSS):**
```css
:root {
  --accent: #f97316;
  --accent-end: #ef4444;
  --team1-color: #3b82f6;
  --team1-color-alpha: rgba(59,130,246,0.15);
  --team2-color: #ef4444;
  --team2-color-alpha: rgba(239,68,68,0.15);
  --bg-overlay: rgba(10,10,20,0.9);
  --text-primary: #ffffff;
  --text-secondary: rgba(255,255,255,0.5);
  --font-title: 'Bebas Neue', sans-serif;
  --font-body: 'Oswald', sans-serif;
}
```

Overlays that already read `state.teams.teamX.color` (casters-scoreboard, map-pick, casters, casters-map-score, series-winner) continue to do so — those values will be populated by the theme system.

Overlays with hardcoded `#3b82f6` / `#ef4444` in CSS (gameplay-hud, hero-bans) need refactoring to use the CSS variables.

---

## 5. Flythrough Fallback Image

### What it does
When `getFlythroughUrl(mapName)` returns `null` (no matching flythrough video found), instead of leaving the previous map's flythrough showing, display a configurable fallback image.

### Architecture

**State addition** (`server/state.js` → `defaultState`):
```js
flythroughFallback: '',  // path to fallback image, empty = use default
```

Default fallback: `ELMT_BG_1920x1080.png` (the org background already used by other overlays).

**Server changes** (`server/server.js`):
- Where the server sets the Map Flythrough OBS media source, when `getFlythroughUrl()` returns `null`:
  - If `state.flythroughFallback` is set, use that image path.
  - Otherwise, use the bundled `ELMT_BG_1920x1080.png`.
  - Set the OBS media source to display the fallback image instead of leaving the stale video.

**Settings UI** (`Settings.jsx`, flythrough section):
- Below the flythrough directory picker, add a "Fallback Image" row.
- File picker button to choose a fallback image.
- Small preview of the current fallback.
- "Reset to default" button that clears back to the org background.

**OBS source handling:**
- The Map Flythrough source is a media source in OBS. For images, we can either:
  - (a) Use `SetInputSettings` to point the media source at the image file, or
  - (b) Use a separate OBS image source that shows/hides when no flythrough is found.
- Option (a) is simpler — media sources can display images. The server already calls `setMediaSource()` for videos; same call works for image files.

### Edge cases
- If the fallback image path is invalid/deleted, fall back to `ELMT_BG_1920x1080.png`.
- When a new map IS found after showing fallback, the media source switches to the video normally.

---

## Non-Goals (Explicitly Out of Scope)

- Music hotkeys
- Overlay toggle hotkeys
- Map cycling hotkeys
- VDO.ninja connection detection
- OBS screenshot-based previews (too heavy during broadcast)
- Periodic screenshot polling
- Multi-theme switching during broadcast (preset save/load is sufficient)

---

## Dependencies Between Features

- **Theming page** is the natural home for **hotkey configuration** (section 6 of the theming UI).
- **Live preview iframe** technique is shared between **overlay previews** (hover in Production) and **theming page** (live theme preview).
- **Team colors** from theming flow into overlays via existing `state.teams.teamX.color` — overlays that already read this need no changes for team colors specifically.
- **Flythrough fallback** is independent of all other features.

## Implementation Order

1. **Flythrough Fallback** — smallest, independent, fixes a visible bug
2. **Connection Status Bar** — small, independent, improves situational awareness
3. **Overlay Theming** — largest feature, but foundational (CSS variable refactoring enables future work)
4. **Live Overlay Previews** — depends on overlay HTML working correctly (benefits from theming CSS cleanup)
5. **Global Hotkeys** — requires Electron IPC additions, UI goes in Theming page
