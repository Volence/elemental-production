import { describe, it, expect, vi } from 'vitest';
import { parseVetoHistory, buildApiAttribution, getMatchDetails, getVetoHistory, vetoHistoryLogLine } from './faceit.js';
import { buildPerMapBans, carryForwardApiAttribution } from './faceit-merge.js';

// Shapes below mirror a real captured response from
// api.faceit.com/democracy/v1/match/{id}/history (S9 EMEA Advanced Bo5,
// 1-17d9542e-7094-4ae7-a539-f6cbf6cc2bb6): tickets arrive as per-game
// (map, attacking_first, heroes) triplets in game order; picks and drops
// carry selected_by = "faction1" | "faction2" | "".
const mapTicket = (pickGuid, selectedBy) => ({
  entity_type: 'map',
  vote_type: 'drop_pick',
  entities: [
    { guid: pickGuid, status: 'pick', selected_by: selectedBy, round: 0 },
    { guid: '0x080000000000066D', status: 'drop', selected_by: '', round: 0 },
  ],
});
const attackingFirstTicket = () => ({
  entity_type: 'attacking_first',
  vote_type: 'drop_pick',
  entities: [{ guid: 'faction1', status: 'pick', selected_by: '', round: 0 }],
});
const heroesTicket = (drops) => ({
  entity_type: 'heroes',
  vote_type: 'drop_pick',
  // Real tickets carry the full ~52-hero pool as picks; the parser must only
  // care about drops. One representative pick entity stands in for the pool.
  entities: [
    { guid: '0x02E0000000000015', status: 'pick', selected_by: '', round: 0 },
    ...drops.map(([guid, selectedBy, round = 0]) => ({ guid, status: 'drop', selected_by: selectedBy, round })),
  ],
});

describe('parseVetoHistory', () => {
  it('extracts per-game map picker and attributed hero bans from ticket triplets', () => {
    const tickets = [
      mapTicket('0x0800000000000CF2', 'faction1'),
      attackingFirstTicket(),
      heroesTicket([['0x02E000000000007A', 'faction1'], ['0x02E00000000004E3', 'faction2']]),
      mapTicket('0x0800000000000E13', 'faction2'),
      attackingFirstTicket(),
      heroesTicket([['0x02E0000000000003', 'faction2'], ['0x02E0000000000079', 'faction1']]),
    ];
    expect(parseVetoHistory(tickets)).toEqual([
      {
        mapPickedBy: 'faction1',
        bans: [
          { heroId: '0x02E000000000007A', faction: 'faction1' },
          { heroId: '0x02E00000000004E3', faction: 'faction2' },
        ],
      },
      {
        mapPickedBy: 'faction2',
        bans: [
          { heroId: '0x02E0000000000003', faction: 'faction2' },
          { heroId: '0x02E0000000000079', faction: 'faction1' },
        ],
      },
    ]);
  });

  it('orders bans chronologically by round when rounds differ', () => {
    const tickets = [
      mapTicket('0x0800000000000CF2', 'faction1'),
      heroesTicket([['0x02E000000000030A', 'faction2', 2], ['0x02E0000000000231', 'faction1', 1]]),
    ];
    expect(parseVetoHistory(tickets)[0].bans).toEqual([
      { heroId: '0x02E0000000000231', faction: 'faction1' },
      { heroId: '0x02E000000000030A', faction: 'faction2' },
    ]);
  });

  it('trims trailing empty triplets (unplayed Bo5 games) but keeps sparse middles', () => {
    const tickets = [
      mapTicket('0x0800000000000CF2', 'faction1'),
      heroesTicket([['0x02E000000000007A', 'faction1'], ['0x02E00000000004E3', 'faction2']]),
      // game 2: veto disrupted — map pick recorded, no hero drops
      mapTicket('0x0800000000000E13', 'faction2'),
      heroesTicket([]),
      // game 3 never played: no picks, no drops
      { entity_type: 'map', vote_type: 'drop_pick', entities: [] },
      heroesTicket([]),
    ];
    const games = parseVetoHistory(tickets);
    expect(games).toHaveLength(2);
    expect(games[1]).toEqual({ mapPickedBy: 'faction2', bans: [] });
  });

  it('keeps unattributed drops with faction null (selected_by empty)', () => {
    const tickets = [
      mapTicket('0x0800000000000CF2', 'faction1'),
      heroesTicket([['0x02E000000000007A', ''], ['0x02E00000000004E3', 'faction2']]),
    ];
    expect(parseVetoHistory(tickets)[0].bans).toEqual([
      { heroId: '0x02E000000000007A', faction: null },
      { heroId: '0x02E00000000004E3', faction: 'faction2' },
    ]);
  });

  it('returns [] for missing or malformed input', () => {
    expect(parseVetoHistory(null)).toEqual([]);
    expect(parseVetoHistory([])).toEqual([]);
    expect(parseVetoHistory([{ entity_type: 'map' }])).toEqual([]);
  });
});

