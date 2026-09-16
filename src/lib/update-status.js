/**
 * In-app updater: pure status logic shared by the Electron main process
 * (src/main/updater.js) and the dashboard (App banner + Settings card).
 *
 * The main process owns the one true status object and pushes the WHOLE
 * object to the renderer after every change, so a dashboard that mounts late
 * (window reload, Settings opened an hour in) just asks for the current value
 * instead of replaying a stream of events it missed.
 *
 * Nothing here touches electron / the DOM, so it is unit-tested directly.
 */

export const RELEASES_URL = 'https://github.com/Volence/elemental-production/releases';

/**
 * state:
 *   idle          nothing checked yet
 *   disabled      dev / unpackaged build — updates are never checked there
 *   checking      a check is in flight
 *   not-available up to date
 *   available     newer release found (auto-download starting, or `manual`:
 *                 this install can't self-update — Linux not run from the
 *                 AppImage — so the producer downloads it by hand)
 *   downloading   percent 0-100
 *   downloaded    installer ready; applied on "Restart to update" or next quit
 *   error         message is a one-line summary (never a stack)
 */
export const INITIAL_UPDATE_STATUS = Object.freeze({
  state: 'idle',
  version: null,
  percent: null,
  releaseNotes: null,
  manual: false,
  message: null,
  checkedAt: null,
});

/**
 * Fold one updater event into the status.
 *
 * The important rule is that a READY update is sticky: the 4-hourly
 * background check (or a flaky network error) must not make the "Restart to
 * update" affordance disappear while the downloaded installer is still on
 * disk and still installs on quit. Same for an in-flight download — a
 * redundant check shouldn't reset the progress bar to "checking".
 *
 * @param {object} prev   current status (INITIAL_UPDATE_STATUS shape)
 * @param {{type:string, version?:string, percent?:number, releaseNotes?:string,
 *          manual?:boolean, message?:string, at?:number}} event
 */
export function reduceUpdateStatus(prev, event) {
  const s = prev || INITIAL_UPDATE_STATUS;
  if (!event || typeof event.type !== 'string') return s;
  const at = typeof event.at === 'number' ? event.at : Date.now();

  switch (event.type) {
    case 'disabled':
      return { ...INITIAL_UPDATE_STATUS, state: 'disabled', message: event.message || null };

    case 'checking':
      if (s.state === 'downloaded' || s.state === 'downloading') return s;
      return { ...s, state: 'checking', message: null };

    case 'available': {
      const version = cleanVersion(event.version);
      // Holding a ready installer wins even over a newer release: swapping the
      // banner back to "downloading" would hide the restart button mid-show.
      // The newer one is picked up on the next launch's check.
      if (s.state === 'downloaded') return s;
      // Re-announcement of the version already being fetched.
      if (s.state === 'downloading' && s.version === version) return s;
      return {
        ...s,
        state: 'available',
        version,
        percent: null,
        releaseNotes: typeof event.releaseNotes === 'string' ? event.releaseNotes : null,
        manual: !!event.manual,
        message: null,
        checkedAt: at,
      };
    }

    case 'downloading': {
      if (s.state === 'downloaded') return s;
      const pct = Number(event.percent);
      return {
        ...s,
        state: 'downloading',
        version: cleanVersion(event.version) || s.version,
        percent: Number.isFinite(pct) ? Math.max(0, Math.min(100, Math.round(pct))) : (s.percent ?? 0),
        manual: false,
        message: null,
      };
    }

    case 'downloaded':
      return {
        ...s,
        state: 'downloaded',
        version: cleanVersion(event.version) || s.version,
        percent: 100,
        manual: false,
        message: null,
      };

    case 'not-available':
      if (s.state === 'downloaded' || s.state === 'downloading') return { ...s, checkedAt: at };
      return { ...INITIAL_UPDATE_STATUS, state: 'not-available', checkedAt: at };

    case 'error':
      // A failed background check while an update is already downloaded is
      // noise — the installer on disk is unaffected.
      if (s.state === 'downloaded') return s;
      return { ...s, state: 'error', percent: null, message: event.message || 'Update check failed', checkedAt: at };

    default:
      return s;
  }
}

/** "v2.3.0" / " 2.3.0 " → "2.3.0"; anything unusable → null. */
export function cleanVersion(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/^v/i, '');
  return t || null;
}

/**
 * Semver-ish "is `latest` newer than `current`" for the manual (non-AppImage
 * Linux) path, where electron-updater can't run and we read the GitHub API
 * ourselves. Numeric major.minor.patch only; a pre-release suffix sorts below
 * its release (2.3.0-beta.1 < 2.3.0), which is all this repo ever tags.
 */
