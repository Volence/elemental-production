import { useState, useEffect } from 'react';

const API = 'http://localhost:3001';

export default function StatusBar() {
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
      <div className="status-bar-item">
        <span style={{ marginRight: 4 }}>📺</span>
        <span>{status.overlayCount} overlay{status.overlayCount !== 1 ? 's' : ''}</span>
      </div>
    </div>
  );
}
