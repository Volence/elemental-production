import dotenv from 'dotenv';
import { fileURLToPath as _flu } from 'url';
import { dirname as _dn, join as _jn } from 'path';

// Load .env from userData (Electron) or app root (dev/standalone)
const _appRoot = _dn(_dn(_flu(import.meta.url)));
const _envPath = process.env.ELEMENTAL_USER_DATA
  ? _jn(process.env.ELEMENTAL_USER_DATA, '.env')
  : _jn(_appRoot, '.env');
dotenv.config({ path: _envPath });
if (process.env.ELEMENTAL_USER_DATA) {
  console.log('[Server] Loading config from', _envPath);
}
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { getState, setState, resetState, loadState, setOverrides, clearOverride, clearAllOverrides, isOverridden } from './state.js';
import * as obs from './obs.js';
import * as faceit from './faceit.js';
import { getHeroes, getHeroesByRole } from './heroes.js';
import * as flythroughs from './flythroughs.js';
import * as mapMusic from './map-music.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Ensure fonts directory exists
const FONTS_DIR = path.join(__dirname, '..', 'data', 'fonts');
if (!fs.existsSync(FONTS_DIR)) fs.mkdirSync(FONTS_DIR, { recursive: true });

app.use(cors());
app.use(express.json());

// Serve built React frontend in production mode (Electron or standalone)
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  console.log('[Server] Serving production frontend from dist/');
}

