import { useState, useEffect, useCallback } from 'react';
import { INITIAL_UPDATE_STATUS } from './update-status.js';

/**
 * Dashboard side of the in-app updater. The main process owns the status
 * (src/main/updater.js) and pushes the whole object on every change; this
 * just mirrors it. Mounted once in App so the sidebar banner and the Settings
 * card always agree.
 *
 * `supported` is false in a plain browser (npm run dev:web) — no
 * window.electronAPI there — and every consumer hides itself.
 */
export function useUpdater() {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
  // An electronAPI from an older preload wouldn't have these methods.
  const supported = !!(api && typeof api.getUpdateStatus === 'function');
  const [status, setStatus] = useState(INITIAL_UPDATE_STATUS);
  const [appVersion, setAppVersion] = useState(null);

  useEffect(() => {
    if (!supported) return;
    let alive = true;
    const unsubscribe = api.onUpdateStatus((s) => { if (alive && s) setStatus(s); });
    api.getUpdateStatus().then((s) => { if (alive && s) setStatus(s); }).catch(() => {});
    api.getAppVersion().then((v) => { if (alive) setAppVersion(v); }).catch(() => {});
    return () => { alive = false; unsubscribe?.(); };
  }, [supported, api]);

  const checkForUpdates = useCallback(async () => {
    if (!supported) return;
    try {
      const s = await api.checkForUpdates();
      if (s) setStatus(s);
    } catch (e) {
      console.warn('[Updater] check failed:', e);
    }
  }, [supported, api]);

  /** @returns {Promise<{ok:boolean, message?:string}>} */
  const installUpdate = useCallback(async () => {
    if (!supported) return { ok: false, message: 'Not running in the desktop app' };
    try {
      return (await api.installUpdate()) || { ok: false, message: 'No response' };
    } catch (e) {
      return { ok: false, message: e?.message || 'Install failed' };
    }
  }, [supported, api]);

  return { supported, status, appVersion, checkForUpdates, installUpdate };
}
