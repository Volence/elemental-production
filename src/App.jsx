import { useState, useEffect, useCallback } from 'react'
import MatchHub from './pages/MatchHub'
import ProductionControls from './pages/ProductionControls'
import Settings from './pages/Settings'

const API = 'http://localhost:3001';

const PAGES = [
  { id: 'match', label: 'Match Hub', icon: '🎮' },
  { id: 'production', label: 'Production', icon: '🎬' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

const SCENE_ICONS = {
  'Starting': '🟢', 'Map Pick': '🗺️', 'Map Intro': '📍', 'Gameplay': '🎮',
  'Casters': '🎙️', 'Casters Lobby': '📋', 'Casters Scoreboard': '📊',
  'Map Score': '🏆', 'Between Matches': '⏳', 'BRB': '☕',
  'Interview': '🎤', 'Series Winner': '🥇', 'Ending': '🔴',
};

export default function App() {
  const [page, setPage] = useState('match');
  const [state, setStateLocal] = useState(null);
  const [obsConnected, setObsConnected] = useState(false);
  const [scenes, setScenes] = useState([]);
  const [currentScene, setCurrentScene] = useState('');
  const [customFonts, setCustomFonts] = useState([]);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/state`);
      const data = await res.json();
      setStateLocal(data);
    } catch (e) {
      console.warn('Failed to fetch state:', e);
    }
  }, []);

  const updateState = useCallback(async (partial) => {
    try {
      const res = await fetch(`${API}/api/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(partial),
      });
      const data = await res.json();
      setStateLocal(data);
      return data;
    } catch (e) {
      console.error('Failed to update state:', e);
    }
  }, []);

  useEffect(() => {
    fetchState();

    // SSE for real-time updates
    const es = new EventSource(`${API}/api/events`);
    es.addEventListener('state', (e) => {
      setStateLocal(JSON.parse(e.data));
    });
    es.onerror = () => {
      console.warn('SSE connection lost, reconnecting...');
    };

    // Check OBS status + get scenes
    fetch(`${API}/api/obs/status`).then(r => r.json()).then(d => setObsConnected(d.connected)).catch(() => {});
    fetch(`${API}/api/obs/scenes`).then(r => r.json()).then(d => {
      setScenes(d.scenes || []);
      setCurrentScene(d.currentScene || '');
    }).catch(() => {});

    // Load custom fonts
    fetch(`${API}/api/fonts`).then(r => r.json()).then(fonts => {
      setCustomFonts(fonts);
      fonts.forEach(f => {
        const style = document.createElement('style');
        style.textContent = `@font-face { font-family: '${f.name}'; src: url('${f.url}'); }`;
        document.head.appendChild(style);
      });
    }).catch(() => {});

    return () => es.close();
  }, [fetchState]);

  // Keep current scene in sync
  useEffect(() => {
    if (state?.currentScene) setCurrentScene(state.currentScene);
  }, [state?.currentScene]);

  const switchScene = async (name) => {
    await fetch(`${API}/api/obs/scene`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    setCurrentScene(name);
  };

  if (!state) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="loading-text"><div className="spinner" /> Loading...</div>
      </div>
    );
  }

  const sceneList = scenes.length > 0
    ? scenes.map(s => s.sceneName)
    : ['Starting', 'Map Pick', 'Map Intro', 'Gameplay', 'Casters', 'Casters Lobby', 'Casters Scoreboard', 'Map Score', 'Between Matches', 'BRB', 'Interview', 'Series Winner', 'Ending'];

  return (
    <>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>ELEMENTAL</h1>
          <span>Production Companion</span>
        </div>

        <nav className="sidebar-nav">
          {PAGES.map(p => (
            <button
              key={p.id}
              className={page === p.id ? 'active' : ''}
              onClick={() => setPage(p.id)}
            >
              <span className="icon">{p.icon}</span>
              {p.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-status">
          <span className={`status-dot ${obsConnected ? 'connected' : 'disconnected'}`} />
          <span>OBS {obsConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </aside>

      <main className="main-content">
        {/* Sticky Scene Toolbar — sits outside the padded content */}
        <div className="scene-toolbar">
          <div className="scene-toolbar-inner">
            {sceneList.map(name => (
              <button
                key={name}
                className={`scene-toolbar-btn ${currentScene === name ? 'active' : ''}`}
                onClick={() => switchScene(name)}
                title={name}
              >
                <span className="scene-icon">{SCENE_ICONS[name] || '📺'}</span>
                <span className="scene-label">{name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="content-body">
          {page === 'match' && <MatchHub state={state} updateState={updateState} api={API} />}
          {page === 'production' && <ProductionControls state={state} updateState={updateState} api={API} />}
          {page === 'settings' && <Settings state={state} updateState={updateState} api={API} obsConnected={obsConnected} setObsConnected={setObsConnected} customFonts={customFonts} setCustomFonts={setCustomFonts} />}
        </div>
      </main>
    </>
  );
}
