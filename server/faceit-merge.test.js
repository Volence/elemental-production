import { describe, it, expect } from 'vitest';
import { buildTeamsUpdate, buildMapsUpdate, buildPerMapBans, carryForwardApiAttribution, getActiveBanIdx, computeHeroBans, computeActiveBan, heroNameToKey, deriveActiveBanState, deriveScores, faceitSyncAllowed, faceitSyncStillCurrent } from './faceit-merge.js';

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


describe('buildPerMapBans', () => {
  const dva = { name: 'DVa', role: 'Tank', image: 'dva.jpg' };
  const freja = { name: 'Freja', role: 'Damage', image: 'freja.jpg' };
  const rawWithApi = (api) => [{ ban1: dva, ban2: freja, api }];

  it('uses API attribution verbatim when present (no picker heuristic)', () => {
    // Heuristic would give ban1 (DVa) to team1 on map 1; API says the reverse.
    const out = buildPerMapBans(rawWithApi({ picker: 'team2', team1Ban: freja, team2Ban: dva }), []);
    expect(out[0].picker).toBe('team2');
    expect(out[0].team1Ban).toEqual(freja);
    expect(out[0].team2Ban).toEqual(dva);
  });

  it('falls back to the picker heuristic when no API attribution exists', () => {
    const maps = [{ winner: 'team1' }, {}];
    const out = buildPerMapBans([{ ban1: dva, ban2: freja }, { ban1: freja, ban2: dva }], maps);
    // map 1: team1 assumed picker, gets ban1; map 2: loser of map 1 (team2) picks
    expect(out[0]).toMatchObject({ picker: 'team1', team1Ban: dva, team2Ban: freja });
    expect(out[1]).toMatchObject({ picker: 'team2', team1Ban: dva, team2Ban: freja });
  });

  it('uses the API picker to seed the ban heuristic when only bans are unattributed', () => {
    const out = buildPerMapBans(rawWithApi({ picker: 'team2', team1Ban: null, team2Ban: null }), []);
    expect(out[0]).toMatchObject({ picker: 'team2', team1Ban: freja, team2Ban: dva });
  });

  it('lets a producer mapPickers correction override the API picker without touching attributed bans', () => {
    const out = buildPerMapBans(rawWithApi({ picker: 'team2', team1Ban: freja, team2Ban: dva }), [], [], ['team1']);
    expect(out[0].picker).toBe('team1');
    expect(out[0].team1Ban).toEqual(freja);
    expect(out[0].team2Ban).toEqual(dva);
  });

  it('still applies a producer banSwap on top of API-attributed bans', () => {
    const out = buildPerMapBans(rawWithApi({ picker: 'team1', team1Ban: dva, team2Ban: freja }), [], [true]);
    expect(out[0].team1Ban).toEqual(freja);
    expect(out[0].team2Ban).toEqual(dva);
  });

  it('keeps the api marker on entries so the UI can tell attribution is confirmed', () => {
    const api = { picker: 'team1', team1Ban: dva, team2Ban: freja };
    expect(buildPerMapBans(rawWithApi(api), [])[0].api).toEqual(api);
    expect(buildPerMapBans([{ ban1: dva, ban2: freja }], [])[0].api).toBeUndefined();
  });

  it('fills the unconfirmed side by elimination when the api confirmed only one of two bans', () => {
    const dvaOnTeam2 = rawWithApi({ picker: 'team1', team1Ban: null, team2Ban: dva });
    expect(buildPerMapBans(dvaOnTeam2, [])[0]).toMatchObject({ team1Ban: freja, team2Ban: dva });
    const frejaOnTeam1 = rawWithApi({ picker: 'team1', team1Ban: freja, team2Ban: null });
    expect(buildPerMapBans(frejaOnTeam1, [])[0]).toMatchObject({ team1Ban: freja, team2Ban: dva });
    // banSwap still applies on top of the filled pair
    expect(buildPerMapBans(dvaOnTeam2, [], [true])[0]).toMatchObject({ team1Ban: dva, team2Ban: freja });
  });

  it('never duplicates or moves the confirmed hero when elimination is ambiguous', () => {
    const mercy = { name: 'Mercy', role: 'Support', image: '' };
    // only the confirmed hero is banned so far: other side stays empty
    const single = [{ ban1: dva, ban2: null, api: { picker: null, team1Ban: null, team2Ban: dva } }];
    expect(buildPerMapBans(single, [])[0]).toMatchObject({ team1Ban: null, team2Ban: dva });
    // confirmed hero isn't among the raw bans (inconsistent data): don't guess
    const mismatch = [{ ban1: freja, ban2: mercy, api: { picker: null, team1Ban: null, team2Ban: dva } }];
    expect(buildPerMapBans(mismatch, [])[0]).toMatchObject({ team1Ban: null, team2Ban: dva });
  });

  it('honors mapPickers "none" (explicit no-pick) with attributed bans intact', () => {
    const out = buildPerMapBans(rawWithApi({ picker: 'team1', team1Ban: dva, team2Ban: freja }), [], [], ['none']);
    expect(out[0].picker).toBeNull();
    expect(out[0].team1Ban).toEqual(dva);
  });
});

