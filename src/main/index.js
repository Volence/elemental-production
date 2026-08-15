/**
 * Electron main process entry.
 *
 * electron-vite bundles this and marks 'electron' as external.
 * The Express server is forked as a child process (separate Node runtime).
 *
 * On first launch, copies .env.example to userData if no .env exists there.
 * Passes ELEMENTAL_USER_DATA to the server so config persists across updates.
 *
 * Dev mode (ELECTRON_IS_DEV=1):
 *   - Server is already running via concurrently, so we skip forking it.
 *   - Window loads the Vite dev server URL for HMR.
 */
import { app, BrowserWindow, shell, globalShortcut, ipcMain } from 'electron';
import { join } from 'path';
import { fork } from 'child_process';
import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs';

const SERVER_PORT = 3001;
const IS_DEV = process.env.ELECTRON_IS_DEV === '1';
const VITE_DEV_URL = process.env.VITE_DEV_SERVER_URL;
let mainWindow;
let serverProcess;

/** Resolve a path relative to the app root (works in dev + packaged) */
function appPath(relativePath) {
  // In packaged app: __dirname = <install>/resources/app/out/main
  // In dev: __dirname = <project>/out/main
  // Both cases: ../../ gets us to the app root
  return join(__dirname, '..', '..', relativePath);
}

async function fetchAndRegisterHotkeys() {
  try {
    const res = await fetch(`http://localhost:${SERVER_PORT}/api/hotkeys`);
    const config = await res.json();

    globalShortcut.unregisterAll();

    if (config.sceneSwitch) {
      for (const [scene, accelerator] of Object.entries(config.sceneSwitch)) {
        if (!accelerator) continue;
        const ok = globalShortcut.register(accelerator, () => {
          fetch(`http://localhost:${SERVER_PORT}/api/obs/scene`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: scene }),
          }).catch(e => console.warn('[Hotkeys] Scene switch failed:', e.message));
        });
        if (!ok) console.warn(`[Hotkeys] Failed to register ${accelerator} for ${scene}`);
      }
    }

    if (config.swapSides) {
      const ok = globalShortcut.register(config.swapSides, async () => {
        try {
          const stateRes = await fetch(`http://localhost:${SERVER_PORT}/api/state`);
          const state = await stateRes.json();
          await fetch(`http://localhost:${SERVER_PORT}/api/state`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ swapSides: !state.swapSides }),
          });
        } catch (e) {
          console.warn('[Hotkeys] Swap sides failed:', e.message);
        }
      });
      if (!ok) console.warn(`[Hotkeys] Failed to register ${config.swapSides} for swap sides`);
    }

    console.log('[Hotkeys] Registered global shortcuts');
  } catch (e) {
    console.warn('[Hotkeys] Failed to fetch/register:', e.message);
  }
}

/**
 * Seed a bundled asset pack (hero renders / map images) into userData.
 *
 * The server resolves these packs out of ELEMENTAL_USER_DATA (see
 * HERO_RENDERS_DIR / MAP_IMAGES_DIR in server/server.js), which a packaged
 * install auto-creates EMPTY — so every packaged build fell back to face
 * icons for bans and blank cards for maps while dev (repo data/) looked fine.
 *
 * Copies per-file and SKIPS anything already present, so a producer's own
 * drop-in always wins over the shipped asset — same "merge, never clobber"
 * shape as the .env handling above. Corollary, and intended: once an install
 * has seeded, a corrected shipped asset will NOT overwrite the copy already
 * sitting in userData. Delete the file there and it re-seeds on next launch.
 *
 * Source: <resources>/seed/<name> when packaged (electron-builder
 * extraResources). Dev never seeds at all — the dev server reads the repo's
 * data/ directly, so seeding would only pin a stale copy into userData.
 *
 * ENTIRELY best-effort: this is cosmetic art. Any failure is warned about and
 * swallowed — initUserData() runs inside app.whenReady(), so a throw here
 * would mean the window never opens over a missing picture.
 */
