import { describe, it, expect } from 'vitest';
import { parseAttackingFirst } from './faceit.js';
import { resolveAutoSide, mergePlayerStats, awaitingFinalStats, needsStatsBackfill } from './faceit-merge.js';

// Ticket shapes captured from api.faceit.com/democracy/v1/match/{id}/history
// (1-17d9542e-…, S9 EMEA Bo5 that went 4 games): each game carries an
// `attacking_first` ticket whose PICKED entity guid is the faction that
// attacks first. Unplayed games stay `open` on both entities.
const af = (picked) => ({
  entity_type: 'attacking_first',
  vote_type: 'drop_pick',
  entities: picked
    ? [
        { guid: picked === 'faction1' ? 'faction2' : 'faction1', status: 'drop', selected_by: '', round: 0 },
        { guid: picked, status: 'pick', selected_by: picked, round: 0 },
      ]
    : [
        { guid: 'faction1', status: 'open', selected_by: 'n/a', round: 0 },
        { guid: 'faction2', status: 'open', selected_by: 'n/a', round: 0 },
      ],
});
const mapT = { entity_type: 'map', entities: [] };
const heroT = { entity_type: 'heroes', entities: [] };

describe('parseAttackingFirst', () => {
  it('maps each game\'s picked faction to the app team vocabulary, in game order', () => {
    const tickets = [mapT, af('faction1'), heroT, mapT, af('faction2'), heroT, mapT, af(null), heroT];
    expect(parseAttackingFirst(tickets)).toEqual(['team1', 'team2', null]);
  });

  it('ignores tickets of other types and survives junk', () => {
    expect(parseAttackingFirst(undefined)).toEqual([]);
    expect(parseAttackingFirst([mapT, heroT, null, { entity_type: 'attacking_first' }])).toEqual([null]);
  });
});

describe('resolveAutoSide', () => {
  it('puts the attacking-first team on the RIGHT: team1 attacking => swapped', () => {
    expect(resolveAutoSide(['team2', 'team1'], 'm1', null))
      .toEqual({ key: 'm1:1:team1', mapIdx: 1, attacker: 'team1', swapSides: true });
    expect(resolveAutoSide(['team2'], 'm1', null))
      .toEqual({ key: 'm1:0:team2', mapIdx: 0, attacker: 'team2', swapSides: false });
  });

  it('uses the NEWEST game with a recorded attacker (the map about to be played)', () => {
    expect(resolveAutoSide(['team1', 'team2', null, null], 'm1', null).mapIdx).toBe(1);
  });

  it('is edge-triggered: the same fact twice returns null so a producer\'s manual swap sticks', () => {
    expect(resolveAutoSide(['team1'], 'm1', 'm1:0:team1')).toBeNull();
  });

  it('a new map\'s fact fires again even after a manual swap', () => {
    expect(resolveAutoSide(['team1', 'team1'], 'm1', 'm1:0:team1').key).toBe('m1:1:team1');
  });

  it('does nothing without a recorded attacker (failed history fetch, pre-vote)', () => {
    expect(resolveAutoSide([], 'm1', null)).toBeNull();
    expect(resolveAutoSide([null, null], 'm1', null)).toBeNull();
    expect(resolveAutoSide(undefined, 'm1', null)).toBeNull();
    expect(resolveAutoSide(['team1'], '', null)).toBeNull();
  });
});

describe('mergePlayerStats', () => {
  const s = [{ matchRound: 1 }];
  it('a failed or 404 stats fetch (empty) never wipes stats already loaded', () => {
    expect(mergePlayerStats(s, [])).toBe(s);
    expect(mergePlayerStats(s, undefined)).toBe(s);
  });
  it('fresh stats replace old ones', () => {
    const fresh = [{ matchRound: 1 }, { matchRound: 2 }];
    expect(mergePlayerStats(s, fresh)).toBe(fresh);
  });
  it('defaults to an empty list', () => {
    expect(mergePlayerStats(undefined, [])).toEqual([]);
  });
});

