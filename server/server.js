import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { getState, setState, resetState, loadState, setOverrides, clearOverride, clearAllOverrides, isOverridden } from './state.js';
import * as obs from './obs.js';
import * as faceit from './faceit.js';
import { getHeroes, getHeroesByRole } from './heroes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Ensure fonts directory exists
const FONTS_DIR = path.join(__dirname, '..', 'data', 'fonts');
if (!fs.existsSync(FONTS_DIR)) fs.mkdirSync(FONTS_DIR, { recursive: true });

app.use(cors());
app.use(express.json());

// Disable caching for overlays and assets so OBS always gets fresh content
const noCacheHeaders = (res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};
app.use('/overlays', express.static(path.join(__dirname, '..', 'overlays'), { setHeaders: noCacheHeaders }));
app.use('/assets', express.static(path.join(__dirname, '..', 'public'), { setHeaders: noCacheHeaders }));
app.use('/fonts', express.static(FONTS_DIR));

// SSE clients for real-time overlay updates
const sseClients = new Set();

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    client.write(msg);
  }
}

// ============ OBS AUTO-SYNC ============
// Pushes state to OBS text sources whenever it changes

let lastSyncedState = {};

// Download a URL to a local file for OBS to use  
async function downloadToLocal(url, filename) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    const dir = path.join(__dirname, '..', 'data', 'cache');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  } catch (e) {
    console.warn('[Cache] Download failed:', e.message);
    return null;
  }
}

const TEXT_SOURCES = ['Team Name 1', 'Team Name 2', 'Left Score', 'Right Score', 'Caster 1 Name', 'Caster 2 Name', 'Countdown Text'];

async function syncToOBS(state) {
  if (!obs.isConnected()) return;

  const updates = [];

  // Font sync — update all text sources when font changes
  const fontFace = state.font?.family || 'Bebas Neue';
  if (fontFace !== lastSyncedState.fontFace) {
    for (const src of TEXT_SOURCES) {
      updates.push(obs.setTextFont(src, fontFace, 128));
    }
    lastSyncedState.fontFace = fontFace;
    console.log(`[OBS Sync] Font changed to "${fontFace}" on all text sources`);
  }

  // Swap-sides: determine which team data goes to which OBS side
  const swap = !!state.swapSides;
  if (swap !== lastSyncedState.swap) {
    // Force full re-sync when swap changes
    lastSyncedState.t1name = null; lastSyncedState.t2name = null;
    lastSyncedState.t1score = null; lastSyncedState.t2score = null;
    lastSyncedState.t1logo = null; lastSyncedState.t2logo = null;
    lastSyncedState.swap = swap;
    console.log(`[OBS Sync] Swap sides: ${swap ? 'ON' : 'OFF'}`);
  }

  const leftTeam = swap ? state.teams?.team2 : state.teams?.team1;
  const rightTeam = swap ? state.teams?.team1 : state.teams?.team2;

  // Team names
  if (leftTeam?.name !== lastSyncedState.t1name) {
    updates.push(obs.setTextSource('Team Name 1', leftTeam?.name || 'Team 1'));
    lastSyncedState.t1name = leftTeam?.name;
  }
  if (rightTeam?.name !== lastSyncedState.t2name) {
    updates.push(obs.setTextSource('Team Name 2', rightTeam?.name || 'Team 2'));
    lastSyncedState.t2name = rightTeam?.name;
  }

  // Scores
  const leftScore = String(leftTeam?.score ?? 0);
  const rightScore = String(rightTeam?.score ?? 0);
  if (leftScore !== lastSyncedState.t1score) {
    updates.push(obs.setTextSource('Left Score', leftScore));
    lastSyncedState.t1score = leftScore;
  }
  if (rightScore !== lastSyncedState.t2score) {
    updates.push(obs.setTextSource('Right Score', rightScore));
    lastSyncedState.t2score = rightScore;
  }

  // Team logos — download from URL to local file for OBS, auto-size to ~50px
  const TARGET_LOGO_PX = 50;
  const leftLogo = leftTeam?.logo;
  if (leftLogo && leftLogo !== lastSyncedState.t1logo) {
    const localPath = await downloadToLocal(leftLogo, 'left_team_logo.png');
    if (localPath) {
      await obs.setImageSource('Left Team Image', localPath);
      setTimeout(async () => {
        const t = await obs.getSceneItemTransform('Gameplay', 'Left Team Image');
        if (t && t.sourceWidth > 0) {
          const s = TARGET_LOGO_PX / t.sourceWidth;
          await obs.setSceneItemTransform('Gameplay', 'Left Team Image', { scaleX: s, scaleY: s });
          console.log(`[OBS Sync] Left Team Image scaled to ${s.toFixed(4)} (${t.sourceWidth}px → ${TARGET_LOGO_PX}px)`);
        }
      }, 500);
    }
    lastSyncedState.t1logo = leftLogo;
  }
  const rightLogo = rightTeam?.logo;
  if (rightLogo && rightLogo !== lastSyncedState.t2logo) {
    const localPath = await downloadToLocal(rightLogo, 'right_team_logo.png');
    if (localPath) {
      await obs.setImageSource('Right Team Image', localPath);
      setTimeout(async () => {
        const t = await obs.getSceneItemTransform('Gameplay', 'Right Team Image');
        if (t && t.sourceWidth > 0) {
          const s = TARGET_LOGO_PX / t.sourceWidth;
          await obs.setSceneItemTransform('Gameplay', 'Right Team Image', { scaleX: s, scaleY: s });
          console.log(`[OBS Sync] Right Team Image scaled to ${s.toFixed(4)} (${t.sourceWidth}px → ${TARGET_LOGO_PX}px)`);
        }
      }, 500);
    }
    lastSyncedState.t2logo = rightLogo;
  }

  // Caster names
  if (state.casters?.[0]?.name !== lastSyncedState.c1name) {
    updates.push(obs.setTextSource('Caster 1 Name', state.casters[0]?.name || ''));
    lastSyncedState.c1name = state.casters?.[0]?.name;
  }
  if (state.casters?.[1]?.name !== lastSyncedState.c2name) {
    updates.push(obs.setTextSource('Caster 2 Name', state.casters[1]?.name || ''));
    lastSyncedState.c2name = state.casters?.[1]?.name;
  }

  // Countdown text
  if (state.countdown?.running || state.countdown?.remaining > 0) {
    const m = Math.floor(state.countdown.remaining / 60);
    const s = state.countdown.remaining % 60;
    const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    if (timeStr !== lastSyncedState.countdown) {
      updates.push(obs.setTextSource('Countdown Text', timeStr));
      lastSyncedState.countdown = timeStr;
    }
  }

  if (updates.length > 0) {
    await Promise.allSettled(updates);
  }
}