function seedAssetDir(userDataPath, name) {
  try {
    if (!app.isPackaged) return;  // dev reads repo data/ live; nothing to seed

    const src = process.resourcesPath ? join(process.resourcesPath, 'seed', name) : null;
    if (!src || !existsSync(src)) {
      // A packaged build with no seed/ folder is a BROKEN build — it silently
      // reproduces the exact empty-user-data bug this seeding exists to fix,
      // so say so loudly rather than falling back to a path that isn't there.
      console.warn(`[Electron] Packaged build is missing bundled assets: ${src || '<no resourcesPath>'} ` +
        `— check build.extraResources in package.json (bans/maps will fall back to low-res art)`);
      return;
    }

    const dest = join(userDataPath, name);
    if (!existsSync(dest)) mkdirSync(dest, { recursive: true });

    let copied = 0;
    for (const file of readdirSync(src)) {
      const from = join(src, file);
      const to = join(dest, file);
      try {
        if (existsSync(to)) continue;            // producer drop-in wins (see above)
        if (!statSync(from).isFile()) continue;  // packs are flat; ignore stray dirs
        copyFileSync(from, to);
        copied++;
      } catch (e) {
        console.warn(`[Electron] Failed to seed ${name}/${file}:`, e.message);
      }
    }
    if (copied) console.log(`[Electron] Seeded ${copied} file(s) into ${dest}`);
  } catch (e) {
    console.warn(`[Electron] Asset seeding for ${name} failed (continuing):`, e.message);
  }
}

function initUserData() {
  const userDataPath = app.getPath('userData');

  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true });
  }

  // Copy .env.example → userData/.env on first launch, or merge new keys on update
  const userEnv = join(userDataPath, '.env');
  const exampleEnv = appPath('.env.example');
  if (!existsSync(userEnv)) {
    if (existsSync(exampleEnv)) {
      copyFileSync(exampleEnv, userEnv);
      console.log('[Electron] Created default .env in', userDataPath);
    }
  } else if (existsSync(exampleEnv)) {
    // Fill in keys that have values in .env.example but are empty/missing in user .env
    // This lets CI-injected keys (e.g. FACEIT_API_KEY) reach existing installs
    const exampleContent = readFileSync(exampleEnv, 'utf8');
    let userContent = readFileSync(userEnv, 'utf8');
    let updated = false;
    for (const match of exampleContent.matchAll(/^([A-Z_][A-Z0-9_]*)=(.+)$/gm)) {
      const [, key, val] = match;
      const userHasValue = new RegExp(`^${key}=.+$`, 'm').test(userContent);
      if (!userHasValue) {
        const userHasEmpty = new RegExp(`^${key}=$`, 'm').test(userContent);
        if (userHasEmpty) {
          userContent = userContent.replace(new RegExp(`^${key}=$`, 'm'), `${key}=${val}`);
        } else {
          userContent += `\n${key}=${val}`;
        }
        updated = true;
      }
    }
    if (updated) {
      writeFileSync(userEnv, userContent);
      console.log('[Electron] Merged new config keys into .env');
    }
  }

  // Shipped image packs -> userData (packaged only, missing files only, and
  // never fatal — see seedAssetDir)
  seedAssetDir(userDataPath, 'hero-renders');
  seedAssetDir(userDataPath, 'map-images');

  return userDataPath;
}

function startServer(userDataPath) {
  const serverPath = appPath('server/server.js');
  console.log('[Electron] Server path:', serverPath, 'exists:', existsSync(serverPath));

  serverProcess = fork(serverPath, [], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      ELEMENTAL_USER_DATA: userDataPath,
      // The forked process must run as Node.js, not as Electron
      ELECTRON_RUN_AS_NODE: '1',
    },
  });

  serverProcess.on('error', (e) => console.error('[Electron] Server error:', e));
  serverProcess.on('exit', (code) => console.log('[Electron] Server exited with code', code));
  console.log('[Electron] Server forked on port', SERVER_PORT);
  console.log('[Electron] User data:', userDataPath);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Elemental Production',
    icon: appPath('public/elemental-logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
    },
    backgroundColor: '#0a0a12',
    autoHideMenuBar: true,
  });

  // Dev: load Vite dev server for HMR. Prod: load Express server.
  const url = VITE_DEV_URL || `http://localhost:${SERVER_PORT}`;
  mainWindow.loadURL(url);
  console.log('[Electron] Loading', url);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  const userDataPath = initUserData();

  if (!IS_DEV) {
    startServer(userDataPath);
    await new Promise((r) => setTimeout(r, 3000));
  } else {
    console.log('[Electron] Dev mode — server managed externally');
  }

  createWindow();

  await fetchAndRegisterHotkeys();

  ipcMain.on('reload-hotkeys', async () => {
    console.log('[Hotkeys] Reloading...');
    await fetchAndRegisterHotkeys();
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (serverProcess) serverProcess.kill();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
