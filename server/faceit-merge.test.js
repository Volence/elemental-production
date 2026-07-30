import { describe, it, expect } from 'vitest';
import { buildTeamsUpdate, buildMapsUpdate, getActiveBanIdx, computeHeroBans, computeActiveBan, heroNameToKey, deriveActiveBanState } from './faceit-merge.js';

const faction1 = { id: 'f1', name: 'Alpha', avatar: 'a.png', roster: [] };
const faction2 = { id: 'f2', name: 'Beta', avatar: 'b.png', roster: [] };
const notOverridden = () => false;

describe('buildTeamsUpdate', () => {
  it('preserves existing team colors instead of hardcoding blue/red', () => {
    const currentTeams = { team1: { color: '#22c55e' }, team2: { color: '#a855f7' } };
    const u = buildTeamsUpdate({ currentTeams, faction1, faction2, score1: 1, score2: 0, isOverridden: notOverridden });
    expect(u.team1.color).toBe('#22c55e');
    expect(u.team2.color).toBe('#a855f7');
  });

  it('falls back to defaults when no color exists yet', () => {
    const u = buildTeamsUpdate({ currentTeams: {}, faction1, faction2, score1: 0, score2: 0, isOverridden: notOverridden });
    expect(u.team1.color).toBe('#3b82f6');
    expect(u.team2.color).toBe('#ef4444');
  });

  it('respects score overrides (omits score so setState merge keeps the manual value)', () => {
    const isOverridden = (p) => p === 'teams.team1.score';
    const u = buildTeamsUpdate({ currentTeams: {}, faction1, faction2, score1: 2, score2: 1, isOverridden });
    expect(u.team1.score).toBeUndefined();
    expect(u.team2.score).toBe(1);
  });

  it('respects name/logo overrides', () => {
    const isOverridden = (p) => p === 'teams.team2.name' || p === 'teams.team2.logo';
    const u = buildTeamsUpdate({ currentTeams: {}, faction1, faction2, score1: 0, score2: 0, isOverridden });
    expect(u.team1.name).toBe('Alpha');
    expect(u.team2.name).toBeUndefined();
    expect(u.team2.logo).toBeUndefined();
  });

  it('passes the given avatar value through untouched (proxying is the caller\'s job)', () => {
    const proxied1 = { ...faction1, avatar: 'http://localhost:5174/api/proxy-image?url=a.png' };
    const proxied2 = { ...faction2, avatar: 'http://localhost:5174/api/proxy-image?url=b.png' };
    const u = buildTeamsUpdate({ currentTeams: {}, faction1: proxied1, faction2: proxied2, score1: 0, score2: 0, isOverridden: notOverridden });
    expect(u.team1.logo).toBe(proxied1.avatar);
    expect(u.team2.logo).toBe(proxied2.avatar);
  });
});

describe('buildMapsUpdate', () => {
  const faceitMaps = [
    { name: 'Oasis', mode: 'Control', image: 'oasis-sm.jpg', status: 'completed', winner: 'team1', roundScore: '2-0' },
    { name: 'Dorado', mode: 'Escort', image: 'dorado-sm.jpg', status: 'current', winner: null, roundScore: null },
  ];
  const perMapBans = [{ picker: 'team1' }, { picker: 'team2' }];

  it('passes faceit maps through (with picker) when maps are not overridden', () => {
    const u = buildMapsUpdate({ currentMaps: [], faceitMaps, perMapBans, mapsOverridden: false });
    expect(u).toHaveLength(2);
    expect(u[0].picker).toBe('team1');
    expect(u[1].name).toBe('Dorado');
  });

  it('keeps producer map list when overridden, but still advances status/winner/roundScore', () => {
    const currentMaps = [
      { name: 'Oasis', mode: 'Control', image: 'local-oasis.png', status: 'current', winner: null, roundScore: null, picker: 'team1' },
      { name: 'Dorado', mode: 'Escort', image: 'local-dorado.png', status: 'upcoming', winner: null, roundScore: null },
      { name: 'Nepal', mode: 'Control', image: 'local-nepal.png', status: 'upcoming', winner: null, roundScore: null },
    ];
    const u = buildMapsUpdate({ currentMaps, faceitMaps, perMapBans, mapsOverridden: true });
    expect(u).toHaveLength(3);
    expect(u[0].image).toBe('local-oasis.png');
    expect(u[0].status).toBe('completed');
    expect(u[0].winner).toBe('team1');
    expect(u[0].roundScore).toBe('2-0');
    expect(u[2].name).toBe('Nepal');
  });
});

