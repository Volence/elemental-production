import { describe, it, expect } from 'vitest';
import { findCurrentMapIndex, findCurrentMap, mapStripClass } from './theme-helpers.js';

describe('findCurrentMapIndex', () => {
  it('prefers the live map', () => {
    const maps = [{ status: 'completed' }, { status: 'current' }, { status: 'upcoming' }];
    expect(findCurrentMapIndex(maps)).toBe(1);
  });
  it('falls through to the next upcoming map when nothing is live (the stale-name bug)', () => {
    const maps = [{ status: 'completed', name: 'Oasis' }, { status: 'upcoming', name: 'Dorado' }];
    expect(findCurrentMapIndex(maps)).toBe(1);
    expect(findCurrentMap(maps).name).toBe('Dorado');
  });
  it('falls back to the last map when the series is over', () => {
    const maps = [{ status: 'completed' }, { status: 'completed' }];
    expect(findCurrentMapIndex(maps)).toBe(1);
  });
  it('handles empty/missing lists', () => {
    expect(findCurrentMapIndex([])).toBe(-1);
    expect(findCurrentMap(undefined)).toEqual({});
  });
});

describe('mapStripClass', () => {
  it('colors by winning team regardless of side swap', () => {
    expect(mapStripClass({ status: 'completed', winner: 'team1' }, 0, 2)).toBe('won-t1');
    expect(mapStripClass({ status: 'completed', winner: 'team2' }, 1, 2)).toBe('won-t2');
  });
  it('marks the current map', () => {
    expect(mapStripClass({ status: 'current' }, 2, 2)).toBe('current');
  });
  it('returns empty for upcoming maps', () => {
    expect(mapStripClass({ status: 'upcoming' }, 3, 2)).toBe('');
  });
});
