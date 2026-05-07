# Producer Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Address 12 producer feedback items covering OBS scene collection improvements, UI fixes, and new features for the Elemental Production broadcast companion.

**Architecture:** Changes split into three tiers — JSON-only scene collection edits (Tasks 1-5), small targeted code changes in existing files (Tasks 6-9), and medium feature additions that touch both server and client (Tasks 10-12). No new files needed; all changes modify existing modules.

**Tech Stack:** Node.js/Express server, React 19 SPA, OBS WebSocket (obs-websocket-js), SSE for real-time overlay sync, Electron shell. No test framework — manual verification via dev server.

---

### Task 1: Lock All Sources in Both Scene Collections

**Files:**
- Modify: `data/obs-scene-collection.json` (all scene items)
- Modify: `data/obs-scene-collection-windows.json` (all scene items)

Prevents producers from accidentally moving/resizing sources in OBS.

- [ ] **Step 1: Run the lock script for Linux scene collection**

```bash
python3 -c "
import json
with open('data/obs-scene-collection.json') as f:
    data = json.load(f)
for source in data['sources']:
    if source.get('id') == 'scene':
        for item in source.get('settings', {}).get('items', []):
            item['locked'] = True
with open('data/obs-scene-collection.json', 'w') as f:
    json.dump(data, f, indent=2)
print('Done — locked all items in Linux collection')
"
```

- [ ] **Step 2: Run the lock script for Windows scene collection**

```bash
python3 -c "
import json
with open('data/obs-scene-collection-windows.json') as f:
    data = json.load(f)
for source in data['sources']:
    if source.get('id') == 'scene':
        for item in source.get('settings', {}).get('items', []):
            item['locked'] = True
with open('data/obs-scene-collection-windows.json', 'w') as f:
    json.dump(data, f, indent=2)
print('Done — locked all items in Windows collection')
"
```

- [ ] **Step 3: Verify**

```bash
python3 -c "
import json
for fname in ['data/obs-scene-collection.json', 'data/obs-scene-collection-windows.json']:
    with open(fname) as f:
        data = json.load(f)
    unlocked = 0
    for s in data['sources']:
        if s.get('id') == 'scene':
            for item in s.get('settings', {}).get('items', []):
                if not item.get('locked'):
                    unlocked += 1
                    print(f'UNLOCKED: {s[\"name\"]} → {item[\"name\"]}')
    if unlocked == 0:
        print(f'{fname}: all items locked ✓')
"
```

- [ ] **Step 4: Commit**

```bash
git add data/obs-scene-collection.json data/obs-scene-collection-windows.json
git commit -m "fix: lock all sources in OBS scene collections"
```

---

### Task 2: Move Background Music to Bottom of Source Lists

**Files:**
- Modify: `data/obs-scene-collection.json`
- Modify: `data/obs-scene-collection-windows.json`

In OBS, items are rendered top-to-bottom (first item in the `items` array is on top in the scene). Audio-only sources like Background Music should be at the bottom of the item list so they don't interfere with visual source ordering.

- [ ] **Step 1: Run the reorder script for both collections**

```bash
python3 -c "
import json

MUSIC_SOURCES = {'Background Music', 'Casters Background Music', 'Map Music'}

for fname in ['data/obs-scene-collection.json', 'data/obs-scene-collection-windows.json']:
    with open(fname) as f:
        data = json.load(f)
    for source in data['sources']:
        if source.get('id') == 'scene':
            items = source.get('settings', {}).get('items', [])
            non_music = [i for i in items if i['name'] not in MUSIC_SOURCES]
            music = [i for i in items if i['name'] in MUSIC_SOURCES]
            if music:
                source['settings']['items'] = non_music + music
                # Reassign item IDs to maintain order
                for idx, item in enumerate(source['settings']['items']):
                    item['id'] = idx + 1
    with open(fname, 'w') as f:
        json.dump(data, f, indent=2)
    print(f'{fname}: music sources moved to bottom')
"
```

- [ ] **Step 2: Verify music is last in each scene**

```bash
python3 -c "
import json
MUSIC = {'Background Music', 'Casters Background Music', 'Map Music'}
for fname in ['data/obs-scene-collection.json', 'data/obs-scene-collection-windows.json']:
    with open(fname) as f:
        data = json.load(f)
    print(f'\n=== {fname} ===')
    for s in data['sources']:
        if s.get('id') == 'scene':
            items = s.get('settings', {}).get('items', [])
            names = [i['name'] for i in items]
            music_at = [(idx, n) for idx, n in enumerate(names) if n in MUSIC]
            if music_at:
                last_non_music = max(i for i, n in enumerate(names) if n not in MUSIC)
                first_music = min(i for i, _ in music_at)
                ok = first_music > last_non_music
                print(f'  {s[\"name\"]:25s} {\"✓\" if ok else \"✗\"} music at {[i for i,_ in music_at]}')
"
```

- [ ] **Step 3: Commit**

```bash
git add data/obs-scene-collection.json data/obs-scene-collection-windows.json
git commit -m "fix: move music sources to bottom of scene item lists"
```

---

### Task 3: Set reroute_audio on Caster/Interviewee Browser Sources

**Files:**
- Modify: `data/obs-scene-collection.json`
- Modify: `data/obs-scene-collection-windows.json`

Browser sources with webcam feeds should have `reroute_audio: true` so their audio goes through OBS's audio mixer instead of being mixed directly into the scene output.

- [ ] **Step 1: Add reroute_audio to caster/interviewee sources**