describe('getActiveBanIdx', () => {
  const bans = (t1, t2) => ({ team1Ban: t1 ? { name: t1 } : null, team2Ban: t2 ? { name: t2 } : null });

  it('honors an explicit producer-selected map', () => {
    const maps = [{ status: 'completed' }, { status: 'current' }, { status: 'upcoming' }];
    expect(getActiveBanIdx(maps, 0)).toBe(0);
  });

  it('picks the live (current) map when no override', () => {
    const maps = [{ status: 'completed' }, { status: 'current' }, { status: 'upcoming' }];
    expect(getActiveBanIdx(maps, -1, [bans('A'), bans('B'), null])).toBe(1);
  });

  it('picks the next upcoming map between maps when its bans are revealed', () => {
    const maps = [{ status: 'completed' }, { status: 'upcoming' }, { status: 'upcoming' }];
    // map 2 (idx 1) bans revealed during the map-intro window
    expect(getActiveBanIdx(maps, -1, [bans('A', 'B'), bans('C', 'D'), null])).toBe(1);
  });

  it('falls back to the last PLAYED map when a series is decided early (phantom upcoming maps, no bans)', () => {
    // Bo5 won 3-0: maps 4 & 5 never played, no bans. Old code returned idx 3
    // (first upcoming) -> empty heroBans. Now it must return idx 2 (last completed).
    const maps = [
      { status: 'completed' }, { status: 'completed' }, { status: 'completed' },
      { status: 'upcoming' }, { status: 'upcoming' },
    ];
    const perMapBans = [bans('A', 'B'), bans('C', 'D'), bans('E', 'F')]; // only played maps
    expect(getActiveBanIdx(maps, -1, perMapBans)).toBe(2);
  });

  it('returns the last completed map when every map is completed (finished match)', () => {
    const maps = [{ status: 'completed' }, { status: 'completed' }, { status: 'completed' }];
    expect(getActiveBanIdx(maps, -1, [bans('A'), bans('B'), bans('C')])).toBe(2);
  });

  it('handles an empty maps array without throwing', () => {
    expect(getActiveBanIdx([], -1, [])).toBe(-1);
  });
});

describe('heroNameToKey', () => {
  it('maps FACEIT display names to dashboard keys (overrides + diacritics + punctuation)', () => {
    expect(heroNameToKey('DVa')).toBe('dva');
    expect(heroNameToKey('D.Va')).toBe('dva');
    expect(heroNameToKey('Soldier 76')).toBe('soldier-76');
    expect(heroNameToKey('Torbjörn')).toBe('torbjorn');
    expect(heroNameToKey('Lúcio')).toBe('lucio');
    expect(heroNameToKey('')).toBe('');
    expect(heroNameToKey(null)).toBe('');
  });
});

describe('computeHeroBans', () => {
  const banEntry = (t1, t2) => ({
    team1Ban: t1 ? { name: t1 } : null,
    team2Ban: t2 ? { name: t2 } : null,
  });

  it('derives the active map bans as dashboard hero keys', () => {
    const maps = [{ status: 'completed' }, { status: 'current' }];
    const perMapBans = [banEntry('Ana', 'Sombra'), banEntry('DVa', 'Soldier 76')];
    expect(computeHeroBans(perMapBans, maps)).toEqual({ team1: ['dva'], team2: ['soldier-76'] });
  });

  it('resolves a finished/decided series to its last played map (the empty-heroBans bug)', () => {
    // Bo5 won 3-0: trailing upcoming maps never played, no bans on them.
    const maps = [
      { status: 'completed' }, { status: 'completed' }, { status: 'completed' },
      { status: 'upcoming' }, { status: 'upcoming' },
    ];
    const perMapBans = [banEntry('Ana', 'Ana'), banEntry('Ana', 'Ana'), banEntry('Genji', 'Mercy')];
    expect(computeHeroBans(perMapBans, maps)).toEqual({ team1: ['genji'], team2: ['mercy'] });
  });

  it('honors an explicit producer-selected map', () => {
    const maps = [{ status: 'completed' }, { status: 'current' }];
    const perMapBans = [banEntry('Reaper', 'Moira'), banEntry('DVa', 'Ana')];
    expect(computeHeroBans(perMapBans, maps, 0)).toEqual({ team1: ['reaper'], team2: ['moira'] });
  });

  it('returns empty arrays when the active map has no bans', () => {
    const maps = [{ status: 'current' }];
    expect(computeHeroBans([{}], maps)).toEqual({ team1: [], team2: [] });
    expect(computeHeroBans([], maps)).toEqual({ team1: [], team2: [] });
    expect(computeHeroBans(null, maps)).toEqual({ team1: [], team2: [] });
  });
});

