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
import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { fork } from 'child_process';
import { existsSync, copyFileSync, mkdirSync } from 'fs';

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

function initUserData() {
  const userDataPath = app.getPath('userData');

  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true });
  }

  // Copy .env.example → userData/.env on first launch
  const userEnv = join(userDataPath, '.env');
  if (!existsSync(userEnv)) {
    const exampleEnv = appPath('.env.example');
    if (existsSync(exampleEnv)) {
      copyFileSync(exampleEnv, userEnv);
      console.log('[Electron] Created default .env in', userDataPath);
    }
  }

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
    // Production: fork the Express server as a child process
    startServer(userDataPath);
    // Wait for server to bind
    await new Promise((r) => setTimeout(r, 3000));
  } else {
    console.log('[Electron] Dev mode — server managed externally');
  }

  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
