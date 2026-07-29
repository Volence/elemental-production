import { useState, useEffect, useRef } from 'react'
import ConfirmModal from '../components/ConfirmModal'

// Accent/punctuation-insensitive hero matching: FACEIT sends "Lucio"/"Torbjorn",
// OverFast names are "Lúcio"/"Torbjörn", and keys are "lucio"/"soldier-76".
const normalizeHeroName = (s) => s
  ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  : '';

const findHeroByName = (allHeroes, name) => {
  const n = normalizeHeroName(name);
  if (!n) return null;
  return allHeroes.find(h => normalizeHeroName(h.key) === n || normalizeHeroName(h.name) === n) || null;
};

// OW2 map pool for manual mode
const OW2_MAPS = [
  { name: 'Busan', mode: 'Control' }, { name: 'Ilios', mode: 'Control' }, { name: 'Lijiang Tower', mode: 'Control' },
  { name: 'Nepal', mode: 'Control' }, { name: 'Oasis', mode: 'Control' }, { name: 'Antarctic Peninsula', mode: 'Control' },
  { name: 'Samoa', mode: 'Control' },
  { name: 'Circuit Royal', mode: 'Escort' }, { name: 'Dorado', mode: 'Escort' }, { name: 'Havana', mode: 'Escort' },
  { name: 'Junkertown', mode: 'Escort' }, { name: 'Rialto', mode: 'Escort' }, { name: 'Route 66', mode: 'Escort' },
  { name: 'Shambali Monastery', mode: 'Escort' }, { name: 'Watchpoint: Gibraltar', mode: 'Escort' },
  { name: 'Blizzard World', mode: 'Hybrid' }, { name: 'Eichenwalde', mode: 'Hybrid' },
  { name: 'Hollywood', mode: 'Hybrid' }, { name: "King's Row", mode: 'Hybrid' },
  { name: 'Midtown', mode: 'Hybrid' }, { name: 'Numbani', mode: 'Hybrid' }, { name: 'Paraíso', mode: 'Hybrid' },
  { name: 'Colosseo', mode: 'Push' }, { name: 'Esperança', mode: 'Push' },
  { name: 'New Queen Street', mode: 'Push' }, { name: 'Runasapi', mode: 'Push' },
  { name: 'New Junk City', mode: 'Flashpoint' }, { name: 'Suravasa', mode: 'Flashpoint' },
  { name: 'Aatlis', mode: 'Flashpoint' },
];

