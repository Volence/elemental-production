import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In Electron, save state to the persistent userData directory
// In dev/standalone, save to data/state.json next to the app
const STATE_FILE = process.env.ELEMENTAL_USER_DATA
  ? path.join(process.env.ELEMENTAL_USER_DATA, 'state.json')
  : path.join(__dirname, '..', 'data', 'state.json');

const defaultState = {
  mode: 'manual', // 'faceit' or 'manual'
  faceitMatchId: '',
  faceitMatchUrl: '',
  bestOf: 5,
  teams: {
    team1: { name: 'Team 1', logo: '', color: '#3b82f6', score: 0 },
    team2: { name: 'Team 2', logo: '', color: '#ef4444', score: 0 },
  },
  maps: [], // { name, mode, image, status: 'upcoming'|'current'|'completed', winner: null|'team1'|'team2' }
  heroBans: { team1: [], team2: [] },
  perMapBans: [], // [{ ban1: { name, role, image }, ban2, picker: 'team1'|'team2'|null, team1Ban, team2Ban, api?: { picker, team1Ban, team2Ban } }] — `api` = FACEIT veto-history attribution (real who-banned-what from faceit.getVetoHistory; absent when FACEIT didn't report it, and buildPerMapBans falls back to the picker heuristic)
  selectedMapIdx: -1, // producer-selected map for ban/stat display; -1 = auto (live map)
  activeBanMapIdx: -1, // DERIVED (getActiveBanIdx): which map's bans heroBans was resolved from; -1 = none. Overlays label the Ban Reveal map from this instead of re-deriving client-side. Kept in lockstep with heroBans (see faceit-merge deriveActiveBanState).
  banSwaps: [], // per-map ⇄ ban-side corrections (true = swap team1Ban/team2Ban), survives FACEIT auto-sync
  mapPickers: [], // per-map manual picker overrides ('team1'|'team2'|'none'), survives FACEIT auto-sync
  removedMapKeys: [], // maps the producer DELETED, as normalizeMapName keys (written by MatchHub removeMap, dropped again by addMap). A deletion isn't recoverable from the maps array itself, so the FACEIT tail-append (faceit-merge buildMapsUpdate) would re-add a map removed off the END on every poll tick. Cleared with banSwaps/mapPickers.
  players: { team1: [], team2: [] },
  playerStats: [],
  mapVeto: [], // { action: 'ban'|'pick', team: 'team1'|'team2', map: {} }
  mapPool: [], // season-level legal map pool (map NAMES, as in /api/maps). Set from Settings' "Season Map Pool" editor; persisted like all state so it survives restarts. Empty = pool board shows a configure hint.
  casters: [
    { name: 'Caster 1', camUrl: '', visible: true },
    { name: 'Caster 2', camUrl: '', visible: true },
  ],
  casterLayout: 2, // 0 = no cam frames, 1 = single cam, 2 = dual cams — scenes already defaulted to 2 client-side; now explicit here
  interviewee: { name: '', camUrl: '', visible: false },
  countdown: { duration: 300, remaining: 0, running: false, label: 'Starting Soon', visible: true, startedAt: null },
  font: { family: 'Bebas Neue', url: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap' },
  lowerThird: { title: '', subtitle: '', visible: false },
  currentScene: 'Starting',
  eventName: 'FACEIT Season 8',
  schedule: [],  // [{ team1, team1Logo, team2, team2Logo, time, label }]
  matchHistory: [],
  graphicsPreset: 'default',
  swapSides: false, // swap team1/team2 positions in OBS
  flythroughsDir: '', // path to folder containing map flythrough videos
  flythroughFallback: '',
  mapMusicDir: '', // path to folder containing map music audio files
  bgMusicDir: '', // path to folder containing royalty-free background music
  bgMusicFile: '', // selected file for "Background Music" OBS source
  castersBgMusicFile: '', // selected file for "Casters Background Music" OBS source
  bgMusicPlaylist: [],
  bgMusicShuffle: false,
  bgMusicPlaylistIndex: 0,
  castersBgMusicPlaylist: [],
  castersBgMusicShuffle: false,
  castersBgMusicPlaylistIndex: 0,
  lastReplayPath: '', // path to the last saved replay clip
  replayClips: [], // array of saved replay clip paths for current match
  replayIndex: 0, // current replay index for cycling
  overrides: {}, // e.g. { 'teams.team1.name': true, 'maps': true }
  faceitAutoSync: true, // whether to auto-poll FACEIT for match updates
  graphicsPresets: {
    default: { name: 'Default', graphics: {} }
  },
  theme: {
    accentColor: '#f97316',
    accentGradient: ['#f97316', '#ef4444'],
    backgroundColor: 'rgba(10,10,20,0.9)',
    textColor: '#ffffff',
    textSecondary: 'rgba(255,255,255,0.5)',
    fontFamily: 'Oswald',
    titleFontFamily: 'Bebas Neue',
    rainbowBar: true,
    rainbowColors: ['#2563eb', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#f97316'],
    team1Color: '#3b82f6',
    team1ColorAuto: true,
    team1ColorAlt: '', // logo's second distinct color (auto-extracted; '' = none found)
    team2Color: '#ef4444',
    team2ColorAuto: true,
    team2ColorAlt: '',
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
  },
  hotkeys: {
    sceneSwitch: {
      'Starting': 'Ctrl+Shift+1',
      'Map Pick': 'Ctrl+Shift+2',
      'Map Pool': 'Ctrl+Shift+P',
      'Ban Reveal': 'Ctrl+Shift+B',
      'Map Intro': 'Ctrl+Shift+3',
      'Gameplay': 'Ctrl+Shift+4',
      'Casters': 'Ctrl+Shift+5',
      'Casters Lobby': 'Ctrl+Shift+6',
      'Casters Scoreboard': 'Ctrl+Shift+7',
      'Map Score': 'Ctrl+Shift+8',
      'Final Stats': 'Ctrl+Shift+T',
      'Between Matches': 'Ctrl+Shift+9',
      'BRB': 'Ctrl+Shift+0',
      'Interview': 'Ctrl+Shift+-',
      'Series Winner': 'Ctrl+Shift+=',
      'Ending': 'Ctrl+Shift+Backspace',
    },
    swapSides: 'Ctrl+Shift+S',
  },
};

let state = { ...defaultState };

export function getState() {
  return state;
}

export function setState(partial) {
  state = deepMerge(state, partial);
  persist();
  return state;
}

/** Set manual override flags for one or more field paths */
export function setOverrides(paths) {
  if (!state.overrides) state.overrides = {};
  for (const p of paths) {
    state.overrides[p] = true;
  }
  persist();
  return state;
}

/** Clear a single override (relinquish manual control) */
export function clearOverride(path) {
  if (state.overrides) {
    delete state.overrides[path];
    persist();
  }
  return state;
}

/** Clear ALL overrides (relinquish all manual control) */
export function clearAllOverrides() {
  state.overrides = {};
  persist();
  return state;
}

/** Check if a field is manually overridden */
export function isOverridden(path) {
  return !!(state.overrides && state.overrides[path]);
}

export function resetState() {
  state = JSON.parse(JSON.stringify(defaultState));
  persist();
  return state;
}

/**
 * Single-`current` invariant: only one map is live at a time. Two `current`
 * maps make every "the map right now" consumer (map intro, flythrough, music)
 * stick on the earlier one, and the FACEIT poll's forward-only status merge
 * makes the stray sticky. The LAST `current` wins — it's the one just promoted.
 */
export function normalizeSingleCurrent(maps) {
  if (!Array.isArray(maps)) return maps;
  let lastCurrent = -1;
  let count = 0;
  maps.forEach((m, i) => { if (m && m.status === 'current') { lastCurrent = i; count++; } });
  if (count <= 1) return maps;
  return maps.map((m, i) =>
    m && m.status === 'current' && i !== lastCurrent
      ? { ...m, status: m.winner ? 'completed' : 'upcoming' }
      : m);
}

export function loadState() {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      state = deepMerge(JSON.parse(JSON.stringify(defaultState)), data);
      // Heal a state.json written before the single-current invariant existed
      state.maps = normalizeSingleCurrent(state.maps);
    }
  } catch (e) {
    console.warn('[State] Failed to load state, using defaults:', e.message);
  }
  return state;
}

// Debounced + atomic persistence. State changes arrive every keystroke and
// every countdown tick, so coalesce writes; write-to-temp + rename means a
// crash mid-write can never leave a truncated state.json behind.
let persistTimer = null;
let dirty = false;

function persist() {
  dirty = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    flush();
  }, 300);
}

function flush() {
  if (!dirty) return;
  dirty = false;
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpFile = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(state, null, 2));
    fs.renameSync(tmpFile, STATE_FILE);
  } catch (e) {
    console.error('[State] Failed to persist:', e.message);
  }
}

// Flush any pending debounced write on shutdown (Electron kills the forked
// server with SIGTERM on quit)
process.on('exit', flush);
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    flush();
    process.exit(0);
  });
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
        target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
