import { useState, useEffect, useRef } from 'react'

const BUILTIN_FONTS = {
  'Bebas Neue': 'https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap',
  'Inter': 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap',
  'Oswald': 'https://fonts.googleapis.com/css2?family=Oswald:wght@400;700&display=swap',
  'Rajdhani': 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;700&display=swap',
  'Teko': 'https://fonts.googleapis.com/css2?family=Teko:wght@400;700&display=swap',
  'Russo One': 'https://fonts.googleapis.com/css2?family=Russo+One&display=swap',
  'Orbitron': 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&display=swap',
};

export default function ProductionControls({ state, updateState, api }) {
  const [scenes, setScenes] = useState([]);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [customFonts, setCustomFonts] = useState([]);
  const fontInputRef = useRef(null);

  useEffect(() => {
    fetch(`${api}/api/obs/scenes`).then(r => r.json()).then(d => {
      setScenes(d.scenes || []);
    }).catch(() => {});
    // Load custom fonts
    fetch(`${api}/api/fonts`).then(r => r.json()).then(fonts => {
      setCustomFonts(fonts);
      // Register custom fonts via @font-face
      fonts.forEach(f => {
        const style = document.createElement('style');
        style.textContent = `@font-face { font-family: '${f.name}'; src: url('${f.url}'); }`;
        document.head.appendChild(style);
      });
    }).catch(() => {});
  }, [api]);

  const switchScene = async (name) => {
    await fetch(`${api}/api/obs/scene`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
  };

  const updateCasterName = async (index, name) => {
    const casters = [...state.casters];
    casters[index] = { ...casters[index], name };
    updateState({ casters });
    // Also update OBS text source
    await fetch(`${api}/api/obs/text`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: `Caster ${index + 1} Name`, text: name }),
    });
  };

  const updateCasterCam = (index, camUrl) => {
    const casters = [...state.casters];
    casters[index] = { ...casters[index], camUrl };
    updateState({ casters });
  };

  const startTimer = async () => {
    await fetch(`${api}/api/timer/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: timerMinutes * 60, label: state.countdown.label }),
    });
  };

  const stopTimer = () => fetch(`${api}/api/timer/stop`, { method: 'POST' });
  const resetTimer = () => fetch(`${api}/api/timer/reset`, { method: 'POST' });

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const updateLowerThird = (field, value) => {
    updateState({ lowerThird: { ...state.lowerThird, [field]: value } });
  };

  return (
    <div className="fade-in">
      <div className="page-header">
        <h2>Production Controls</h2>
        <p>Scene switching, timers, caster management</p>
      </div>

      {/* Scene Switcher */}
      <div className="card">
        <div className="card-title">🎬 Scenes</div>
        <div className="scene-grid" style={{ marginTop: 12 }}>
          {scenes.length > 0 ? scenes.map(s => (
            <button
              key={s.sceneName}
              className={`scene-btn ${state.currentScene === s.sceneName ? 'active' : ''}`}
              onClick={() => switchScene(s.sceneName)}
            >
              {s.sceneName}
            </button>
          )) : (
            ['Starting', 'Intermission', 'Casters', 'Casters Lobby', 'Casters Scoreboard', 'Gameplay', 'Ending'].map(name => (
              <button
                key={name}
                className={`scene-btn ${state.currentScene === name ? 'active' : ''}`}
                onClick={() => switchScene(name)}
              >
                {name}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Countdown Timer */}
      <div className="card">
        <div className="card-title">⏱️ Countdown Timer</div>
        <div className="countdown-display" style={{ marginTop: 8 }}>
          {formatTime(state.countdown.remaining || 0)}
        </div>
        <div style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 12 }}>
          {state.countdown.label}
          {state.countdown.running && <span className="badge badge-success" style={{ marginLeft: 8 }}>LIVE</span>}
        </div>
        <div className="countdown-controls">
          <input className="input" style={{ width: 120 }} placeholder="Label" value={state.countdown.label}
            onChange={e => updateState({ countdown: { ...state.countdown, label: e.target.value } })} />
          <input className="input" type="number" style={{ width: 70 }} value={timerMinutes} min={1} max={60}
            onChange={e => setTimerMinutes(Number(e.target.value))} />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>min</span>
          {!state.countdown.running ? (
            <button className="btn btn-success btn-sm" onClick={startTimer}>▶ Start</button>
          ) : (
            <button className="btn btn-danger btn-sm" onClick={stopTimer}>⏸ Stop</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={resetTimer}>↺ Reset</button>
        </div>
      </div>

      {/* Caster Management */}
      <div className="card">
        <div className="card-title">🎙️ Casters</div>
        <div style={{ marginTop: 12 }}>
          {state.casters.map((caster, i) => (
            <div key={i} className="caster-row">
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.8rem', minWidth: 24 }}>#{i + 1}</span>
              <input className="input" placeholder="Caster name" value={caster.name}
                onChange={e => updateCasterName(i, e.target.value)} />
              <input className="input" placeholder="Cam URL (VDO.Ninja, etc.)" value={caster.camUrl || ''}
                onChange={e => updateCasterCam(i, e.target.value)} style={{ flex: 2 }} />
            </div>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
          onClick={() => updateState({ casters: [...state.casters, { name: `Caster ${state.casters.length + 1}`, camUrl: '', visible: true }] })}>
          + Add Caster
        </button>
      </div>

      {/* Interview Cam */}
      <div className="card">
        <div className="card-title">🎤 Interview / Guest Cam</div>
        <div style={{ marginTop: 12 }}>
          <div className="caster-row">
            <input className="input" placeholder="Name" value={state.interviewee?.name || ''}
              onChange={e => updateState({ interviewee: { ...state.interviewee, name: e.target.value } })} />
            <input className="input" placeholder="Cam URL" value={state.interviewee?.camUrl || ''}
              onChange={e => updateState({ interviewee: { ...state.interviewee, camUrl: e.target.value } })} style={{ flex: 2 }} />
            <button className={`btn btn-sm ${state.interviewee?.visible ? 'btn-success' : 'btn-ghost'}`}
              onClick={() => updateState({ interviewee: { ...state.interviewee, visible: !state.interviewee?.visible } })}>
              {state.interviewee?.visible ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
        </div>
      </div>

      {/* Lower Third */}
      <div className="card">
        <div className="card-title">📺 Lower Third</div>
        <div className="grid-2" style={{ marginTop: 12, marginBottom: 12 }}>
          <div>
            <label className="input-label">Title</label>
            <input className="input" value={state.lowerThird?.title || ''} placeholder="Player name or title"
              onChange={e => updateLowerThird('title', e.target.value)} />
          </div>
          <div>
            <label className="input-label">Subtitle</label>
            <input className="input" value={state.lowerThird?.subtitle || ''} placeholder="Role, team, etc."
              onChange={e => updateLowerThird('subtitle', e.target.value)} />
          </div>
        </div>

        {/* Preview */}
        {(state.lowerThird?.title || state.lowerThird?.subtitle) && (
          <div className="lower-third-preview">
            <div className="lt-title">{state.lowerThird.title || 'Title'}</div>
            <div className="lt-subtitle">{state.lowerThird.subtitle || 'Subtitle'}</div>
          </div>
        )}

        <button className={`btn btn-sm ${state.lowerThird?.visible ? 'btn-success' : 'btn-ghost'}`}
          onClick={() => updateLowerThird('visible', !state.lowerThird?.visible)}>
          {state.lowerThird?.visible ? '✓ Showing' : 'Show Lower Third'}
        </button>
      </div>

      {/* Team Info (Manual Override) */}
      <div className="card">
        <div className="card-title">👥 Team Info</div>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <div>
            <label className="input-label" style={{ color: 'var(--team1)' }}>Team 1</label>
            <input className="input" value={state.teams.team1.name}
              onChange={e => updateState({ teams: { ...state.teams, team1: { ...state.teams.team1, name: e.target.value } } })} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-sm" style={{ background: 'var(--team1)', color: 'white' }}
                onClick={() => updateState({ teams: { ...state.teams, team1: { ...state.teams.team1, score: state.teams.team1.score + 1 } } })}>
                Score +1
              </button>
              <button className="btn btn-ghost btn-sm"
                onClick={() => updateState({ teams: { ...state.teams, team1: { ...state.teams.team1, score: Math.max(0, state.teams.team1.score - 1) } } })}>
                -1
              </button>
            </div>
          </div>
          <div>
            <label className="input-label" style={{ color: 'var(--team2)' }}>Team 2</label>
            <input className="input" value={state.teams.team2.name}
              onChange={e => updateState({ teams: { ...state.teams, team2: { ...state.teams.team2, name: e.target.value } } })} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-sm" style={{ background: 'var(--team2)', color: 'white' }}
                onClick={() => updateState({ teams: { ...state.teams, team2: { ...state.teams.team2, score: state.teams.team2.score + 1 } } })}>
                Score +1
              </button>
              <button className="btn btn-ghost btn-sm"
                onClick={() => updateState({ teams: { ...state.teams, team2: { ...state.teams.team2, score: Math.max(0, state.teams.team2.score - 1) } } })}>
                -1
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Font Selector + Upload */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🔤 Font</span>
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
                // Register it
                const style = document.createElement('style');
                style.textContent = `@font-face { font-family: '${font.name}'; src: url('${font.url}'); }`;
                document.head.appendChild(style);
                updateState({ font: { family: font.name, url: font.url, custom: true } });
              }
              e.target.value = '';
            }} />
        </div>
        <div style={{ marginTop: 12 }}>
          <select className="input" value={state.font?.family || 'Bebas Neue'}
            onChange={e => {
              const custom = customFonts.find(f => f.name === e.target.value);
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
            {customFonts.length > 0 && (
              <optgroup label="Uploaded">
                {customFonts.map(f => (
                  <option key={f.filename} value={f.name}>{f.name}</option>
                ))}
              </optgroup>
            )}
          </select>
          <div style={{ marginTop: 8, fontFamily: state.font?.family, fontSize: '1.5rem' }}>
            Preview: {state.teams.team1.name} vs {state.teams.team2.name}
          </div>
        </div>
      </div>

      {/* Match History */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📋 Match History</span>
          <button className="btn btn-primary btn-sm"
            onClick={() => fetch(`${api}/api/history/save`, { method: 'POST' })}>
            Save Current Match
          </button>
        </div>
        {state.matchHistory?.length > 0 ? (
          <div>
            {state.matchHistory.map((m, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.8rem' }}>
                <span style={{ fontWeight: 600 }}>{m.teams.team1.name}</span>
                <span style={{ color: 'var(--text-secondary)', margin: '0 6px' }}>{m.teams.team1.score} – {m.teams.team2.score}</span>
                <span style={{ fontWeight: 600 }}>{m.teams.team2.name}</span>
                <span style={{ color: 'var(--text-muted)', marginLeft: 12 }}>{new Date(m.timestamp).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 8 }}>No matches saved yet</p>
        )}
      </div>
    </div>
  );
}
