import { useState, useEffect, useCallback, useRef } from 'react'
import MatchHub from './pages/MatchHub'
import ProductionControls from './pages/ProductionControls'
import Theming from './pages/Theming'
import Settings from './pages/Settings'
import StatusBar from './components/StatusBar'
import ConfirmModal from './components/ConfirmModal'
import { sampleBuckets, pickTwoColors, ELMT_ACCENT_FALLBACK } from './lib/color-extract.js'

// Resolves { primary, secondary } — secondary is the logo's second distinct
// color (null when the logo only has one color family). Scenes that want a
// two-tone team treatment (series-winner petals) read theme.teamNColorAlt.
function extractColorFromLogo(logoUrl, proxyBase) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 64;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        const buckets = sampleBuckets(data);
        resolve(pickTwoColors(buckets));
      } catch { resolve({ primary: ELMT_ACCENT_FALLBACK, secondary: null }); }
    };
    img.onerror = () => resolve({ primary: ELMT_ACCENT_FALLBACK, secondary: null });
    const needsProxy = logoUrl.startsWith('http') && !logoUrl.startsWith(proxyBase);
    img.src = needsProxy ? `${proxyBase}/api/proxy-image?url=${encodeURIComponent(logoUrl)}` : logoUrl;
  });
}

const API = 'http://localhost:3001';

const PAGES = [
  { id: 'match', label: 'Match Hub', icon: '🎮' },
  { id: 'production', label: 'Production', icon: '🎬' },
  { id: 'theming', label: 'Theming', icon: '🎨' },
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
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [pendingPage, setPendingPage] = useState(null);

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

    // Poll OBS status
    const checkObs = () => fetch(`${API}/api/obs/status`).then(r => r.json()).then(d => setObsConnected(d.connected)).catch(() => {});
    checkObs();
    const obsPoll = setInterval(checkObs, 5000);
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

    return () => { es.close(); clearInterval(obsPoll); };
  }, [fetchState]);

  // Keep current scene in sync
  useEffect(() => {
    if (state?.currentScene) setCurrentScene(state.currentScene);
  }, [state?.currentScene]);

  // Auto-extract team colors from logos
  const extractedLogosRef = useRef({});
  useEffect(() => {
    if (!state?.theme) return;
    const t1Logo = state.teams?.team1?.logo;
    const t2Logo = state.teams?.team2?.logo;
    const doExtract = async () => {
      const updates = {};
      if (t1Logo && state.theme.team1ColorAuto !== false && extractedLogosRef.current.t1 !== t1Logo) {
        extractedLogosRef.current.t1 = t1Logo;
        const { primary, secondary } = await extractColorFromLogo(t1Logo, API);
        updates.theme = { ...state.theme, team1Color: primary, team1ColorAlt: secondary || '' };
        updates.teams = { ...state.teams, team1: { ...state.teams?.team1, color: primary } };
      }
      if (t2Logo && state.theme.team2ColorAuto !== false && extractedLogosRef.current.t2 !== t2Logo) {
        extractedLogosRef.current.t2 = t2Logo;
        const { primary, secondary } = await extractColorFromLogo(t2Logo, API);
        updates.theme = { ...(updates.theme || state.theme), team2Color: primary, team2ColorAlt: secondary || '' };
        updates.teams = { ...(updates.teams || state.teams), team2: { ...state.teams?.team2, color: primary } };
      }
      if (Object.keys(updates).length > 0) {
        updateState(updates);
      }
    };
    doExtract();
  }, [state?.teams?.team1?.logo, state?.teams?.team2?.logo]);

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
              onClick={() => {
                if (page === 'settings' && settingsDirty && p.id !== 'settings') {
                  setPendingPage(p.id);
                  return;
                }
                setPage(p.id);
              }}
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
          {page === 'theming' && <Theming state={state} updateState={updateState} api={API} customFonts={customFonts} />}
          {page === 'settings' && <Settings state={state} updateState={updateState} api={API} obsConnected={obsConnected} setObsConnected={setObsConnected} customFonts={customFonts} setCustomFonts={setCustomFonts} onDirtyChange={setSettingsDirty} />}
        </div>
      </main>
      <StatusBar state={state} />
      <ConfirmModal
        open={!!pendingPage}
        message="You have unsaved changes in Settings. Leave anyway?"
        confirmLabel="Leave"
        onConfirm={() => { setSettingsDirty(false); setPage(pendingPage); setPendingPage(null); }}
        onCancel={() => setPendingPage(null)}
      />
    </>
  );
}