```bash
python3 -c "
import json

REROUTE_SOURCES = {'Caster 1', 'Caster 2', 'Interviewee'}

for fname in ['data/obs-scene-collection.json', 'data/obs-scene-collection-windows.json']:
    with open(fname) as f:
        data = json.load(f)
    for source in data['sources']:
        if source.get('name') in REROUTE_SOURCES and 'browser_source' in source.get('versioned_id', source.get('id', '')):
            source['settings']['reroute_audio'] = True
            print(f'{fname}: {source[\"name\"]} → reroute_audio=true')
    with open(fname, 'w') as f:
        json.dump(data, f, indent=2)
"
```

- [ ] **Step 2: Verify**

```bash
python3 -c "
import json
for fname in ['data/obs-scene-collection.json', 'data/obs-scene-collection-windows.json']:
    with open(fname) as f:
        data = json.load(f)
    for s in data['sources']:
        if s.get('name') in ('Caster 1', 'Caster 2', 'Interviewee'):
            ra = s.get('settings', {}).get('reroute_audio')
            print(f'{fname}: {s[\"name\"]} reroute_audio={ra}')
"
```

- [ ] **Step 3: Commit**

```bash
git add data/obs-scene-collection.json data/obs-scene-collection-windows.json
git commit -m "fix: enable reroute_audio on caster/interviewee browser sources"
```

---

### Task 4: Bake Caster Cam Transforms Into All Scenes

**Files:**
- Modify: `data/obs-scene-collection.json`
- Modify: `data/obs-scene-collection-windows.json`

The scene collections currently have all caster cam items at default transforms (pos 0,0, scale 1,1). The real transforms were captured from the running OBS instance. This task bakes those values into the JSON so new installs get correct caster positions without manual adjustment.

Captured transforms from OBS (negative scale means intentionally hidden/off-screen in that scene):

| Scene | Source | pos x,y | scale x,y |
|---|---|---|---|
| Casters Flythrough | Caster 1 | 353, 270 | 0.2609, 0.2611 |
| Casters Flythrough | Caster 2 | 1074, 270 | 0.2609, 0.2611 |
| Casters | Caster 1 | 369, 377 | 0.2953, 0.2954 |
| Casters | Caster 2 | 980, 377 | 0.2974, 0.2972 |
| Casters Lobby | Caster 1 | 532, 105 | 0.2104, 0.2102 |
| Casters Lobby | Caster 2 | 977, 105 | 0.2099, 0.2102 |
| Casters Scoreboard | Caster 1 | 532, 105 | 0.2104, 0.2102 |
| Casters Scoreboard | Caster 2 | 977, 105 | 0.2099, 0.2102 |
| Map Score | Caster 1 | 73, 124 | 0.2057, 0.2056 |
| Map Score | Caster 2 | 71, 389 | 0.2057, 0.2056 |
| Gameplay | Caster 1 | 0, 0 | 1, 1 |
| Gameplay | Caster 2 | 0, 0 | 1, 1 |
| Map Pick | Caster 1 | 0, 0 | -0.089, -0.090 |
| Map Pick | Caster 2 | 0, 0 | -0.0896, -0.0898 |
| Map Intro | Caster 1 | 0, 0 | -0.075, -0.075 |
| Map Intro | Caster 2 | 0, 0 | -0.075, -0.075 |
| Series Winner | Caster 1 | 0, 0 | -0.1156, -0.1157 |
| Series Winner | Caster 2 | 0, 0 | -0.0693, -0.0694 |

- [ ] **Step 1: Apply caster cam transforms to both scene collections**

```bash
python3 -c "
import json

TRANSFORMS = {
    'Casters Flythrough': {
        'Caster 1': {'pos': {'x': 353, 'y': 270}, 'scale': {'x': 0.2609, 'y': 0.2611}},
        'Caster 2': {'pos': {'x': 1074, 'y': 270}, 'scale': {'x': 0.2609, 'y': 0.2611}},
    },
    'Casters': {
        'Caster 1': {'pos': {'x': 369, 'y': 377}, 'scale': {'x': 0.2953, 'y': 0.2954}},
        'Caster 2': {'pos': {'x': 980, 'y': 377}, 'scale': {'x': 0.2974, 'y': 0.2972}},
    },
    'Casters Lobby': {
        'Caster 1': {'pos': {'x': 532, 'y': 105}, 'scale': {'x': 0.2104, 'y': 0.2102}},
        'Caster 2': {'pos': {'x': 977, 'y': 105}, 'scale': {'x': 0.2099, 'y': 0.2102}},
    },
    'Casters Scoreboard': {
        'Caster 1': {'pos': {'x': 532, 'y': 105}, 'scale': {'x': 0.2104, 'y': 0.2102}},
        'Caster 2': {'pos': {'x': 977, 'y': 105}, 'scale': {'x': 0.2099, 'y': 0.2102}},
    },
    'Map Score': {
        'Caster 1': {'pos': {'x': 73, 'y': 124}, 'scale': {'x': 0.2057, 'y': 0.2056}},
        'Caster 2': {'pos': {'x': 71, 'y': 389}, 'scale': {'x': 0.2057, 'y': 0.2056}},
    },
    'Gameplay': {
        'Caster 1': {'pos': {'x': 0, 'y': 0}, 'scale': {'x': 1, 'y': 1}},
        'Caster 2': {'pos': {'x': 0, 'y': 0}, 'scale': {'x': 1, 'y': 1}},
    },
    'Map Pick': {
        'Caster 1': {'pos': {'x': 0, 'y': 0}, 'scale': {'x': -0.089, 'y': -0.090}},
        'Caster 2': {'pos': {'x': 0, 'y': 0}, 'scale': {'x': -0.0896, 'y': -0.0898}},
    },
    'Map Intro': {
        'Caster 1': {'pos': {'x': 0, 'y': 0}, 'scale': {'x': -0.075, 'y': -0.075}},
        'Caster 2': {'pos': {'x': 0, 'y': 0}, 'scale': {'x': -0.075, 'y': -0.075}},
    },
    'Series Winner': {
        'Caster 1': {'pos': {'x': 0, 'y': 0}, 'scale': {'x': -0.1156, 'y': -0.1157}},
        'Caster 2': {'pos': {'x': 0, 'y': 0}, 'scale': {'x': -0.0693, 'y': -0.0694}},
    },
}

for fname in ['data/obs-scene-collection.json', 'data/obs-scene-collection-windows.json']:
    with open(fname) as f:
        data = json.load(f)
    count = 0
    for source in data['sources']:
        if source.get('id') == 'scene' and source['name'] in TRANSFORMS:
            scene_transforms = TRANSFORMS[source['name']]
            for item in source.get('settings', {}).get('items', []):
                if item['name'] in scene_transforms:
                    t = scene_transforms[item['name']]
                    item['pos'] = t['pos']
                    item['scale'] = t['scale']
                    count += 1
    with open(fname, 'w') as f:
        json.dump(data, f, indent=2)
    print(f'{fname}: updated {count} caster items')
"
```

