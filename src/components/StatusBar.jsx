import { useState, useEffect } from 'react';

const API = 'http://localhost:3001';

function timeAgo(ts) {
  if (!ts) return '';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  return `${Math.floor(sec / 3600)}h ago`;
}

export default function StatusBar({ state }) {
  const [status, setStatus] = useState({ obs: false, faceit: false, overlayCount: 0 });

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${API}/api/status`);
        const data = await res.json();
        setStatus(data);
      } catch (e) {
        setStatus({ obs: false, faceit: false, overlayCount: 0 });
      }
    };
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  const syncActive = state?.faceitAutoSync;
  const lastSync = state?.faceitLastSync;
  const lastError = state?.faceitLastSyncError;
  const hasError = lastError && (!lastSync || lastError > lastSync);

  return (
    <div className="status-bar">
      <div className="status-bar-item">
        <span className={`status-dot ${status.obs ? 'connected' : 'disconnected'}`} />
        <span>OBS {status.obs ? 'Connected' : 'Disconnected'}</span>
      </div>
      <div className="status-bar-item">
        <span className={`status-dot ${status.faceit ? 'connected' : 'disconnected'}`} />
        <span>FACEIT {status.faceit ? 'OK' : 'Unreachable'}</span>
      </div>
      {syncActive && (
        <div className="status-bar-item">
          <span className={`status-dot ${hasError ? 'disconnected' : 'connected'}`} style={!hasError ? { animation: 'pulse 2s infinite' } : {}} />
          <span>Sync {hasError ? 'Error' : timeAgo(lastSync)}</span>
        </div>
      )}
      <div className="status-bar-item">
        <span style={{ marginRight: 4 }}>📺</span>
        <span>{status.overlayCount} overlay{status.overlayCount !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
