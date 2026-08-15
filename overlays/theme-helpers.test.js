import { describe, it, expect } from 'vitest';
import { findCurrentMapIndex, findCurrentMap, mapStripClass, hexToAlpha, legibleColor, proxyImg, normMapName } from './theme-helpers.js';

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

describe('findCurrentMapIndex with duplicate current', () => {
  it('prefers the LAST current map when multiple are current', () => {
    const maps = [
      { name: 'Ilios', status: 'current' },
      { name: 'Runasapi', status: 'current' },
      { name: 'Dorado', status: 'upcoming' },
    ];
    expect(findCurrentMapIndex(maps)).toBe(1);
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

// Drift guard: components-v2.js keeps deliberate private duplicates of these
// two functions (see the comment at the top of components-v2.js explaining
// why it can't require() this module). Covering both surfaces means a future
// change to one won't silently go untested on the other.
describe('hexToAlpha', () => {
  it('converts a hex color + alpha to an rgba() string', () => {
    expect(hexToAlpha('#ff0000', 0.5)).toBe('rgba(255,0,0,0.5)');
    expect(hexToAlpha('#00ff00', 1)).toBe('rgba(0,255,0,1)');
    expect(hexToAlpha('#123456', 0.38)).toBe('rgba(18,52,86,0.38)');
  });
  it('passes through non-hex input unchanged', () => {
    expect(hexToAlpha('transparent', 0.5)).toBe('transparent');
    expect(hexToAlpha('', 0.5)).toBe('');
  });
});

describe('proxyImg', () => {
  it('routes an external URL through the local proxy', () => {
    const out = proxyImg('https://cdn.example.com/a.png');
    expect(out).toContain('/api/proxy-image?url=');
    expect(out).toContain(encodeURIComponent('https://cdn.example.com/a.png'));
  });
  it('passes a localhost URL through unchanged', () => {
    expect(proxyImg('http://localhost:3001/cache/x.png')).toBe('http://localhost:3001/cache/x.png');
  });
});

describe('normMapName', () => {
  // Pinned exact output — a same-output-for-both-inputs assertion alone would
  // pass even for a constant-returning stub. This is a DISPLAY-name key
  // (apostrophe kept, just folded to straight ASCII); it is deliberately NOT
  // the same as server/map-image-resolver.js's normalizeMapName, which strips
  // apostrophes entirely to build filesystem-safe slugs ("kings-row").
  it('lowercases and folds a straight apostrophe through unchanged', () => {
    expect(normMapName("King's Row")).toBe("king's row");
  });
  it('folds curly and straight apostrophes to the same key', () => {
    expect(normMapName("King's Row")).toBe(normMapName('King’s Row'));
    expect(normMapName('King’s Row')).toBe("king's row");
  });
  it('strips diacritics', () => {
    expect(normMapName('Paraíso')).toBe('paraiso');
  });
  it('trims surrounding whitespace and lowercases', () => {
    expect(normMapName('  ILIOS ')).toBe('ilios');
  });
  it('handles null/undefined as empty string', () => {
    expect(normMapName(null)).toBe('');
    expect(normMapName(undefined)).toBe('');
  });
});

describe('legibleColor', () => {
  it('lifts a too-dark color to the lightness floor, keeping its hue', () => {
    const out = legibleColor('#140251', 0.45); // near-black navy (real extraction)
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(out.slice(i, i + 2), 16));
    const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255;
    expect(l).toBeGreaterThanOrEqual(0.44);
    expect(b).toBeGreaterThan(r); // still blue-family
    expect(b).toBeGreaterThan(g);
  });

  it('passes a bright color through unchanged', () => {
    expect(legibleColor('#5f22fd', 0.45)).toBe('#5f22fd');
  });

  it('passes non-hex theme strings through untouched', () => {
    expect(legibleColor('hsl(200 90% 55%)', 0.45)).toBe('hsl(200 90% 55%)');
    expect(legibleColor('', 0.45)).toBe('');
  });

  it('lifts pure black to a neutral gray at the floor (no hue invented)', () => {
    const out = legibleColor('#000000', 0.45);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(out.slice(i, i + 2), 16));
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeGreaterThan(100);
  });
});