- [ ] **Step 2: Verify key scenes have non-default transforms**

```bash
python3 -c "
import json
for fname in ['data/obs-scene-collection.json']:
    with open(fname) as f:
        data = json.load(f)
    for s in data['sources']:
        if s.get('id') == 'scene' and s['name'] in ('Casters', 'Casters Lobby', 'Map Score'):
            items = s.get('settings', {}).get('items', [])
            casters = [i for i in items if i['name'].startswith('Caster')]
            for c in casters:
                print(f'{s[\"name\"]:25s} {c[\"name\"]}: pos=({c[\"pos\"][\"x\"]},{c[\"pos\"][\"y\"]}) scale=({c[\"scale\"][\"x\"]},{c[\"scale\"][\"y\"]})')
"
```

Expected: Casters scene has Caster 1 at (369,377) and Caster 2 at (980,377), etc.

- [ ] **Step 3: Commit**

```bash
git add data/obs-scene-collection.json data/obs-scene-collection-windows.json
git commit -m "fix: bake caster cam transforms into scene collections"
```

---

### Task 5: Set Game Capture to Window Mode (Windows Collection Only)

**Files:**
- Modify: `data/obs-scene-collection-windows.json`

The Windows collection uses `game_capture` for the Overwatch source. It's currently set to `any_fullscreen` which can grab the wrong window. Change to `window` capture mode with `"capture_mode": "window"`.

- [ ] **Step 1: Update game capture settings**

```bash
python3 -c "
import json
with open('data/obs-scene-collection-windows.json') as f:
    data = json.load(f)
for source in data['sources']:
    if source.get('name') == 'Overwatch' and 'game_capture' in source.get('versioned_id', source.get('id', '')):
        source['settings']['capture_mode'] = 'window'
        print(f'Overwatch game_capture → capture_mode=window')
        print(f'Full settings: {json.dumps(source[\"settings\"], indent=2)}')
with open('data/obs-scene-collection-windows.json', 'w') as f:
    json.dump(data, f, indent=2)
"
```

- [ ] **Step 2: Commit**

```bash
git add data/obs-scene-collection-windows.json
git commit -m "fix: set Windows game capture to window mode"
```

---

### Task 6: Map Tiebreaker Visual Distinction

**Files:**
- Modify: `src/pages/MatchHub.jsx:427-530` (map display section)

Maps added beyond the bestOf count should show a "TIEBREAKER" tag with a dashed border. No blocking — producers can always add maps (FACEIT tiebreaker scenarios require this flexibility). In scrim mode (`state.mode === 'scrim'`), bestOf auto-tracks map count, so tiebreaker labels don't apply.

- [ ] **Step 1: Add tiebreaker visual to map slots**

Three changes inside the `state.maps.map((m, i) => {` block in `src/pages/MatchHub.jsx`:

**1a.** At line 431, before `return (`, add:

```jsx
              const isTiebreaker = state.mode !== 'scrim' && i >= state.bestOf;
```

**1b.** In the existing `style` prop on the map-slot div (line 450-456), add the tiebreaker border:

Current style:
```jsx
                  style={{
                    cursor: 'pointer',
                    outline: isSelected ? '3px solid #22c55e' : 'none',
                    outlineOffset: -2,
                    boxShadow: isSelected ? '0 0 12px rgba(34,197,94,0.3), inset 0 0 12px rgba(34,197,94,0.1)' : 'none',
                    transition: 'outline 0.2s, box-shadow 0.2s',
                  }}
```

New style:
```jsx
                  style={{
                    cursor: 'pointer',
                    outline: isSelected ? '3px solid #22c55e' : 'none',
                    outlineOffset: -2,
                    boxShadow: isSelected ? '0 0 12px rgba(34,197,94,0.3), inset 0 0 12px rgba(34,197,94,0.1)' : 'none',
                    transition: 'outline 0.2s, box-shadow 0.2s',
                    ...(isTiebreaker ? { border: '2px dashed #b8860b' } : {}),
                  }}
```

**1c.** Right after the `<div className="map-mode">` element (line 460), add the tiebreaker tag:

```jsx
                  {isTiebreaker && (
                    <div style={{
                      fontSize: '0.55rem', fontWeight: 700, letterSpacing: '1px',
                      color: '#b8860b', textTransform: 'uppercase', marginTop: 2,
                    }}>TIEBREAKER</div>
                  )}
```

- [ ] **Step 2: Verify in browser**

Run: `npm run dev`

