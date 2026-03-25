import { useState, useRef } from 'react'
import FolderBrowser from '../components/FolderBrowser'

const BUILTIN_FONTS = {
  'Bebas Neue': 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap',
  'Inter': 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap',
  'Oswald': 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;700&display=swap',
  'Rajdhani': 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;700&display=swap',
  'Teko': 'https://fonts.googleapis.com/css2?family=Teko:wght@400;700&display=swap',
  'Russo One': 'https://fonts.googleapis.com/css2?family=Russo+One&display=swap',
  'Orbitron': 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap',
};

export default function Settings({ state, updateState, api, obsConnected, setObsConnected, customFonts, setCustomFonts }) {
  const [obsHost, setObsHost] = useState('localhost');
  const [obsPort, setObsPort] = useState('4455');
  const [obsPassword, setObsPassword] = useState('');
  const [connecting, setConnecting] = useState(false);
  const fontInputRef = useRef(null);
  const [flythroughDir, setFlythroughDir] = useState(state.flythroughsDir || '');
  const [flythroughMaps, setFlythroughMaps] = useState({});
  const [flythroughSaving, setFlythroughSaving] = useState(false);
  const [flythroughError, setFlythroughError] = useState('');
  const [mapMusicDir, setMapMusicDir] = useState(state.mapMusicDir || '');
  const [mapMusicMaps, setMapMusicMaps] = useState({});
  const [mapMusicSaving, setMapMusicSaving] = useState(false);
  const [mapMusicError, setMapMusicError] = useState('');
  const [bgMusicDir, setBgMusicDir] = useState(state.bgMusicDir || '');
  const [bgMusicFiles, setBgMusicFiles] = useState([]);
  const [bgMusicSelected, setBgMusicSelected] = useState(state.bgMusicFile || '');
  const [castersBgMusicSelected, setCastersBgMusicSelected] = useState(state.castersBgMusicFile || '');
  const [bgMusicSaving, setBgMusicSaving] = useState(false);
  const [bgMusicError, setBgMusicError] = useState('');
  const [browseTarget, setBrowseTarget] = useState(null); // 'flythroughs' | 'mapMusic' | 'bgMusic' | null

  // Load initial flythroughs state
  useState(() => {
    fetch(`${api}/api/flythroughs`).then(r => r.json()).then(data => {
      if (data.directory) setFlythroughDir(data.directory);
      if (data.maps) setFlythroughMaps(data.maps);
    }).catch(() => {});
    fetch(`${api}/api/map-music`).then(r => r.json()).then(data => {
      if (data.directory) setMapMusicDir(data.directory);
      if (data.maps) setMapMusicMaps(data.maps);
    }).catch(() => {});
    fetch(`${api}/api/bg-music`).then(r => r.json()).then(data => {
      if (data.directory) setBgMusicDir(data.directory);
      if (data.files) setBgMusicFiles(data.files);
      if (data.bgMusicFile) setBgMusicSelected(data.bgMusicFile);
      if (data.castersBgMusicFile) setCastersBgMusicSelected(data.castersBgMusicFile);
    }).catch(() => {});
  });

  const saveFlythroughDir = async () => {
    setFlythroughSaving(true);
    setFlythroughError('');
    try {
      const res = await fetch(`${api}/api/flythroughs/directory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: flythroughDir }),
      });
      const data = await res.json();
      if (data.error) {
        setFlythroughError(data.error);
      } else {
        setFlythroughMaps(data.maps || {});
      }
    } catch (e) {
      setFlythroughError(e.message);
    }
    setFlythroughSaving(false);
  };

  const saveMapMusicDir = async () => {
    setMapMusicSaving(true);
    setMapMusicError('');
    try {
      const res = await fetch(`${api}/api/map-music/directory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: mapMusicDir }),
      });
      const data = await res.json();
      if (data.error) {
        setMapMusicError(data.error);
      } else {
        setMapMusicMaps(data.maps || {});
      }
    } catch (e) {
      setMapMusicError(e.message);
    }
    setMapMusicSaving(false);
  };

  const saveBgMusicDir = async () => {
    setBgMusicSaving(true);
    setBgMusicError('');
    try {
      const res = await fetch(`${api}/api/bg-music/directory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: bgMusicDir }),
      });
      const data = await res.json();
      if (data.error) {
        setBgMusicError(data.error);
      } else {
        setBgMusicFiles(data.files || []);
      }
    } catch (e) {
      setBgMusicError(e.message);
    }
    setBgMusicSaving(false);
  };

  const assignBgMusic = async (source, file) => {
    if (source === 'background') setBgMusicSelected(file);
    else setCastersBgMusicSelected(file);
    try {
      await fetch(`${api}/api/bg-music/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, file }),
      });
    } catch (e) {
      console.error('Failed to assign music:', e);
    }
  };

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
        <p>Configure connections, fonts, and preferences</p>
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

      {/* OBS Scene Collection */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🎬 OBS Scene Setup</span>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '8px 0' }}>
          Download the scene collection template and follow the setup guide below.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <a
            href={`${api}/api/obs/scene-collection`}
            download="elemental-obs-scenes.json"
            className="btn btn-primary"
            style={{ textDecoration: 'none' }}
          >
            ⬇ Download Scene Collection JSON
          </a>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            Reference for building your OBS scene collection
          </span>
        </div>

        <div style={{ marginTop: 16, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 6 }}>Required</div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
            <div>📡 <strong>OBS WebSocket</strong> — Built into OBS 28+. Enable in Tools → WebSocket Server Settings. Default port 4455.</div>
            <div>🌐 <strong>Browser Sources</strong> — Each overlay is a browser source (1920×1080, transparent background). URLs are listed in the Overlay URLs section below.</div>
          </div>

          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 6 }}>Media Sources (▶ type)</div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
            <div>🎬 <strong>Map Flythrough</strong> — Shared across Map Intro + Casters Flythrough. Server auto-sets the video file. Check ✅ Loop, uncheck ☐ Restart on activate.</div>
            <div>🎵 <strong>Map Music</strong> — Shared across Map Intro + Casters Flythrough. Server auto-sets audio by map. Same settings as above.</div>
            <div>🎧 <strong>Background Music</strong> — Add to production scenes (Starting, Between Matches, BRB, Ending). Selected in Background Music settings below.</div>
            <div>🎧 <strong>Casters Background Music</strong> — Add to caster scenes (Casters, Lobby, Scoreboard, Map Score, Interview, Series Winner). Selected below.</div>
            <div>🎬 <strong>Replay</strong> — Add to <strong>Between Matches</strong> scene only. ❌ No Loop, ✅ Restart on activate, ✅ Show nothing when playback ends. Server auto-loads clips and auto-cycles.</div>
          </div>

          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 6 }}>Audio Capture (manual — select target app in Properties)</div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 12 }}>
            <div>🎮 <strong>Overwatch</strong> — Screen Capture (PipeWire) on Linux, Game Capture on Windows. Select Overwatch window. Add to Gameplay scene.</div>
            <div>🔊 <strong>Overwatch Audio Only</strong> — Application Audio Capture (PipeWire on Linux, Application Audio Output Capture on Windows). Select Overwatch. Add to Gameplay.</div>
            <div>🔊 <strong>Discord Audio</strong> — Same type as above. Select Discord. Add to Gameplay + Interview scenes.</div>
          </div>

          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 6 }}>Replay Buffer (optional)</div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div>⏺ <strong>Enable</strong> — Settings → Output → Replay Buffer → ✅ Enable. Set Maximum Replay Time to 20s, Maximum Memory to 512 MB.</div>
            <div>📎 <strong>Usage</strong> — Toggle buffer ON in Production Controls, save clips during gameplay, then play them in Between Matches with auto-cycling.</div>
          </div>
        </div>
      </div>

      {/* Font Selector + Upload */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🔤 Overlay Font</span>
          <button className="btn btn-ghost btn-sm" onClick={() => fontInputRef.current?.click()}>📁 Upload Font</button>
          <input ref={fontInputRef} type="file" accept=".ttf,.otf,.woff,.woff2" style={{ display: 'none' }}
            onChange={async (e) => {
              const file = e.target.files[0];
              if (!file) return;
              const res = await fetch(`${api}/api/fonts/upload`, {
                method: 'POST',
                headers: { 'X-Filename': file.name },
                body: await file.arrayBuffer(),
              });
              const font = await res.json();
              if (font.success) {
                setCustomFonts(prev => [...prev, font]);
                const style = document.createElement('style');
                style.textContent = `@font-face { font-family: '${font.name}'; src: url('${font.url}'); }`;
                document.head.appendChild(style);
                updateState({ font: { family: font.name, url: font.url, custom: true } });
              }
              e.target.value = '';
            }} />
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '8px 0' }}>
          Controls the font used across all OBS overlay browser sources
        </p>
        <select className="input" value={state.font?.family || 'Bebas Neue'}
          onChange={e => {
            const custom = customFonts?.find(f => f.name === e.target.value);
            if (custom) {
              updateState({ font: { family: custom.name, url: custom.url, custom: true } });
            } else {
              updateState({ font: { family: e.target.value, url: BUILTIN_FONTS[e.target.value] || '' } });
            }
          }}>
          <optgroup label="Built-in">
            {Object.keys(BUILTIN_FONTS).map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </optgroup>
          {customFonts?.length > 0 && (
            <optgroup label="Uploaded">
              {customFonts.map(f => (
                <option key={f.filename} value={f.name}>{f.name}</option>
              ))}
            </optgroup>
          )}
        </select>
        <div style={{ marginTop: 8, fontFamily: state.font?.family, fontSize: '1.5rem' }}>
          Preview: {state.teams?.team1?.name || 'Team 1'} vs {state.teams?.team2?.name || 'Team 2'}
        </div>
      </div>

      {/* Map Flythroughs */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🎥 Map Flythroughs</span>
          {Object.keys(flythroughMaps).length > 0 && (
            <span className="badge badge-success">{Object.keys(flythroughMaps).length} maps</span>
          )}
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '8px 0' }}>
          Set the folder containing map flythrough .mp4 videos for use in the Map Intro overlay
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            value={flythroughDir}
            onChange={e => setFlythroughDir(e.target.value)}
            placeholder="/home/volence/Videos/OW Flythroughs"
          />
          <button className="btn btn-ghost btn-sm" onClick={() => setBrowseTarget('flythroughs')}
            style={{ whiteSpace: 'nowrap' }}>📂 Browse</button>
          <button className="btn btn-primary" onClick={saveFlythroughDir} disabled={flythroughSaving}>
            {flythroughSaving ? 'Scanning...' : 'Save'}
          </button>
        </div>
        {flythroughError && (
          <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: 6 }}>{flythroughError}</div>
        )}
        {Object.keys(flythroughMaps).length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 6 }}>Detected Maps</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(flythroughMaps).map(([name, url]) => (
                <span key={name} style={{ fontSize: '0.75rem', padding: '3px 8px', background: 'var(--bg-input)', borderRadius: 4 }}>
                  ✓ {name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Map Music */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🎵 Map Music</span>
          {Object.keys(mapMusicMaps).length > 0 && (
            <span className="badge badge-success">{Object.keys(mapMusicMaps).length} maps</span>
          )}
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '8px 0' }}>
          Set the folder containing map theme .mp3 audio files for the Map Music OBS source
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            value={mapMusicDir}
            onChange={e => setMapMusicDir(e.target.value)}
            placeholder="/home/volence/Music/OW Map Music"
          />
          <button className="btn btn-ghost btn-sm" onClick={() => setBrowseTarget('mapMusic')}
            style={{ whiteSpace: 'nowrap' }}>📂 Browse</button>
          <button className="btn btn-primary" onClick={saveMapMusicDir} disabled={mapMusicSaving}>
            {mapMusicSaving ? 'Scanning...' : 'Save'}
          </button>
        </div>
        {mapMusicError && (
          <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: 6 }}>{mapMusicError}</div>
        )}
        {Object.keys(mapMusicMaps).length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 6 }}>Detected Maps</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(mapMusicMaps).map(([name]) => (
                <span key={name} style={{ fontSize: '0.75rem', padding: '3px 8px', background: 'var(--bg-input)', borderRadius: 4 }}>
                  ♪ {name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Background Music */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🎧 Background Music</span>
          {bgMusicFiles.length > 0 && (
            <span className="badge badge-success">{bgMusicFiles.length} files</span>
          )}
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '8px 0' }}>
          Set the folder containing royalty-free music files, then assign tracks to OBS sources
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            className="input"
            style={{ flex: 1 }}
            value={bgMusicDir}
            onChange={e => setBgMusicDir(e.target.value)}
            placeholder="/home/volence/Music/Royalty Free"
          />
          <button className="btn btn-ghost btn-sm" onClick={() => setBrowseTarget('bgMusic')}
            style={{ whiteSpace: 'nowrap' }}>📂 Browse</button>
          <button className="btn btn-primary" onClick={saveBgMusicDir} disabled={bgMusicSaving}>
            {bgMusicSaving ? 'Scanning...' : 'Save'}
          </button>
        </div>
        {bgMusicError && (
          <div style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: 6 }}>{bgMusicError}</div>
        )}
        {bgMusicFiles.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 4 }}>Background Music (production screens)</div>
              <select
                className="input"
                style={{ width: '100%' }}
                value={bgMusicSelected}
                onChange={e => assignBgMusic('background', e.target.value)}
              >
                <option value="">— None —</option>
                {bgMusicFiles.map(f => <option key={f} value={f}>{f.replace(/\.[^.]+$/, '')}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 4 }}>Casters Background Music (caster screens)</div>
              <select
                className="input"
                style={{ width: '100%' }}
                value={castersBgMusicSelected}
                onChange={e => assignBgMusic('casters', e.target.value)}
              >
                <option value="">— None —</option>
                {bgMusicFiles.map(f => <option key={f} value={f}>{f.replace(/\.[^.]+$/, '')}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Overlay URLs */}
      <div className="card">
        <div className="card-title">🖥️ OBS Browser Source URLs</div>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '8px 0 12px' }}>
          Add these as Browser Sources in OBS (1920×1080, transparent background)
        </p>
        {[
          { name: 'Starting Soon', url: `http://localhost:3001/overlays/starting-soon.html` },
          { name: 'Map Pick', url: `http://localhost:3001/overlays/map-pick.html` },
          { name: 'Map Intro', url: `http://localhost:3001/overlays/map-intro.html` },
          { name: 'Gameplay HUD', url: `http://localhost:3001/overlays/gameplay-hud.html` },
          { name: 'Casters', url: `http://localhost:3001/overlays/casters.html` },
          { name: 'Casters Lobby', url: `http://localhost:3001/overlays/casters-lobby.html` },
          { name: 'Casters Scoreboard', url: `http://localhost:3001/overlays/casters-scoreboard.html` },
          { name: 'Casters Map Score', url: `http://localhost:3001/overlays/casters-map-score.html` },
          { name: 'Between Matches', url: `http://localhost:3001/overlays/between-matches.html` },
          { name: 'BRB', url: `http://localhost:3001/overlays/brb.html` },
          { name: 'Interview', url: `http://localhost:3001/overlays/interview.html` },
          { name: 'Hero Bans', url: `http://localhost:3001/overlays/hero-bans.html` },
          { name: 'Lower Third', url: `http://localhost:3001/overlays/lower-third.html` },
          { name: 'Series Winner', url: `http://localhost:3001/overlays/series-winner.html` },
          { name: 'End of Stream', url: `http://localhost:3001/overlays/end-of-stream.html` },
          { name: 'Stinger Transition', url: `http://localhost:3001/overlays/stinger-transition.html` },
          { name: 'Casters Fly HUD', url: `http://localhost:3001/overlays/casters-flythrough-hud.html` },
        ].map(overlay => (
          <div key={overlay.name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontWeight: 600, fontSize: '0.8rem', minWidth: 140 }}>{overlay.name}</span>
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
          { group: 'Scenes', items: [
            { name: 'Starting', method: 'POST', url: 'http://localhost:3001/api/scene/Starting' },
            { name: 'Map Pick', method: 'POST', url: 'http://localhost:3001/api/scene/Map%20Pick' },
            { name: 'Map Intro', method: 'POST', url: 'http://localhost:3001/api/scene/Map%20Intro' },
            { name: 'Gameplay', method: 'POST', url: 'http://localhost:3001/api/scene/Gameplay' },
            { name: 'Casters', method: 'POST', url: 'http://localhost:3001/api/scene/Casters' },
            { name: 'Between Matches', method: 'POST', url: 'http://localhost:3001/api/scene/Between%20Matches' },
            { name: 'BRB', method: 'POST', url: 'http://localhost:3001/api/scene/BRB' },
            { name: 'Interview', method: 'POST', url: 'http://localhost:3001/api/scene/Interview' },
            { name: 'Series Winner', method: 'POST', url: 'http://localhost:3001/api/scene/Series%20Winner' },
            { name: 'Ending', method: 'POST', url: 'http://localhost:3001/api/scene/Ending' },
          ]},
          { group: 'Match Controls', items: [
            { name: 'Score +1 Team 1', method: 'POST', url: 'http://localhost:3001/api/score/increment?team=team1' },
            { name: 'Score +1 Team 2', method: 'POST', url: 'http://localhost:3001/api/score/increment?team=team2' },
            { name: 'Advance Map', method: 'POST', url: 'http://localhost:3001/api/map/advance' },
          ]},
          { group: 'Timer', items: [
            { name: 'Start Timer', method: 'POST', url: 'http://localhost:3001/api/timer/start' },
            { name: 'Pause Timer', method: 'POST', url: 'http://localhost:3001/api/timer/pause' },
            { name: 'Resume Timer', method: 'POST', url: 'http://localhost:3001/api/timer/resume' },
            { name: 'Stop Timer', method: 'POST', url: 'http://localhost:3001/api/timer/stop' },
          ]},
        ].map(section => (
          <div key={section.group} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 6 }}>{section.group}</div>
            {section.items.map(ep => (
              <div key={ep.name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: '0.8rem', minWidth: 130 }}>{ep.name}</span>
                <span className="badge badge-accent">{ep.method}</span>
                <code style={{ flex: 1, padding: '6px 10px', background: 'var(--bg-input)', borderRadius: 6, fontSize: '0.75rem', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
                  {ep.url}
                </code>
                <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(ep.url)}>Copy</button>
              </div>
            ))}
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

      {/* Folder Browser Modal */}
      {browseTarget && (
        <FolderBrowser
          api={api}
          currentPath={
            browseTarget === 'flythroughs' ? flythroughDir :
            browseTarget === 'mapMusic' ? mapMusicDir :
            bgMusicDir
          }
          onSelect={(selectedPath) => {
            if (browseTarget === 'flythroughs') setFlythroughDir(selectedPath);
            else if (browseTarget === 'mapMusic') setMapMusicDir(selectedPath);
            else if (browseTarget === 'bgMusic') setBgMusicDir(selectedPath);
          }}
          onClose={() => setBrowseTarget(null)}
        />
      )}
    </div>
  );
}
