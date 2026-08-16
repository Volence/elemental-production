import { describe, it, expect } from 'vitest';
import { buildTeamsUpdate, buildMapsUpdate, getActiveBanIdx, computeHeroBans, computeActiveBan, heroNameToKey, deriveActiveBanState, deriveScores } from './faceit-merge.js';

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

  it('preserves a producer-entered roundScore while FACEIT has none, and yields once FACEIT reports one', () => {
    const producerScored = [
      { name: 'Oasis', mode: 'Control', image: 'local-oasis.png', status: 'current', winner: null, roundScore: '2-1', picker: 'team1' },
      { name: 'Dorado', mode: 'Escort', image: 'local-dorado.png', status: 'upcoming', winner: null, roundScore: '3-2' },
    ];
    // faceitMaps[0] has no roundScore yet -> producer's '2-1' survives.
    // faceitMaps[1] has reported '4-3' -> FACEIT wins over the producer's '3-2'.
    const faceitWithScore = [
      { name: 'Oasis', mode: 'Control', image: 'oasis-sm.jpg', status: 'current', winner: null, roundScore: null },
      { name: 'Dorado', mode: 'Escort', image: 'dorado-sm.jpg', status: 'current', winner: null, roundScore: '4-3' },
    ];
    const u = buildMapsUpdate({ currentMaps: producerScored, faceitMaps: faceitWithScore, perMapBans, mapsOverridden: true });
    expect(u[0].roundScore).toBe('2-1');
    expect(u[1].roundScore).toBe('4-3');
  });

  // REGRESSION (producer report): Bo7 late pick vanished under the maps 🔒.
  // FACEIT reveals map 6 long after the producer touched the map list; the
  // overridden branch used to map over currentMaps only, so the new map was
  // dropped on every poll tick and never reached state.maps — the map-pool
  // board then grayed it (its Control column was already taken by Ilios) with
  // no pick badge, and map-pick showed an empty column.
  it('appends maps FACEIT reveals AFTER the producer took the maps override (Bo7 late pick)', () => {
    const currentMaps = [
      { name: 'Ilios', mode: 'Control', image: 'local-ilios.png', status: 'completed', winner: 'team1', roundScore: '2-1', picker: 'team1' },
      { name: 'Dorado', mode: 'Escort', image: 'local-dorado.png', status: 'completed', winner: 'team2', roundScore: '3-2', picker: 'team2' },
    ];
    const late = [
      { name: 'Ilios', mode: 'Control', image: 'ilios-sm.jpg', status: 'completed', winner: 'team1', roundScore: '2-1' },
      { name: 'Dorado', mode: 'Escort', image: 'dorado-sm.jpg', status: 'completed', winner: 'team2', roundScore: '3-2' },
      // Same MODE as map 1 — a Bo7 has 7 slots but only 5 modes.
      { name: 'Antarctic Peninsula', mode: 'Control', image: 'antarctic-sm.jpg', status: 'current', winner: null, roundScore: null },
    ];
    const u = buildMapsUpdate({
      currentMaps, faceitMaps: late,
      perMapBans: [{ picker: 'team1' }, { picker: 'team2' }, { picker: 'team2' }],
      mapsOverridden: true,
    });
    expect(u).toHaveLength(3);
    expect(u[0].image).toBe('local-ilios.png'); // producer's list still wins for maps it covers
    expect(u[2].name).toBe('Antarctic Peninsula');
    expect(u[2].status).toBe('current');
    expect(u[2].picker).toBe('team2');
  });

  // Pins DEDUP of a still-present map (King's Row is only removed from the
  // MIDDLE, so the tail loop's `i = merged.length` start already skips it —
  // no removal record needed). It also walks past the positional inheritance
  // a mid-list removal causes: the remaining Dorado now merges FACEIT index 1
  // (King's Row's progress). That misattribution is the documented
  // index-alignment limitation, not something this test asserts against.
  it('does not resurrect a map the producer REMOVED (tail append is name-guarded)', () => {
    const currentMaps = [{ name: 'Ilios' }, { name: 'Dorado' }]; // producer deleted King's Row (idx 1)
    const faceit = [{ name: 'Ilios' }, { name: 'King’s Row' }, { name: 'Dorado' }];
    const u = buildMapsUpdate({ currentMaps, faceitMaps: faceit, perMapBans: [], mapsOverridden: true });
    expect(u.map(m => m.name)).toEqual(['Ilios', 'Dorado']);
  });

  // Pins the APOSTROPHE FOLD in the dedup key (curly vs straight), not removal.
  it('name-guards across curly/straight apostrophes when appending', () => {
    const currentMaps = [{ name: 'Ilios' }, { name: "King's Row" }];
    const faceit = [{ name: 'Ilios' }, { name: 'Nepal' }, { name: 'King’s Row' }];
    const u = buildMapsUpdate({ currentMaps, faceitMaps: faceit, perMapBans: [], mapsOverridden: true });
    expect(u.map(m => m.name)).toEqual(['Ilios', "King's Row"]);
  });

  // BLOCKER (review round): a map removed off the END of the list is past
  // merged.length AND absent from the in-list name guard, so the tail append
  // re-added it on EVERY 15s tick — an unbreakable ping-pong, since removeMap
  // itself takes the maps 🔒 that enables this branch. state.removedMapKeys
  // (written by MatchHub's removeMap) is the only thing that can say "gone on
  // purpose"; merging twice proves it doesn't drift back after one tick.
  it('does not resurrect a TRAILING removal across repeated merges (removal record)', () => {
    const faceit = [{ name: 'Ilios' }, { name: 'Dorado' }, { name: 'Nepal' }];
    let maps = [{ name: 'Ilios' }, { name: 'Dorado' }]; // producer deleted Nepal, the LAST map
    const removedMapKeys = ['nepal'];
    for (let tick = 0; tick < 3; tick++) {
      maps = buildMapsUpdate({ currentMaps: maps, faceitMaps: faceit, perMapBans: [], mapsOverridden: true, removedMapKeys });
      expect(maps.map(m => m.name)).toEqual(['Ilios', 'Dorado']);
    }
  });

  it('re-adding a removed map syncs it again once the key is dropped', () => {
    const faceit = [{ name: 'Ilios' }, { name: 'Dorado' }, { name: 'King’s Row' }];
    const currentMaps = [{ name: 'Ilios' }, { name: 'Dorado' }];
    // Keys are normalizeMapName's ("King's Row"/"King’s Row" -> "kings-row").
    const stillRemoved = buildMapsUpdate({ currentMaps, faceitMaps: faceit, perMapBans: [], mapsOverridden: true, removedMapKeys: ['kings-row'] });
    expect(stillRemoved.map(m => m.name)).toEqual(['Ilios', 'Dorado']);
    // MatchHub's addMap drops the key when the producer re-adds that name.
    const readded = buildMapsUpdate({ currentMaps, faceitMaps: faceit, perMapBans: [{}, {}, { picker: 'team2' }], mapsOverridden: true, removedMapKeys: [] });
    expect(readded.map(m => m.name)).toEqual(['Ilios', 'Dorado', 'King’s Row']);
    expect(readded[2].picker).toBe('team2');
  });

  it('tolerates a removal record written with a different apostrophe/accent form', () => {
    const faceit = [{ name: 'Ilios' }, { name: "King's Row" }];
    const u = buildMapsUpdate({ currentMaps: [{ name: 'Ilios' }], faceitMaps: faceit, perMapBans: [], mapsOverridden: true, removedMapKeys: ['King’s Row'] });
    expect(u.map(m => m.name)).toEqual(['Ilios']);
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

  it('picks the LAST current map when bad state carries two live maps', () => {
    const maps = [{ status: 'current' }, { status: 'current' }, { status: 'upcoming' }];
    expect(getActiveBanIdx(maps, -1, [bans('A'), bans('B'), null])).toBe(1);
  });
});

describe('deriveScores', () => {
  it('counts map winners per team', () => {
    const maps = [
      { winner: 'team1' }, { winner: 'team2' }, { winner: 'team1' }, { winner: null },
    ];
    expect(deriveScores(maps)).toEqual({ team1: 2, team2: 1 });
  });

  it('counts producer-appended maps past the FACEIT list (the dropped-decider bug)', () => {
    const faceitMaps = [{ winner: 'team1' }, { winner: 'team2' }];
    const withAppendedDecider = faceitMaps.concat([{ winner: 'team2' }]);
    expect(deriveScores(withAppendedDecider)).toEqual({ team1: 1, team2: 2 });
  });

  it('tolerates null entries and non-arrays', () => {
    expect(deriveScores([null, { winner: 'team1' }, undefined])).toEqual({ team1: 1, team2: 0 });
    expect(deriveScores(undefined)).toEqual({ team1: 0, team2: 0 });
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
