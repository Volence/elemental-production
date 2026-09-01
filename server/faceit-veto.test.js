import { describe, it, expect, vi } from 'vitest';
import { parseVetoHistory, buildApiAttribution, getMatchDetails } from './faceit.js';

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
  const jsonRes = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

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
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