In the Match Hub, set bestOf to BO1 and add 3 maps. Maps 2 and 3 should have dashed gold borders and "TIEBREAKER" labels. Map 1 should look normal. Switch to Scrim mode — all tiebreaker labels should disappear.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MatchHub.jsx
git commit -m "feat: add tiebreaker visual for maps beyond bestOf count"
```

---

### Task 7: Prevent Duplicate Hero Bans Across Teams

**Files:**
- Modify: `src/pages/MatchHub.jsx:143-154` (toggleBan function)

Currently `toggleBan()` only checks the current team's bans when toggling. A hero banned by team1 can also be banned by team2. Fix: check `allBans` (both teams combined) before allowing a new ban.

- [ ] **Step 1: Update toggleBan to check both teams**

In `src/pages/MatchHub.jsx`, replace the `toggleBan` function (lines 143-154):

Current:
```jsx
  const toggleBan = (heroKey) => {
    const bans = { ...state.heroBans };
    const teamBans = [...(bans[banTeam] || [])];
    const idx = teamBans.indexOf(heroKey);
    if (idx >= 0) {
      teamBans.splice(idx, 1);
    } else {
      teamBans.push(heroKey);
    }
    bans[banTeam] = teamBans;
    updateState({ heroBans: bans });
  };
```

New:
```jsx
  const toggleBan = (heroKey) => {
    const bans = { ...state.heroBans };
    const teamBans = [...(bans[banTeam] || [])];
    const idx = teamBans.indexOf(heroKey);
    if (idx >= 0) {
      teamBans.splice(idx, 1);
    } else {
      const otherTeam = banTeam === 'team1' ? 'team2' : 'team1';
      if ((bans[otherTeam] || []).includes(heroKey)) return;
      teamBans.push(heroKey);
    }
    bans[banTeam] = teamBans;
    updateState({ heroBans: bans });
  };
