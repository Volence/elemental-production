import { useState } from 'react'

export default function Settings({ state, updateState, api, obsConnected, setObsConnected }) {
  const [obsHost, setObsHost] = useState('localhost');
  const [obsPort, setObsPort] = useState('4455');
  const [obsPassword, setObsPassword] = useState('');
  const [connecting, setConnecting] = useState(false);

  const connectObs = async () => {
    setConnecting(true);
    try {
      const res = await fetch(`${api}/api/obs/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: obsHost, port: parseInt(obsPort), password: obsPassword }),
      });
      const data = await res.json();
      setObsConnected(data.connected);
    } catch (e) {
      console.error(e);
    }
    setConnecting(false);
  };

  const resetAll = async () => {
    if (confirm('Reset all state to defaults? This cannot be undone.')) {
      await fetch(`${api}/api/state/reset`, { method: 'POST' });
    }
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2>Settings</h2>
        <p>Configure connections and preferences</p>
      </div>

      {/* OBS Connection */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📡 OBS WebSocket</span>
          <span className={`badge ${obsConnected ? 'badge-success' : 'badge-danger'}`}>
            {obsConnected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="grid-3" style={{ marginTop: 8 }}>
          <div>
            <label className="input-label">Host</label>
            <input className="input" value={obsHost} onChange={e => setObsHost(e.target.value)} />
          </div>
          <div>
            <label className="input-label">Port</label>
            <input className="input" value={obsPort} onChange={e => setObsPort(e.target.value)} />
          </div>
          <div>
            <label className="input-label">Password</label>
            <input className="input" type="password" value={obsPassword} onChange={e => setObsPassword(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={connectObs} disabled={connecting}>
          {connecting ? 'Connecting...' : 'Connect to OBS'}
        </button>
      </div>

      {/* Overlay URLs */}
      <div className="card">
        <div className="card-title">🖥️ OBS Browser Source URLs</div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '8px 0 12px' }}>
          Add these as Browser Sources in OBS (1920x1080, transparent)
        </p>
        {[
          { name: 'Scoreboard', url: `http://localhost:3001/overlays/scoreboard.html` },
          { name: 'Map Tracker', url: `http://localhost:3001/overlays/map-tracker.html` },
          { name: 'Hero Bans', url: `http://localhost:3001/overlays/hero-bans.html` },
          { name: 'Countdown', url: `http://localhost:3001/overlays/countdown.html` },
          { name: 'Lower Third', url: `http://localhost:3001/overlays/lower-third.html` },
          { name: 'Player Stats', url: `http://localhost:3001/overlays/player-stats.html` },
        ].map(overlay => (
          <div key={overlay.name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: '0.8rem', minWidth: 100 }}>{overlay.name}</span>
            <code style={{ flex: 1, padding: '6px 10px', background: 'var(--bg-input)', borderRadius: 6, fontSize: '0.75rem', color: 'var(--accent)', wordBreak: 'break-all' }}>
              {overlay.url}
            </code>
            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(overlay.url)}>Copy</button>
          </div>
        ))}
      </div>

      {/* Stream Deck API */}
      <div className="card">
        <div className="card-title">🎛️ Stream Deck API Endpoints</div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '8px 0 12px' }}>
          Use "Website" actions in Stream Deck with POST to these URLs
        </p>
        {[
          { name: 'Next Scene', method: 'POST', url: 'http://localhost:3001/api/scene/Gameplay' },
          { name: 'Score +1 T1', method: 'POST', url: 'http://localhost:3001/api/score/increment?team=team1' },
          { name: 'Score +1 T2', method: 'POST', url: 'http://localhost:3001/api/score/increment?team=team2' },
          { name: 'Advance Map', method: 'POST', url: 'http://localhost:3001/api/map/advance' },
          { name: 'Start Timer', method: 'POST', url: 'http://localhost:3001/api/timer/start' },
          { name: 'Stop Timer', method: 'POST', url: 'http://localhost:3001/api/timer/stop' },
        ].map(ep => (
          <div key={ep.name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: '0.8rem', minWidth: 100 }}>{ep.name}</span>
            <span className="badge badge-accent">{ep.method}</span>
            <code style={{ flex: 1, padding: '6px 10px', background: 'var(--bg-input)', borderRadius: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
              {ep.url}
            </code>
            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(ep.url)}>Copy</button>
          </div>
        ))}
      </div>

      {/* Reset */}
      <div className="card">
        <div className="card-title">🔄 Reset</div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '8px 0 12px' }}>
          Reset all match data, scores, and settings to defaults
        </p>
        <button className="btn btn-danger" onClick={resetAll}>Reset All State</button>
      </div>
    </div>
  );
}