export function isNewerVersion(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a.nums[i] !== b.nums[i]) return a.nums[i] > b.nums[i];
  }
  if (a.pre === b.pre) return false;
  if (!a.pre) return true;   // 2.3.0 > 2.3.0-beta
  if (!b.pre) return false;
  return a.pre > b.pre;
}

function parseVersion(v) {
  const c = cleanVersion(v);
  if (!c) return null;
  const m = c.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!m) return null;
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] || '' };
}

/** Release page for a version ("What's new" / manual download link). */
export function releaseUrl(version) {
  const v = cleanVersion(version);
  return v ? `${RELEASES_URL}/tag/v${v}` : `${RELEASES_URL}/latest`;
}

/**
 * electron-updater errors carry full stacks and sometimes whole HTTP response
 * bodies (a 404 on latest.yml dumps the headers). The producer needs one short
 * line; the full thing still goes to the [Updater] log.
 */
export function summarizeUpdaterError(err) {
  const raw = err && typeof err === 'object' ? (err.message || String(err)) : String(err ?? '');
  const first = raw.split('\n').map(l => l.trim()).find(Boolean) || 'Update check failed';
  if (/ERR_INTERNET_DISCONNECTED|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|net::ERR_/i.test(raw)) {
    return 'Could not reach GitHub (offline?)';
  }
  if (/latest(-linux)?\.yml/i.test(raw) && /404|Cannot find/i.test(raw)) {
    return 'Latest release has no update files yet';
  }
  return first.length > 160 ? `${first.slice(0, 157)}...` : first;
}

/**
 * Does it look like a show is on air? Gates "Restart to update" behind a
 * confirm — restarting kills the Express server every OBS browser source is
 * fed from, so overlays blank until the app is back.
 *
 * Deliberately generous (a confirm, not a block), any of:
 *   - OBS reports streaming or recording (`obsStats` from /api/obs/stats,
 *     when the dashboard could fetch it — optional)
 *   - FACEIT auto-sync running
 *   - a map marked live
 *   - a series in progress: some map completed AND some still upcoming. That
 *     is the between-maps break screen — precisely when a producer has a
 *     spare moment to click restart, with no map marked 'current'.
 * A stale 'current' map from a finished match only costs one extra click.
 *
 * @param {object} state      dashboard state
 * @param {{streaming?:boolean, recording?:boolean}|null} [obsStats]
 */
export function isMatchLive(state, obsStats = null) {
  if (obsStats && (obsStats.streaming || obsStats.recording)) return true;
  if (!state || typeof state !== 'object') return false;
  if (state.mode === 'faceit' && state.faceitAutoSync) return true;
  const maps = (Array.isArray(state.maps) ? state.maps : []).filter(Boolean);
  if (maps.some(m => m.status === 'current')) return true;
  return maps.some(m => m.status === 'completed') && maps.some(m => m.status === 'upcoming');
}

/**
 * What the dashboard banner should show, or null for no banner. Only the
 * states the producer can act on get one — checking / up-to-date / errors
 * live on the Settings card so a failed check never nags during a show.
 *
 * @returns {null | {kind:'restart'|'downloading'|'manual'|'available', version:string, text:string, percent:number|null}}
 */
export function updateBanner(status) {
  if (!status || !status.version) return null;
  const v = status.version;
  switch (status.state) {
    case 'downloaded':
      return { kind: 'restart', version: v, text: `Update v${v} ready`, percent: 100 };
    case 'downloading':
      return { kind: 'downloading', version: v, text: `Downloading v${v}… ${status.percent ?? 0}%`, percent: status.percent ?? 0 };
    case 'available':
      return status.manual
        ? { kind: 'manual', version: v, text: `Update v${v} available`, percent: null }
        : { kind: 'available', version: v, text: `Update v${v} available — downloading`, percent: null };
    default:
      return null;
  }
}

/** One-line status for the Settings card. */
export function updateStatusText(status) {
  const s = status || INITIAL_UPDATE_STATUS;
  switch (s.state) {
    case 'disabled': return s.message || 'Updates are only checked in the installed app';
    case 'checking': return 'Checking for updates…';
    case 'not-available': return 'You are on the latest version';
    case 'available': return s.manual
      ? `v${s.version} is available — download it manually from the release page`
      : `v${s.version} is available — downloading in the background`;
    case 'downloading': return `Downloading v${s.version}… ${s.percent ?? 0}%`;
    case 'downloaded': return `v${s.version} is ready — restart to update (or it installs next time you quit)`;
    case 'error': return `Update check failed: ${s.message || 'unknown error'}`;
    default: return 'Not checked yet';
  }
}