describe('carryForwardApiAttribution', () => {
  // PRODUCER BUG (v2.2.0, live, Track Hunters vs ELMT Stellar): a sync whose
  // veto-history fetch yielded nothing downgraded a confirmed map to the
  // picker guess and flipped every overlay's ban sides mid-broadcast.
  const mei = { name: 'Mei', role: 'Damage', image: '' };
  const dmon = { name: 'D.Mon', role: 'Tank', image: '' };
  const zarya = { name: 'Zarya', role: 'Tank', image: '' };
  const MATCH = '1-4559c9d9-7d2f-401d-8c7f-0abd7aff6d94';
  const confirmed = { picker: 'team1', team1Ban: dmon, team2Ban: mei };
  // State as a good tick left it: buildPerMapBans output (api kept on entry).
  const prevState = (api = confirmed, raw = { ban1: mei, ban2: dmon }) => ({
    matchId: MATCH,
    perMapBans: buildPerMapBans([{ ...raw, api }], []),
  });

  it('keeps confirmed attribution when the same match comes back with the same bans but no api', () => {
    const fresh = [{ ban1: mei, ban2: dmon }];
    const out = carryForwardApiAttribution(fresh, prevState(), MATCH);
    expect(out[0].api).toEqual(confirmed);
    const bans = buildPerMapBans(out, []);
    expect(bans[0]).toMatchObject({ picker: 'team1', team1Ban: dmon, team2Ban: mei });
  });

  it('treats the ban pair as unordered (entity order means nothing)', () => {
    const out = carryForwardApiAttribution([{ ban1: dmon, ban2: mei }], prevState(), MATCH);
    expect(out[0].api).toEqual(confirmed);
  });

  it('does NOT carry bans when the banned heroes changed (a genuinely different veto)', () => {
    const out = carryForwardApiAttribution([{ ban1: mei, ban2: zarya }], prevState(), MATCH);
    // picker isn't carried either: D.Mon vanished, so the veto was redone
    expect(out[0].api).toBeUndefined();
    expect(buildPerMapBans(out, [])[0].api).toBeUndefined();
  });

  it('does NOT carry across matches', () => {
    const prev = { ...prevState(), matchId: '1-some-other-match' };
    expect(carryForwardApiAttribution([{ ban1: mei, ban2: dmon }], prev, MATCH)[0].api).toBeUndefined();
    expect(carryForwardApiAttribution([{ ban1: mei, ban2: dmon }], prevState(), '')[0].api).toBeUndefined();
    expect(carryForwardApiAttribution([{ ban1: mei, ban2: dmon }], null, MATCH)[0].api).toBeUndefined();
  });

  it('lets a fresh api win over the carried one', () => {
    const freshApi = { picker: 'team2', team1Ban: mei, team2Ban: dmon };
    const fresh = [{ ban1: mei, ban2: dmon, api: freshApi }];
    const out = carryForwardApiAttribution(fresh, prevState(), MATCH);
    expect(out[0]).toBe(fresh[0]);
  });

  it('still applies a producer banSwap on top of carried attribution (and mapPickers)', () => {
    // The previous state was itself swapped: team sides flipped, api untouched.
    const prev = { matchId: MATCH, perMapBans: buildPerMapBans([{ ban1: mei, ban2: dmon, api: confirmed }], [], [true]) };
    expect(prev.perMapBans[0].team1Ban).toEqual(mei);
    const out = buildPerMapBans(carryForwardApiAttribution([{ ban1: mei, ban2: dmon }], prev, MATCH), [], [true], ['team2']);
    expect(out[0]).toMatchObject({ picker: 'team2', team1Ban: mei, team2Ban: dmon, api: confirmed });
  });

  it('merges a partial fresh api (picker only — a drop not yet attributed) with confirmed bans', () => {
    const fresh = [{ ban1: mei, ban2: dmon, api: { picker: 'team1', team1Ban: null, team2Ban: null } }];
    const out = carryForwardApiAttribution(fresh, prevState(), MATCH);
    expect(out[0].api).toEqual(confirmed);
  });

  it('carries a confirmed picker (no bans yet) as bans arrive, but not the absent bans', () => {
    const pickerOnly = { picker: 'team2', team1Ban: null, team2Ban: null };
    const prev = prevState(pickerOnly, { ban1: null, ban2: null });
    // bans landed during an outage: picker survives (map picked before bans)
    const out = carryForwardApiAttribution([{ ban1: mei, ban2: dmon }], prev, MATCH);
    expect(out[0].api).toEqual(pickerOnly);
    // ...and seeds the heuristic exactly as a fresh picker-only api would
    expect(buildPerMapBans(out, [])[0]).toMatchObject({ picker: 'team2', team1Ban: dmon, team2Ban: mei });
  });

  it('carries a one-sided confirmation when the second ban lands during an outage', () => {
    // tick N: only Stellar's Mei was banned + confirmed; tick N+1: D.Mon lands
    // in the Data API but the history fetch fails.
    const oneSided = { picker: 'team1', team1Ban: null, team2Ban: mei };
    const prev = prevState(oneSided, { ban1: mei, ban2: null });
    for (const fresh of [[{ ban1: mei, ban2: dmon }], [{ ban1: dmon, ban2: mei }]]) {
      const out = carryForwardApiAttribution(fresh, prev, MATCH);
      expect(out[0].api).toEqual(oneSided); // the other side is NOT invented in api
      // ...buildPerMapBans fills the open slot by elimination: Mei stays on
      // team2 whatever the entity order, D.Mon goes to team1.
      expect(buildPerMapBans(out, [])[0]).toMatchObject({ team1Ban: dmon, team2Ban: mei });
      // the heuristic alone (team1 picker gets ban1) would have put Mei on team1
      if (fresh[0].ban1 === mei) expect(buildPerMapBans(fresh, [])[0].team1Ban).toEqual(mei);
    }
  });

  it('does not carry a one-sided confirmation whose hero is no longer banned', () => {
    const oneSided = { picker: 'team1', team1Ban: null, team2Ban: mei };
    const prev = prevState(oneSided, { ban1: mei, ban2: null });
    const out = carryForwardApiAttribution([{ ban1: zarya, ban2: dmon }], prev, MATCH);
    expect(out[0].api).toBeUndefined();
  });

  it('carries a one-sided confirmation unchanged when the set did not grow', () => {
    const oneSided = { picker: null, team1Ban: mei, team2Ban: null };
    const prev = prevState(oneSided, { ban1: mei, ban2: null });
    const out = carryForwardApiAttribution([{ ban1: mei, ban2: null }], prev, MATCH);
    expect(out[0].api).toEqual(oneSided);
    expect(buildPerMapBans(out, [])[0]).toMatchObject({ team1Ban: mei, team2Ban: null });
  });

  it('does not carry bans onto a map whose bans disappeared', () => {
    const out = carryForwardApiAttribution([{ ban1: null, ban2: null }], prevState(), MATCH);
    expect(out[0].api).toBeUndefined();
  });

  it('works per index and passes untouched entries through', () => {
    const prev = { matchId: MATCH, perMapBans: [{ ban1: mei, ban2: dmon, api: confirmed }, { ban1: zarya, ban2: null }] };
    const fresh = [{ ban1: mei, ban2: dmon }, { ban1: zarya, ban2: null }, { ban1: dmon, ban2: mei }];
    const out = carryForwardApiAttribution(fresh, prev, MATCH);
    expect(out[0].api).toEqual(confirmed);
    expect(out[1]).toBe(fresh[1]);
    expect(out[2]).toBe(fresh[2]);
  });
});