```

The only change is adding the 3 lines after `} else {` that check whether the other team already banned this hero. If so, the function returns early (no-op).

- [ ] **Step 2: Verify in browser**

In Match Hub, switch to Hero Bans. Ban "Ana" for Team 1. Switch to Team 2 and click "Ana" — nothing should happen. Click a different hero — it should ban normally. Switch back to Team 1 and un-ban Ana — now Team 2 should be able to ban Ana.

- [ ] **Step 3: Commit**

```bash
git add src/pages/MatchHub.jsx
git commit -m "fix: prevent same hero being banned by both teams"
```

---

### Task 8: Timer Display Updates Immediately on Value Change

**Files:**
- Modify: `src/pages/ProductionControls.jsx:523-536` (countdown display and input)

Currently, changing the timer minutes input only updates `timerMinutes` local state. The countdown display shows `state.countdown.remaining` which only changes when Start is pressed. The producer expects to see the display update as they type.

- [ ] **Step 1: Update countdown display to show timerMinutes when idle**

In `src/pages/ProductionControls.jsx`, the countdown display is at line 523-525:

Current:
```jsx
        <div className="countdown-display" style={{ marginTop: 8 }}>
          {formatTime(state.countdown.remaining || 0)}
        </div>
```

New:
```jsx
        <div className="countdown-display" style={{ marginTop: 8 }}>
          {formatTime(timerRunning || timerPaused ? state.countdown.remaining : timerMinutes * 60)}
        </div>
```

When the timer is running or paused, show the server's remaining time (active countdown). When idle (not running, not paused), show the local `timerMinutes` value converted to seconds.

`timerRunning` is `state.countdown.running` (line 108). `timerPaused` is `!timerRunning && state.countdown.remaining > 0 && remaining < duration` (line 109).

- [ ] **Step 2: Verify in browser**

Run the dev server. In Production Controls, the timer should show `05:00`. Change the minutes input to 10 — display should immediately show `10:00`. Change to 3 — shows `03:00`. Press Start — countdown begins from 3:00 and ticks down. Change the input while running — display should still show the live countdown, not the input value.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ProductionControls.jsx
git commit -m "fix: timer display updates immediately when changing minutes"
```

---

### Task 9: Add Hide Timer Toggle

**Files:**
- Modify: `server/state.js:32` (add `visible` to countdown default state)
- Modify: `src/pages/ProductionControls.jsx:520-550` (add toggle button to timer UI)
- Modify: `overlays/starting-soon.html:183-200` (respect `countdown.visible` flag)

Producers want to hide the timer on certain scenes (like BRB) without stopping it. Add a `visible` flag to the countdown state.

- [ ] **Step 1: Add `visible` to default countdown state**

In `server/state.js`, line 32, the current countdown default:

```js
  countdown: { duration: 300, remaining: 0, running: false, label: 'Starting Soon' },
```

Change to:

```js
  countdown: { duration: 300, remaining: 0, running: false, label: 'Starting Soon', visible: true },
```

- [ ] **Step 2: Add toggle button to timer controls**

In `src/pages/ProductionControls.jsx`, find the timer controls section. After the Reset button (line 549):

```jsx
          <button className="btn btn-ghost btn-sm" onClick={() => fetch(`${api}/api/timer/reset`, { method: 'POST' })}>↺ Reset</button>
```

Add:

```jsx
          <button
            className={`btn btn-sm ${state.countdown.visible === false ? 'btn-danger' : 'btn-ghost'}`}
            onClick={() => updateState({ countdown: { ...state.countdown, visible: !state.countdown.visible } })}
            title={state.countdown.visible === false ? 'Timer is hidden on overlays' : 'Hide timer on overlays'}
          >{state.countdown.visible === false ? '👁️‍🗨️ Hidden' : '👁️ Visible'}</button>
```

Note: We check `=== false` rather than `!state.countdown.visible` because existing state objects won't have the `visible` field, and we want the default behavior (no field = visible).

- [ ] **Step 3: Update overlay to respect visible flag**

In `overlays/starting-soon.html`, find the countdown timer rendering. The timer element is created in the DOM build (around line 230 in the built HTML). Find where the countdown timer text is set.

The timer display is in the `update()` function. After the line that sets the countdown text (around line 197: `timerEl.textContent = formatTime(localRemaining);`), the timer section visibility needs to be controlled.

The countdown section is built in the `buildKey`-gated DOM rebuild. Look for where `countdown-timer` is created. It's inside a template literal. The approach: in the `update()` function, after updating the timer text, hide/show the timer container based on `state.countdown.visible`.

Add after line 198 (after the `timerEl.textContent` update, before `return;`):

```javascript
      var timerSection = document.getElementById('countdown-section');
      if (timerSection) {
        timerSection.style.display = (state.countdown.visible === false) ? 'none' : '';
      }
```

Also need to add `id="countdown-section"` to the timer wrapper in the DOM template. Find the countdown section in the template literal (around line 230-240). The countdown HTML looks like:

```html
<div class="countdown-section">
```

Add the id attribute: `<div class="countdown-section" id="countdown-section">`.

Search the file for `countdown-section` to find the exact location.

- [ ] **Step 4: Verify in browser**

Start the dev server. Open the Starting Soon overlay in a browser tab. The timer should be visible. In Production Controls, click the "Visible" toggle — it should change to "Hidden" with red background. The overlay's timer section should disappear. Toggle back — timer reappears. Start a countdown, toggle visibility off — timer disappears but countdown continues running. Toggle back on — timer shows current remaining time.

- [ ] **Step 5: Commit**

```bash
git add server/state.js src/pages/ProductionControls.jsx overlays/starting-soon.html
git commit -m "feat: add hide/show toggle for countdown timer on overlays"
```

---

### Task 10: Unsaved Changes Warning on Settings Tab Switch

**Files:**
- Modify: `src/App.jsx:22-24,120-128` (page state and tab click handler)
- Modify: `src/pages/Settings.jsx:14-34` (expose dirty flag)

When producers edit settings (OBS host, music directory, etc.) and click another tab without saving, changes are lost silently. Add a confirmation dialog before switching away from Settings with unsaved changes.

- [ ] **Step 1: Add dirty tracking to Settings**

In `src/pages/Settings.jsx`, the component receives props and has local state for form fields. We need to track whether any field has been modified from its initial/saved value.

Add a `dirty` state and expose it via a callback prop. At the top of the Settings component (after line 34, after the existing `useState` declarations):

```jsx
  const [dirty, setDirty] = useState(false);
```

The Settings component needs to call a parent callback when dirty changes. Add `onDirtyChange` to the destructured props on line 14:

Current:
```jsx
export default function Settings({ state, updateState, api, obsConnected, setObsConnected, customFonts, setCustomFonts }) {
```

New:
```jsx
export default function Settings({ state, updateState, api, obsConnected, setObsConnected, customFonts, setCustomFonts, onDirtyChange }) {
```

Track dirtiness: any time a local-only field changes (bgMusicDir, flythroughDir, mapMusicDir, obsHost, obsPort, obsPassword), set dirty. When a save action completes (saveBgMusicDir, saveFlythrough, etc.), clear dirty.

The simplest approach: wrap the existing `setBgMusicDir`, `setFlythroughDir`, `setMapMusicDir` calls. Add a helper after the `dirty` state:

```jsx
  const markDirty = () => {
    if (!dirty) {
      setDirty(true);
      onDirtyChange?.(true);
    }
  };
  const clearDirty = () => {
    setDirty(false);
    onDirtyChange?.(false);
  };
```

Then add `markDirty()` calls to the `onChange` handlers for the directory inputs. There are three directory text inputs:
- Flythrough dir (line ~180): `onChange={e => setFlythroughDir(e.target.value)}` → `onChange={e => { setFlythroughDir(e.target.value); markDirty(); }}`
- Map music dir (line ~260): `onChange={e => setMapMusicDir(e.target.value)}` → `onChange={e => { setMapMusicDir(e.target.value); markDirty(); }}`
- Background music dir (line 403): `onChange={e => setBgMusicDir(e.target.value)}` → `onChange={e => { setBgMusicDir(e.target.value); markDirty(); }}`

And call `clearDirty()` in the success paths of `saveBgMusicDir`, `saveFlythroughDir`, `saveMapMusicDir`.

Find each save function and add `clearDirty()` after the successful response. For example, the bg music save handler calls `setBgMusicSaving(false)` on success — add `clearDirty()` right after.

- [ ] **Step 2: Add confirmation to tab switch in App.jsx**

In `src/App.jsx`, add state for Settings dirty flag and a guarded page setter.

After line 27 (`const [customFonts, setCustomFonts] = useState([]);`), add:

```jsx
  const [settingsDirty, setSettingsDirty] = useState(false);
```

Replace the tab click handler. Current (line 124):

```jsx
              onClick={() => setPage(p.id)}
```

New:

```jsx
              onClick={() => {
                if (page === 'settings' && settingsDirty && p.id !== 'settings') {
                  if (!confirm('You have unsaved changes in Settings. Leave anyway?')) return;
                  setSettingsDirty(false);
                }
                setPage(p.id);
              }}
```

Then pass `onDirtyChange` to the Settings component. Find where `<Settings` is rendered (around line 147):

Current:
```jsx
        {page === 'settings' && <Settings state={state} updateState={updateState} api={API} obsConnected={obsConnected} setObsConnected={setObsConnected} customFonts={customFonts} setCustomFonts={setCustomFonts} />}
```

New:
```jsx
        {page === 'settings' && <Settings state={state} updateState={updateState} api={API} obsConnected={obsConnected} setObsConnected={setObsConnected} customFonts={customFonts} setCustomFonts={setCustomFonts} onDirtyChange={setSettingsDirty} />}
```

- [ ] **Step 3: Verify in browser**

In Settings, type something in the Background Music directory input. Click the "Match Hub" tab — a browser confirm dialog should appear. Click Cancel — stays on Settings. Click OK — navigates to Match Hub. Save the directory first, then click Match Hub — no dialog.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/pages/Settings.jsx
git commit -m "feat: warn on unsaved Settings changes when switching tabs"
```

---

### Task 11: Fix Timer Countdown Jitter

**Files:**
- Modify: `server/server.js:285-310` (countdown interval — add `startedAt` timestamp)
- Modify: `server/server.js:1322-1365` (timer API endpoints — include `startedAt` in state)
- Modify: `server/state.js:32` (add `startedAt` to countdown defaults)
- Modify: `overlays/starting-soon.html:150-200` (use `startedAt` for smooth client-side countdown)

**Root cause:** The server ticks every 1s and broadcasts `remaining` on each tick. The overlay also ticks locally every 1s. But the `update()` function sets `localRemaining = serverRemaining` on **every** SSE state event — not just timer events. When other state changes trigger broadcasts between local ticks, the timer visually jumps.

**Fix:** Instead of broadcasting a ticking `remaining` value, broadcast `startedAt` (epoch timestamp when the timer was started) and `duration`. The overlay computes remaining time from `now - startedAt`, eliminating drift entirely. The server still ticks to update `remaining` in the state (for the control panel display), but the overlay ignores `remaining` and computes its own.

- [ ] **Step 1: Add `startedAt` to default state**

In `server/state.js`, line 32:

Current:
```js
  countdown: { duration: 300, remaining: 0, running: false, label: 'Starting Soon', visible: true },
```

(After Task 9 adds `visible`.) Change to:

```js
  countdown: { duration: 300, remaining: 0, running: false, label: 'Starting Soon', visible: true, startedAt: null },
```

`startedAt` is the epoch timestamp (ms) when the timer was started. On resume, it's backdated so `duration - (now - startedAt)/1000 = remaining`.

- [ ] **Step 2: Update server countdown functions**

In `server/server.js`, replace `startCountdown` and `stopCountdown` (lines 288-310).

Design:
- `duration` stays as the original timer length (never changes mid-cycle, needed for stop/reset)
- `startedAt` is the epoch ms when the timer was started/resumed
- On **resume**, backdate `startedAt` to `Date.now() - (duration - remaining) * 1000` so `duration - (now - startedAt)/1000 = remaining`
- The overlay computes its own remaining from `duration` and `startedAt`, eliminating jitter

Current:
```js
function startCountdown() {
  stopCountdown();
  const state = getState();
  setState({ countdown: { ...state.countdown, running: true } });
  countdownInterval = setInterval(() => {
    const s = getState();
    if (s.countdown.remaining <= 0) {
      stopCountdown();
      return;
    }
    setState({ countdown: { ...s.countdown, remaining: s.countdown.remaining - 1 } });
    const updated = getState();
    broadcast('state', updated);
    syncToOBS(updated);
  }, 1000);
}

function stopCountdown() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
  const s = getState();
  setState({ countdown: { ...s.countdown, running: false } });
}
```

New:
```js
function startCountdown() {
  stopCountdownInterval();
  countdownInterval = setInterval(() => {
    const cur = getState();
    if (!cur.countdown.running || !cur.countdown.startedAt) return;
    const elapsed = (Date.now() - cur.countdown.startedAt) / 1000;
    const newRemaining = Math.max(0, Math.round(cur.countdown.duration - elapsed));
    setState({ countdown: { ...cur.countdown, remaining: newRemaining } });
    const updated = getState();
    broadcast('state', updated);
    syncToOBS(updated);
    if (newRemaining <= 0) {
      stopCountdownInterval();
      setState({ countdown: { ...getState().countdown, running: false, startedAt: null } });
      broadcast('state', getState());
    }
  }, 1000);
}

