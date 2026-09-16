/**
 * In-app updates via electron-updater (GitHub provider).
 *
 * BROADCAST SAFETY: this app feeds every OBS overlay during a live show, so it
 * NEVER restarts on its own. Updates download quietly in the background and
 * are applied only when the producer clicks "Restart to update" (the dashboard
 * confirms first if a match looks live) or on a normal quit
 * (autoInstallOnAppQuit). A failed check is logged with [Updater] and shown on
 * the Settings card only — it must never throw, crash, or pop anything up.
 *
 * Where updates come from: the release workflow attaches latest.yml /
 * latest-linux.yml (+ the .exe.blockmap) to each GitHub release; electron-
 * updater reads resources/app-update.yml (written by electron-builder from
 * build.publish) to know which repo to ask.
 *
 * Linux caveat: self-update only works when running FROM the AppImage (it
 * replaces the file at $APPIMAGE). Any other packaged Linux run (e.g.
 * linux-unpacked) gets a plain GitHub API version check and a "download
 * manually" status instead of an updater error.
 */
import process from 'node:process';
import { app, ipcMain } from 'electron';
// electron-updater is CommonJS and exposes `autoUpdater` through a lazy
// getter, which Node's ESM named-export detection can't see — default import.
import electronUpdater from 'electron-updater';
import {
  INITIAL_UPDATE_STATUS, reduceUpdateStatus, summarizeUpdaterError, isNewerVersion, cleanVersion,
} from '../lib/update-status.js';

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;
// Let the server fork + window load settle before touching the network.
const FIRST_CHECK_DELAY_MS = 15 * 1000;
const GITHUB_LATEST_API = 'https://api.github.com/repos/Volence/elemental-production/releases/latest';
const DEV_DISABLED_MESSAGE = 'Updates are only checked in the installed app (this is a dev build)';

const log = {
  info: (...a) => console.log('[Updater]', ...a),
  warn: (...a) => console.warn('[Updater]', ...a),
  error: (...a) => console.error('[Updater]', ...a),
  debug: () => {},
};

let status = INITIAL_UPDATE_STATUS;
let getWindow = () => null;
let updater = null;        // electron-updater instance, only when it can actually work
let manualCheckInFlight = null;
let lastErrorMessage = null;
let initialized = false;

function dispatch(event) {
  const next = reduceUpdateStatus(status, event);
  if (next === status) return;
  status = next;
  try {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('updater:status', status);
  } catch (e) {
    log.warn('Failed to push status to renderer:', e.message);
  }
}

function canSelfUpdate() {
  if (process.platform === 'linux') return !!process.env.APPIMAGE;
  return process.platform === 'win32' || process.platform === 'darwin';
}

function setupElectronUpdater() {
  const u = electronUpdater.autoUpdater;
  u.logger = log;
  u.autoDownload = true;
  u.autoInstallOnAppQuit = true;

  u.on('checking-for-update', () => dispatch({ type: 'checking' }));
  u.on('update-available', (info) => dispatch({
    type: 'available',
    version: info?.version,
    releaseNotes: typeof info?.releaseNotes === 'string' ? info.releaseNotes : null,
  }));
  u.on('update-not-available', () => dispatch({ type: 'not-available' }));

  // Progress fires many times a second; only forward whole-percent changes so
  // the dashboard isn't re-rendering on every chunk mid-show.
  let lastPct = -1;
  u.on('download-progress', (p) => {
    const pct = Math.floor(p?.percent ?? 0);
    if (pct === lastPct) return;
    lastPct = pct;
    dispatch({ type: 'downloading', percent: pct });
  });
  u.on('update-downloaded', (info) => {
    lastPct = -1;
    log.info(`v${info?.version} downloaded — installs on "Restart to update" or next quit`);
    dispatch({ type: 'downloaded', version: info?.version });
  });
  // Without an 'error' listener an EventEmitter error THROWS — this listener
  // is what keeps a GitHub outage from taking the main process down. No log
  // here: electron-updater already wrote the full error through u.logger.
  u.on('error', (err) => {
    lastPct = -1;
    lastErrorMessage = summarizeUpdaterError(err);
    dispatch({ type: 'error', message: lastErrorMessage });
  });
  return u;
}