describe('faceitSyncStillCurrent', () => {
  // A poll/refresh for match A in flight when the producer loads match B must
  // not write A's result into B's state.
  it('allows the write only while the fetched match is still loaded', () => {
    expect(faceitSyncStillCurrent({ faceitMatchId: 'A' }, 'A')).toBe(true);
    expect(faceitSyncStillCurrent({ faceitMatchId: 'B' }, 'A')).toBe(false);
    expect(faceitSyncStillCurrent({ faceitMatchId: '' }, 'A')).toBe(false);
    expect(faceitSyncStillCurrent({ faceitMatchId: '' }, '')).toBe(false);
    expect(faceitSyncStillCurrent(null, 'A')).toBe(false);
  });
});

describe('faceitSyncAllowed', () => {
  // Producer report (third time): "the map picks and bans keep resetting" in
  // Manual mode. The auto-sync tick only ever checked faceitMatchId, and
  // switching to Manual/Scrim left the loaded match id (and the running poll)
  // in place — so FACEIT kept writing maps/perMapBans/heroBans every 15s over
  // the hand-entered ones. Manual mode never takes overrides (that's the
  // point of it), so the ONLY safe rule is: FACEIT writes in FACEIT mode only.
  it('allows the tick in faceit mode with a loaded match', () => {
    expect(faceitSyncAllowed({ mode: 'faceit', faceitMatchId: '1-abc' })).toEqual({ allowed: true });
  });

  it('refuses in manual mode even when a match id lingers from before the switch', () => {
    const r = faceitSyncAllowed({ mode: 'manual', faceitMatchId: '1-abc', faceitAutoSync: true });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/manual/);
  });

  it('refuses in scrim mode', () => {
    expect(faceitSyncAllowed({ mode: 'scrim', faceitMatchId: '1-abc' }).allowed).toBe(false);
  });

  it('refuses without a loaded match', () => {
    const r = faceitSyncAllowed({ mode: 'faceit', faceitMatchId: '' });
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/no match/i);
  });

  it('refuses on a missing/garbage state', () => {
    expect(faceitSyncAllowed(undefined).allowed).toBe(false);
    expect(faceitSyncAllowed({}).allowed).toBe(false);
  });
});
