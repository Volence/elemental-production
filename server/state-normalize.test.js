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

  it('does not mutate the input array or its entries', () => {
    const first = { name: 'Ilios', status: 'current' };
    const maps = [first, { name: 'Runasapi', status: 'current' }];
    const out = normalizeSingleCurrent(maps);
    expect(first.status).toBe('current');
    expect(maps[0]).toBe(first);
    expect(out[0]).not.toBe(first);
  });

  it('tolerates null entries', () => {
    const maps = [null, { name: 'Ilios', status: 'current' }, undefined, { name: 'Busan', status: 'current' }];
    const out = normalizeSingleCurrent(maps);
    expect(out[0]).toBe(null);
    expect(out[2]).toBe(undefined);
    expect(out[1].status).toBe('upcoming');
    expect(out[3].status).toBe('current');
  });

  it('passes through non-arrays', () => {
    expect(normalizeSingleCurrent(undefined)).toBe(undefined);
    expect(normalizeSingleCurrent(null)).toBe(null);
  });
});
