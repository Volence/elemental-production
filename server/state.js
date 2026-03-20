import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '..', 'data', 'state.json');

const defaultState = {
  mode: 'manual', // 'faceit' or 'manual'
  faceitMatchId: '',
  bestOf: 5,
  teams: {
    team1: { name: 'Team 1', logo: '', color: '#3b82f6', score: 0 },
    team2: { name: 'Team 2', logo: '', color: '#ef4444', score: 0 },
  },
  maps: [], // { name, mode, image, status: 'upcoming'|'current'|'completed', winner: null|'team1'|'team2' }
  heroBans: { team1: [], team2: [] },
  perMapBans: [], // [{ ban1: { name, role, image }, ban2: { name, role, image }, picker: 'team1'|'team2' }]
  players: { team1: [], team2: [] },
  playerStats: [],
  mapVeto: [], // { action: 'ban'|'pick', team: 'team1'|'team2', map: {} }
  casters: [
    { name: 'Caster 1', camUrl: '', visible: true },
    { name: 'Caster 2', camUrl: '', visible: true },
  ],
  interviewee: { name: '', camUrl: '', visible: false },
  countdown: { duration: 300, remaining: 0, running: false, label: 'Starting Soon' },
  font: { family: 'Bebas Neue', url: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap' },
  lowerThird: { title: '', subtitle: '', visible: false },
  currentScene: 'Starting',
  eventName: 'FACEIT Season 8',
  schedule: [],  // [{ team1, team1Logo, team2, team2Logo, time, label }]
  matchHistory: [],
  graphicsPreset: 'default',
  swapSides: false, // swap team1/team2 positions in OBS
  overrides: {}, // e.g. { 'teams.team1.name': true, 'maps': true }
  graphicsPresets: {
    default: { name: 'Default', graphics: {} }
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

function persist() {
  try {
    const dir = path.dirname(STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[State] Failed to persist:', e.message);
  }
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