describe('awaitingFinalStats', () => {
  const finishedAt = 1_000_000; // FACEIT finished_at is unix SECONDS
  const now = finishedAt * 1000 + 60_000;
  it('keeps polling after FINISHED while completed maps outnumber stats rounds, inside the grace window', () => {
    expect(awaitingFinalStats({ statsCount: 0, completedMaps: 3, finishedAt, now })).toBe(true);
    expect(awaitingFinalStats({ statsCount: 2, completedMaps: 3, finishedAt, now })).toBe(true);
  });
  it('stops once stats cover every completed map', () => {
    expect(awaitingFinalStats({ statsCount: 3, completedMaps: 3, finishedAt, now })).toBe(false);
  });
  it('gives up after the grace window so a match with no stats can\'t poll forever', () => {
    expect(awaitingFinalStats({ statsCount: 0, completedMaps: 3, finishedAt, now: finishedAt * 1000 + 11 * 60_000 })).toBe(false);
  });
  it('stops when finishedAt is unknown', () => {
    expect(awaitingFinalStats({ statsCount: 0, completedMaps: 3, finishedAt: null, now })).toBe(false);
  });
});

describe('needsStatsBackfill', () => {
  const base = { mode: 'faceit', faceitMatchId: 'm1', playerStats: [], maps: [{ status: 'completed' }] };
  it('true for a FACEIT match with completed maps and no stats (the startup red row)', () => {
    expect(needsStatsBackfill(base)).toBe(true);
  });
  it('false when stats exist, no map completed, no match, or not FACEIT mode', () => {
    expect(needsStatsBackfill({ ...base, playerStats: [{}] })).toBe(false);
    expect(needsStatsBackfill({ ...base, maps: [{ status: 'upcoming' }] })).toBe(false);
    expect(needsStatsBackfill({ ...base, faceitMatchId: '' })).toBe(false);
    expect(needsStatsBackfill({ ...base, mode: 'manual' })).toBe(false);
    expect(needsStatsBackfill(null)).toBe(false);
  });
});

import { buildFaceitMap, faceitCompletedMaps, revertAutoSwap } from './faceit-merge.js';

describe('buildFaceitMap (forward-only map progress, shared by poll tick + refresh)', () => {
  const m = { name: 'Busan', mode: 'Control', imageLg: 'L' };
  const won = { winner: 'f1', scoreSummary: '2-1' };
  it('takes status/winner/score from FACEIT stats', () => {
    expect(buildFaceitMap(m, won, {}, 'f1')).toEqual({
      name: 'Busan', mode: 'Control', image: 'L', status: 'completed', winner: 'team1', roundScore: '2-1' });
  });
  it('never demotes a completed map when stats are missing (404 window after FINISHED)', () => {
    const cur = { status: 'completed', winner: 'team2', roundScore: '1-2' };
    expect(buildFaceitMap(m, undefined, cur, 'f1'))
      .toMatchObject({ status: 'completed', winner: 'team2', roundScore: '1-2' });
  });
  it('defaults to upcoming with no stats and no prior state', () => {
    expect(buildFaceitMap(m, undefined, undefined, 'f1')).toMatchObject({ status: 'upcoming', winner: null, roundScore: null });
  });
});

describe('faceitCompletedMaps', () => {
  it('ignores producer-appended maps past FACEIT\'s picks (they never get stats)', () => {
    const maps = [{ status: 'completed' }, { status: 'completed' }, { status: 'completed' }];
    expect(faceitCompletedMaps({ results: {}, pickedMaps: [{}, {}] }, maps)).toBe(2);
  });
  it('uses FACEIT\'s result score when it says more', () => {
    expect(faceitCompletedMaps({ results: { score: { faction1: 3, faction2: 1 } }, pickedMaps: [{}, {}, {}, {}] }, [])).toBe(4);
  });
});

describe('revertAutoSwap (leaving FACEIT mode)', () => {
  it('undoes a swap FACEIT made', () => {
    expect(revertAutoSwap({ swapSides: true, autoSide: { attacker: 'team1' } })).toBe(false);
  });
  it('keeps a producer\'s manual swap (differs from what FACEIT set)', () => {
    expect(revertAutoSwap({ swapSides: true, autoSide: { attacker: 'team2' } })).toBe(true);
    expect(revertAutoSwap({ swapSides: true, autoSide: null })).toBe(true);
  });
});

describe('resolveAutoSide seed (upgrade from a build without autoSide)', () => {
  it('records the current fact without swapping', () => {
    expect(resolveAutoSide(['team1'], 'm1', null, { seedOnly: true }))
      .toEqual({ key: 'm1:0:team1', mapIdx: 0, attacker: 'team1', swapSides: undefined });
  });
});