function stopCountdownInterval() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = null;
}
```

- [ ] **Step 3: Update timer API endpoints**

In `server/server.js`, replace the timer endpoints (lines 1322-1365):

```js
app.post('/api/timer/start', (req, res) => {
  const { duration, label } = req.body;
  const d = duration || getState().countdown.duration;
  setState({
    countdown: {
      ...getState().countdown,
      duration: d,
      remaining: d,
      running: true,
      startedAt: Date.now(),
      label: label || 'Starting Soon',
    },
  });
  startCountdown();
  broadcast('state', getState());
  res.json({ success: true });
});

app.post('/api/timer/stop', (req, res) => {
  stopCountdownInterval();
  const s = getState();
  setState({
    countdown: { ...s.countdown, remaining: s.countdown.duration, running: false, startedAt: null },
  });
  broadcast('state', getState());
  res.json({ success: true });
});

app.post('/api/timer/pause', (req, res) => {
  stopCountdownInterval();
  const s = getState();
  const elapsed = s.countdown.startedAt ? (Date.now() - s.countdown.startedAt) / 1000 : 0;
  const remaining = Math.max(0, Math.round(s.countdown.duration - elapsed));
  setState({
    countdown: { ...s.countdown, remaining, running: false, startedAt: null },
  });
  broadcast('state', getState());
  res.json({ success: true });
});

app.post('/api/timer/resume', (req, res) => {
  const s = getState();
  if (s.countdown.remaining > 0) {
    setState({
      countdown: {
        ...s.countdown,
        running: true,
        startedAt: Date.now() - (s.countdown.duration - s.countdown.remaining) * 1000,
      },
    });
    startCountdown();
    broadcast('state', getState());
  }
  res.json({ success: true });
});