// Countdown timer interval
let countdownInterval = null;

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

// ============ STATE API ============

app.get('/api/state', (req, res) => {
  res.json(getState());
});

app.patch('/api/state', (req, res) => {
  const updated = setState(req.body);
  broadcast('state', updated);
  syncToOBS(updated);
  res.json(updated);
});

app.post('/api/state/reset', (req, res) => {
  const updated = resetState();
  broadcast('state', updated);
  syncToOBS(updated);
  res.json(updated);
});

// ============ OBS API ============

app.get('/api/obs/status', (req, res) => {
  res.json({ connected: obs.isConnected() });
});

app.post('/api/obs/connect', async (req, res) => {
  const { host, port, password } = req.body;
  const result = await obs.connect(
    host || process.env.OBS_WS_HOST,
    port || process.env.OBS_WS_PORT,
    password || process.env.OBS_WS_PASSWORD
  );
  res.json(result);
});

app.get('/api/obs/scenes', async (req, res) => {
  const result = await obs.getScenes();
  res.json(result);
});

app.post('/api/obs/scene', async (req, res) => {
  const { name } = req.body;
  const ok = await obs.setScene(name);
  if (ok) setState({ currentScene: name });
  broadcast('state', getState());
  res.json({ success: ok });
});

// Alias for Stream Deck
app.post('/api/scene/:name', async (req, res) => {
  const ok = await obs.setScene(req.params.name);
  if (ok) setState({ currentScene: req.params.name });
  broadcast('state', getState());
  res.json({ success: ok });
});

app.post('/api/obs/text', async (req, res) => {
  const { source, text } = req.body;
  const ok = await obs.setTextSource(source, text);
  res.json({ success: ok });
});

app.post('/api/obs/image', async (req, res) => {
  const { source, file } = req.body;
  const ok = await obs.setImageSource(source, file);
  res.json({ success: ok });
});

