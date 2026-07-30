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
  perMapBans: [], // [{ ban1: { name, role, image }, ban2: { name, role, image }, picker: 'team1'|'team2' }]
  selectedMapIdx: -1, // producer-selected map for ban/stat display; -1 = auto (live map)
  activeBanMapIdx: -1, // DERIVED (getActiveBanIdx): which map's bans heroBans was resolved from; -1 = none. Overlays label the Ban Reveal map from this instead of re-deriving client-side. Kept in lockstep with heroBans (see faceit-merge deriveActiveBanState).
  banSwaps: [], // per-map ⇄ ban-side corrections (true = swap team1Ban/team2Ban), survives FACEIT auto-sync
  mapPickers: [], // per-map manual picker overrides ('team1'|'team2'|'none'), survives FACEIT auto-sync
  players: { team1: [], team2: [] },
  playerStats: [],
  mapVeto: [], // { action: 'ban'|'pick', team: 'team1'|'team2', map: {} }
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
    team2Color: '#ef4444',
    team2ColorAuto: true,
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
      'Map Intro': 'Ctrl+Shift+3',
      'Gameplay': 'Ctrl+Shift+4',
      'Casters': 'Ctrl+Shift+5',
      'Casters Lobby': 'Ctrl+Shift+6',
      'Casters Scoreboard': 'Ctrl+Shift+7',
      'Map Score': 'Ctrl+Shift+8',
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

export function loadState() {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(STATE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
      state = deepMerge(JSON.parse(JSON.stringify(defaultState)), data);
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