app.post('/api/timer/reset', (req, res) => {
  stopCountdownInterval();
  const s = getState();
  setState({
    countdown: { ...s.countdown, remaining: s.countdown.duration, running: false, startedAt: null },
  });
  broadcast('state', getState());
  res.json({ success: true });
});
```

- [ ] **Step 4: Update overlay to compute remaining from startedAt**

In `overlays/starting-soon.html`, replace the client-side countdown logic (lines 153-166 and the sync logic in `update()` at lines 183-199):

Replace the entire countdown section (lines 153-166):
```javascript
    let localRemaining = 0;
    let countdownRunning = false;
    let tickInterval = null;

    function startLocalTick() {
      if (tickInterval) return;
      tickInterval = setInterval(function() {
        if (!countdownRunning || localRemaining <= 0) return;
        localRemaining = Math.max(0, localRemaining - 1);
        var t = document.getElementById('countdown-timer');
        if (t) t.textContent = formatTime(localRemaining);
      }, 1000);
    }
```

With:
```javascript
    let countdownDuration = 0;
    let countdownStartedAt = null;
    let countdownRunning = false;
    let tickInterval = null;

    function getRemaining() {
      if (!countdownRunning || !countdownStartedAt) return countdownDuration;
      var elapsed = (Date.now() - countdownStartedAt) / 1000;
      return Math.max(0, Math.round(countdownDuration - elapsed));
    }

    function startLocalTick() {
      if (tickInterval) return;
      tickInterval = setInterval(function() {
        if (!countdownRunning) return;
        var remaining = getRemaining();
        var t = document.getElementById('countdown-timer');
        if (t) t.textContent = formatTime(remaining);
      }, 200);
    }
```

Note: tick interval is 200ms (not 1000ms) for smoother display transitions at second boundaries.

Then in the `update()` function, replace the sync lines (around lines 185-191):

Current:
```javascript
      const serverRemaining = state.countdown?.remaining || 0;
      localRemaining = serverRemaining;
      countdownRunning = !!(state.countdown?.running);
      startLocalTick();
```

With:
```javascript
      countdownDuration = state.countdown?.duration || 0;
      countdownStartedAt = state.countdown?.startedAt || null;
      countdownRunning = !!(state.countdown?.running);
      if (!countdownRunning) {
        countdownDuration = state.countdown?.remaining || 0;
        countdownStartedAt = null;
      }
      startLocalTick();
```

And update the timer display update below (around line 197):

Current:
```javascript
        timerEl.textContent = formatTime(localRemaining);
```

With:
```javascript
        timerEl.textContent = formatTime(getRemaining());
```

- [ ] **Step 5: Verify in browser**

Open the Starting Soon overlay in a browser tab. Start a 5-minute timer from Production Controls. The overlay countdown should tick smoothly without jumps. While the timer runs, change something else (like event name) — the countdown should not jump or stutter. Pause the timer — overlay freezes at current time. Resume — countdown continues from where it paused.

- [ ] **Step 6: Commit**

```bash
git add server/state.js server/server.js overlays/starting-soon.html
git commit -m "fix: eliminate timer countdown jitter via startedAt-based client computation"
```

---

### Task 12: Background Music Playlist

**Files:**
- Modify: `server/state.js:44-45` (add playlist state fields)
- Modify: `server/server.js:1253-1307` (add playlist API endpoints, auto-advance logic)
- Modify: `server/obs.js` (add media playback ended listener hookup)
- Modify: `src/pages/Settings.jsx:387-443` (replace single-select with multi-select + controls)

Currently background music is a single file per OBS source. Producers want to select multiple files as a playlist with auto-advance and shuffle.

- [ ] **Step 1: Add playlist state fields**

In `server/state.js`, after line 45 (`castersBgMusicFile: '',`), add:

```js
  bgMusicPlaylist: [],
  bgMusicShuffle: false,
  bgMusicPlaylistIndex: 0,
  castersBgMusicPlaylist: [],
  castersBgMusicShuffle: false,
  castersBgMusicPlaylistIndex: 0,