app.post('/api/obs/browser', async (req, res) => {
  const { source, url } = req.body;
  const ok = await obs.setBrowserSource(source, url);
  res.json({ success: ok });
});

app.post('/api/obs/visibility', async (req, res) => {
  const { scene, source, visible } = req.body;
  const ok = await obs.setSourceVisibility(scene, source, visible);
  res.json({ success: ok });
});

app.get('/api/obs/inputs', async (req, res) => {
  const inputs = await obs.getInputList();
  res.json(inputs);
});

// Auto-configure OBS browser sources with overlay URLs
app.post('/api/obs/setup-overlays', async (req, res) => {
  const base = `http://localhost:${PORT}/overlays`;
  const results = {};

  // Try configuring each browser source (they may or may not exist)
  const configs = [
    { source: 'Faceit Lobby BS', url: `${base}/faceit-lobby.html` },
    { source: 'Faceit Scoreboard BS', url: `${base}/faceit-scoreboard.html` },
  ];

  for (const { source, url } of configs) {
    const ok = await obs.setBrowserSource(source, url);
    results[source] = ok;
  }

  res.json({ success: true, results });
});

// Sync font to all OBS text sources
app.post('/api/obs/sync-font', async (req, res) => {
  const { fontFace, fontSize } = req.body;
  const textSources = ['Team Name 1', 'Team Name 2', 'Left Score', 'Right Score',
    'Caster 1 Name', 'Caster 2 Name', 'Countdown Text'];
  const results = await Promise.allSettled(
    textSources.map(s => obs.setTextFont(s, fontFace || 'Bebas Neue', fontSize || 256))
  );
  res.json({ success: true, updated: textSources.length });
});

// Stinger transition
app.post('/api/obs/transition', async (req, res) => {
  const { name, duration } = req.body;
  const ok = await obs.setCurrentSceneTransition(name || 'Stinger', duration || 1000);
  res.json({ success: ok });
});

// Take a screenshot of a scene or the current program output
app.get('/api/obs/screenshot', async (req, res) => {
  const sceneName = req.query.scene || await obs.getCurrentProgramScene();
  if (!sceneName) return res.status(400).json({ error: 'No scene' });

  const imageData = await obs.getSourceScreenshot(sceneName,
    parseInt(req.query.width) || 1920, parseInt(req.query.height) || 1080);
  if (!imageData) return res.status(500).json({ error: 'Screenshot failed' });

  // Save to disk and return path
  const filename = `obs_screenshot_${Date.now()}.png`;
  const filePath = path.join(__dirname, '..', 'data', 'cache', filename);
  const base64 = imageData.replace(/^data:image\/\w+;base64,/, '');
  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));

  // Return both the file path and the base64 data
  res.json({ success: true, file: filePath, scene: sceneName });
});

// Force re-sync all state to OBS (clears cache so everything gets pushed)
app.post('/api/obs/force-sync', async (req, res) => {
  lastSyncedState = {}; // Clear cache
  const state = getState();
  await syncToOBS(state);
  res.json({ success: true, synced: true });
});

// Toggle swap sides
app.post('/api/obs/swap-sides', async (req, res) => {
  const state = getState();
  const newState = setState({ swapSides: !state.swapSides });
  lastSyncedState = {}; // Force full re-sync
  await syncToOBS(newState);
  broadcast('state', newState);
  res.json({ success: true, swapSides: newState.swapSides });
});

