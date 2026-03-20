import { useState, useEffect } from 'react'

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
  const [matchUrl, setMatchUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [heroes, setHeroes] = useState({ tank: [], damage: [], support: [] });
  const [banTeam, setBanTeam] = useState('team1');
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [selectedMapIdx, setSelectedMapIdx] = useState(-1); // -1 = auto (current/last)

  useEffect(() => {
    fetch(`${api}/api/heroes/grouped`).then(r => r.json()).then(setHeroes).catch(() => {});
  }, [api]);

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

  // Clear a single override
  const releasOverride = async (path) => {
    await fetch(`${api}/api/overrides/clear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
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
      });
    }
  };

  const addMap = (map) => {
    const maps = [...(state.maps || []), { ...map, image: '', status: 'upcoming', winner: null }];
    updateState({ maps });
    setOverride('maps');
    setShowMapPicker(false);
  };

  const removeMap = (idx) => {
    const maps = state.maps.filter((_, i) => i !== idx);
    updateState({ maps });
    setOverride('maps');
  };

  const setMapStatus = (idx, status, winner = null) => {
    const maps = state.maps.map((m, i) => i === idx ? { ...m, status, winner } : m);
    updateState({ maps });
  };

  const toggleBan = (heroKey) => {
    const bans = { ...state.heroBans };
    const teamBans = [...(bans[banTeam] || [])];
    const idx = teamBans.indexOf(heroKey);
    if (idx >= 0) {
      teamBans.splice(idx, 1);
    } else {
      teamBans.push(heroKey);
    }
    bans[banTeam] = teamBans;
    updateState({ heroBans: bans });
  };

  const allBans = [...(state.heroBans?.team1 || []), ...(state.heroBans?.team2 || [])];

  // Aggregate stats for the latest round
  const latestStats = state.playerStats?.length > 0 ? state.playerStats[state.playerStats.length - 1] : null;

  return (
    <div className="fade-in">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2>Match Hub</h2>
          <p>Load FACEIT matches or set up manually</p>
        </div>
        <div className="mode-toggle">
          <button className={state.mode === 'faceit' ? 'active' : ''} onClick={() => toggleMode('faceit')}>FACEIT</button>
          <button className={state.mode === 'manual' ? 'active' : ''} onClick={() => toggleMode('manual')}>Manual</button>
        </div>
      </div>

      {/* FACEIT Loader */}
      {state.mode === 'faceit' && (
        <div className="card">
          <div className="card-title">Load FACEIT Match</div>
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

      {/* Team Setup — shown in both modes */}
      {(state.teams.team1.name !== 'Team 1' || state.mode === 'manual') && (
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
          </div>
        </div>
      )}

      {/* Team Header */}
      {(state.teams.team1.name !== 'Team 1' || state.mode === 'manual') && (
        <div className="team-header">
          <div className="team-card team1">
            {state.teams.team1.logo && <img className="team-logo" src={state.teams.team1.logo} alt="" />}
            <div className="team-name">{state.teams.team1.name}</div>
          </div>
          <div className="vs-divider">
            <div className="score">{state.teams.team1.score} – {state.teams.team2.score}</div>
            <div className="vs">BO{state.bestOf}</div>
          </div>
          <div className="team-card team2">
            {state.teams.team2.logo && <img className="team-logo" src={state.teams.team2.logo} alt="" />}
            <div className="team-name">{state.teams.team2.name}</div>
          </div>
        </div>
      )}

      {/* Map Tracker */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🗺️ Map Series</span>
          <div style={{ display: 'flex', gap: 8 }}>
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
              return (
                <div key={i}
                  className={`map-slot ${m.status} ${m.winner ? `${m.winner}-win` : ''}`}
                  onClick={() => {
                    setSelectedMapIdx(i);
                    // Update heroBans for this map from perMapBans
                    const mapBans = state.perMapBans?.[i];
                    if (mapBans) {
                      const faceitNameOverrides = { 'DVa': 'dva', 'Lucio': 'lucio', 'Soldier 76': 'soldier-76', 'Torbjorn': 'torbjorn' };
                      const toKey = (n) => n ? (faceitNameOverrides[n] || n.toLowerCase().replace(/\s+/g, '-').replace(/[.']/g, '')) : '';
                      updateState({
                        heroBans: {
                          team1: mapBans.team1Ban ? [toKey(mapBans.team1Ban.name)] : [],
                          team2: mapBans.team2Ban ? [toKey(mapBans.team2Ban.name)] : [],
                        }
                      });
                    }
                  }}
                  style={{ cursor: 'pointer', outline: isSelected ? '2px solid var(--accent)' : 'none', outlineOffset: -2 }}
                >
                  {m.image && <img className="map-image" src={m.image} alt={m.name} />}
                  <div className="map-name">{m.name}</div>
                  <div className="map-mode">{m.mode}</div>
                  {m.status === 'completed' && m.winner && (
                    <div className={`map-result ${m.winner === 'team1' ? 'win' : 'loss'}`}>
                      {m.winner === 'team1' ? state.teams.team1.name : state.teams.team2.name}
                    </div>
                  )}
                  {m.roundScore && <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>{m.roundScore}</div>}
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
                            setMapStatus(i, 'completed', 'team1');
                            updateState({ teams: { ...state.teams, team1: { ...state.teams.team1, score: state.teams.team1.score + 1 } } });
                          }}>T1 Win</button>
                        <button className="btn btn-sm" style={{ background: 'var(--team2)', color: 'white', fontSize: '0.65rem' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMapStatus(i, 'completed', 'team2');
                            updateState({ teams: { ...state.teams, team2: { ...state.teams.team2, score: state.teams.team2.score + 1 } } });
                          }}>T2 Win</button>
                      </>
                    )}
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
            const idx = selectedMapIdx >= 0 ? selectedMapIdx : (state.maps?.findIndex(m => m.status === 'current') >= 0 ? state.maps.findIndex(m => m.status === 'current') : (state.maps?.length || 1) - 1);
            const mapName = state.maps?.[idx]?.name;
            return mapName ? ` — ${mapName} (Map ${idx + 1})` : '';
          })()}</span>
          <div className="mode-toggle">
            <button className={banTeam === 'team1' ? 'active' : ''} onClick={() => setBanTeam('team1')}>
              {state.teams.team1.name}
            </button>
            <button className={banTeam === 'team2' ? 'active' : ''} onClick={() => setBanTeam('team2')}>
              {state.teams.team2.name}
            </button>
          </div>
        </div>

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
    </div>
  );
}