/** Non-AppImage Linux: compare against GitHub's latest release, no download. */
function manualCheck() {
  if (manualCheckInFlight) return manualCheckInFlight;
  manualCheckInFlight = (async () => {
    dispatch({ type: 'checking' });
    try {
      const res = await fetch(GITHUB_LATEST_API, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'elemental-production-updater' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      const data = await res.json();
      const latest = cleanVersion(data?.tag_name);
      if (latest && isNewerVersion(latest, app.getVersion())) {
        log.info(`v${latest} available (not running from an AppImage — manual download)`);
        dispatch({ type: 'available', version: latest, manual: true });
      } else {
        dispatch({ type: 'not-available' });
      }
    } catch (e) {
      log.error('Manual check failed:', e?.message || e);
      dispatch({ type: 'error', message: summarizeUpdaterError(e) });
    } finally {
      manualCheckInFlight = null;
    }
  })();
  return manualCheckInFlight;
}

async function checkForUpdates(reason) {
  if (!app.isPackaged) {
    dispatch({ type: 'disabled', message: DEV_DISABLED_MESSAGE });
    return status;
  }
  // A ready installer stays put (see reduceUpdateStatus) — don't re-download.
  if (status.state === 'downloaded') return status;
  log.info(`Checking for updates (${reason})`);
  try {
    if (updater) {
      const result = await updater.checkForUpdates();
      // With autoDownload the check resolves with a separate downloadPromise;
      // a failed download rejects it AND emits 'error' (which already set the
      // status and logged). Unhandled, that rejection would surface as an
      // unhandledRejection in the main process.
      result?.downloadPromise?.catch?.(() => {});
    } else {
      await manualCheck();
    }
  } catch (e) {
    // electron-updater has already emitted 'error' (→ status, full log) by the
    // time the promise rejects; this only guarantees nothing escapes.
    log.warn(`Check failed (${reason}): ${summarizeUpdaterError(e)}`);
    dispatch({ type: 'error', message: summarizeUpdaterError(e) });
  }
  return status;
}

function installUpdate() {
  if (!updater || status.state !== 'downloaded') {
    return { ok: false, message: 'No downloaded update to install' };
  }
  log.info(`Restart to update → v${status.version} (producer-initiated)`);
  lastErrorMessage = null;
  try {
    // isSilent=true: no NSIS wizard; isForceRunAfter=true: relaunch after.
    // quitAndInstall starts the installer synchronously and defers the actual
    // app.quit() a tick, so this reply still reaches the renderer.
    updater.quitAndInstall(true, true);
  } catch (e) {
    log.error('quitAndInstall threw:', e?.stack || e);
    return { ok: false, message: summarizeUpdaterError(e) };
  }
  // BaseUpdater resets quitAndInstallCalled when install() fails (emitting
  // 'error' instead of quitting). The reducer deliberately ignores errors
  // while an update is downloaded, so hand the reason back to the click.
  if (updater.quitAndInstallCalled === false) {
    return { ok: false, message: lastErrorMessage || 'Install failed — see [Updater] logs' };
  }
  return { ok: true };
}

/**
 * Call once from app.whenReady(). IPC handlers are registered in every mode
 * so the dashboard's Settings card works in dev too (it just reports
 * "disabled"); the network is only touched in a packaged build.
 *
 * @param {{ getWindow: () => (import('electron').BrowserWindow | null) }} opts
 */
export function initUpdater(opts) {
  if (initialized) return;
  initialized = true;
  if (opts?.getWindow) getWindow = opts.getWindow;

  ipcMain.handle('app:get-version', () => app.getVersion());
  ipcMain.handle('updater:get-status', () => status);
  ipcMain.handle('updater:check', () => checkForUpdates('manual'));
  ipcMain.handle('updater:install', () => installUpdate());

  if (!app.isPackaged) {
    dispatch({ type: 'disabled', message: DEV_DISABLED_MESSAGE });
    log.info('Dev build — update checks disabled');
    return;
  }

  try {
    if (canSelfUpdate()) updater = setupElectronUpdater();
    else log.info('Not running from an AppImage — update checks will link to a manual download');
  } catch (e) {
    // Never let updater wiring stop the app from starting; fall back to the
    // version-only check so the producer still hears about new releases.
    log.error('electron-updater setup failed, using manual checks:', e?.stack || e);
    updater = null;
  }

  setTimeout(() => { checkForUpdates('launch'); }, FIRST_CHECK_DELAY_MS);
  setInterval(() => { checkForUpdates('periodic'); }, CHECK_INTERVAL_MS);
}
