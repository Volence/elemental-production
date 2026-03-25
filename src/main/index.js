/**
 * Electron main process entry.
 *
 * electron-vite bundles this and marks 'electron' as external.
 * The Express server is forked as a child process (separate Node runtime).
 *
 * On first launch, copies .env.example to userData if no .env exists there.
 * Passes ELEMENTAL_USER_DATA to the server so config persists across updates.
 */
import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { fork } from 'child_process';
import { existsSync, copyFileSync, mkdirSync } from 'fs';

const SERVER_PORT = 3001;
let mainWindow;
let serverProcess;

function initUserData() {
  const userDataPath = app.getPath('userData');

  // Ensure directory exists
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, { recursive: true });
  }

  // Copy .env.example → userData/.env on first launch
  const userEnv = join(userDataPath, '.env');
  if (!existsSync(userEnv)) {
    const exampleEnv = join(__dirname, '../../.env.example');
    if (existsSync(exampleEnv)) {
      copyFileSync(exampleEnv, userEnv);
      console.log('[Electron] Created default .env in', userDataPath);
    }
  }

  return userDataPath;
}

function startServer(userDataPath) {
  const serverPath = join(__dirname, '../../server/server.js');
  serverProcess = fork(serverPath, [], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PORT: String(SERVER_PORT),
      ELEMENTAL_USER_DATA: userDataPath,
    },
  });
  serverProcess.on('error', (e) => console.error('[Electron] Server error:', e));
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
    icon: join(__dirname, '../../public/elemental-logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#0a0a12',
    autoHideMenuBar: true,
  });

  mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);

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
  startServer(userDataPath);
  await new Promise((r) => setTimeout(r, 2000));
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