// Disable caching for overlays and assets so OBS always gets fresh content
const noCacheHeaders = (res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

// Serve overlay HTML files with injected initial state (so OBS doesn't need to fetch)
const overlaysDir = path.join(__dirname, '..', 'overlays');

// Pre-encode overlay images as base64 data URIs so OBS browser sources don't need network fetches
// (OBS's embedded Chromium can't reliably load secondary resources from localhost)
const overlayImageCache = {};
function getImageDataUri(filename) {
  if (overlayImageCache[filename]) return overlayImageCache[filename];
  const imgPath = path.join(overlaysDir, filename);
  if (fs.existsSync(imgPath)) {
    const ext = path.extname(filename).slice(1).toLowerCase();
    const mime = ext === 'jpg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
    overlayImageCache[filename] = `data:${mime};base64,${fs.readFileSync(imgPath).toString('base64')}`;
    return overlayImageCache[filename];
  }
  return null;
}

app.get('/overlays/:file', async (req, res) => {
  const filePath = path.join(overlaysDir, req.params.file);
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');

  // For non-HTML files, serve directly
  if (!req.params.file.endsWith('.html')) {
    noCacheHeaders(res);
    return res.sendFile(filePath);
  }

  // For HTML overlays, inline all local image references as base64 data URIs
  let html = fs.readFileSync(filePath, 'utf8');

  // Replace all local image references: ./file.png, 'file.png', "file.png"
  html = html.replace(/(?:\.\/)?([A-Za-z0-9_-]+\.(?:png|jpg|jpeg|svg))/g, (match, filename) => {
    const dataUri = getImageDataUri(filename);
    return dataUri || match;  // Keep original if file doesn't exist in overlays dir
  });

  // Inject hero data + state as server-side bootstrap
  let heroJson = '[]';
  try { heroJson = JSON.stringify(await getHeroes()).replace(/<\//g, '<\\/'); } catch(e) {}
  const stateJson = JSON.stringify(getState()).replace(/<\//g, '<\\/');
  const bootstrap = `<script>
// Server-injected: pre-populate hero data so OBS doesn't need to fetch /api/heroes
window.__HERO_DATA__ = ${heroJson};
// Fallback: if fetch/SSE hasn't populated content, call update()
(function() {
  var state = ${stateJson};
  var attempts = 0;
  function tryUpdate() {
    attempts++;
    var root = document.getElementById('root');
    if (root && !root.innerHTML.trim() && typeof update === 'function') {
      // Pre-populate heroData if the overlay uses it
      if (typeof heroData !== 'undefined' && (!heroData || !heroData.length)) {
        heroData = window.__HERO_DATA__;
      }
      try { update(state); } catch(e) {
        if (attempts < 4) setTimeout(tryUpdate, 2000);
      }
    }
  }
  setTimeout(tryUpdate, 2000);
})();
</script>`;
  html = html.replace('</body>', `${bootstrap}\n</body>`);

  noCacheHeaders(res);
  res.type('html').send(html);
});
// Serve non-HTML overlay assets (images, etc.) as static
app.use('/overlays', express.static(overlaysDir, { setHeaders: noCacheHeaders }));
app.use('/assets', express.static(path.join(__dirname, '..', 'public'), { setHeaders: noCacheHeaders }));
app.use('/fonts', express.static(FONTS_DIR));

// SSE clients for real-time overlay updates
const sseClients = new Set();

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
  res.flushHeaders();

  // Send initial state immediately so new connections are up to date
  res.write(`event: state\ndata: ${JSON.stringify(getState())}\n\n`);

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// Heartbeat to keep SSE connections alive (OBS browser sources drop idle connections)
setInterval(() => {
  for (const client of sseClients) {
    client.write(`: heartbeat\n\n`);
  }
}, 15000);

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

const TEXT_SOURCES = ['Caster 1 Name', 'Caster 2 Name'];

async function syncToOBS(state) {
  if (!obs.isConnected()) return;

  const updates = [];

  // Font sync — update text sources when font changes
  const fontFace = state.font?.family || 'Bebas Neue';
  if (fontFace !== lastSyncedState.fontFace) {
    for (const src of TEXT_SOURCES) {
      updates.push(obs.setTextFont(src, fontFace, 128));
    }
    lastSyncedState.fontFace = fontFace;
    console.log(`[OBS Sync] Font changed to "${fontFace}" on all text sources`);
  }

  // Swap-sides tracking
  const swap = !!state.swapSides;
  if (swap !== lastSyncedState.swap) {
    lastSyncedState.swap = swap;
    console.log(`[OBS Sync] Swap sides: ${swap ? 'ON' : 'OFF'}`);
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

  // Flythrough video sync — update OBS media source when current map changes
  const currentMap = (state.maps || []).find(m => m.status === 'current') || state.maps?.[0];
  const currentMapName = currentMap?.name || '';
  if (currentMapName && currentMapName !== lastSyncedState.currentMapFlythrough) {
    const flyUrl = flythroughs.getFlythroughUrl(currentMapName);
    if (flyUrl) {
      const dir = state.flythroughsDir || '';
      // getFlythroughUrl returns URL path, extract filename and build absolute path
      const filename = decodeURIComponent(flyUrl.split('/').pop());
      const absPath = path.join(dir, filename);
      updates.push(obs.setMediaSource('Map Flythrough', absPath));
      console.log(`[OBS Sync] Flythrough → ${currentMapName} (${filename})`);
    }
    lastSyncedState.currentMapFlythrough = currentMapName;
  }

  // Map music sync — update OBS media source when current map changes
  if (currentMapName && currentMapName !== lastSyncedState.currentMapMusic) {
    const musicPath = mapMusic.getMusicPath(currentMapName);
    if (musicPath) {
      updates.push(obs.setMediaSource('Map Music', musicPath));
      const filename = path.basename(musicPath);
      console.log(`[OBS Sync] Map Music → ${currentMapName} (${filename})`);
    }
    lastSyncedState.currentMapMusic = currentMapName;
  }

  // Background music sync — set OBS media sources from saved state on first connect
  if (state.bgMusicDir && state.bgMusicFile && !lastSyncedState.bgMusicSynced) {
    const absPath = path.join(state.bgMusicDir, state.bgMusicFile);
    if (fs.existsSync(absPath)) {
      updates.push(obs.setMediaSource('Background Music', absPath));
      console.log(`[OBS Sync] Background Music → ${state.bgMusicFile}`);
    }
    lastSyncedState.bgMusicSynced = true;
  }
  if (state.bgMusicDir && state.castersBgMusicFile && !lastSyncedState.castersBgMusicSynced) {
    const absPath = path.join(state.bgMusicDir, state.castersBgMusicFile);
    if (fs.existsSync(absPath)) {
      updates.push(obs.setMediaSource('Casters Background Music', absPath));
      console.log(`[OBS Sync] Casters Background Music → ${state.castersBgMusicFile}`);
    }
    lastSyncedState.castersBgMusicSynced = true;
  }

  // Caster webcam sync — set OBS browser sources from saved cam URLs on first connect
  if (!lastSyncedState.casterCamsSynced) {
    for (let i = 0; i < state.casters.length; i++) {
      const url = state.casters[i]?.camUrl;
      if (url) {
        updates.push(obs.setBrowserSource(`Caster ${i + 1}`, url));
        console.log(`[OBS Sync] Caster ${i + 1} cam → ${url}`);
      }
    }
    if (state.interviewee?.camUrl) {
      updates.push(obs.setBrowserSource('Interviewee', state.interviewee.camUrl));
      console.log(`[OBS Sync] Interviewee cam → ${state.interviewee.camUrl}`);
    }
    lastSyncedState.casterCamsSynced = true;
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

  for (const [source, file] of BROWSER_SOURCES) {
    const ok = await obs.setBrowserSource(source, `${base}/${file}`);
    results[source] = ok;
  }

  // Optional: refresh all sources to clear cache
  if (req.query.refresh === 'true') {
    await new Promise(r => setTimeout(r, 1000));
    for (const [source] of BROWSER_SOURCES) {
      await obs.refreshBrowserSource(source).catch(() => {});
    }
  }

  res.json({ success: true, results });
});

// Sync font to all OBS text sources
app.post('/api/obs/sync-font', async (req, res) => {
  const { fontFace, fontSize } = req.body;
  const textSources = ['Caster 1 Name', 'Caster 2 Name'];
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
    if (!isOverridden('maps')) {
      // Copy picker from perMapBans onto each map so overlays can read currentMap.picker
      const mapsWithPicker = maps.map((m, i) => ({
        ...m,
        picker: perMapBans[i]?.picker || null,
      }));
      update.maps = mapsWithPicker;
    }
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

/** Re-fetch current FACEIT match data (used when clearing overrides) */
app.post('/api/faceit/refresh', async (req, res) => {
  try {
    const currentState = getState();
    const matchId = currentState.faceitMatchId;
    if (!matchId) return res.status(400).json({ error: 'No FACEIT match loaded' });

    const [details, stats] = await Promise.all([
      faceit.getMatchDetails(matchId),
      faceit.getMatchStats(matchId).catch(() => []),
    ]);

    const faction1 = details.teams.faction1;
    const faction2 = details.teams.faction2;

    const maps = details.pickedMaps.map((m, i) => {
      const roundStats = stats[i];
      let winner = null;
      if (roundStats?.winner) {
        winner = roundStats.winner === faction1.id ? 'team1' : 'team2';
      }
      return {
        name: m.name, mode: m.mode,
        image: m.imageSm || m.imageLg,
        status: roundStats ? (roundStats.winner ? 'completed' : 'current') : 'upcoming',
        winner,
        roundScore: roundStats?.scoreSummary || null,
      };
    });

    const update = {};
    if (!isOverridden('bestOf')) update.bestOf = details.bestOf;
    if (!isOverridden('maps')) {
      update.maps = maps.map((m, i) => ({ ...m, picker: currentState.perMapBans?.[i]?.picker || null }));
    }
    if (!isOverridden('players')) {
      update.players = { team1: faction1.roster, team2: faction2.roster };
    }

    const t1 = { color: '#3b82f6', faceitId: faction1.id };
    if (!isOverridden('teams.team1.name')) t1.name = faction1.name;
    if (!isOverridden('teams.team1.logo')) t1.logo = faction1.avatar;
    if (!isOverridden('teams.team1.score')) t1.score = details.results?.score?.faction1 || 0;
    const t2 = { color: '#ef4444', faceitId: faction2.id };
    if (!isOverridden('teams.team2.name')) t2.name = faction2.name;
    if (!isOverridden('teams.team2.logo')) t2.logo = faction2.avatar;
    if (!isOverridden('teams.team2.score')) t2.score = details.results?.score?.faction2 || 0;
    update.teams = { team1: t1, team2: t2 };

    const updated = setState(update);
    broadcast('state', updated);
    syncToOBS(updated);
    res.json({ success: true });
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

// ============ FLYTHROUGHS API ============

/** Serve flythrough videos from the configured directory */
function setupFlythroughsRoute() {
  const dir = getState().flythroughsDir;
  if (dir && fs.existsSync(dir)) {
    flythroughs.scanDirectory(dir);
    console.log(`[Flythroughs] Serving videos from ${dir} (${Object.keys(flythroughs.getAllFlythroughs()).length} maps matched)`);
  }
}

app.get('/flythroughs/:file', (req, res) => {
  const dir = getState().flythroughsDir;
  if (!dir) return res.status(404).send('No flythroughs directory configured');
  const filePath = path.join(dir, decodeURIComponent(req.params.file));
  if (!fs.existsSync(filePath)) return res.status(404).send('Not found');
  res.sendFile(filePath);
});

/** Get available flythroughs index */
app.get('/api/flythroughs', (req, res) => {
  res.json({
    directory: getState().flythroughsDir || '',
    maps: flythroughs.getAllFlythroughs(),
  });
});

/** Look up flythrough for a specific map */
app.get('/api/flythroughs/lookup', (req, res) => {
  const mapName = req.query.map;
  if (!mapName) return res.status(400).json({ error: 'map query param required' });
  const url = flythroughs.getFlythroughUrl(mapName);
  res.json({ map: mapName, url });
});

/** Update flythroughs directory */
app.post('/api/flythroughs/directory', (req, res) => {
  const { directory } = req.body;
  if (!directory) return res.status(400).json({ error: 'directory required' });
  if (!fs.existsSync(directory)) return res.status(400).json({ error: 'Directory does not exist' });
  setState({ flythroughsDir: directory });
  flythroughs.scanDirectory(directory);
  const maps = flythroughs.getAllFlythroughs();
  console.log(`[Flythroughs] Directory set to ${directory} (${Object.keys(maps).length} maps matched)`);
  broadcast('state', getState());
  res.json({ success: true, maps });
});

// ============ MAP MUSIC API ============

/** Setup map music route */
function setupMapMusicRoute() {
  const dir = getState().mapMusicDir;
  if (dir && fs.existsSync(dir)) {
    mapMusic.scanDirectory(dir);
    console.log(`[MapMusic] Serving audio from ${dir} (${Object.keys(mapMusic.getAllMapMusic()).length} maps matched)`);
  }
}

/** Get available map music index */
app.get('/api/map-music', (req, res) => {
  res.json({
    directory: getState().mapMusicDir || '',
    maps: mapMusic.getAllMapMusic(),
  });
});

/** Look up music for a specific map */
app.get('/api/map-music/lookup', (req, res) => {
  const mapName = req.query.map;
  if (!mapName) return res.status(400).json({ error: 'map query param required' });
  const musicPath = mapMusic.getMusicPath(mapName);
  res.json({ map: mapName, path: musicPath });
});

/** Update map music directory */
app.post('/api/map-music/directory', (req, res) => {
  const { directory } = req.body;
  if (!directory) return res.status(400).json({ error: 'directory required' });
  if (!fs.existsSync(directory)) return res.status(400).json({ error: 'Directory does not exist' });
  setState({ mapMusicDir: directory });
  mapMusic.scanDirectory(directory);
  const maps = mapMusic.getAllMapMusic();
  console.log(`[MapMusic] Directory set to ${directory} (${Object.keys(maps).length} maps matched)`);
  broadcast('state', getState());
  res.json({ success: true, maps });
});
// ============ PRE-SHOW CHECKLIST ============

/** Pre-flight check — validate all systems before going live */
app.get('/api/preflight', async (req, res) => {
  const state = getState();
  const checks = [];

  // 1. OBS Connected
  checks.push({
    id: 'obs', label: 'OBS Connected',
    ok: obs.isConnected(),
    detail: obs.isConnected() ? 'Connected' : 'Not connected — connect in Settings',
  });

  // 2. Scene sources — check each scene has its sources present
  if (obs.isConnected()) {
    const scenesRes = await obs.rawCall('GetSceneList');
    const scenes = scenesRes?.scenes || [];
    let missingCount = 0;
    const missingSources = [];
    for (const scene of scenes) {
      const items = await obs.getSceneItemList(scene.sceneName);
      if (items.length === 0) {
        missingCount++;
        missingSources.push(scene.sceneName);
      }
    }
    checks.push({
      id: 'scenes', label: 'Scene Sources',
      ok: missingCount === 0,
      detail: missingCount === 0
        ? `${scenes.length} scenes — all have sources`
        : `${missingCount} empty scene(s): ${missingSources.join(', ')}`,
    });

    // 2b. Check browser sources have URLs (exclude caster/interviewee — covered by Cam URLs check)
    const camSourceNames = ['Caster 1', 'Caster 2', 'Interviewee'];
    const inputs = await obs.getInputList();
    const emptyBrowserSources = [];
    for (const input of inputs) {
      if (input.inputKind === 'browser_source' && !camSourceNames.includes(input.inputName)) {
        const settings = await obs.rawCall('GetInputSettings', { inputName: input.inputName });
        const url = settings?.inputSettings?.url || '';
        if (!url || url === 'about:blank') {
          emptyBrowserSources.push(input.inputName);
        }
      }
    }
    checks.push({
      id: 'browser_sources', label: 'Browser Sources',
      ok: emptyBrowserSources.length === 0,
      detail: emptyBrowserSources.length === 0
        ? 'All browser sources have URLs'
        : `Empty: ${emptyBrowserSources.join(', ')}`,
    });
  }

  // 3. Caster names
  const caster1 = state.casters?.[0]?.name;
  const caster2 = state.casters?.[1]?.name;
  checks.push({
    id: 'casters', label: 'Caster Names',
    ok: !!(caster1 && caster2),
    detail: caster1 && caster2 ? `${caster1} & ${caster2}` :
      !caster1 && !caster2 ? 'Neither caster named' :
      `Missing: ${!caster1 ? 'Caster 1' : 'Caster 2'}`,
  });

  // 4. Music sources
  checks.push({
    id: 'bg_music', label: 'Background Music',
    ok: !!state.bgMusicFile,
    detail: state.bgMusicFile || 'Not selected — set in Settings',
  });
  checks.push({
    id: 'casters_music', label: 'Casters Background Music',
    ok: !!state.castersBgMusicFile,
    detail: state.castersBgMusicFile || 'Not selected — set in Settings',
  });

  // 5. Flythrough videos — check the flythroughs module, not state
  const ftMaps = Object.keys(flythroughs.getAllFlythroughs());
  checks.push({
    id: 'flythroughs', label: 'Map Flythroughs',
    ok: ftMaps.length > 0,
    detail: ftMaps.length > 0 ? `${ftMaps.length} maps detected` : 'No folder set — configure in Settings',
  });

  // 6. Map music — check the mapMusic module, not state
  const mmMaps = Object.keys(mapMusic.getAllMapMusic());
  checks.push({
    id: 'map_music', label: 'Map Music',
    ok: mmMaps.length > 0,
    detail: mmMaps.length > 0 ? `${mmMaps.length} maps detected` : 'No folder set — configure in Settings',
  });

  // 7. Cam URLs (optional — warn if casters named but no cam)
  const cam1 = state.casters?.[0]?.camUrl;
  const cam2 = state.casters?.[1]?.camUrl;
  const castersNamed = !!(caster1 || caster2);
  checks.push({
    id: 'cams', label: 'Caster Cam URLs',
    ok: !castersNamed || (!!cam1 && !!cam2),
    detail: cam1 && cam2 ? 'Both configured' :
      !castersNamed ? 'No casters set (optional)' :
      `Missing: ${!cam1 ? 'Caster 1 cam' : ''}${!cam1 && !cam2 ? ', ' : ''}${!cam2 ? 'Caster 2 cam' : ''}`,
    warn: castersNamed && (!cam1 || !cam2),
  });

  const allOk = checks.every(c => c.ok);
  res.json({ allOk, checks });
});

// ============ OBS STREAM HEALTH ============

/** Get OBS stats for stream health monitoring */
app.get('/api/obs/stats', async (req, res) => {
  const stats = await obs.rawCall('GetStats');
  if (!stats) return res.json({ connected: false });

  const streamStatus = await obs.rawCall('GetStreamStatus');
  const recordStatus = await obs.rawCall('GetRecordStatus');

  res.json({
    connected: true,
    cpu: stats.cpuUsage,
    memoryUsage: stats.memoryUsage,
    availableDiskSpace: stats.availableDiskSpace,
    activeFps: stats.activeFps,
    renderSkippedFrames: stats.renderSkippedFrames,
    renderTotalFrames: stats.renderTotalFrames,
    outputSkippedFrames: stats.outputSkippedFrames,
    outputTotalFrames: stats.outputTotalFrames,
    streaming: streamStatus?.outputActive || false,
    streamDuration: streamStatus?.outputDuration || 0,
    streamBytes: streamStatus?.outputBytes || 0,
    recording: recordStatus?.outputActive || false,
    recordDuration: recordStatus?.outputDuration || 0,
  });
});

// ============ REPLAY BUFFER ============

/** Get replay buffer status */
app.get('/api/replay/status', async (req, res) => {
  const status = await obs.getReplayBufferStatus();
  const lastPath = status.active ? await obs.getLastReplayPath() : null;
  res.json({ ...status, lastReplayPath: lastPath });
});

/** Start replay buffer */
app.post('/api/replay/start', async (req, res) => {
  const ok = await obs.startReplayBuffer();
  res.json({ success: ok });
});

/** Stop replay buffer */
app.post('/api/replay/stop', async (req, res) => {
  const ok = await obs.stopReplayBuffer();
  res.json({ success: ok });
});

/** Save replay buffer (clip last N seconds) — accumulates clips */
app.post('/api/replay/save', async (req, res) => {
  const savedPath = await obs.saveReplayBuffer();
  if (savedPath) {
    const state = getState();
    const clips = [...(state.replayClips || []), savedPath];
    setState({ lastReplayPath: savedPath, replayClips: clips, replayIndex: clips.length - 1 });
    console.log(`[Replay] Saved clip ${clips.length}: ${savedPath}`);
    res.json({ success: true, path: savedPath, clipCount: clips.length });
  } else {
    res.json({ success: false, error: 'Failed to save replay — is the replay buffer running?' });
  }
});

/** Load a replay clip into the Replay source — supports cycling through clips */
app.post('/api/replay/load', async (req, res) => {
  const { switchScene, direction } = req.body || {};
  const state = getState();
  const clips = state.replayClips || [];
  if (clips.length === 0) {
    return res.json({ success: false, error: 'No replays saved yet' });
  }

  // Determine which clip to play
  let idx = state.replayIndex || 0;
  if (direction === 'next') {
    idx = (idx + 1) % clips.length;
  } else if (direction === 'prev') {
    idx = (idx - 1 + clips.length) % clips.length;
  }
  // else: play from current index (first load)

  const replayPath = clips[idx];
  setState({ replayIndex: idx });

  // Load into a media source called "Replay"
  const ok = await obs.setMediaSource('Replay', replayPath, false); // no loop
  if (!ok) {
    return res.json({ success: false, error: 'Could not set Replay source — make sure a "Replay" media source exists in OBS' });
  }

  // Optionally switch to Between Matches scene
  if (switchScene) {
    await obs.setScene('Between Matches');
  }

  console.log(`[Replay] Playing clip ${idx + 1}/${clips.length}: ${replayPath}`);
  res.json({ success: true, path: replayPath, index: idx, total: clips.length });
});

/** Clear all saved replay clips (use between matches) */
app.post('/api/replay/clear', (req, res) => {
  setState({ replayClips: [], replayIndex: 0, lastReplayPath: '' });
  console.log('[Replay] Clips cleared');
  res.json({ success: true });
});

// ============ DIRECTORY BROWSER ============

/** Browse filesystem directories for the folder picker */
app.get('/api/browse', (req, res) => {
  const dir = req.query.path || os.homedir();
  try {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return res.status(400).json({ error: 'Not a valid directory' });
    }
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const folders = [];
    const files = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // skip hidden
      if (entry.isDirectory()) {
        folders.push(entry.name);
      } else if (/\.(mp3|mp4|ogg|wav|flac|m4a|aac|webm|mkv|avi|mov)$/i.test(entry.name)) {
        files.push(entry.name);
      }
    }
    folders.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    files.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    res.json({ path: dir, parent: path.dirname(dir), folders, files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============ OBS SCENE COLLECTION ============

/** Download the OBS scene collection template */
app.get('/api/obs/scene-collection', (req, res) => {
  const filePath = path.join(__dirname, '..', 'data', 'obs-scene-collection.json');
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Scene collection file not found' });
  res.setHeader('Content-Disposition', 'attachment; filename="elemental-obs-scenes.json"');
  res.setHeader('Content-Type', 'application/json');
  res.sendFile(filePath);
});

// ============ BACKGROUND MUSIC API ============

/** List available background music files */
app.get('/api/bg-music', (req, res) => {
  const dir = getState().bgMusicDir;
  if (!dir || !fs.existsSync(dir)) return res.json({ directory: dir || '', files: [] });
  try {
    const files = fs.readdirSync(dir).filter(f => /\.(mp3|ogg|wav|flac|m4a|aac)$/i.test(f));
    res.json({
      directory: dir,
      files,
      bgMusicFile: getState().bgMusicFile || '',
      castersBgMusicFile: getState().castersBgMusicFile || '',
    });
  } catch (e) {
    res.json({ directory: dir, files: [], error: e.message });
  }
});

/** Set background music directory */
app.post('/api/bg-music/directory', (req, res) => {
  const { directory } = req.body;
  if (!directory) return res.status(400).json({ error: 'directory required' });
  if (!fs.existsSync(directory)) return res.status(400).json({ error: 'Directory does not exist' });
  setState({ bgMusicDir: directory });
  const files = fs.readdirSync(directory).filter(f => /\.(mp3|ogg|wav|flac|m4a|aac)$/i.test(f));
  console.log(`[BGMusic] Directory set to ${directory} (${files.length} files)`);
  broadcast('state', getState());
  res.json({ success: true, files });
});

/** Assign a file to a specific OBS music source */
app.post('/api/bg-music/assign', async (req, res) => {
  const { source, file } = req.body;
  if (!source || !file) return res.status(400).json({ error: 'source and file required' });
  const dir = getState().bgMusicDir;
  if (!dir) return res.status(400).json({ error: 'No music directory configured' });
  const absPath = path.join(dir, file);
  if (!fs.existsSync(absPath)) return res.status(400).json({ error: 'File not found' });

  if (source === 'background') {
    setState({ bgMusicFile: file });
    await obs.setMediaSource('Background Music', absPath);
    console.log(`[BGMusic] Background Music → ${file}`);
  } else if (source === 'casters') {
    setState({ castersBgMusicFile: file });
    await obs.setMediaSource('Casters Background Music', absPath);
    console.log(`[BGMusic] Casters Background Music → ${file}`);
  } else {
    return res.status(400).json({ error: 'source must be "background" or "casters"' });
  }

  broadcast('state', getState());
  res.json({ success: true });
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
  // Stop = pause + reset to full duration
  const s = getState();
  setState({ countdown: { ...s.countdown, remaining: s.countdown.duration, running: false } });
  broadcast('state', getState());
  res.json({ success: true });
});

app.post('/api/timer/pause', (req, res) => {
  // Pause = stop interval but keep remaining time
  stopCountdown();
  broadcast('state', getState());
  res.json({ success: true });
});

app.post('/api/timer/resume', (req, res) => {
  // Resume = restart interval from current remaining
  const s = getState();
  if (s.countdown.remaining > 0) {
    setState({ countdown: { ...s.countdown, running: true } });
    startCountdown();
    broadcast('state', getState());
  }
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
  const updated = getState();
  broadcast('state', updated);
  syncToOBS(updated);
  res.json({ success: true });
});

// ============ STREAM DECK / QUICK ACTION APIS ============

/** Toggle swap sides */
app.post('/api/swap', (req, res) => {
  const s = getState();
  setState({ swapSides: !s.swapSides });
  const updated = getState();
  broadcast('state', updated);
  syncToOBS(updated);
  res.json({ success: true, swapSides: updated.swapSides });
});

/** Reset match — clear scores, bans, map statuses, stats. Keep team names/logos if keepTeams=true */
app.post('/api/reset', (req, res) => {
  const s = getState();
  const keepTeams = req.body?.keepTeams !== false; // default: keep teams
  const resetData = {
    swapSides: false,
    heroBans: { team1: [], team2: [] },
    playerStats: [],
    perMapBans: [],
    selectedMapIdx: -1,
    faceitMatchId: '',
    players: { team1: [], team2: [] },
    maps: (s.maps || []).map(m => ({ ...m, status: 'upcoming', winner: null, roundScore: '' })),
  };

  if (keepTeams) {
    resetData.teams = {
      team1: { ...s.teams.team1, score: 0 },
      team2: { ...s.teams.team2, score: 0 },
    };
  } else {
    resetData.teams = {
      team1: { name: 'Team 1', logo: '', color: '#3b82f6', score: 0 },
      team2: { name: 'Team 2', logo: '', color: '#ef4444', score: 0 },
    };
    resetData.maps = [];
  }

  setState(resetData);
  clearAllOverrides();
  const updated = getState();
  broadcast('state', updated);
  syncToOBS(updated);
  res.json({ success: true });
});

/** Mark map winner — increments score + completes current map + advances to next */
app.post('/api/map-win', (req, res) => {
  const team = req.query.team || req.body.team; // 'team1' or 'team2'
  if (!team || !['team1', 'team2'].includes(team)) {
    return res.status(400).json({ error: 'team must be "team1" or "team2"' });
  }

  const s = getState();
  const maps = [...(s.maps || [])];
  const currentIdx = maps.findIndex(m => m.status === 'current');

  if (currentIdx >= 0) {
    maps[currentIdx] = { ...maps[currentIdx], status: 'completed', winner: team };
  }

  // Advance to next map
  const nextIdx = maps.findIndex(m => m.status === 'upcoming');
  if (nextIdx >= 0) {
    maps[nextIdx] = { ...maps[nextIdx], status: 'current' };
  }

  // Increment score
  const teamData = s.teams[team];
  const teams = { ...s.teams, [team]: { ...teamData, score: teamData.score + 1 } };

  setState({ maps, teams });
  const updated = getState();
  broadcast('state', updated);
  syncToOBS(updated);
  res.json({ success: true, score: updated.teams[team].score });
});

/** Toggle lower third visibility */
app.post('/api/lower-third/toggle', (req, res) => {
  const s = getState();
  const visible = !(s.lowerThird?.visible);
  setState({ lowerThird: { ...s.lowerThird, visible } });
  broadcast('state', getState());
  res.json({ success: true, visible });
});

/** Toggle caster camera visibility in scenes */
app.post('/api/casters/toggle', async (req, res) => {
  const s = getState();
  const casterLayout = s.casterLayout || 2;
  // Cycle: 2 → 1 → 0 → 2
  const next = casterLayout === 2 ? 1 : casterLayout === 1 ? 0 : 2;
  setState({ casterLayout: next });
  broadcast('state', getState());

  // Toggle OBS source visibility for caster cameras
  const scenes = ['Casters', 'Casters Lobby', 'Casters Scoreboard', 'Map Score'];
  for (const scene of scenes) {
    await obs.setSourceVisibility(scene, 'Caster 1', next >= 1);
    await obs.setSourceVisibility(scene, 'Caster 2', next >= 2);
  }

  res.json({ success: true, casterLayout: next });
});

/** Set caster layout directly: 0, 1, or 2 */
app.post('/api/casters/layout', async (req, res) => {
  const count = Number(req.body?.count ?? req.query?.count ?? 2);
  if (![0, 1, 2].includes(count)) {
    return res.status(400).json({ error: 'count must be 0, 1, or 2' });
  }
  setState({ casterLayout: count });
  broadcast('state', getState());

  const scenes = ['Casters', 'Casters Lobby', 'Casters Scoreboard', 'Map Score'];
  for (const scene of scenes) {
    await obs.setSourceVisibility(scene, 'Caster 1', count >= 1);
    await obs.setSourceVisibility(scene, 'Caster 2', count >= 2);
  }

  res.json({ success: true, casterLayout: count });
});

/** Set caster webcam URL — pushes to OBS browser source */
app.post('/api/casters/cam', async (req, res) => {
  const { index, camUrl } = req.body;
  if (index === undefined) return res.status(400).json({ error: 'index required' });
  const casters = [...getState().casters];
  casters[index] = { ...casters[index], camUrl: camUrl || '' };
  setState({ casters });
  broadcast('state', getState());

  // Push URL to OBS browser source
  const sourceName = `Caster ${index + 1}`;
  if (camUrl) {
    await obs.setBrowserSource(sourceName, camUrl);
    console.log(`[OBS Sync] ${sourceName} cam → ${camUrl}`);
  }

  res.json({ success: true });
});

/** Set interviewee webcam URL — pushes to OBS browser source */
app.post('/api/interviewee/cam', async (req, res) => {
  const { camUrl } = req.body;
  const interviewee = { ...getState().interviewee, camUrl: camUrl || '' };
  setState({ interviewee });
  broadcast('state', getState());

  if (camUrl) {
    await obs.setBrowserSource('Interviewee', camUrl);
    console.log(`[OBS Sync] Interviewee cam → ${camUrl}`);
  }

  res.json({ success: true });
});

/** Refresh all overlay browser sources */
app.post('/api/overlays/refresh', async (req, res) => {
  const BROWSER_SOURCES = [
    'Gameplay HUD', 'Casters BS', 'Casters Lobby BS', 'Casters Scoreboard BS',
    'Casters Map Score BS', 'Series Winner BS', 'Between Matches BS',
    'Starting Soon BS', 'BRB BS', 'Interview BS', 'End Stream BS',
    'Map Intro BS', 'Map Pick BS',
  ];
  for (const source of BROWSER_SOURCES) {
    await obs.refreshBrowserSource(source);
  }
  res.json({ success: true, refreshed: BROWSER_SOURCES.length });
});

/** BRB mode: switch to BRB scene + start timer */
app.post('/api/brb', (req, res) => {
  const duration = req.body?.duration || 300; // default 5 min
  obs.setScene('BRB');
  setState({
    countdown: { duration, remaining: duration, running: true, label: 'BRB' },
    currentScene: 'BRB',
  });
  startCountdown();
  broadcast('state', getState());
  res.json({ success: true });
});

// ============ OBS SOURCE/AUDIO APIS ============

/** Get scene items for a scene (or current scene) */
app.get('/api/obs/sources', async (req, res) => {
  const sceneName = req.query.scene || await obs.getCurrentProgramScene();
  if (!sceneName) return res.json([]);
  const items = await obs.getSceneItemList(sceneName);
  res.json(items.map(i => ({
    id: i.sceneItemId,
    name: i.sourceName,
    kind: i.inputKind,
    enabled: i.sceneItemEnabled,
  })).reverse());
});

/** Toggle source visibility */
app.post('/api/obs/source/visibility', async (req, res) => {
  const { scene, source, visible } = req.body;
  const sceneName = scene || await obs.getCurrentProgramScene();
  const ok = await obs.setSourceVisibility(sceneName, source, visible);
  res.json({ success: ok });
});

/** Get all audio sources with volumes */
app.get('/api/obs/audio', async (req, res) => {
  // Discover sources from BOTH GetInputList and scene items
  const inputs = await obs.getInputList();
  const inputNames = new Set(inputs.map(i => i.inputName));
  
  // Also scan all scenes for sources not in the input list (e.g. Application Audio Capture)
  const scenesRes = await obs.rawCall('GetSceneList');
  if (scenesRes?.scenes) {
    for (const scene of scenesRes.scenes) {
      const items = await obs.getSceneItemList(scene.sceneName);
      for (const item of items) {
        if (!inputNames.has(item.sourceName) && item.inputKind) {
          inputs.push({ inputName: item.sourceName, inputKind: item.inputKind });
          inputNames.add(item.sourceName);
        }
      }
    }
  }

  console.log('[Audio API] All discovered sources:', inputs.map(i => `${i.inputName} (${i.inputKind})`));
  
  const audioSources = [];
  for (const input of inputs) {
    // Try to get volume — if it works, the source has audio
    const vol = await obs.getInputVolume(input.inputName);
    if (vol !== null) {
      const muted = await obs.getInputMute(input.inputName);
      audioSources.push({
        name: input.inputName,
        kind: input.inputKind,
        volumeDb: vol.inputVolumeDb,
        volumeMul: vol.inputVolumeMul,
        muted: muted ?? false,
      });
    }
  }
  console.log('[Audio API] Sources with volume:', audioSources.map(s => s.name));
  res.json(audioSources);
});

/** Debug: dump all raw OBS inputs + scene items */
app.get('/api/obs/debug-inputs', async (req, res) => {
  const inputs = await obs.getInputList();
  const scenesRes = await obs.rawCall('GetSceneList');
  const sceneItems = {};
  if (scenesRes?.scenes) {
    for (const scene of scenesRes.scenes) {
      sceneItems[scene.sceneName] = await obs.getSceneItemList(scene.sceneName);
    }
  }
  res.json({ inputs, sceneItems });
});

/** Set audio volume */
app.post('/api/obs/audio/volume', async (req, res) => {
  const { source, volumeDb } = req.body;
  const ok = await obs.setInputVolume(source, volumeDb);
  res.json({ success: ok });
});

/** Toggle audio mute */
app.post('/api/obs/audio/mute', async (req, res) => {
  const { source, muted } = req.body;
  const ok = await obs.setInputMute(source, muted);
  res.json({ success: ok });
});

/** Scene preview thumbnail */
app.get('/api/obs/preview', async (req, res) => {
  const sceneName = req.query.scene;
  if (!sceneName) return res.status(400).json({ error: 'scene required' });
  const imageData = await obs.getSourceScreenshot(sceneName, 320, 180);
  if (!imageData) return res.status(500).json({ error: 'Preview failed' });
  res.json({ scene: sceneName, imageData });
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

// Browser source list (shared between startup and manual setup)
const BROWSER_SOURCES = [
  ['Gameplay HUD', 'gameplay-hud.html'],
  ['Casters BS', 'casters.html'],
  ['Casters Lobby BS', 'casters-lobby.html'],
  ['Casters Scoreboard BS', 'casters-scoreboard.html'],
  ['Casters Map Score BS', 'casters-map-score.html'],
  ['Series Winner BS', 'series-winner.html'],
  ['Between Matches BS', 'between-matches.html'],
  ['Starting Soon BS', 'starting-soon.html'],
  ['BRB BS', 'brb.html'],
  ['Interview BS', 'interview.html'],
  ['End Stream BS', 'end-of-stream.html'],
  ['Map Intro BS', 'map-intro.html'],
  ['Map Pick BS', 'map-pick.html'],
  ['Casters Flythrough HUD', 'casters-flythrough-hud.html'],
];

let browserSourcesConfigured = false;

async function setupBrowserSources() {
  if (browserSourcesConfigured) {
    console.log('[OBS] Browser sources already configured, skipping');
    return;
  }
  browserSourcesConfigured = true;

  const base = `http://localhost:${PORT}/overlays`;

  // Step 1: Set stable URLs (no cache buster — idempotent, won't trigger reload if already set)
  for (const [source, file] of BROWSER_SOURCES) {
    await obs.setBrowserSource(source, `${base}/${file}`).catch(() => {});
  }

  // Step 2: Single pass refresh to bust any stale cache
  await new Promise(r => setTimeout(r, 1000));
  for (const [source] of BROWSER_SOURCES) {
    await obs.refreshBrowserSource(source).catch(() => {});
  }

  console.log('[OBS] Browser sources configured for all overlays');
}

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
      await setupBrowserSources();
    }, 3000);

    // Auto-cycle replay clips when one finishes playing
    obs.onEvent('onMediaEnd', async (data) => {
      if (data.inputName !== 'Replay') return;
      const state = getState();
      const clips = state.replayClips || [];
      if (clips.length === 0) return;

      const nextIdx = ((state.replayIndex || 0) + 1) % clips.length;
      setState({ replayIndex: nextIdx });
      await obs.setMediaSource('Replay', clips[nextIdx], false);
      console.log(`[Replay] Auto-cycling to clip ${nextIdx + 1}/${clips.length}`);
    });
  }).catch(() => {});
}

// Pre-fetch heroes
getHeroes().catch(() => {});

// Initialize flythroughs from saved state
setupFlythroughsRoute();
setupMapMusicRoute();

// SPA catch-all — must be AFTER all API routes
// In production, serve index.html for any unmatched route (React Router)
if (fs.existsSync(distDir)) {
  app.get('{*path}', (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  const mode = fs.existsSync(distDir) ? 'production' : 'development';
  console.log(`[Server] Production Companion (${mode}) running on http://localhost:${PORT}`);
  console.log(`[Server] Overlays available at http://localhost:${PORT}/overlays/`);
});