export default function MatchHub({ state, updateState, api }) {
  const [matchUrl, setMatchUrl] = useState(state.faceitMatchUrl || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [heroes, setHeroes] = useState({ tank: [], damage: [], support: [] });
  const [mapImages, setMapImages] = useState({});
  const [banTeam, setBanTeam] = useState('team1');
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [selectedMapIdx, setSelectedMapIdx] = useState(-1); // -1 = auto (current/last)
  const [showNewMatchConfirm, setShowNewMatchConfirm] = useState(false);
  const [logoUploadTarget, setLogoUploadTarget] = useState('team1');
  const logoInputRef = useRef(null);

  useEffect(() => {
    fetch(`${api}/api/heroes/grouped`).then(r => r.json()).then(setHeroes).catch(() => {});
  }, [api]);

  // Map name -> screenshot from the server's OverFast-backed catalog, so
  // manually added maps get images like FACEIT-loaded ones do.
  useEffect(() => {
    fetch(`${api}/api/maps`).then(r => r.json()).then(list => {
      const byName = {};
      (Array.isArray(list) ? list : []).forEach(m => {
        if (m.name) byName[m.name.toLowerCase()] = m.screenshot || m.image || '';
      });
      setMapImages(byName);
    }).catch(() => {});
  }, [api]);

  // Keep local map selection in sync with server state (dashboard reloads,
  // FACEIT match loads resetting it to -1, etc.)
  useEffect(() => {
    const idx = state.selectedMapIdx ?? -1;
    setSelectedMapIdx(prev => (prev === idx ? prev : idx));
  }, [state.selectedMapIdx]);

  // Restore the loaded match URL after tab switches (this component unmounts).
  // Only fill an empty input — never stomp something the producer is typing.
  useEffect(() => {
    if (state.faceitMatchUrl && !matchUrl) setMatchUrl(state.faceitMatchUrl);
  }, [state.faceitMatchUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const allHeroList = () => [...(heroes.tank || []), ...(heroes.damage || []), ...(heroes.support || [])];

  // Route external logo URLs through the local proxy for dashboard previews —
  // hosts like liquipedia reject hotlinked <img> requests
  const previewUrl = (u) => u && /^https?:\/\//i.test(u) && !u.includes('localhost') && !u.includes('127.0.0.1')
    ? `${api}/api/proxy-image?url=${encodeURIComponent(u)}`
    : u;

  // heroBans payload for a map's stored bans (what the overlays display).
  // Returns null while the hero list hasn't loaded yet — writing then would
  // wipe the on-air ban icons because names can't resolve to keys.
  const heroBansForMap = (idx, perMapBansArr = state.perMapBans) => {
    const mapBans = perMapBansArr?.[idx];
    const list = allHeroList();
    if (!list.length && (mapBans?.team1Ban || mapBans?.team2Ban)) return null;
    const toKey = (n) => findHeroByName(list, n)?.key || '';
    return {
      team1: mapBans?.team1Ban ? [toKey(mapBans.team1Ban.name)].filter(Boolean) : [],
      team2: mapBans?.team2Ban ? [toKey(mapBans.team2Ban.name)].filter(Boolean) : [],
    };
  };

  // Which map the overlays display bans for when no map is manually selected:
  // live map → next upcoming map → last map (mirrors server getActiveBanIdx)
  const autoActiveIdx = () => {
    const maps = state.maps || [];
    const cur = maps.findIndex(m => m.status === 'current');
    if (cur >= 0) return cur;
    const up = maps.findIndex(m => m.status === 'upcoming');
    if (up >= 0) return up;
    return maps.length - 1;
  };
  const getDisplayMapIdx = () => (selectedMapIdx >= 0 ? selectedMapIdx : autoActiveIdx());

  const overrides = state.overrides || {};
  const hasOverrides = Object.keys(overrides).length > 0;

  // Set manual override for a field
  const setOverride = async (...paths) => {
    await fetch(`${api}/api/overrides`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
    });
  };

  // Clear a single override and re-fetch from FACEIT
  const releasOverride = async (path) => {
    await fetch(`${api}/api/overrides/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    // Re-fetch from FACEIT to restore the API value
    if (state.mode === 'faceit' && state.faceitMatchId) {
      try {
        await fetch(`${api}/api/faceit/refresh`, { method: 'POST' });
      } catch (e) { /* silent fallback */ }
    }
  };

  // Clear ALL overrides
  const releaseAllOverrides = async () => {
    await fetch(`${api}/api/overrides`, { method: 'DELETE' });
  };

  // Override-aware update: set the field AND flag the override
  const overrideField = (path, stateUpdate) => {
    updateState(stateUpdate);
    setOverride(path);
  };

  const loadMatch = async () => {
    if (!matchUrl.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${api}/api/faceit/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: matchUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load match');
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const toggleMode = (mode) => {
    updateState({ mode });
    if (mode === 'manual') {
      updateState({
        teams: {
          team1: { name: 'Team 1', logo: '', color: '#3b82f6', score: 0 },
          team2: { name: 'Team 2', logo: '', color: '#ef4444', score: 0 },
        },
        maps: [],
        playerStats: [],
        heroBans: { team1: [], team2: [] },
        perMapBans: [],
        banSwaps: [],
        mapPickers: [],
        selectedMapIdx: -1,
      });
    } else if (mode === 'scrim') {
      updateState({
        teams: {
          team1: { name: state.teams?.team1?.name || 'Team 1', logo: state.teams?.team1?.logo || '', color: '#3b82f6', score: 0 },
          team2: { name: state.teams?.team2?.name || 'Team 2', logo: state.teams?.team2?.logo || '', color: '#ef4444', score: 0 },
        },
        maps: [],
        playerStats: [],
        heroBans: { team1: [], team2: [] },
        perMapBans: [],
        banSwaps: [],
        mapPickers: [],
        selectedMapIdx: -1,
        bestOf: 1,
      });
    }
  };

  const swapSides = () => fetch(`${api}/api/swap`, { method: 'POST' });
  const resetMatch = (keepTeams = true) => fetch(`${api}/api/reset`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keepTeams }),
  });

  const addMap = (map) => {
    const maps = [...(state.maps || []), {
      ...map,
      image: mapImages[(map.name || '').toLowerCase()] || '',
      status: 'upcoming', winner: null,
    }];
    const updates = { maps };
    if (state.mode === 'scrim') updates.bestOf = maps.length;
    updateState(updates);
    setOverride('maps');
    setShowMapPicker(false);
  };

  const removeMap = (idx) => {
    const maps = state.maps.filter((_, i) => i !== idx);
    const updates = { maps };
    if (state.mode === 'scrim') updates.bestOf = maps.length;
    updateState(updates);
    setOverride('maps');
  };

  const setMapStatus = (idx, status, winner = null) => {
    const maps = state.maps.map((m, i) => i === idx ? { ...m, status, winner } : m);
    updateState({ maps });
  };

  // Index of the map that ban edits apply to. Never a completed map: once a
  // winner is set, new ban edits belong to the NEXT map (even before it's added).
  const getActiveBanMapIdx = () => {
    if (selectedMapIdx >= 0) return selectedMapIdx;
    const maps = state.maps || [];
    const currentIdx = maps.findIndex(m => m.status === 'current');
    if (currentIdx >= 0) return currentIdx;
    if (maps.length > 0 && maps[maps.length - 1].status === 'completed') return maps.length;
    return Math.max(0, maps.length - 1);
  };

  const toggleBan = (heroKey) => {
    const bans = { ...state.heroBans };
    const teamBans = [...(bans[banTeam] || [])];
    const idx = teamBans.indexOf(heroKey);
    if (idx >= 0) {
      teamBans.splice(idx, 1);
    } else {
      const otherTeam = banTeam === 'team1' ? 'team2' : 'team1';
      if ((bans[otherTeam] || []).includes(heroKey)) return;
      teamBans.push(heroKey);
    }
    bans[banTeam] = teamBans;

    // In FACEIT mode a manual ban edit is a correction of FACEIT's data —
    // lock it so the next auto-sync tick doesn't overwrite it on-air.
    // (Visible in the overrides banner; release it to hand control back.)
    if (state.mode === 'faceit' && state.faceitMatchId) setOverride('heroBans');

    // Also sync to perMapBans for the current/selected map so overlays can display them
    const allHeroes = [...(heroes.tank || []), ...(heroes.damage || []), ...(heroes.support || [])];
    const toHeroObj = (key) => {
      const h = allHeroes.find(x => x.key === key);
      return h ? { name: h.name, role: h.role, image: h.portrait } : { name: key, role: '', image: '' };
    };
    const mapIdx = getActiveBanMapIdx();
    const perMapBans = [...(state.perMapBans || [])];
    while (perMapBans.length <= mapIdx) perMapBans.push({});
    perMapBans[mapIdx] = {
      ...perMapBans[mapIdx],
      team1Ban: bans.team1?.[0] ? toHeroObj(bans.team1[0]) : null,
      team2Ban: bans.team2?.[0] ? toHeroObj(bans.team2[0]) : null,
      ban1: bans.team1?.[0] ? toHeroObj(bans.team1[0]) : null,
      ban2: bans.team2?.[0] ? toHeroObj(bans.team2[0]) : null,
    };

    updateState({ heroBans: bans, perMapBans });
  };

  // Clear all bans for both teams in one click (looks cleaner on stream)
  const clearAllBans = () => {
    if (state.mode === 'faceit' && state.faceitMatchId) setOverride('heroBans');
    const mapIdx = getActiveBanMapIdx();
    const perMapBans = [...(state.perMapBans || [])];
    if (perMapBans[mapIdx]) {
      perMapBans[mapIdx] = { ...perMapBans[mapIdx], team1Ban: null, team2Ban: null, ban1: null, ban2: null };
    }
    updateState({ heroBans: { team1: [], team2: [] }, perMapBans });
  };

  const uploadLogo = async (team, file) => {
    const res = await fetch(`${api}/api/upload-logo`, {
      method: 'POST',
      headers: { 'X-Filename': file.name },
      body: await file.arrayBuffer(),
    });
    const data = await res.json();
    if (data.success) {
      overrideField(`teams.${team}.logo`,
        { teams: { ...state.teams, [team]: { ...state.teams[team], logo: data.url } } });
    }
  };

  const allBans = [...(state.heroBans?.team1 || []), ...(state.heroBans?.team2 || [])];

  // Aggregate stats for the latest round
  const latestStats = state.playerStats?.length > 0 ? state.playerStats[state.playerStats.length - 1] : null;

  return (
    <div className="fade-in">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2>Match Hub</h2>
          <p>Everything about the current live match — teams, maps, bans, and stats</p>
        </div>
        <div className="mode-toggle">
          <button className={state.mode === 'faceit' ? 'active' : ''} onClick={() => toggleMode('faceit')}>FACEIT</button>
          <button className={state.mode === 'manual' ? 'active' : ''} onClick={() => toggleMode('manual')}>Manual</button>
          <button className={state.mode === 'scrim' ? 'active' : ''} onClick={() => toggleMode('scrim')}>Scrim</button>
        </div>
      </div>

      {/* Quick Action Bar */}
      <div className="quick-action-bar">
        <button className={`swap-btn ${state.swapSides ? 'swapped' : ''}`} onClick={swapSides}>
          ⇄ {state.swapSides ? 'Sides Swapped' : 'Swap Sides'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => resetMatch(true)}>🔄 Reset Scores</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowNewMatchConfirm(true)}>🗑️ New Match</button>
        {state.swapSides && <span className="badge badge-warning">Sides are swapped</span>}
      </div>

      {/* Scrim Mode — Minimal UI */}
      {state.mode === 'scrim' && (
        <div className="card">
          <div className="card-title">🎮 Quick Scrim</div>
          <div style={{ marginTop: 12 }}>
            <div style={{ marginBottom: 12 }}>
              <label className="input-label">Event Name</label>
              <input className="input" value={state.eventName || ''} placeholder="e.g. Scrim Night"
                onChange={e => updateState({ eventName: e.target.value })} />
            </div>
            <div className="grid-2">
              <div>
                <label className="input-label" style={{ color: 'var(--team1)' }}>Team 1</label>
                <input className="input" value={state.teams.team1.name}
                  onChange={e => updateState({ teams: { ...state.teams, team1: { ...state.teams.team1, name: e.target.value } } })} />
                <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
                  <button className="btn btn-sm" style={{ background: 'var(--team1)', color: 'white', fontSize: '1.2rem', width: 48, height: 48, borderRadius: 12 }}
                    onClick={() => updateState({ teams: { ...state.teams, team1: { ...state.teams.team1, score: state.teams.team1.score + 1 } } })}>+</button>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: '3rem', lineHeight: 1, minWidth: 40, textAlign: 'center' }}>{state.teams.team1.score}</div>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '1.2rem', width: 48, height: 48, borderRadius: 12 }}
                    onClick={() => updateState({ teams: { ...state.teams, team1: { ...state.teams.team1, score: Math.max(0, state.teams.team1.score - 1) } } })}>−</button>
                </div>
              </div>
              <div>
                <label className="input-label" style={{ color: 'var(--team2)' }}>Team 2</label>
                <input className="input" value={state.teams.team2.name}
                  onChange={e => updateState({ teams: { ...state.teams, team2: { ...state.teams.team2, name: e.target.value } } })} />
                <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'center' }}>
                  <button className="btn btn-sm" style={{ background: 'var(--team2)', color: 'white', fontSize: '1.2rem', width: 48, height: 48, borderRadius: 12 }}
                    onClick={() => updateState({ teams: { ...state.teams, team2: { ...state.teams.team2, score: state.teams.team2.score + 1 } } })}>+</button>
                  <div style={{ fontFamily: 'Bebas Neue', fontSize: '3rem', lineHeight: 1, minWidth: 40, textAlign: 'center' }}>{state.teams.team2.score}</div>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: '1.2rem', width: 48, height: 48, borderRadius: 12 }}
                    onClick={() => updateState({ teams: { ...state.teams, team2: { ...state.teams.team2, score: Math.max(0, state.teams.team2.score - 1) } } })}>−</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FACEIT Loader */}
      {state.mode === 'faceit' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Load FACEIT Match</span>
            {state.faceitMatchId && (
              <button
                className={`btn btn-sm ${state.faceitAutoSync ? '' : 'btn-ghost'}`}
                onClick={() => {
                  fetch(`${api}/api/faceit/auto-sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ enabled: !state.faceitAutoSync }),
                  });
                }}
                style={state.faceitAutoSync ? {
                  background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
                  color: '#22c55e', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6,
                } : { fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                  background: state.faceitAutoSync ? '#22c55e' : 'rgba(255,255,255,0.2)',
                  boxShadow: state.faceitAutoSync ? '0 0 6px rgba(34,197,94,0.6)' : 'none',
                  animation: state.faceitAutoSync ? 'pulse 2s infinite' : 'none',
                }} />
                {state.faceitAutoSync ? 'Auto Sync ON' : 'Auto Sync'}
              </button>
            )}
          </div>
          <div className="input-group" style={{ marginTop: 12 }}>
            <input
              className="input"
              placeholder="Paste FACEIT room URL or match ID..."
              value={matchUrl}
              onChange={e => setMatchUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadMatch()}
            />
            <button className="btn btn-primary" onClick={loadMatch} disabled={loading}>
              {loading ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Loading...</> : '🔍 Load'}
            </button>
          </div>
          {error && <p style={{ color: 'var(--danger)', fontSize: '0.8rem', marginTop: 4 }}>{error}</p>}
          {state.faceitAutoSync && (
            <p style={{ color: state.faceitLastSyncError && (!state.faceitLastSync || state.faceitLastSyncError > state.faceitLastSync) ? '#ef4444' : '#22c55e', fontSize: '0.7rem', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              ↻ Live syncing every 15s
              {state.faceitLastSync && <span style={{ color: 'var(--text-muted)' }}>— last sync {Math.floor((Date.now() - state.faceitLastSync) / 1000) < 5 ? 'just now' : `${Math.floor((Date.now() - state.faceitLastSync) / 1000)}s ago`}</span>}
              {state.faceitLastSyncError && (!state.faceitLastSync || state.faceitLastSyncError > state.faceitLastSync) && <span style={{ color: '#ef4444' }}>— sync error, retrying...</span>}
            </p>
          )}
        </div>
      )}

      {/* Override Banner */}
      {state.mode === 'faceit' && hasOverrides && (
        <div className="card" style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.25)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'var(--warning)', fontWeight: 700, fontSize: '0.8rem' }}>🔒 Manual Overrides Active</span>
            <button className="btn btn-ghost btn-sm" onClick={releaseAllOverrides}
              style={{ color: 'var(--warning)', fontSize: '0.7rem' }}>
              🔓 Relinquish All
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {Object.keys(overrides).map(key => {
              const label = {
                'teams.team1.name': 'Team 1 Name',
                'teams.team2.name': 'Team 2 Name',
                'teams.team1.score': 'Team 1 Score',
                'teams.team2.score': 'Team 2 Score',
                'teams.team1.logo': 'Team 1 Logo',
                'teams.team2.logo': 'Team 2 Logo',
                'maps': 'Maps',
                'bestOf': 'Best Of',
                'players': 'Players',
                'heroBans': 'Hero Bans',
              }[key] || key.split('.').pop();
              return (
                <button key={key} className="btn btn-sm"
                  onClick={() => releasOverride(key)}
                  title={`Click to release "${label}" back to FACEIT control`}
                  style={{
                    background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)',
                    color: 'var(--warning)', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                  {label} <span style={{ opacity: 0.6 }}>✕</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Team Setup — always shown */}
      {state.mode !== 'scrim' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Team Setup</span>
            {state.mode === 'faceit' && <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>Edit to override FACEIT data</span>}
          </div>
          <div style={{ marginTop: 12 }}>
            <label className="input-label">Event Name</label>
            <input className="input" value={state.eventName || ''} placeholder="e.g. FACEIT Season 8"
              onChange={e => updateState({ eventName: e.target.value })} />
          </div>
          <div className="grid-2" style={{ marginTop: 12 }}>
            <div>
              <label className="input-label">
                Team 1 Name
                {overrides['teams.team1.name'] && (
                  <span onClick={() => releasOverride('teams.team1.name')} style={{ cursor: 'pointer', marginLeft: 6, fontSize: '0.7rem', color: 'var(--warning)' }} title="Click to release override">🔒</span>
                )}
              </label>
              <input className="input" value={state.teams.team1.name}
                onChange={e => overrideField('teams.team1.name',
                  { teams: { ...state.teams, team1: { ...state.teams.team1, name: e.target.value } } })} />
            </div>
            <div>
              <label className="input-label">
                Team 2 Name
                {overrides['teams.team2.name'] && (
                  <span onClick={() => releasOverride('teams.team2.name')} style={{ cursor: 'pointer', marginLeft: 6, fontSize: '0.7rem', color: 'var(--warning)' }} title="Click to release override">🔒</span>
                )}
              </label>
              <input className="input" value={state.teams.team2.name}
                onChange={e => overrideField('teams.team2.name',
                  { teams: { ...state.teams, team2: { ...state.teams.team2, name: e.target.value } } })} />
            </div>
            <div>
              <label className="input-label">
                Team 1 Score
                {overrides['teams.team1.score'] && (
                  <span onClick={() => releasOverride('teams.team1.score')} style={{ cursor: 'pointer', marginLeft: 6, fontSize: '0.7rem', color: 'var(--warning)' }} title="Click to release override">🔒</span>
                )}
              </label>
              <input className="input" type="number" min={0} value={state.teams.team1.score}
                onChange={e => overrideField('teams.team1.score',
                  { teams: { ...state.teams, team1: { ...state.teams.team1, score: Number(e.target.value) } } })} />
            </div>
            <div>
              <label className="input-label">
                Team 2 Score
                {overrides['teams.team2.score'] && (
                  <span onClick={() => releasOverride('teams.team2.score')} style={{ cursor: 'pointer', marginLeft: 6, fontSize: '0.7rem', color: 'var(--warning)' }} title="Click to release override">🔒</span>
                )}
              </label>
              <input className="input" type="number" min={0} value={state.teams.team2.score}
                onChange={e => overrideField('teams.team2.score',
                  { teams: { ...state.teams, team2: { ...state.teams.team2, score: Number(e.target.value) } } })} />
            </div>
            {['team1', 'team2'].map(team => (
              <div key={team}>
                <label className="input-label">
                  {team === 'team1' ? 'Team 1' : 'Team 2'} Logo
                  {overrides[`teams.${team}.logo`] && (
                    <span onClick={() => releasOverride(`teams.${team}.logo`)} style={{ cursor: 'pointer', marginLeft: 6, fontSize: '0.7rem', color: 'var(--warning)' }} title="Click to release override">🔒</span>
                  )}
                </label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {state.teams[team].logo && (
                    <img src={previewUrl(state.teams[team].logo)} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  <input className="input" style={{ flex: 1 }} placeholder="Logo URL or upload →"
                    value={state.teams[team].logo || ''}
                    onChange={e => overrideField(`teams.${team}.logo`,
                      { teams: { ...state.teams, [team]: { ...state.teams[team], logo: e.target.value } } })} />
                  <button className="btn btn-ghost btn-sm" style={{ whiteSpace: 'nowrap' }}
                    onClick={() => { setLogoUploadTarget(team); logoInputRef.current?.click(); }}>📁 Upload</button>
                </div>
              </div>
            ))}
          </div>
          <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files[0];
              if (file) uploadLogo(logoUploadTarget, file);
              e.target.value = '';
            }} />
        </div>
      )}

      {/* Team Header */}
      {state.mode !== 'scrim' && (
        <div className="team-header">
          <div className="team-card team1">
            {state.teams.team1.logo && <img className="team-logo" src={previewUrl(state.teams.team1.logo)} alt="" />}
            <div className="team-name">{state.teams.team1.name}</div>
          </div>
          <div className="vs-divider">
            <div className="score">{state.teams.team1.score} – {state.teams.team2.score}</div>
            <div className="vs">BO{state.mode === 'scrim' ? (state.maps?.length || 0) : state.bestOf}</div>
          </div>
          <div className="team-card team2">
            {state.teams.team2.logo && <img className="team-logo" src={previewUrl(state.teams.team2.logo)} alt="" />}
            <div className="team-name">{state.teams.team2.name}</div>
          </div>
        </div>
      )}

      {/* Map Tracker */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🗺️ Map Series</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {selectedMapIdx >= 0 && (
              <button className="btn btn-sm" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', fontSize: '0.7rem' }}
                onClick={() => {
                  setSelectedMapIdx(-1);
                  // Also point the displayed bans back at the live map
                  const hb = heroBansForMap(autoActiveIdx());
                  updateState({ selectedMapIdx: -1, ...(hb ? { heroBans: hb } : {}) });
                }}>📍 Go to Live Map</button>
            )}
            {state.mode !== 'scrim' && (<>
              {overrides['bestOf'] && (
                <span onClick={() => releasOverride('bestOf')} style={{ cursor: 'pointer', fontSize: '0.7rem', color: 'var(--warning)', alignSelf: 'center' }} title="Release override">🔒</span>
              )}
              <select className="input" style={{ width: 80 }} value={state.bestOf}
                onChange={e => { updateState({ bestOf: Number(e.target.value) }); setOverride('bestOf'); }}>
                <option value={1}>BO1</option>
                <option value={3}>BO3</option>
                <option value={5}>BO5</option>
                <option value={7}>BO7</option>
              </select>
            </>)}
            {overrides['maps'] && (
              <span onClick={() => releasOverride('maps')} style={{ cursor: 'pointer', fontSize: '0.7rem', color: 'var(--warning)', alignSelf: 'center' }} title="Release map override">🔒 Maps</span>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setShowMapPicker(!showMapPicker)}>+ Add Map</button>
          </div>
        </div>

        {state.maps?.length > 0 && (
          <div className="map-series">
            {state.maps.map((m, i) => {
              const isSelected = selectedMapIdx === i || (selectedMapIdx === -1 && (
                m.status === 'current' || (i === state.maps.length - 1 && state.maps.every(mm => mm.status === 'completed'))
              ));
              const isTiebreaker = state.mode !== 'scrim' && i >= state.bestOf;
              return (
                <div key={i}
                  className={`map-slot ${m.status} ${m.winner ? `${m.winner}-win` : ''}`}
                  onClick={() => {
                    setSelectedMapIdx(i);
                    // Show this map's bans (cleared if it has none yet)
                    const hb = heroBansForMap(i);
                    updateState({ selectedMapIdx: i, ...(hb ? { heroBans: hb } : {}) });
                  }}
                  style={{
                    cursor: 'pointer',
                    outline: isSelected ? '3px solid #22c55e' : 'none',
                    outlineOffset: -2,
                    boxShadow: isSelected ? '0 0 12px rgba(34,197,94,0.3), inset 0 0 12px rgba(34,197,94,0.1)' : 'none',
                    transition: 'outline 0.2s, box-shadow 0.2s',
                    ...(isTiebreaker ? { border: '2px dashed #b8860b' } : {}),
                  }}
                >
                  {m.image && <img className="map-image" src={m.image} alt={m.name} />}
                  <div className="map-name">{m.name}</div>
                  <div className="map-mode">{m.mode}</div>
                  {isTiebreaker && (
                    <div style={{
                      fontSize: '0.55rem', fontWeight: 700, letterSpacing: '1px',
                      color: '#b8860b', textTransform: 'uppercase', marginTop: 2,
                    }}>TIEBREAKER</div>
                  )}
                  {/* Map picker indicator */}
                  {(() => {
                    const mapBans = state.perMapBans?.[i];
                    const picker = mapBans?.picker || m.picker;
                    if (picker) {
                      const pickerName = picker === 'team1' ? state.teams.team1.name : state.teams.team2.name;
                      const pickerColor = picker === 'team1' ? (state.teams.team1.color || 'var(--team1)') : (state.teams.team2.color || 'var(--team2)');
                      return (
                        <div style={{
                          fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.5px',
                          color: pickerColor, textTransform: 'uppercase', marginTop: 4,
                          display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center',
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: pickerColor, display: 'inline-block' }} />
                          {pickerName} Pick
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {m.status === 'completed' && m.winner && (
                    <div className={`map-result ${m.winner === 'team1' ? 'win' : 'loss'}`}>
                      {m.winner === 'team1' ? state.teams.team1.name : state.teams.team2.name}
                    </div>
                  )}
                  {m.roundScore && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>{m.roundScore}</div>}
                  {/* Per-map ban indicators */}
                  {(() => {
                    const mapBans = state.perMapBans?.[i];
                    if (!mapBans?.team1Ban && !mapBans?.team2Ban) return null;
                    const allHeroes = [...(heroes.tank || []), ...(heroes.damage || []), ...(heroes.support || [])];
                    const getPortrait = (ban) => {
                      if (!ban?.name) return null;
                      return findHeroByName(allHeroes, ban.name)?.portrait || ban.image || null;
                    };
                    const t1Color = state.teams.team1.color || '#3b82f6';
                    const t2Color = state.teams.team2.color || '#ef4444';
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 6 }}>
                        {mapBans.team1Ban && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ fontSize: '0.5rem', color: t1Color, fontWeight: 700 }}>BAN</span>
                            {getPortrait(mapBans.team1Ban) && (
                              <img src={getPortrait(mapBans.team1Ban)} alt={mapBans.team1Ban.name}
                                style={{ width: 22, height: 22, borderRadius: 4, border: `2px solid ${t1Color}` }} />
                            )}
                          </div>
                        )}
                        {mapBans.team2Ban && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            {getPortrait(mapBans.team2Ban) && (
                              <img src={getPortrait(mapBans.team2Ban)} alt={mapBans.team2Ban.name}
                                style={{ width: 22, height: 22, borderRadius: 4, border: `2px solid ${t2Color}` }} />
                            )}
                            <span style={{ fontSize: '0.5rem', color: t2Color, fontWeight: 700 }}>BAN</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  {/* Controls for manual map management */}
                  <div style={{ marginTop: 8, display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {m.status === 'upcoming' && (
                      <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setMapStatus(i, 'current'); }}>▶ Play</button>
                    )}
                    {m.status === 'current' && (
                      <>
                        <button className="btn btn-sm" style={{ background: 'var(--team1)', color: 'white', fontSize: '0.65rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const updatedMaps = state.maps.map((mm, ii) => ii === i ? { ...mm, status: 'completed', winner: 'team1' } : mm);
                            updateState({ maps: updatedMaps, teams: { ...state.teams, team1: { ...state.teams.team1, score: state.teams.team1.score + 1 } } });
                          }}>{state.teams.team1.name} Win</button>
                        <button className="btn btn-sm" style={{ background: 'var(--team2)', color: 'white', fontSize: '0.65rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const updatedMaps = state.maps.map((mm, ii) => ii === i ? { ...mm, status: 'completed', winner: 'team2' } : mm);
                            updateState({ maps: updatedMaps, teams: { ...state.teams, team2: { ...state.teams.team2, score: state.teams.team2.score + 1 } } });
                          }}>{state.teams.team2.name} Win</button>
                      </>
                    )}
                    {m.status === 'completed' && m.winner && (
                      <>
                        <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)', fontSize: '0.6rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const oldWinner = m.winner;
                            const newWinner = oldWinner === 'team1' ? 'team2' : 'team1';
                            const updatedMaps = state.maps.map((mm, ii) => ii === i ? { ...mm, winner: newWinner } : mm);
                            updateState({
                              maps: updatedMaps,
                              teams: {
                                ...state.teams,
                                team1: { ...state.teams.team1, score: state.teams.team1.score + (newWinner === 'team1' ? 1 : -1) },
                                team2: { ...state.teams.team2, score: state.teams.team2.score + (newWinner === 'team2' ? 1 : -1) },
                              }
                            });
                          }}>⇄ Swap</button>
                        <button className="btn btn-sm" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--text-secondary)', fontSize: '0.6rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            const oldWinner = m.winner;
                            const updatedMaps = state.maps.map((mm, ii) => ii === i ? { ...mm, status: 'current', winner: null } : mm);
                            updateState({
                              maps: updatedMaps,
                              teams: {
                                ...state.teams,
                                [oldWinner]: { ...state.teams[oldWinner], score: Math.max(0, state.teams[oldWinner].score - 1) },
                              }
                            });
                          }}>↩ Undo</button>
                      </>
                    )}
                    {/* Swap hero bans between teams for this map */}
                    {state.perMapBans?.[i]?.team1Ban && state.perMapBans?.[i]?.team2Ban && (
                      <button className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.6rem', ...(state.banSwaps?.[i] ? { background: 'rgba(249,115,22,0.15)', color: 'var(--warning)', border: '1px solid rgba(249,115,22,0.3)' } : {}) }}
                        title={state.banSwaps?.[i] ? 'Ban sides swapped from FACEIT data — click to restore' : 'Swap hero ban assignments between teams'}
                        onClick={(e) => {
                          e.stopPropagation();
                          const perMapBans = [...(state.perMapBans || [])];
                          const old = perMapBans[i];
                          perMapBans[i] = { ...old, team1Ban: old.team2Ban, team2Ban: old.team1Ban };
                          // Persist the correction so FACEIT auto-sync re-applies
                          // it on every tick instead of flipping it back
                          const banSwaps = [...(state.banSwaps || [])];
                          while (banSwaps.length <= i) banSwaps.push(false);
                          banSwaps[i] = !banSwaps[i];
                          const updates = { perMapBans, banSwaps };
                          if (getDisplayMapIdx() === i) {
                            updates.heroBans = heroBansForMap(i, perMapBans);
                          }
                          updateState(updates);
                        }}>⇄ Bans</button>
                    )}
                    {/* Map picker toggle — always available */}
                    <select className="input" style={{ width: 80, fontSize: '0.6rem', padding: '2px 4px', height: 'auto' }}
                      value={state.perMapBans?.[i]?.picker || m.picker || ''}
                      onClick={e => e.stopPropagation()}
                      onChange={e => {
                        e.stopPropagation();
                        const picker = e.target.value || null;
                        const perMapBans = [...(state.perMapBans || [])];
                        while (perMapBans.length <= i) perMapBans.push({});
                        perMapBans[i] = { ...perMapBans[i], picker };
                        const updates = { perMapBans };
                        // In FACEIT mode the picker decides which chronological
                        // ban (ban1/ban2) belongs to which team — re-derive the
                        // sides now (instead of waiting for the next sync tick)
                        // and drop any ⇄ swap, which was relative to the old sides
                        if (state.mode === 'faceit' && (perMapBans[i].ban1 || perMapBans[i].ban2)) {
                          const banPicker = picker || 'team1';
                          perMapBans[i] = {
                            ...perMapBans[i],
                            team1Ban: banPicker === 'team1' ? perMapBans[i].ban1 : perMapBans[i].ban2,
                            team2Ban: banPicker === 'team2' ? perMapBans[i].ban1 : perMapBans[i].ban2,
                          };
                          const banSwaps = [...(state.banSwaps || [])];
                          if (banSwaps[i]) { banSwaps[i] = false; updates.banSwaps = banSwaps; }
                          if (getDisplayMapIdx() === i) {
                            const hb = heroBansForMap(i, perMapBans);
                            if (hb) updates.heroBans = hb;
                          }
                        }
                        updates.maps = state.maps.map((mm, ii) => ii === i ? { ...mm, picker } : mm);
                        // Persist the choice so FACEIT auto-sync doesn't revert
                        // it to the seeding heuristic ('none' = explicit no-pick)
                        const mapPickers = [...(state.mapPickers || [])];
                        while (mapPickers.length <= i) mapPickers.push(null);
                        mapPickers[i] = e.target.value || 'none';
                        updates.mapPickers = mapPickers;
                        updateState(updates);
                      }}>
                      <option value="">No pick</option>
                      <option value="team1">{state.teams.team1.name} pick</option>
                      <option value="team2">{state.teams.team2.name} pick</option>
                    </select>
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.6rem' }} onClick={(e) => { e.stopPropagation(); removeMap(i); }}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showMapPicker && (
          <div style={{ marginTop: 16, padding: 16, background: 'var(--bg-input)', borderRadius: 8 }}>
            <div className="card-title" style={{ marginBottom: 12 }}>Select Map</div>
            {['Control', 'Escort', 'Hybrid', 'Push', 'Flashpoint'].map(mode => (
              <div key={mode} style={{ marginBottom: 12 }}>
                <div className="role-label">{mode}</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {OW2_MAPS.filter(m => m.mode === mode).map(m => (
                    <button key={m.name} className="btn btn-ghost btn-sm" onClick={() => addMap(m)}>{m.name}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hero Bans */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🚫 Hero Bans{(() => {
            const idx = getActiveBanMapIdx();
            const mapName = state.maps?.[idx]?.name;
            if (mapName) return ` — ${mapName} (Map ${idx + 1})`;
            if (idx >= (state.maps?.length || 0) && (state.maps?.length || 0) > 0) return ` — Next Map (Map ${idx + 1})`;
            return '';
          })()}</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {allBans.length > 0 && (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: '0.7rem' }} onClick={clearAllBans}>
                🧹 Clear Bans
              </button>
            )}
            <div className="mode-toggle">
              <button className={banTeam === 'team1' ? 'active' : ''} onClick={() => setBanTeam('team1')}>
                {state.teams.team1.name}
              </button>
              <button className={banTeam === 'team2' ? 'active' : ''} onClick={() => setBanTeam('team2')}>
                {state.teams.team2.name}
              </button>
            </div>
          </div>
        </div>

        {state.mode === 'faceit' && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 12px', marginBottom: 12,
            background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
            borderRadius: 6, fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.5,
          }}>
            <span style={{ fontSize: '0.85rem' }}>⚠️</span>
            <span>
              FACEIT's API doesn't report <em>which team</em> banned each hero, so ban sides are a best
              guess based on map picks and may be flipped. If a ban shows on the wrong team, click
              <strong> ⇄ Bans</strong> on that map above — the correction sticks through auto-sync.
            </span>
          </div>
        )}

        {/* Current bans display */}
        {allBans.length > 0 && (
          <div style={{ marginBottom: 16, display: 'flex', gap: 16 }}>
            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--team1)', fontWeight: 600 }}>{state.teams.team1.name} Bans:</span>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {(state.heroBans?.team1 || []).map(key => {
                  const hero = [...heroes.tank, ...heroes.damage, ...heroes.support].find(h => h.key === key);
                  return hero ? (
                    <div key={key} style={{ width: 40, height: 40 }}>
                      <img src={hero.portrait} alt={hero.name} style={{ width: '100%', borderRadius: 6, border: '2px solid var(--danger)' }} />
                    </div>
                  ) : null;
                })}
              </div>
            </div>
            <div>
              <span style={{ fontSize: '0.7rem', color: 'var(--team2)', fontWeight: 600 }}>{state.teams.team2.name} Bans:</span>
              <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                {(state.heroBans?.team2 || []).map(key => {
                  const hero = [...heroes.tank, ...heroes.damage, ...heroes.support].find(h => h.key === key);
                  return hero ? (
                    <div key={key} style={{ width: 40, height: 40 }}>
                      <img src={hero.portrait} alt={hero.name} style={{ width: '100%', borderRadius: 6, border: '2px solid var(--danger)' }} />
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          </div>
        )}

        {/* Hero grid by role */}
        {['tank', 'damage', 'support'].map(role => (
          <div key={role} className="role-section">
            <div className={`role-label ${role}`}>
              {role === 'tank' ? '🛡️' : role === 'damage' ? '⚔️' : '💚'} {role} ({heroes[role]?.length || 0})
            </div>
            <div className="hero-grid">
              {(heroes[role] || []).map(hero => (
                <div
                  key={hero.key}
                  className={`hero-icon ${allBans.includes(hero.key) ? 'banned' : ''}`}
                  onClick={() => toggleBan(hero.key)}
                  title={hero.name}
                >
                  <img src={hero.portrait} alt={hero.name} />
                  <div className="hero-name">{hero.name}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Player Stats */}
      {(() => {
        const statsIdx = selectedMapIdx >= 0 ? selectedMapIdx : (state.playerStats?.length || 1) - 1;
        const selectedStats = state.playerStats?.[statsIdx];
        return selectedStats && selectedStats.teams?.length >= 2 ? selectedStats : null;
      })() && (() => {
        const statsIdx = selectedMapIdx >= 0 ? selectedMapIdx : (state.playerStats?.length || 1) - 1;
        const latestStats = state.playerStats[statsIdx];
        // Sort players by role: Tank → Damage → Support so they line up across teams
        const roleOrder = { 'Tank': 0, 'Damage': 1, 'Support': 2 };
        const sortedTeams = latestStats.teams.map(team => ({
          ...team,
          players: [...team.players].sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9)),
        }));

        return (
          <div className="card">
            <div className="card-header">
              <span className="card-title">📊 Player Stats — Map {latestStats.matchRound}</span>
              <span className="badge badge-accent">{latestStats.mapMode}</span>
            </div>

            <div className="stats-grid">
              {sortedTeams.map((team, ti) => (
                <div key={ti}>
                  <h4 style={{ marginBottom: 12, color: ti === 0 ? 'var(--team1)' : 'var(--team2)' }}>
                    {team.name} {team.stats.teamWin && <span className="badge badge-success">W</span>}
                  </h4>
                  {team.players.map((p, pi) => {
                    // Add a role header when the role changes
                    const prevRole = pi > 0 ? team.players[pi - 1].role : null;
                    const showRoleHeader = p.role !== prevRole;
                    return (
                      <div key={p.playerId}>
                        {showRoleHeader && (
                          <div style={{
                            fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1,
                            padding: '6px 0 4px', marginTop: pi > 0 ? 8 : 0, borderBottom: '1px solid var(--border)',
                            color: p.role === 'Tank' ? 'var(--warning)' : p.role === 'Damage' ? 'var(--danger)' : 'var(--success)',
                          }}>
                            {p.role === 'Tank' ? '🛡️' : p.role === 'Damage' ? '⚔️' : '💚'} {p.role}
                          </div>
                        )}
                        <div className="stat-card" style={{ marginBottom: 8 }}>
                          <div className="player-name">{p.nickname}</div>
                          <div className="player-role" style={{
                            color: p.role === 'Tank' ? 'var(--warning)' : p.role === 'Damage' ? 'var(--danger)' : 'var(--success)'
                          }}>{p.role}</div>
                          <div className="stat-row"><span className="label">K/D</span><span className="value">{p.kdRatio.toFixed(2)}</span></div>
                          <div className="stat-row"><span className="label">Elims</span><span className="value">{p.kills}</span></div>
                          <div className="stat-row"><span className="label">Deaths</span><span className="value">{p.deaths}</span></div>
                          <div className="stat-row"><span className="label">Final Blows</span><span className="value">{p.finalBlows}</span></div>
                          <div className="stat-row"><span className="label">Damage</span><span className="value">{p.damageDealt.toLocaleString()}</span></div>
                          <div className="stat-row"><span className="label">Healing</span><span className="value">{p.healingDone.toLocaleString()}</span></div>
                          <div className="stat-row"><span className="label">Obj Time</span><span className="value">{p.objectiveTime}s</span></div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Team aggregate */}
                  <div className="team-aggregate" style={{ borderColor: ti === 0 ? 'var(--team1)' : 'var(--team2)' }}>
                    <div style={{ fontWeight: 700, marginBottom: 6, fontSize: '0.8rem' }}>Team Totals</div>
                    <div className="stat-row"><span className="label">Eliminations</span><span className="value">{team.stats.totalEliminations}</span></div>
                    <div className="stat-row"><span className="label">Deaths</span><span className="value">{team.stats.totalDeaths}</span></div>
                    <div className="stat-row"><span className="label">Final Blows</span><span className="value">{team.stats.totalFinalBlows}</span></div>
                    <div className="stat-row"><span className="label">Obj Time</span><span className="value">{team.stats.totalObjectiveTime}s</span></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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

      <ConfirmModal
        open={showNewMatchConfirm}
        message="Reset everything including team names?"
        confirmLabel="New Match"
        onConfirm={() => { resetMatch(false); setShowNewMatchConfirm(false); }}
        onCancel={() => setShowNewMatchConfirm(false)}
      />
    </div>
  );
}