describe('buildApiAttribution', () => {
  const heroMap = {
    '0x02E000000000007A': { name: 'DVa', role: 'Tank', image: 'dva.jpg' },
    '0x02E00000000004E3': { name: 'Freja', role: 'Damage', image: 'freja.jpg' },
  };

  it('maps faction1/faction2 to team1/team2 and resolves hero objects', () => {
    const games = [{
      mapPickedBy: 'faction2',
      bans: [
        { heroId: '0x02E000000000007A', faction: 'faction1' },
        { heroId: '0x02E00000000004E3', faction: 'faction2' },
      ],
    }];
    expect(buildApiAttribution(games, heroMap)).toEqual([{
      picker: 'team2',
      team1Ban: { name: 'DVa', role: 'Tank', image: 'dva.jpg' },
      team2Ban: { name: 'Freja', role: 'Damage', image: 'freja.jpg' },
    }]);
  });

  it('drops ban attribution entirely when any drop is unattributed', () => {
    const games = [{
      mapPickedBy: 'faction1',
      bans: [
        { heroId: '0x02E000000000007A', faction: null },
        { heroId: '0x02E00000000004E3', faction: 'faction2' },
      ],
    }];
    expect(buildApiAttribution(games, heroMap)).toEqual([
      { picker: 'team1', team1Ban: null, team2Ban: null },
    ]);
  });

  it('returns null for a game with neither picker nor bans', () => {
    expect(buildApiAttribution([{ mapPickedBy: null, bans: [] }], heroMap)).toEqual([null]);
  });

  it('falls back to a readable placeholder for unknown hero ids', () => {
    const games = [{
      mapPickedBy: null,
      bans: [{ heroId: '0x02E0000000000FFF', faction: 'faction1' }],
    }];
    expect(buildApiAttribution(games, heroMap)[0].team1Ban).toEqual({
      name: '0x02E0000000000FFF', role: 'Unknown', image: '',
    });
  });

  it('leaves the other side null when only one team banned', () => {
    const games = [{
      mapPickedBy: null,
      bans: [{ heroId: '0x02E000000000007A', faction: 'faction2' }],
    }];
    expect(buildApiAttribution(games, heroMap)).toEqual([
      { picker: null, team1Ban: null, team2Ban: { name: 'DVa', role: 'Tank', image: 'dva.jpg' } },
    ]);
  });
});

