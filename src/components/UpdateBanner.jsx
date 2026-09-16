import { updateBanner, releaseUrl } from '../lib/update-status.js';

/**
 * Sidebar pill for an update the producer can act on (downloading / ready /
 * manual download). Renders nothing for every other state — checks and
 * errors only show on the Settings card, so a flaky network never nags
 * during a show. Links open in the system browser via main's
 * setWindowOpenHandler.
 */
export default function UpdateBanner({ status, onRestart, onDismiss, installError, installing }) {
  const banner = updateBanner(status);
  if (!banner) return null;

  const tone = banner.kind === 'restart' ? 'tone-success' : banner.kind === 'manual' ? 'tone-warning' : '';
  const notesUrl = releaseUrl(banner.version);

  return (
    <div className={`update-pill ${tone}`} role="status">
      <div className="update-pill-head">
        <span>⬆️ {banner.text}</span>
        <button className="update-pill-dismiss" onClick={onDismiss} title="Hide until next launch" aria-label="Dismiss">×</button>
      </div>

      {banner.kind === 'downloading' && (
        <div className="update-pill-progress"><div style={{ width: `${banner.percent}%` }} /></div>
      )}

      <div className="update-pill-actions">
        {banner.kind === 'restart' && (
          <button className="btn btn-success btn-sm" onClick={onRestart} disabled={installing}>
            {installing ? 'Restarting…' : 'Restart to update'}
          </button>
        )}
        {banner.kind === 'manual' && (
          <a href={notesUrl} target="_blank" rel="noreferrer">Download from GitHub</a>
        )}
        {banner.kind !== 'manual' && (
          <a href={notesUrl} target="_blank" rel="noreferrer">What's new</a>
        )}
      </div>

      {installError && <div className="update-pill-error">{installError}</div>}
    </div>
  );
}
