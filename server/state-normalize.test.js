import { describe, it, expect } from 'vitest';
import { normalizeSingleCurrent } from './state.js';

describe('normalizeSingleCurrent', () => {
  it('keeps the last current map and demotes earlier ones', () => {
    const maps = [
      { name: 'Ilios', status: 'current' },
      { name: 'Runasapi', status: 'current' },
      { name: 'Dorado', status: 'upcoming' },
    ];
    const out = normalizeSingleCurrent(maps);
    expect(out.map(m => m.status)).toEqual(['upcoming', 'current', 'upcoming']);
  });

  it('completes a demoted map that already has a winner', () => {
    const maps = [
      { name: 'Ilios', status: 'current', winner: 'team1' },
      { name: 'Runasapi', status: 'current' },
    ];
    const out = normalizeSingleCurrent(maps);
    expect(out[0].status).toBe('completed');
    expect(out[1].status).toBe('current');
  });

  it('leaves a single current map untouched', () => {
    const maps = [{ status: 'completed' }, { status: 'current' }, { status: 'upcoming' }];
    expect(normalizeSingleCurrent(maps)).toStrictEqual(maps);
  });

  it('leaves a list with no current map untouched', () => {
    const maps = [{ status: 'completed' }, { status: 'upcoming' }];
    expect(normalizeSingleCurrent(maps)).toBe(maps);
  });

  it('passes through non-arrays', () => {
    expect(normalizeSingleCurrent(undefined)).toBe(undefined);
    expect(normalizeSingleCurrent(null)).toBe(null);
  });
});
