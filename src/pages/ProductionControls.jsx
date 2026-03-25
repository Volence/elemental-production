import { useState, useEffect } from 'react'

// Audio mixer groups — only actual audio sources (no browser sources)
const AUDIO_GROUPS = {
  '🎵 Music': ['Background Music', 'Casters Background Music', 'Map Music'],
  '🎙️ Casters': ['Caster 1', 'Caster 2'],
  '🔊 App Audio': ['Overwatch Audio Only', 'Discord Audio', 'Game Audio', 'Desktop Audio', 'Mic/Aux'],
};

// Map scene names to the most relevant audio group for auto-expand
const SCENE_TO_GROUP = {
  'Starting': '🎵 Music',
  'Map Pick': '🎵 Music', 'Between Matches': '🎵 Music',
  'BRB': '🎵 Music', 'Ending': '🎵 Music',
  'Map Intro': '🎵 Music', 'Casters Flythrough': '🎵 Music',
  'Gameplay': '🔊 App Audio',
  'Casters': '🎙️ Casters', 'Casters Lobby': '🎙️ Casters',
  'Casters Scoreboard': '🎙️ Casters', 'Map Score': '🎙️ Casters',
  'Interview': '🔊 App Audio', 'Series Winner': '🎙️ Casters',
};

export default function ProductionControls({ state, updateState, api }) {
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [audioSources, setAudioSources] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [currentScene, setCurrentScene] = useState('');
  const [expandedGroups, setExpandedGroups] = useState(['🎵 Music', '🎙️ Casters', '🔊 App Audio']);
  // Schedule editor
  const [scheduleTeam1, setScheduleTeam1] = useState('');
  const [scheduleTeam2, setScheduleTeam2] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleLabel, setScheduleLabel] = useState('');

  useEffect(() => {
    fetch(`${api}/api/obs/scenes`).then(r => r.json()).then(d => {
      setScenes(d.scenes || []);
      setCurrentScene(d.currentScene || '');
    }).catch(() => {});
    loadAudio();
  }, [api]);

  useEffect(() => {
    if (state?.currentScene) {
      setCurrentScene(state.currentScene);
      // Auto-expand the audio group matching the current scene
      const group = SCENE_TO_GROUP[state.currentScene];
      if (group && !expandedGroups.includes(group)) {
        setExpandedGroups(prev => [...prev.filter(g => g === '🎵 Shared / Global'), group]);
      }
    }
  }, [state?.currentScene]);

  const loadAudio = () => {
    fetch(`${api}/api/obs/audio`).then(r => r.json()).then(setAudioSources).catch(() => {});
  };

  const switchScene = async (name) => {
    await fetch(`${api}/api/obs/scene`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setCurrentScene(name);
  };

  const updateCasterName = async (index, name) => {
    const casters = [...state.casters];
    casters[index] = { ...casters[index], name };
    updateState({ casters });
    await fetch(`${api}/api/obs/text`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: `Caster ${index + 1} Name`, text: name }),
    });
  };

  const updateCasterCam = async (index, camUrl) => {
    const casters = [...state.casters];
    casters[index] = { ...casters[index], camUrl };
    updateState({ casters });
    // Push to OBS browser source
    await fetch(`${api}/api/casters/cam`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index, camUrl }),
    });
  };

  const setCasterLayout = async (count) => {
    await fetch(`${api}/api/casters/layout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count }),
    });
  };

  const startTimer = async () => {
    await fetch(`${api}/api/timer/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: timerMinutes * 60, label: state.countdown.label }),
    });
  };

  const pauseTimer = () => fetch(`${api}/api/timer/pause`, { method: 'POST' });
  const resumeTimer = () => fetch(`${api}/api/timer/resume`, { method: 'POST' });

  const timerRunning = state.countdown.running;
  const timerPaused = !timerRunning && state.countdown.remaining > 0 && state.countdown.remaining < (state.countdown.duration || timerMinutes * 60);
  const goBRB = () => fetch(`${api}/api/brb`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration: timerMinutes * 60 }),
  });

  const refreshOverlays = () => fetch(`${api}/api/overlays/refresh`, { method: 'POST' });

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const updateLowerThird = (field, value) => {
    updateState({ lowerThird: { ...state.lowerThird, [field]: value } });
  };

  const setVolume = async (source, volumeDb) => {
    await fetch(`${api}/api/obs/audio/volume`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, volumeDb }),
    });
    setAudioSources(prev => prev.map(s => s.name === source ? { ...s, volumeDb } : s));
  };

  const toggleMute = async (source, currentMuted) => {
    await fetch(`${api}/api/obs/audio/mute`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, muted: !currentMuted }),
    });
    setAudioSources(prev => prev.map(s => s.name === source ? { ...s, muted: !currentMuted } : s));
  };

  const toggleGroup = (group) => {
    setExpandedGroups(prev =>
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    );
  };

  // Schedule helpers
  const addScheduleRow = () => {
    if (!scheduleTeam1.trim() && !scheduleTeam2.trim()) return;
    const schedule = [...(state.schedule || []), {
      team1: scheduleTeam1 || 'TBD',
      team1Logo: '',
      team2: scheduleTeam2 || 'TBD',
      team2Logo: '',
      time: scheduleTime,
      label: scheduleLabel,
    }];
    updateState({ schedule });
    setScheduleTeam1(''); setScheduleTeam2(''); setScheduleTime(''); setScheduleLabel('');
  };

  const removeScheduleRow = (idx) => {
    const schedule = (state.schedule || []).filter((_, i) => i !== idx);
    updateState({ schedule });
  };

  const autoFillSchedule = () => {
    const schedule = [{
      team1: state.teams?.team1?.name || 'Team 1',
      team1Logo: state.teams?.team1?.logo || '',
      team2: state.teams?.team2?.name || 'Team 2',
      team2Logo: state.teams?.team2?.logo || '',
      time: '',
      label: 'UP NEXT',
    }];
    updateState({ schedule });
  };

  // Pre-flight checklist
  const [preflight, setPreflight] = useState(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightExpanded, setPreflightExpanded] = useState(false);

  const runPreflight = async () => {
    setPreflightLoading(true);
    try {
      const res = await fetch(`${api}/api/preflight`);
      const data = await res.json();
      setPreflight(data);
    } catch { setPreflight(null); }
    setPreflightLoading(false);
  };

  useEffect(() => { runPreflight(); }, [api]);

  // Stream health
  const [obsStats, setObsStats] = useState(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${api}/api/obs/stats`);
        const data = await res.json();
        if (data.connected) setObsStats(data);
        else setObsStats(null);
      } catch { setObsStats(null); }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [api]);

  const formatDuration = (ms) => {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
      : `${m}:${String(sec).padStart(2,'0')}`;
  };

  const casterLayout = state.casterLayout ?? 2;
  // Replay buffer
  const [replayStatus, setReplayStatus] = useState({ active: false });
  const [replaySaving, setReplaySaving] = useState(false);

  useEffect(() => {
    const pollReplay = async () => {
      try {
        const res = await fetch(`${api}/api/replay/status`);
        setReplayStatus(await res.json());
      } catch {}
    };
    pollReplay();
    const interval = setInterval(pollReplay, 10000);
    return () => clearInterval(interval);
  }, [api]);

  const toggleReplayBuffer = async () => {
    const endpoint = replayStatus.active ? 'stop' : 'start';
    await fetch(`${api}/api/replay/${endpoint}`, { method: 'POST' });
    const res = await fetch(`${api}/api/replay/status`);
    setReplayStatus(await res.json());
  };

  const saveReplay = async () => {
    setReplaySaving(true);
    const res = await fetch(`${api}/api/replay/save`, { method: 'POST' });
    await res.json();
    setReplaySaving(false);
  };

  const loadReplay = async (direction) => {
    await fetch(`${api}/api/replay/load`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ switchScene: !direction, direction }),
    });
  };

  const clearReplays = async () => {
    await fetch(`${api}/api/replay/clear`, { method: 'POST' });
  };

  const clipCount = state.replayClips?.length || 0;
  const clipIndex = state.replayIndex || 0;

  const sceneList = scenes.length > 0
    ? scenes.map(s => s.sceneName)
    : ['Starting', 'Map Pick', 'Map Intro', 'Gameplay', 'Casters', 'Casters Lobby', 'Casters Scoreboard', 'Map Score', 'Between Matches', 'BRB', 'Interview', 'Series Winner', 'Ending'];

  return (
    <div className="fade-in">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2>Production Controls</h2>
          <p>Scene previews, audio, casters, timers, and on-screen graphics</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost btn-sm" onClick={refreshOverlays}>🔄 Refresh Overlays</button>
          <button className="btn btn-ghost btn-sm" onClick={goBRB}>☕ BRB Mode</button>
          <div style={{ display: 'flex', gap: 2, border: '1px solid rgba(99,102,241,0.2)', borderRadius: 6, overflow: 'hidden' }}>
            <button
              className="btn btn-sm"
              onClick={toggleReplayBuffer}
              style={{
                background: replayStatus.active ? 'rgba(239,68,68,0.15)' : 'var(--bg-input)',
                color: replayStatus.active ? '#ef4444' : 'var(--text-muted)',
                border: 'none', borderRadius: 0, fontSize: '0.7rem',
              }}
              title={replayStatus.active ? 'Stop replay buffer' : 'Start replay buffer'}
            >
              {replayStatus.active ? '⏺ Buffer ON' : '⏸ Buffer OFF'}
            </button>
            <button
              className="btn btn-sm"
              onClick={saveReplay}
              disabled={!replayStatus.active || replaySaving}
              style={{
                background: 'var(--bg-input)', border: 'none', borderRadius: 0,
                fontSize: '0.7rem', color: replayStatus.active ? 'var(--text-primary)' : 'var(--text-muted)',
                position: 'relative',
              }}
              title="Save clip from replay buffer"
            >
              {replaySaving ? '⏳' : '📎 Save'}
              {clipCount > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4, background: '#6366f1',
                  color: '#fff', fontSize: '0.55rem', borderRadius: '50%',
                  width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700,
                }}>{clipCount}</span>
              )}
            </button>
            {clipCount > 1 && (
              <button
                className="btn btn-sm"
                onClick={() => loadReplay('prev')}
                style={{ background: 'var(--bg-input)', border: 'none', borderRadius: 0, fontSize: '0.7rem', padding: '4px 6px' }}
                title="Previous clip"
              >◀</button>
            )}
            <button
              className="btn btn-sm"
              onClick={() => loadReplay()}
              disabled={clipCount === 0}
              style={{
                background: 'var(--bg-input)', border: 'none', borderRadius: 0,
                fontSize: '0.7rem', color: clipCount > 0 ? '#6366f1' : 'var(--text-muted)',
              }}
              title={clipCount > 0 ? `Play clip ${clipIndex + 1}/${clipCount}` : 'No clips saved'}
            >
              ▶ {clipCount > 0 ? `${clipIndex + 1}/${clipCount}` : 'Play'}
            </button>
            {clipCount > 1 && (
              <button
                className="btn btn-sm"
                onClick={() => loadReplay('next')}
                style={{ background: 'var(--bg-input)', border: 'none', borderRadius: 0, fontSize: '0.7rem', padding: '4px 6px' }}
                title="Next clip"
              >▶</button>
            )}
            {clipCount > 0 && (
              <button
                className="btn btn-sm"
                onClick={clearReplays}
                style={{ background: 'var(--bg-input)', border: 'none', borderRadius: 0, fontSize: '0.65rem', color: 'var(--text-muted)', padding: '4px 6px' }}
                title="Clear all saved clips"
              >🗑</button>
            )}
          </div>
        </div>
      </div>

      {/* Stream Health Bar */}
      {obsStats && (obsStats.streaming || obsStats.recording) && (
        <div style={{
          display: 'flex', gap: 16, alignItems: 'center', padding: '8px 16px', marginBottom: 12,
          background: 'var(--bg-card)', borderRadius: 8,
          border: '1px solid rgba(99,102,241,0.2)', fontSize: '0.75rem',
        }}>
          {obsStats.streaming && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse 2s infinite' }} />
              <strong style={{ color: '#ef4444' }}>LIVE</strong>
              <span style={{ color: 'var(--text-muted)' }}>{formatDuration(obsStats.streamDuration)}</span>
            </span>
          )}
          {obsStats.recording && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
              <strong style={{ color: '#f59e0b' }}>REC</strong>
              <span style={{ color: 'var(--text-muted)' }}>{formatDuration(obsStats.recordDuration)}</span>
            </span>
          )}
          <span style={{ color: 'var(--text-muted)' }}>
            {obsStats.activeFps?.toFixed(0)} FPS
          </span>
          <span style={{ color: 'var(--text-muted)' }}>
            CPU {obsStats.cpu?.toFixed(1)}%
          </span>
          <span style={{
            color: obsStats.outputSkippedFrames > 0 ? '#ef4444' : 'var(--text-muted)',
          }}>
            {obsStats.outputSkippedFrames > 0
              ? `⚠ ${obsStats.outputSkippedFrames} dropped`
              : '0 dropped'}
          </span>
          {obsStats.streaming && obsStats.streamBytes > 0 && (
            <span style={{ color: 'var(--text-muted)' }}>
              {(obsStats.streamBytes / 1024 / 1024).toFixed(0)} MB sent
            </span>
          )}
          <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
            💾 {obsStats.availableDiskSpace?.toFixed(1)} GB free
          </span>
        </div>
      )}

      {/* Pre-Show Checklist */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="card-header" style={{ cursor: 'pointer' }} onClick={() => setPreflightExpanded(!preflightExpanded)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="card-title">
              {preflightExpanded ? '▼' : '▶'} {preflight?.allOk ? '🟢' : '🔴'} Pre-Show Checklist
            </span>
            {preflight && !preflightExpanded && (
              <span style={{ fontSize: '0.7rem', color: preflight.allOk ? 'var(--success)' : 'var(--danger)' }}>
                {preflight.allOk ? 'All systems go' : `${preflight.checks.filter(c => !c.ok).length} issue(s)`}
              </span>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); runPreflight(); }}
            disabled={preflightLoading}>
            {preflightLoading ? '⏳' : '↻ Re-check'}
          </button>
        </div>
        {preflightExpanded && preflight && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {preflight.checks.map(check => (
              <div key={check.id} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                background: check.ok ? 'rgba(34,197,94,0.06)' : check.warn ? 'rgba(245,158,11,0.06)' : 'rgba(239,68,68,0.06)',
                borderRadius: 6, fontSize: '0.78rem',
              }}>
                <span style={{ fontSize: '1rem' }}>{check.ok ? '✅' : check.warn ? '⚠️' : '❌'}</span>
                <span style={{ fontWeight: 600, minWidth: 160 }}>{check.label}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.72rem' }}>{check.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scene Switcher */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🖼️ Scenes</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Click to switch</span>
        </div>
        <div className="scene-preview-grid">
          {sceneList.map(name => {
            const thumbFile = {
              'Starting': 'starting', 'Map Pick': 'map-pick', 'Map Intro': 'map-intro',
              'Gameplay': 'gameplay', 'Casters': 'casters', 'Casters Lobby': 'casters-lobby',
              'Casters Scoreboard': 'casters-scoreboard', 'Map Score': 'map-score',
              'Between Matches': 'between-matches', 'BRB': 'brb', 'Interview': 'interview',
              'Series Winner': 'series-winner', 'Ending': 'ending',
            }[name];
            const thumbSrc = thumbFile ? `/scene-thumbs/${thumbFile}.png` : null;
            // Per-scene focus: [focusX, focusY, zoom]
            // focusX/focusY = 0-1, where the interesting content is in the source image
            // The image is positioned so this focal point appears at the CENTER of the thumbnail
            const focusConfig = {
              'Starting': [0.12, 0.78, 1.5],        // timer + "STARTING SOON" text, bottom-left
              'Map Pick': [0.47, 0.5, 1.1],          // fills nicely, centered
              'Map Intro': [0.47, 0.78, 2.5],        // small card cluster in lower-center
              'Gameplay': [0.47, 0.04, 2.5],         // thin header bars at very top edge
              'Casters': [0.44, 0.5, 1.15],          // two camera boxes + title, centered
              'Casters Lobby': [0.47, 0.55, 1.3],    // data panel with teams in lower portion
              'Casters Scoreboard': [0.47, 0.55, 1.3],// stats table below caster area
              'Map Score': [0.52, 0.35, 1.3],        // score table center-right area
              'Between Matches': [0.47, 0.5, 1.1],   // mostly dark, show full layout
              'BRB': [0.47, 0.48, 1.1],              // centered "WE'LL BE RIGHT BACK"
              'Interview': [0.47, 0.6, 1.2],         // camera box + name below
              'Series Winner': [0.47, 0.48, 1.15],   // centered logo + score
              'Ending': [0.47, 0.42, 1.15],          // "SEE YOU NEXT TIME" centered
            };
            const [fx, fy, zoom] = focusConfig[name] || [0.5, 0.5, 1.1];
            // Calculate position to center the focal point, clamped to prevent blank edges
            const rawLeft = (0.5 - fx * zoom) * 100;
            const rawTop = (0.5 - fy * zoom) * 100;
            const imgLeft = Math.min(0, Math.max((1 - zoom) * 100, rawLeft));
            const imgTop = Math.min(0, Math.max((1 - zoom) * 100, rawTop));
            return (
              <div
                key={name}
                className={`scene-preview-card ${currentScene === name ? 'active' : ''}`}
                onClick={() => switchScene(name)}
              >
                <div style={{
                  width: '100%', aspectRatio: '16/9', overflow: 'hidden',
                  borderRadius: '6px 6px 0 0', background: '#0a0f1e',
                  position: 'relative',
                }}>
                  {thumbSrc ? (
                    <img
                      src={thumbSrc}
                      alt={name}
                      style={{
                        position: 'absolute',
                        width: `${zoom * 100}%`,
                        height: `${zoom * 100}%`,
                        left: `${imgLeft}%`,
                        top: `${imgTop}%`,
                        display: 'block',
                        opacity: currentScene === name ? 1 : 0.65,
                        transition: 'opacity 0.2s ease',
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.7rem', color: 'var(--text-muted)',
                    }}>
                      {name}
                    </div>
                  )}
                </div>
                <div className="preview-label">{name}</div>
              </div>
            );
          })}
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
          {timerRunning && <span className="badge badge-success" style={{ marginLeft: 8 }}>LIVE</span>}
          {timerPaused && <span className="badge" style={{ marginLeft: 8, background: '#b8860b', color: '#fff' }}>PAUSED</span>}
        </div>
        <div className="countdown-controls">
          <input className="input" style={{ width: 120 }} placeholder="Label" value={state.countdown.label}
            onChange={e => updateState({ countdown: { ...state.countdown, label: e.target.value } })} />
          <input className="input" type="number" style={{ width: 70 }} value={timerMinutes} min={1} max={60}
            onChange={e => setTimerMinutes(Number(e.target.value))} />
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>min</span>
          {!timerRunning && !timerPaused && (
            <button className="btn btn-success btn-sm" onClick={startTimer}>▶ Start</button>
          )}
          {timerPaused && (
            <button className="btn btn-success btn-sm" onClick={resumeTimer}>▶ Resume</button>
          )}
          {timerRunning && (
            <button className="btn btn-sm" style={{ background: '#b8860b', color: '#fff' }} onClick={pauseTimer}>⏸ Pause</button>
          )}
          {(timerRunning || timerPaused) && (
            <button className="btn btn-danger btn-sm" onClick={() => fetch(`${api}/api/timer/stop`, { method: 'POST' })}>⏹ Stop</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => fetch(`${api}/api/timer/reset`, { method: 'POST' })}>↺ Reset</button>
        </div>
      </div>

      {/* Schedule Editor */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📅 Today's Schedule</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={autoFillSchedule}>📋 Auto-fill from Match</button>
          </div>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '4px 0 12px' }}>
          Shown on the Starting Soon overlay. First row is highlighted as "Up Next".
        </p>

        {/* Current schedule rows */}
        {(state.schedule || []).length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {(state.schedule || []).map((row, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 4,
                background: i === 0 ? 'rgba(249,115,22,0.1)' : 'var(--bg-input)',
                borderRadius: 6, borderLeft: i === 0 ? '3px solid #f97316' : '3px solid transparent',
              }}>
                {i === 0 && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: 1, minWidth: 50 }}>Up Next</span>}
                <span style={{ fontWeight: 600, flex: 1 }}>{row.team1}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>vs</span>
                <span style={{ fontWeight: 600, flex: 1, textAlign: 'right' }}>{row.team2}</span>
                {row.time && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', minWidth: 50, textAlign: 'right' }}>{row.time}</span>}
                <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.6rem', padding: '2px 6px' }}
                  onClick={() => removeScheduleRow(i)}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Add row form */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: 1, minWidth: 100 }} placeholder="Team 1" value={scheduleTeam1}
            onChange={e => setScheduleTeam1(e.target.value)} />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>vs</span>
          <input className="input" style={{ flex: 1, minWidth: 100 }} placeholder="Team 2" value={scheduleTeam2}
            onChange={e => setScheduleTeam2(e.target.value)} />
          <input className="input" style={{ width: 70 }} placeholder="Time" value={scheduleTime}
            onChange={e => setScheduleTime(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={addScheduleRow}>+ Add</button>
        </div>
      </div>

      {/* Caster Management */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🎙️ Casters</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Cameras:</span>
            <div className="mode-toggle">
              {[0, 1, 2].map(n => (
                <button key={n} className={casterLayout === n ? 'active' : ''} onClick={() => setCasterLayout(n)}>
                  {n === 0 ? '🚫 None' : n === 1 ? '📷 1' : '📷📷 2'}
                </button>
              ))}
            </div>
          </div>
        </div>
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

      {/* Interview / Guest Cam */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🎤 Interview / Guest Cam</span>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '4px 0 12px' }}>
          Full-screen interview scene with camera feed + player info bar. Used during post-match player interviews.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="caster-row">
            <input className="input" placeholder="Player name" value={state.interviewee?.name || ''}
              onChange={e => updateState({ interviewee: { ...state.interviewee, name: e.target.value } })} />
            <input className="input" placeholder="Cam URL (VDO.Ninja, etc.)" value={state.interviewee?.camUrl || ''}
              onChange={e => {
                const camUrl = e.target.value;
                updateState({ interviewee: { ...state.interviewee, camUrl } });
                fetch(`${api}/api/interviewee/cam`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ camUrl }),
                });
              }} style={{ flex: 2 }} />
            <button className={`btn btn-sm ${state.interviewee?.visible ? 'btn-success' : 'btn-ghost'}`}
              onClick={() => updateState({ interviewee: { ...state.interviewee, visible: !state.interviewee?.visible } })}>
              {state.interviewee?.visible ? '👁️' : '👁️‍🗨️'}
            </button>
          </div>
          <div className="caster-row">
            <input className="input" placeholder="Team name" value={state.interviewee?.teamName || ''}
              onChange={e => updateState({ interviewee: { ...state.interviewee, teamName: e.target.value } })} />
            <select className="input" value={state.interviewee?.role || ''}
              onChange={e => updateState({ interviewee: { ...state.interviewee, role: e.target.value } })}
              style={{ maxWidth: 120 }}>
              <option value="">Role</option>
              <option value="Tank">Tank</option>
              <option value="Damage">Damage</option>
              <option value="Support">Support</option>
            </select>
            <input className="input" placeholder="Label" value={state.interviewee?.label || ''}
              onChange={e => updateState({ interviewee: { ...state.interviewee, label: e.target.value } })}
              style={{ flex: 1 }} />
          </div>
          {/* Quick fill from loaded teams */}
          {state.teams?.team1?.name && (
            <div style={{ display: 'flex', gap: 6, fontSize: '0.7rem' }}>
              <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>Quick fill team:</span>
              <button className="btn btn-sm btn-ghost" onClick={() => updateState({
                interviewee: { ...state.interviewee, teamName: state.teams.team1.name, teamLogo: state.teams.team1.logo || '', teamColor: state.teams.team1.color || '#3b82f6' }
              })}>{state.teams.team1.name}</button>
              <button className="btn btn-sm btn-ghost" onClick={() => updateState({
                interviewee: { ...state.interviewee, teamName: state.teams.team2.name, teamLogo: state.teams.team2.logo || '', teamColor: state.teams.team2.color || '#ef4444' }
              })}>{state.teams.team2.name}</button>
            </div>
          )}
        </div>
      </div>

      {/* Lower Third */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📺 Lower Third</span>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '4px 0 12px' }}>
          Pop-up name banner (chyron) that slides over any active scene. Use for player intros, caster names, etc.
        </p>
        <div className="grid-2" style={{ marginBottom: 12 }}>
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

      {/* Audio Mixer — Scene-based groups */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🔊 Audio Mixer</span>
          <button className="btn btn-ghost btn-sm" onClick={loadAudio}>↻ Refresh</button>
        </div>
        {audioSources.length > 0 ? (
          <div style={{ marginTop: 8 }}>
            {Object.entries(AUDIO_GROUPS).map(([group, sourceNames]) => {
              const groupSources = audioSources.filter(s => sourceNames.includes(s.name));
              if (groupSources.length === 0) return null;
              const isExpanded = expandedGroups.includes(group);
              const mutedCount = groupSources.filter(s => s.muted).length;
              const isCurrentGroup = SCENE_TO_GROUP[currentScene] === group;

              return (
                <div key={group} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      onClick={() => toggleGroup(group)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1,
                        padding: '8px 12px', background: isCurrentGroup ? 'rgba(99,102,241,0.1)' : 'var(--bg-input)',
                        border: isCurrentGroup ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                        borderRadius: '6px 0 0 6px', cursor: 'pointer', color: 'var(--text-primary)',
                        fontWeight: 600, fontSize: '0.8rem', fontFamily: 'inherit',
                      }}
                    >
                      <span>{isExpanded ? '▼' : '▶'} {group}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                        {groupSources.length} source{groupSources.length !== 1 ? 's' : ''}
                        {mutedCount > 0 && <span style={{ color: 'var(--danger)', marginLeft: 6 }}>{mutedCount} muted</span>}
                      </span>
                    </button>
                    <button
                      onClick={async () => {
                        const allMuted = groupSources.every(s => s.muted);
                        for (const s of groupSources) {
                          if (allMuted ? s.muted : !s.muted) await toggleMute(s.name, s.muted);
                        }
                      }}
                      style={{
                        padding: '8px 10px', background: isCurrentGroup ? 'rgba(99,102,241,0.1)' : 'var(--bg-input)',
                        border: isCurrentGroup ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent',
                        borderRadius: '0 6px 6px 0', cursor: 'pointer',
                        color: groupSources.every(s => s.muted) ? 'var(--success)' : 'var(--text-muted)',
                        fontWeight: 600, fontSize: '0.65rem', fontFamily: 'inherit', whiteSpace: 'nowrap',
                      }}
                      title={groupSources.every(s => s.muted) ? 'Unmute all' : 'Mute all'}
                    >
                      {groupSources.every(s => s.muted) ? '🔊' : '🔇'}
                    </button>
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '4px 0 0 12px' }}>
                      {groupSources.map(source => (
                        <div key={source.name} className="audio-source">
                          <button
                            className={`mute-btn ${source.muted ? 'muted' : ''}`}
                            onClick={() => toggleMute(source.name, source.muted)}
                            title={source.muted ? 'Unmute' : 'Mute'}
                          >
                            {source.muted ? '🔇' : '🔊'}
                          </button>
                          <span className="audio-name" title={source.name}>{source.name}</span>
                          <input
                            type="range"
                            min={-60}
                            max={0}
                            step={0.5}
                            value={source.volumeDb}
                            onChange={e => setVolume(source.name, Number(e.target.value))}
                            disabled={source.muted}
                          />
                          <span className="audio-db">{source.volumeDb.toFixed(1)} dB</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Ungrouped sources */}
            {(() => {
              const allGrouped = Object.values(AUDIO_GROUPS).flat();
              const ungrouped = audioSources.filter(s => !allGrouped.includes(s.name));
              if (ungrouped.length === 0) return null;
              const isExpanded = expandedGroups.includes('🔧 Other');
              const unmutedCount = ungrouped.filter(s => !s.muted).length;
              const muteAll = async () => {
                for (const s of ungrouped) {
                  if (!s.muted) await toggleMute(s.name, false);
                }
              };
              return (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      onClick={() => toggleGroup('🔧 Other')}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1,
                        padding: '8px 12px', background: 'var(--bg-input)', border: '1px solid transparent',
                        borderRadius: '6px 0 0 6px', cursor: 'pointer', color: 'var(--text-primary)',
                        fontWeight: 600, fontSize: '0.8rem', fontFamily: 'inherit',
                      }}
                    >
                      <span>{isExpanded ? '▼' : '▶'} 🔧 Other</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                        {ungrouped.length} source{ungrouped.length !== 1 ? 's' : ''}
                        {unmutedCount > 0 && <span style={{ color: 'var(--danger)', marginLeft: 6 }}>{unmutedCount} unmuted</span>}
                      </span>
                    </button>
                    {unmutedCount > 0 && (
                      <button
                        onClick={muteAll}
                        style={{
                          padding: '8px 10px', background: 'var(--bg-input)', border: '1px solid transparent',
                          borderRadius: '0 6px 6px 0', cursor: 'pointer', color: 'var(--danger)',
                          fontWeight: 600, fontSize: '0.65rem', fontFamily: 'inherit', whiteSpace: 'nowrap',
                        }}
                        title="Mute all ungrouped sources"
                      >
                        🔇 Mute All
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <div style={{ padding: '4px 0 0 12px' }}>
                      {ungrouped.map(source => (
                        <div key={source.name} className="audio-source">
                          <button
                            className={`mute-btn ${source.muted ? 'muted' : ''}`}
                            onClick={() => toggleMute(source.name, source.muted)}
                            title={source.muted ? 'Unmute' : 'Mute'}
                          >
                            {source.muted ? '🔇' : '🔊'}
                          </button>
                          <span className="audio-name" title={source.name}>{source.name}</span>
                          <input
                            type="range"
                            min={-60}
                            max={0}
                            step={0.5}
                            value={source.volumeDb}
                            onChange={e => setVolume(source.name, Number(e.target.value))}
                            disabled={source.muted}
                          />
                          <span className="audio-db">{source.volumeDb.toFixed(1)} dB</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        ) : (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 8 }}>
            Click refresh to load audio sources from OBS
          </p>
        )}
      </div>
    </div>
  );
}