describe('getMatchDetails veto-history integration', () => {
  const heroEntity = (id, name, role) => ({
    guid: id, game_heroes_id: id, name,
    filters: { voting_tags: [`role:${role}`] },
    image_sm: `${name.toLowerCase()}.jpg`,
  });
  // 3-hero pool, game 1 allows only Kiriko -> DVa + Freja were banned
  const matchPayload = {
    match_id: 'm1', status: 'FINISHED', best_of: 3, competition_name: 'Test League',
    teams: {
      faction1: { faction_id: 'f1', name: 'Alpha', avatar: '', roster: [] },
      faction2: { faction_id: 'f2', name: 'Beta', avatar: '', roster: [] },
    },
    voting: {
      map: { entities: [], pick: ['0x0800000000000CF2'] },
      heroes: {
        entities: [
          heroEntity('0x02E000000000007A', 'DVa', 'Tank'),
          heroEntity('0x02E00000000004E3', 'Freja', 'Damage'),
          heroEntity('0x02E0000000000015', 'Kiriko', 'Support'),
        ],
        pick: [['0x02E0000000000015']],
      },
    },
    results: {},
  };
  const democracyPayload = {
    payload: {
      tickets: [
        {
          entity_type: 'map', vote_type: 'drop_pick',
          entities: [{ guid: '0x0800000000000CF2', status: 'pick', selected_by: 'faction2', round: 0 }],
        },
        {
          entity_type: 'heroes', vote_type: 'drop_pick',
          entities: [
            { guid: '0x02E000000000007A', status: 'drop', selected_by: 'faction2', round: 0 },
            { guid: '0x02E00000000004E3', status: 'drop', selected_by: 'faction1', round: 0 },
            { guid: '0x02E0000000000015', status: 'pick', selected_by: '', round: 0 },
          ],
        },
      ],
    },
  };
  const jsonRes = (body, ok = true, status = 200) => ({
    ok, status, headers: new Map(), json: async () => body, text: async () => JSON.stringify(body),
  });

  it('attaches per-game api attribution to perMapBans from the democracy history', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/democracy/')) return jsonRes(democracyPayload);
      return jsonRes(matchPayload);
    }));
    try {
      const details = await getMatchDetails('m1');
      expect(details.perMapBans[0].api).toEqual({
        picker: 'team2',
        team1Ban: { name: 'Freja', role: 'Damage', image: 'freja.jpg' },
        team2Ban: { name: 'DVa', role: 'Tank', image: 'dva.jpg' },
      });
      // chronological ban1/ban2 still derived from entity order for fallback UI
      expect(details.perMapBans[0].ban1.name).toBe('DVa');
      expect(details.perMapBans[0].ban2.name).toBe('Freja');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('omits api attribution when the democracy endpoint fails (fallback to heuristic)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/democracy/')) return jsonRes({ errors: [] }, false, 404);
      return jsonRes(matchPayload);
    }));
    try {
      const details = await getMatchDetails('m1');
      expect(details.perMapBans[0].api).toBeUndefined();
      expect(details.perMapBans[0].ban1.name).toBe('DVa');
      expect(details.vetoHistoryError).toBe('HTTP 404');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('omits api attribution when the democracy fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/democracy/')) throw new Error('ECONNRESET');
      return jsonRes(matchPayload);
    }));
    try {
      const details = await getMatchDetails('m1');
      expect(details.perMapBans[0].api).toBeUndefined();
      expect(details.vetoHistoryError).toBe('network error: ECONNRESET');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// ---------------------------------------------------------------------------
// REAL FIXTURE — trimmed from api.faceit.com/democracy/v1/match/
// 1-4559c9d9-7d2f-401d-8c7f-0abd7aff6d94/history (Track Hunters = faction1 vs
// ELMT Stellar = faction2, Bo5 that ended 0-2 — ships an unplayed 4th/5th
// triplet). Ticket order, statuses, selected_by and rounds are verbatim; only
// the ~52 undecided "pick" hero entities per heroes ticket and all but a few
// "open" entities of the unplayed triplet are cut.
//
// PRODUCER BUG (v2.2.0, live): map 2 aired as Track Hunters→Mei / Stellar→D.Mon
// on every overlay. Truth: Stellar banned Mei, Track Hunters banned D.Mon. The
// Data API's voting.heroes entity order lists Mei (entity 19) before D.Mon
// (entity 52), so the "picker made ban1" guess gave Mei to the map-2 picker.
// Map 3 also shows entity order isn't chronological: Jetpack Cat (entity 48)
// was dropped in round 1, Zarya (entity 10) in round 2.
// ---------------------------------------------------------------------------
const MEI = '0x02E00000000000DD';
const DMON = '0x02E0000000000542';
const trackHuntersVsStellarHistory = {
  payload: {
    match_id: '1-4559c9d9-7d2f-401d-8c7f-0abd7aff6d94',
    tickets: [
      // game 1 — Nepal
      { entity_type: 'map', vote_type: 'drop_pick', pre_voting_by_tag_regexp: '^tcat:.+$', entities: [
        { guid: '0x08000000000007E2', status: 'drop', random: false, round: 0, selected_by: '' },
        { guid: '0x08000000000004B7', status: 'pick', random: false, round: 0, selected_by: 'faction1' },
        { guid: '0x0800000000000EC0', status: 'drop', random: false, round: 0, selected_by: '' },
      ] },
      { entity_type: 'attacking_first', vote_type: 'drop_pick', entities: [
        { guid: 'faction1', status: 'pick', random: false, round: 0, selected_by: 'faction1' },
        { guid: 'faction2', status: 'drop', random: false, round: 0, selected_by: '' },
      ] },
      { entity_type: 'heroes', vote_type: 'drop_pick', entities: [
        { guid: '0x02E000000000007A', status: 'drop', random: false, round: 0, selected_by: 'faction2' },
        { guid: '0x02E0000000000236', status: 'pick', random: false, round: 0, selected_by: '' },
        { guid: '0x02E0000000000042', status: 'drop', random: false, round: 0, selected_by: 'faction1' },
      ] },
      // game 2 — New Junk City: many map drops, one pick
      { entity_type: 'map', vote_type: 'drop_pick', pre_voting_by_tag_regexp: '^tcat:.+$', entities: [
        { guid: '0x08000000000007E2', status: 'drop', random: false, round: 0, selected_by: '' },
        { guid: '0x08000000000004B7', status: 'drop', random: false, round: 0, selected_by: '' },
        { guid: '0x0800000000000EC0', status: 'drop', random: false, round: 0, selected_by: '' },
        { guid: '0x0800000000000756', status: 'drop', random: false, round: 0, selected_by: '' },
        { guid: '0x08000000000005BB', status: 'drop', random: false, round: 0, selected_by: '' },
        { guid: '0x0800000000000C85', status: 'drop', random: false, round: 0, selected_by: '' },
        { guid: '0x0800000000000E13', status: 'pick', random: false, round: 0, selected_by: 'faction1' },
        { guid: '0x0800000000000D3E', status: 'drop', random: false, round: 0, selected_by: '' },
      ] },
      { entity_type: 'attacking_first', vote_type: 'drop_pick', entities: [
        { guid: 'faction1', status: 'pick', random: false, round: 0, selected_by: 'faction1' },
        { guid: 'faction2', status: 'drop', random: false, round: 0, selected_by: '' },
      ] },
      { entity_type: 'heroes', vote_type: 'drop_pick', entities: [
        { guid: '0x02E0000000000236', status: 'pick', random: false, round: 0, selected_by: '' },
        { guid: MEI, status: 'drop', random: false, round: 0, selected_by: 'faction2' },
        { guid: DMON, status: 'drop', random: false, round: 0, selected_by: 'faction1' },
      ] },
      // game 3 — Route 66: map pick and hero drops carry rounds 1/2
      { entity_type: 'map', vote_type: 'drop_pick', pre_voting_by_tag_regexp: '^tcat:.+$', entities: [
        { guid: '0x0800000000000E13', status: 'drop', random: false, round: 0, selected_by: '' },
        { guid: '0x0800000000000B34', status: 'drop', random: false, round: 0, selected_by: '' },
        { guid: '0x08000000000005BB', status: 'pick', random: false, round: 1, selected_by: 'faction1' },
      ] },
      { entity_type: 'attacking_first', vote_type: 'drop_pick', entities: [
        { guid: 'faction2', status: 'drop', random: false, round: 0, selected_by: '' },
        { guid: 'faction1', status: 'pick', random: false, round: 1, selected_by: 'faction1' },
      ] },
      { entity_type: 'heroes', vote_type: 'drop_pick', entities: [
        { guid: '0x02E0000000000068', status: 'drop', random: false, round: 2, selected_by: 'faction2' },
        { guid: '0x02E0000000000236', status: 'pick', random: false, round: 0, selected_by: '' },
        { guid: '0x02E0000000000516', status: 'drop', random: false, round: 1, selected_by: 'faction1' },
      ] },
      // game 4 — never played: everything "open"
      { entity_type: 'map', vote_type: 'drop_pick', pre_voting_by_tag_regexp: '^tcat:.+$', entities: [
        { guid: '0x08000000000007E2', status: 'open', random: false, round: 0, selected_by: 'n/a' },
      ] },
      { entity_type: 'attacking_first', vote_type: 'drop_pick', entities: [
        { guid: 'faction1', status: 'open', random: false, round: 0, selected_by: 'n/a' },
      ] },
      { entity_type: 'heroes', vote_type: 'drop_pick', entities: [
        { guid: MEI, status: 'open', random: false, round: 0, selected_by: 'n/a' },
        { guid: DMON, status: 'open', random: false, round: 0, selected_by: 'n/a' },
      ] },
    ],
  },
};
// voting.heroes entity order from the Data API for the same match (subset,
// relative order preserved): DVa 0, Zarya 10, Cassidy 18, Mei 19, Jetpack Cat 48, D.Mon 52.
const stellarHeroEntities = [
  ['0x02E000000000007A', 'DVa', 'Tank'],
  ['0x02E0000000000068', 'Zarya', 'Tank'],
  ['0x02E0000000000042', 'Cassidy', 'Damage'],
  [MEI, 'Mei', 'Damage'],
  ['0x02E0000000000236', 'Kiriko', 'Support'],
  ['0x02E0000000000516', 'Jetpack Cat', 'Support'],
  [DMON, 'D.Mon', 'Tank'],
];
// A sync where the history gave nothing: same raw entries, no `api`.
const withoutApi = (list) => list.map((e) => { const copy = { ...e }; delete copy.api; return copy; });
const stellarHeroMap = Object.fromEntries(stellarHeroEntities.map(([id, name, role]) => [id, { name, role, image: '' }]));

describe('real history: Track Hunters vs ELMT Stellar (v2.2.0 on-air regression)', () => {
  it('parses three played games and trims the unplayed "open" triplet', () => {
    const games = parseVetoHistory(trackHuntersVsStellarHistory.payload.tickets);
    expect(games).toHaveLength(3);
    expect(games.map(g => g.mapPickedBy)).toEqual(['faction1', 'faction1', 'faction1']);
  });

  it('attributes map 2: Track Hunters (team1) banned D.Mon, Stellar (team2) banned Mei', () => {
    const attribution = buildApiAttribution(parseVetoHistory(trackHuntersVsStellarHistory.payload.tickets), stellarHeroMap);
    expect(attribution[1].team1Ban.name).toBe('D.Mon');
    expect(attribution[1].team2Ban.name).toBe('Mei');
    expect(attribution[1].picker).toBe('team1');
  });

  it('orders map 3 bans by round, not by entity order (Jetpack Cat r1 before Zarya r2)', () => {
    const games = parseVetoHistory(trackHuntersVsStellarHistory.payload.tickets);
    expect(games[2].bans).toEqual([
      { heroId: '0x02E0000000000516', faction: 'faction1' },
      { heroId: '0x02E0000000000068', faction: 'faction2' },
    ]);
    // ...whereas entity order would put Zarya first.
    const entityOrder = stellarHeroEntities.map(([id]) => id);
    expect(entityOrder.indexOf('0x02E0000000000068')).toBeLessThan(entityOrder.indexOf('0x02E0000000000516'));
  });

  it('end to end: getMatchDetails + buildPerMapBans put D.Mon on Track Hunters even though entity order says Mei first', async () => {
    const matchPayload = {
      match_id: '1-4559c9d9-7d2f-401d-8c7f-0abd7aff6d94', status: 'ONGOING', best_of: 5,
      teams: {
        faction1: { faction_id: 'th', name: 'Track Hunters', avatar: '', roster: [] },
        faction2: { faction_id: 'st', name: 'ELMT Stellar', avatar: '', roster: [] },
      },
      voting: {
        map: { entities: [], pick: ['0x08000000000004B7', '0x0800000000000E13'] },
        heroes: {
          entities: stellarHeroEntities.map(([id, name, role]) => ({
            guid: id, game_heroes_id: id, name, filters: { voting_tags: [`role:${role}`] },
          })),
          // map 1: DVa + Cassidy banned; map 2: Mei + D.Mon banned
          pick: [
            stellarHeroEntities.map(([id]) => id).filter(id => id !== '0x02E000000000007A' && id !== '0x02E0000000000042'),
            stellarHeroEntities.map(([id]) => id).filter(id => id !== MEI && id !== DMON),
          ],
        },
      },
      results: {},
    };
    const res = (body) => ({ ok: true, status: 200, headers: new Map(), json: async () => body, text: async () => JSON.stringify(body) });
    vi.stubGlobal('fetch', vi.fn(async (url) => (String(url).includes('/democracy/') ? res(trackHuntersVsStellarHistory) : res(matchPayload))));
    try {
      const details = await getMatchDetails('1-4559c9d9-7d2f-401d-8c7f-0abd7aff6d94');
      expect(details.vetoHistoryError).toBeNull();
      expect(details.perMapBans[1].ban1.name).toBe('Mei'); // entity order — the misleading input
      // Stellar won map 1 -> heuristic makes Track Hunters (loser) the map-2
      // picker AND gives them ban1 = Mei: exactly what aired.
      const maps = [{ winner: 'team2' }, {}];
      const heuristic = buildPerMapBans(withoutApi(details.perMapBans), maps);
      expect(heuristic[1].team1Ban.name).toBe('Mei');
      const real = buildPerMapBans(details.perMapBans, maps);
      expect(real[1].team1Ban.name).toBe('D.Mon');
      expect(real[1].team2Ban.name).toBe('Mei');

      // A later tick whose history fetch fails must keep those real sides.
      const prev = { matchId: '1-4559c9d9-7d2f-401d-8c7f-0abd7aff6d94', perMapBans: real };
      const failedTick = withoutApi(details.perMapBans);
      const kept = buildPerMapBans(carryForwardApiAttribution(failedTick, prev, prev.matchId), maps);
      expect(kept[1].team1Ban.name).toBe('D.Mon');
      expect(kept[1].team2Ban.name).toBe('Mei');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('getVetoHistory failure reasons', () => {
  const stub = (impl) => vi.stubGlobal('fetch', vi.fn(impl));
  const textRes = (body, { ok = true, status = 200, headers = {} } = {}) => ({
    ok, status, headers: new Map(Object.entries(headers)), text: async () => body,
  });
  const run = async (impl) => {
    stub(impl);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      // unique match id per call so the transition logger starts fresh
      return await getVetoHistory(`m-${Math.random()}`);
    } finally {
      warn.mockRestore();
      log.mockRestore();
      vi.unstubAllGlobals();
    }
  };

  it('reports the HTTP status, flagging a Cloudflare challenge', async () => {
    expect(await run(async () => textRes('<html>Just a moment...</html>', { ok: false, status: 403, headers: { 'cf-mitigated': 'challenge' } })))
      .toEqual({ games: null, error: 'HTTP 403 (Cloudflare challenge)' });
    expect(await run(async () => textRes('{}', { ok: false, status: 500 })))
      .toEqual({ games: null, error: 'HTTP 500' });
  });

  it('reports a non-JSON 200 (challenge page or otherwise)', async () => {
    expect((await run(async () => textRes('<html><script src="/cdn-cgi/challenge-platform/x"></script></html>'))).error)
      .toBe('Cloudflare challenge page instead of JSON');
    expect((await run(async () => textRes('oops'))).error).toBe('non-JSON response');
  });

  it('reports shape drift and a parsed-but-empty history', async () => {
    expect((await run(async () => textRes('{"payload":{}}'))).error).toBe('unexpected response shape (no payload.tickets)');
    expect((await run(async () => textRes(JSON.stringify({ payload: { tickets: [{ entity_type: 'heroes', entities: [] }] } })))).error)
      .toBe('history has no picks or bans yet');
  });

  it('reports network errors and never throws', async () => {
    expect(await run(async () => { throw new Error('ETIMEDOUT'); }))
      .toEqual({ games: null, error: 'network error: ETIMEDOUT' });
  });

  it('returns games with error null on success', async () => {
    const r = await run(async () => textRes(JSON.stringify(trackHuntersVsStellarHistory)));
    expect(r.error).toBeNull();
    expect(r.games).toHaveLength(3);
  });

  it('logs only on transitions, not on every poll tick', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    let failing = true;
    vi.stubGlobal('fetch', vi.fn(async () => (failing
      ? textRes('', { ok: false, status: 403 })
      : textRes(JSON.stringify(trackHuntersVsStellarHistory)))));
    try {
      const id = 'm-transitions';
      await getVetoHistory(id);
      await getVetoHistory(id);
      await getVetoHistory(id);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/^\[FACEIT\] Veto history unavailable for m-transitions: HTTP 403/);
      failing = false;
      await getVetoHistory(id);
      await getVetoHistory(id);
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0][0]).toMatch(/recovered \(was: HTTP 403\)/);
    } finally {
      warn.mockRestore();
      log.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

describe('vetoHistoryLogLine', () => {
  it('is quiet when nothing changed', () => {
    expect(vetoHistoryLogLine({ matchId: 'a', error: null }, 'a', null)).toBeNull();
    expect(vetoHistoryLogLine({ matchId: 'a', error: 'HTTP 403' }, 'a', 'HTTP 403')).toBeNull();
    // a new match starts from "ok": its first success is quiet
    expect(vetoHistoryLogLine({ matchId: 'a', error: 'HTTP 403' }, 'b', null)).toBeNull();
  });

  it('logs ok→failing, failing→ok and a reason change', () => {
    expect(vetoHistoryLogLine({ matchId: 'a', error: null }, 'a', 'HTTP 403')).toMatch(/unavailable for a: HTTP 403/);
    expect(vetoHistoryLogLine({ matchId: 'a', error: 'HTTP 403' }, 'a', null)).toMatch(/recovered/);
    expect(vetoHistoryLogLine({ matchId: 'a', error: 'HTTP 403' }, 'a', 'HTTP 500')).toMatch(/HTTP 403 → HTTP 500/);
    // a new match's first failure logs even if the old match was failing the same way
    expect(vetoHistoryLogLine({ matchId: 'a', error: 'HTTP 403' }, 'b', 'HTTP 403')).toMatch(/unavailable for b/);
  });
});