describe('computeActiveBan', () => {
  const banEntry = (t1, t2) => ({
    team1Ban: t1 ? { name: t1 } : null,
    team2Ban: t2 ? { name: t2 } : null,
  });

  it('returns the resolved index alongside the heroBans derived from it', () => {
    const maps = [{ status: 'completed' }, { status: 'current' }];
    const perMapBans = [banEntry('Ana', 'Sombra'), banEntry('Genji', 'Mercy')];
    expect(computeActiveBan(perMapBans, maps)).toEqual({ idx: 1, heroBans: { team1: ['genji'], team2: ['mercy'] } });
  });

  it('finished/decided series: idx is the last PLAYED map, not a trailing decider', () => {
    const maps = [
      { status: 'completed' }, { status: 'completed' }, { status: 'completed' },
      { status: 'upcoming' }, { status: 'upcoming' },
    ];
    const perMapBans = [banEntry('Ana', 'Ana'), banEntry('Ana', 'Ana'), banEntry('Genji', 'Mercy')];
    // idx 2 (last completed) — this is the value the Ban Reveal chip labels from,
    // fixing the "MAP 5 · decider" mismatch while the bans were map 3's.
    expect(computeActiveBan(perMapBans, maps)).toEqual({ idx: 2, heroBans: { team1: ['genji'], team2: ['mercy'] } });
  });

  it('idx is -1 when there is no resolvable map', () => {
    expect(computeActiveBan([], [])).toEqual({ idx: -1, heroBans: { team1: [], team2: [] } });
  });
});

describe('deriveActiveBanState', () => {
  const banEntry = (t1, t2) => ({
    team1Ban: t1 ? { name: t1 } : null,
    team2Ban: t2 ? { name: t2 } : null,
  });
  const notOverridden = () => false;

  it('boot-recompute: stale-empty heroBans + no activeBanMapIdx → resolved heroBans AND idx', () => {
    const state = {
      maps: [{ status: 'completed' }, { status: 'completed' }],
      perMapBans: [banEntry('Ana', 'Sombra'), banEntry('Genji', 'Mercy')],
      selectedMapIdx: -1,
      heroBans: { team1: [], team2: [] }, // the owner's stale persisted value
      // activeBanMapIdx absent (pre-fix persisted state)
    };
    expect(deriveActiveBanState(state, notOverridden)).toEqual({
      heroBans: { team1: ['genji'], team2: ['mercy'] },
      activeBanMapIdx: 1,
    });
  });

  it('PATCH-recompute: moving selectedMapIdx re-derives BOTH heroBans and idx', () => {
    const state = {
      maps: [{ status: 'completed' }, { status: 'current' }],
      perMapBans: [banEntry('Reaper', 'Moira'), banEntry('DVa', 'Ana')],
      selectedMapIdx: 0,
      heroBans: { team1: ['dva'], team2: ['ana'] }, // was the live map (idx 1)
      activeBanMapIdx: 1,
    };
    expect(deriveActiveBanState(state, notOverridden)).toEqual({
      heroBans: { team1: ['reaper'], team2: ['moira'] },
      activeBanMapIdx: 0,
    });
  });

  it('writes idx even when heroBans is unchanged (two maps, identical bans, active map moved)', () => {
    const state = {
      maps: [{ status: 'completed' }, { status: 'current' }],
      perMapBans: [banEntry('Ana', 'Ana'), banEntry('Ana', 'Ana')],
      selectedMapIdx: -1,
      heroBans: { team1: ['ana'], team2: ['ana'] }, // already matches
      activeBanMapIdx: 0, // but stale — active map is now idx 1 (current)
    };
    expect(deriveActiveBanState(state, notOverridden)).toEqual({ activeBanMapIdx: 1 });
  });

  it('override freeze: heroBans override freezes the idx derivation too — returns null', () => {
    const state = {
      maps: [{ status: 'current' }],
      perMapBans: [banEntry('Genji', 'Mercy')],
      selectedMapIdx: -1,
      heroBans: { team1: ['ana'], team2: ['ana'] }, // producer-pinned
      activeBanMapIdx: 5, // producer-pinned map — must NOT be re-derived
    };
    expect(deriveActiveBanState(state, (p) => p === 'heroBans')).toBeNull();
  });

  it('returns null (no write) when both heroBans and idx already match', () => {
    const state = {
      maps: [{ status: 'current' }],
      perMapBans: [banEntry('Genji', 'Mercy')],
      selectedMapIdx: -1,
      heroBans: { team1: ['genji'], team2: ['mercy'] },
      activeBanMapIdx: 0,
    };
    expect(deriveActiveBanState(state, notOverridden)).toBeNull();
  });
});