```

- [ ] **Step 2: Add playlist API endpoints**

In `server/server.js`, after the existing `/api/bg-music/assign` endpoint (line 1307), add:

```js
app.post('/api/bg-music/playlist', async (req, res) => {
  const { source, files, shuffle } = req.body;
  if (!source || !files) return res.status(400).json({ error: 'source and files required' });
  const dir = getState().bgMusicDir;
  if (!dir) return res.status(400).json({ error: 'No music directory configured' });

  if (source === 'background') {
    setState({ bgMusicPlaylist: files, bgMusicShuffle: !!shuffle, bgMusicPlaylistIndex: 0 });
    if (files.length > 0) {
      const first = shuffle ? files[Math.floor(Math.random() * files.length)] : files[0];
      setState({ bgMusicFile: first, bgMusicPlaylistIndex: shuffle ? files.indexOf(first) : 0 });
      await obs.setMediaSource('Background Music', path.join(dir, first));
      console.log(`[BGMusic] Playlist started: ${first} (${files.length} tracks, shuffle=${!!shuffle})`);
    }
  } else if (source === 'casters') {
    setState({ castersBgMusicPlaylist: files, castersBgMusicShuffle: !!shuffle, castersBgMusicPlaylistIndex: 0 });
    if (files.length > 0) {
      const first = shuffle ? files[Math.floor(Math.random() * files.length)] : files[0];
      setState({ castersBgMusicFile: first, castersBgMusicPlaylistIndex: shuffle ? files.indexOf(first) : 0 });
      await obs.setMediaSource('Casters Background Music', path.join(dir, first));
      console.log(`[BGMusic] Casters playlist started: ${first} (${files.length} tracks, shuffle=${!!shuffle})`);
    }
  } else {
    return res.status(400).json({ error: 'source must be "background" or "casters"' });
  }

  broadcast('state', getState());
  res.json({ success: true });
});
```

- [ ] **Step 3: Add auto-advance on media end**

In `server/server.js`, find where `obs.onEvent('onMediaEnd', ...)` is set up (search for `onMediaEnd`). It's used for replay cycling. We need to also handle music auto-advance.

Find the existing `obs.onEvent('onMediaEnd', ...)` call and extend it to handle both replay and music:

After the existing replay media end handler, or within it, add music playlist advance logic. The `onMediaEnd` callback receives `data` with `inputName`. Add:

```js
async function advancePlaylist(sourceName, stateKeyPrefix) {
  const s = getState();
  const playlist = s[`${stateKeyPrefix}Playlist`] || [];
  if (playlist.length <= 1) return;
  const shuffle = s[`${stateKeyPrefix}Shuffle`];
  const currentIndex = s[`${stateKeyPrefix}PlaylistIndex`] || 0;
  let nextIndex;
  if (shuffle) {
    do { nextIndex = Math.floor(Math.random() * playlist.length); } while (nextIndex === currentIndex && playlist.length > 1);
  } else {
    nextIndex = (currentIndex + 1) % playlist.length;
  }
  const nextFile = playlist[nextIndex];
  const dir = s.bgMusicDir;
  if (!dir || !nextFile) return;
  setState({ [`${stateKeyPrefix}File`]: nextFile, [`${stateKeyPrefix}PlaylistIndex`]: nextIndex });
  await obs.setMediaSource(sourceName, path.join(dir, nextFile));
  broadcast('state', getState());
  console.log(`[BGMusic] Auto-advance ${sourceName} → ${nextFile} (${nextIndex + 1}/${playlist.length})`);
}
```

Then in the `onMediaEnd` handler, add:

```js
if (data.inputName === 'Background Music') {
  advancePlaylist('Background Music', 'bgMusic');
}
if (data.inputName === 'Casters Background Music') {
  advancePlaylist('Casters Background Music', 'castersBgMusic');
}
```

- [ ] **Step 4: Update Settings UI for playlist**

In `src/pages/Settings.jsx`, replace the single-select dropdowns (lines 416-441) with multi-select checkboxes and controls.

Replace the entire block from the `{bgMusicFiles.length > 0 && (` (line 415) through the closing `)}` (line 442):

```jsx
        {bgMusicFiles.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['background', 'casters'].map(source => {
              const label = source === 'background' ? 'Background Music (production screens)' : 'Casters Background Music (caster screens)';
              const currentFile = source === 'background' ? bgMusicSelected : castersBgMusicSelected;
              const playlist = source === 'background' ? (state.bgMusicPlaylist || []) : (state.castersBgMusicPlaylist || []);
              const shuffle = source === 'background' ? state.bgMusicShuffle : state.castersBgMusicShuffle;

              return (
                <div key={source}>
                  <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                  <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, padding: 4 }}>
                    {bgMusicFiles.map(f => {
                      const inPlaylist = playlist.includes(f);
                      const isCurrent = f === currentFile;
                      return (
                        <label key={f} style={{
                          display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', cursor: 'pointer',
                          borderRadius: 4, fontSize: '0.8rem',
                          background: isCurrent ? 'rgba(34,197,94,0.1)' : 'transparent',
                        }}>
                          <input type="checkbox" checked={inPlaylist}
                            onChange={() => {
                              const newList = inPlaylist ? playlist.filter(x => x !== f) : [...playlist, f];
                              fetch(`${api}/api/bg-music/playlist`, {
                                method: 'POST', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ source, files: newList, shuffle }),
                              });
                            }} />
                          <span style={{ flex: 1 }}>{f.replace(/\.[^.]+$/, '')}</span>
                          {isCurrent && <span className="badge badge-success" style={{ fontSize: '0.6rem' }}>Playing</span>}
                        </label>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!shuffle}
                        onChange={() => {
                          fetch(`${api}/api/bg-music/playlist`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ source, files: playlist, shuffle: !shuffle }),
                          });
                        }} />
                      Shuffle
                    </label>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      {playlist.length} track{playlist.length !== 1 ? 's' : ''} selected
                    </span>
                    {playlist.length > 0 && (
                      <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', fontSize: '0.65rem' }}
                        onClick={() => {
                          fetch(`${api}/api/bg-music/playlist`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ source, files: [], shuffle: false }),
                          });
                        }}>Clear</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
```

- [ ] **Step 5: Verify in browser**

In Settings, set a Background Music directory with multiple audio files. The file list should show checkboxes. Check 3 files — they form a playlist. The first one starts playing (shows "Playing" badge). Toggle shuffle on. When a track finishes in OBS, the next track should auto-start. Clear the playlist — music stops. Single-select still works via the existing assign endpoint (checking a single file).

- [ ] **Step 6: Commit**

```bash
git add server/state.js server/server.js server/obs.js src/pages/Settings.jsx
git commit -m "feat: background music playlist with auto-advance and shuffle"
```

---

## Execution Order

Tasks 1-5 are pure JSON changes and can be done in any order (or even in parallel). They have no code dependencies.

Tasks 6-8 are independent small code changes — any order works.

Task 9 (hide timer) should be done before Task 11 (timer jitter fix) since Task 11 modifies `server/state.js` defaults and the overlay `update()` function — doing Task 9 first avoids merge conflicts.

Task 10 (unsaved changes) is independent of all others.

Task 11 (timer jitter) depends on Task 9 being done first (for the state.js default).

Task 12 (music playlist) is independent and can be done last since it's the largest change.

**Recommended order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12