// Install a Google Font to the system for OBS FreeType2
app.post('/api/fonts/install', async (req, res) => {
  const { family } = req.body;
  if (!family) return res.status(400).json({ error: 'Missing family' });

  try {
    const { execSync } = await import('child_process');
    const fontsDir = path.join(process.env.HOME || '/home/volence', '.local', 'share', 'fonts');
    if (!fs.existsSync(fontsDir)) fs.mkdirSync(fontsDir, { recursive: true });

    // Try downloading from GitHub Google Fonts repository
    const slug = family.replace(/\s+/g, '');
    const url = `https://github.com/googlefonts/${slug}Font/raw/main/fonts/variable/${slug}%5Bwght%5D.ttf`;
    const localFile = path.join(fontsDir, `${slug}-Variable.ttf`);

    const response = await fetch(url);
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(localFile, buffer);
      execSync('fc-cache -f ' + fontsDir);
      console.log(`[Fonts] Installed ${family} to ${localFile}`);
      res.json({ success: true, installed: family, path: localFile });
    } else {
      res.json({ success: false, error: `Could not download ${family} from GitHub` });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Query/set scene item transforms
app.get('/api/obs/transform', async (req, res) => {
  const { scene, source } = req.query;
  if (!scene || !source) return res.status(400).json({ error: 'Need scene and source params' });
  const transform = await obs.getSceneItemTransform(scene, source);
  res.json(transform);
});

app.post('/api/obs/transform', async (req, res) => {
  const { scene, source, transform } = req.body;
  const ok = await obs.setSceneItemTransform(scene, source, transform);
  res.json({ success: ok });
});

// ============ FACEIT API ============

app.post('/api/faceit/match', async (req, res) => {
  try {
    const matchId = faceit.parseMatchUrl(req.body.url || req.body.matchId);
    const [details, stats] = await Promise.all([
      faceit.getMatchDetails(matchId),
      faceit.getMatchStats(matchId).catch(() => []),
    ]);

    // Update state with FACEIT data, respecting manual overrides
    const faction1 = details.teams.faction1;
    const faction2 = details.teams.faction2;

    const maps = details.pickedMaps.map((m, i) => {
      const roundStats = stats[i];
      let winner = null;
      if (roundStats?.winner) {
        winner = roundStats.winner === faction1.id ? 'team1' : 'team2';
      }
      return {
        name: m.name,
        mode: m.mode,
        image: m.imageSm || m.imageLg,
        status: roundStats ? (roundStats.winner ? 'completed' : 'current') : 'upcoming',
        winner,
        roundScore: roundStats?.scoreSummary || null,
      };
    });

    // Determine map picker for each map:
    // - Map 1: higher seed (faction1) picks
    // - Subsequent maps: loser of previous map picks
    // Picker bans first (ban1), other team bans second (ban2)
    const perMapBans = (details.perMapBans || []).map((bans, i) => {
      let picker = 'team1'; // Default: faction1 (higher seed) picks map 1
      if (i > 0) {
        const prevWinner = maps[i - 1]?.winner;
        if (prevWinner) {
          // Loser of previous map picks next
          picker = prevWinner === 'team1' ? 'team2' : 'team1';
        }
      }
      return {
        ...bans,
        picker,
        // Attribute: ban1 belongs to picker, ban2 belongs to other team
        team1Ban: picker === 'team1' ? bans.ban1 : bans.ban2,
        team2Ban: picker === 'team2' ? bans.ban1 : bans.ban2,
      };
    });

    // Convert FACEIT hero name to dashboard hero key format
    // FACEIT uses names like "DVa", "Lucio", "Soldier 76", "Torbjorn"
    // Dashboard keys are lowercase: "dva", "lucio", "soldier-76", "torbjorn"
    const faceitNameOverrides = {
      'DVa': 'dva',
      'Lucio': 'lucio',
      'Soldier 76': 'soldier-76',
      'Torbjorn': 'torbjorn',
    };
    const heroNameToKey = (name) => {
      if (!name) return '';
      if (faceitNameOverrides[name]) return faceitNameOverrides[name];
      return name.toLowerCase().replace(/\s+/g, '-').replace(/[.']/g, '');
    };

    // Find current map and auto-populate heroBans for it
    const currentMapIdx = maps.findIndex(m => m.status === 'current');
    const activeIdx = currentMapIdx >= 0 ? currentMapIdx : maps.length - 1; // fall back to last map
    const activeBans = perMapBans[activeIdx];
    const heroBans = {
      team1: activeBans?.team1Ban ? [heroNameToKey(activeBans.team1Ban.name)] : [],
      team2: activeBans?.team2Ban ? [heroNameToKey(activeBans.team2Ban.name)] : [],
    };

    // Build update object, skipping overridden fields
    const update = {
      mode: 'faceit',
      faceitMatchId: matchId,
    };

    if (!isOverridden('bestOf')) update.bestOf = details.bestOf;
    if (!isOverridden('maps')) update.maps = maps;
    if (!isOverridden('players')) {
      update.players = {
        team1: faction1.roster,
        team2: faction2.roster,
      };
    }
    update.playerStats = stats;
    update.perMapBans = perMapBans;
    if (!isOverridden('heroBans')) update.heroBans = heroBans;

    // Team 1 fields
    const t1 = {};
    if (!isOverridden('teams.team1.name')) t1.name = faction1.name;
    if (!isOverridden('teams.team1.logo')) t1.logo = faction1.avatar;
    if (!isOverridden('teams.team1.score')) t1.score = details.results?.score?.faction1 || 0;
    t1.color = '#3b82f6';
    t1.faceitId = faction1.id;

    // Team 2 fields
    const t2 = {};
    if (!isOverridden('teams.team2.name')) t2.name = faction2.name;
    if (!isOverridden('teams.team2.logo')) t2.logo = faction2.avatar;
    if (!isOverridden('teams.team2.score')) t2.score = details.results?.score?.faction2 || 0;
    t2.color = '#ef4444';
    t2.faceitId = faction2.id;

    update.teams = { team1: t1, team2: t2 };

    const updated = setState(update);

    broadcast('state', updated);
    syncToOBS(updated);
    res.json({ success: true, details, stats, state: updated });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/faceit/match/:matchId/stats', async (req, res) => {
  try {
    const stats = await faceit.getMatchStats(req.params.matchId);
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// ============ OVERRIDES API ============

/** Set manual overrides for specific fields */
app.post('/api/overrides', (req, res) => {
  const { paths } = req.body; // e.g. ['teams.team1.name', 'maps']
  if (!Array.isArray(paths)) return res.status(400).json({ error: 'paths must be an array' });
  const updated = setOverrides(paths);
  broadcast('state', updated);
  res.json({ success: true, overrides: updated.overrides });
});

/** Clear a single override (relinquish manual control for one field) */
app.post('/api/overrides/clear', (req, res) => {
  const { path } = req.body;
  if (!path) return res.status(400).json({ error: 'path is required' });
  const updated = clearOverride(path);
  broadcast('state', updated);
  res.json({ success: true, overrides: updated.overrides });
});

/** Clear ALL overrides (relinquish all manual control) */
app.delete('/api/overrides', (req, res) => {
  const updated = clearAllOverrides();
  broadcast('state', updated);
  res.json({ success: true, overrides: updated.overrides });
});

// ============ MAPS API ============

let cachedMaps = null;
let mapsCacheTime = 0;

/** Get all Overwatch maps from OverFast API (cached for 1 hour) */
app.get('/api/maps', async (req, res) => {
  const ONE_HOUR = 3600000;
  if (cachedMaps && Date.now() - mapsCacheTime < ONE_HOUR) {
    return res.json(cachedMaps);
  }
  try {
    const resp = await fetch('https://overfast-api.tekrop.fr/maps');
    if (!resp.ok) throw new Error(`OverFast API ${resp.status}`);
    cachedMaps = await resp.json();
    mapsCacheTime = Date.now();
    res.json(cachedMaps);
  } catch (e) {
    if (cachedMaps) return res.json(cachedMaps); // serve stale cache on error
    res.status(500).json({ error: e.message });
  }
});

// ============ HEROES API ============

app.get('/api/heroes', async (req, res) => {
  const heroes = await getHeroes();
  res.json(heroes);
});

app.get('/api/heroes/grouped', async (req, res) => {
  const grouped = await getHeroesByRole();
  res.json(grouped);
});

// ============ COUNTDOWN API ============

app.post('/api/timer/start', (req, res) => {
  const { duration, label } = req.body;
  const d = duration || getState().countdown.duration;
  setState({ countdown: { duration: d, remaining: d, running: true, label: label || 'Starting Soon' } });
  startCountdown();
  broadcast('state', getState());
  res.json({ success: true });
});

app.post('/api/timer/stop', (req, res) => {
  stopCountdown();
  broadcast('state', getState());
  res.json({ success: true });
});

app.post('/api/timer/reset', (req, res) => {
  stopCountdown();
  const s = getState();
  setState({ countdown: { ...s.countdown, remaining: s.countdown.duration, running: false } });
  broadcast('state', getState());
  res.json({ success: true });
});

// ============ SCORE API (Stream Deck friendly) ============

app.post('/api/score/increment', (req, res) => {
  const team = req.query.team || req.body.team || 'team1';
  const s = getState();
  const teamData = s.teams[team];
  if (teamData) {
    setState({ teams: { ...s.teams, [team]: { ...teamData, score: teamData.score + 1 } } });
    const updated = getState();
    broadcast('state', updated);
    syncToOBS(updated);
  }
  res.json({ success: true, state: getState() });
});

app.post('/api/map/advance', (req, res) => {
  const s = getState();
  const maps = [...s.maps];
  const currentIdx = maps.findIndex(m => m.status === 'current');
  if (currentIdx >= 0) {
    maps[currentIdx] = { ...maps[currentIdx], status: 'completed' };
  }
  const nextIdx = maps.findIndex(m => m.status === 'upcoming');
  if (nextIdx >= 0) {
    maps[nextIdx] = { ...maps[nextIdx], status: 'current' };
  }
  setState({ maps });
  broadcast('state', getState());
  res.json({ success: true });
});

// ============ MATCH HISTORY ============

app.post('/api/history/save', (req, res) => {
  const s = getState();
  const entry = {
    timestamp: new Date().toISOString(),
    teams: { ...s.teams },
    maps: [...s.maps],
    bestOf: s.bestOf,
    mode: s.mode,
    faceitMatchId: s.faceitMatchId,
  };
  setState({ matchHistory: [...s.matchHistory, entry] });
  res.json({ success: true });
});

app.get('/api/history', (req, res) => {
  res.json(getState().matchHistory);
});

// ============ FONT UPLOAD ============

app.get('/api/fonts', (req, res) => {
  try {
    const files = fs.readdirSync(FONTS_DIR).filter(f => /\.(ttf|otf|woff|woff2)$/i.test(f));
    const fonts = files.map(f => ({
      name: f.replace(/\.(ttf|otf|woff|woff2)$/i, '').replace(/[-_]/g, ' '),
      filename: f,
      url: `http://localhost:${PORT}/fonts/${encodeURIComponent(f)}`,
    }));
    res.json(fonts);
  } catch (e) {
    res.json([]);
  }
});

app.post('/api/fonts/upload', express.raw({ type: '*/*', limit: '10mb' }), (req, res) => {
  const filename = req.headers['x-filename'] || 'uploaded-font.ttf';
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(FONTS_DIR, safeName);
  fs.writeFileSync(filePath, req.body);
  console.log(`[Fonts] Saved ${safeName}`);
  res.json({
    success: true,
    name: safeName.replace(/\.(ttf|otf|woff|woff2)$/i, '').replace(/[-_]/g, ' '),
    filename: safeName,
    url: `http://localhost:${PORT}/fonts/${encodeURIComponent(safeName)}`,
  });
});

// ============ START ============

loadState();

// Try to connect to OBS on startup
if (process.env.OBS_WS_HOST) {
  obs.connect(
    process.env.OBS_WS_HOST,
    parseInt(process.env.OBS_WS_PORT) || 4455,
    process.env.OBS_WS_PASSWORD || ''
  ).then(async () => {
    // Initial sync of current state to OBS after connecting
    setTimeout(async () => {
      await syncToOBS(getState());
      // Auto-configure all browser sources with cache buster
      const base = `http://localhost:${PORT}/overlays`;
      const cacheBust = `v=${Date.now()}`;
      const browserSources = [
        ['Gameplay HUD BS', 'gameplay-hud.html'],
        ['Faceit Lobby BS', 'faceit-lobby.html'],
        ['Faceit Scoreboard BS', 'faceit-scoreboard.html'],
        ['Starting Soon BS', 'starting-soon.html'],
        ['Map Intro BS', 'map-intro.html'],
        ['Map Pick BS', 'map-pick.html'],
      ];
      for (const [source, file] of browserSources) {
        await obs.setBrowserSource(source, `${base}/${file}?${cacheBust}`).catch(() => {});
        // Small delay to let OBS process the URL change before hard-refreshing
        await new Promise(r => setTimeout(r, 500));
        await obs.refreshBrowserSource(source).catch(() => {});
      }
      console.log('[OBS] Browser sources configured for all overlays (cache busted)');
    }, 3000);
  }).catch(() => {});
}

// Pre-fetch heroes
getHeroes().catch(() => {});

app.listen(PORT, () => {
  console.log(`[Server] Production Companion running on http://localhost:${PORT}`);
  console.log(`[Server] Overlays available at http://localhost:${PORT}/overlays/`);
});
