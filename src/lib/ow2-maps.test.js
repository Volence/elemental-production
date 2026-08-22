import { describe, it, expect } from 'vitest';
import {
  COMPETITIVE_MODES,
  STADIUM_ONLY_MAPS,
  OW2_MAPS_FALLBACK,
  competitiveMapsFromCatalog,
} from './ow2-maps.js';
import { FACEIT_MAP_IDS } from '../../server/faceit.js';

// Comparison key only — the two sources spell a handful of maps differently
// ("Watchpoint Gibraltar" vs "Watchpoint: Gibraltar", "Paraiso" vs "Paraíso",
// straight vs typographic apostrophes). That divergence is expected and
// documented at the top of server/faceit.js; what must NOT diverge is which
// maps exist and what mode each one is.
const key = (name) => String(name)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[‘’']/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '');

describe('OW2_MAPS_FALLBACK vs the server FACEIT map table', () => {
  const serverMaps = new Map(
    Object.values(FACEIT_MAP_IDS).map(m => [key(m.name), m.mode])
  );
  const fallbackMaps = new Map(OW2_MAPS_FALLBACK.map(m => [key(m.name), m.mode]));

  // This is the regression guard for the v2.1.3 producer report ("no neon
  // junction selection in match hub maps"): the Match Hub picker's hardcoded
  // pool had silently drifted from the server's, missing Neon Junction and
  // both Clash maps, so a producer could not add them by hand.
  it('covers every map the server can resolve from a FACEIT id', () => {
    const missing = [...serverMaps.keys()].filter(k => !fallbackMaps.has(k));
    expect(missing).toEqual([]);
  });

  it('invents no maps the server does not know', () => {
    const extra = [...fallbackMaps.keys()].filter(k => !serverMaps.has(k));
    expect(extra).toEqual([]);
  });

  it('agrees with the server on every map\'s mode', () => {
    const disagreements = [...fallbackMaps.entries()]
      .filter(([k, mode]) => serverMaps.get(k) !== mode)
      .map(([k, mode]) => `${k}: picker=${mode} server=${serverMaps.get(k)}`);
    expect(disagreements).toEqual([]);
  });

  it('uses only modes the picker knows how to group', () => {
    for (const m of OW2_MAPS_FALLBACK) expect(COMPETITIVE_MODES).toContain(m.mode);
  });

  it('lists Neon Junction and both Clash maps (the reported gap)', () => {
    const names = OW2_MAPS_FALLBACK.map(m => m.name);
    expect(names).toContain('Neon Junction');
    expect(names).toContain('Hanaoka');
    expect(names).toContain('Throne of Anubis');
  });
});

describe('competitiveMapsFromCatalog', () => {
  const catalog = [
    { name: 'Busan', gamemodes: ['control'] },
    { name: 'Gogadoro', gamemodes: ['control'] },          // Stadium-only
    { name: 'Neon Junction', gamemodes: ['hybrid'] },
    { name: 'Hanaoka', gamemodes: ['clash'] },
    { name: 'Kanezaka', gamemodes: ['deathmatch', 'team-deathmatch'] }, // arcade
    { name: 'Colosseo', gamemodes: ['push'] },
    { name: 'Practice Range', gamemodes: ['practice-range'] },
    { name: 'Busan', gamemodes: ['control'] },             // duplicate entry
  ];

  it('keeps the competitive maps and drops arcade/legacy modes', () => {
    const names = competitiveMapsFromCatalog(catalog).map(m => m.name);
    expect(names).toContain('Busan');
    expect(names).toContain('Neon Junction');
    expect(names).toContain('Hanaoka');
    expect(names).toContain('Colosseo');
    expect(names).not.toContain('Kanezaka');
    expect(names).not.toContain('Practice Range');
  });

  it('drops Stadium-only maps, which the catalog cannot flag itself', () => {
    const names = competitiveMapsFromCatalog(catalog).map(m => m.name);
    expect(names).not.toContain('Gogadoro');
    for (const stadium of STADIUM_ONLY_MAPS) expect(names).not.toContain(stadium);
  });

  it('de-duplicates repeated catalog entries', () => {
    const names = competitiveMapsFromCatalog(catalog).map(m => m.name);
    expect(names.filter(n => n === 'Busan')).toHaveLength(1);
  });

  it('groups output in COMPETITIVE_MODES order so the picker renders stably', () => {
    const modes = competitiveMapsFromCatalog(catalog).map(m => m.mode);
    const firstSeen = [...new Set(modes)];
    const expected = COMPETITIVE_MODES.filter(m => firstSeen.includes(m));
    expect(firstSeen).toEqual(expected);
  });

  // The caller falls back to OW2_MAPS_FALLBACK on null — an empty picker
  // would be strictly worse than a slightly stale one.
  it('returns null for an empty or unusable catalog', () => {
    expect(competitiveMapsFromCatalog([])).toBeNull();
    expect(competitiveMapsFromCatalog(null)).toBeNull();
    expect(competitiveMapsFromCatalog([{ name: 'Kanezaka', gamemodes: ['deathmatch'] }])).toBeNull();
  });
});

// Adding maps to the picker is only half the job: a map a producer can select
// but that has no music/flythrough definition silently plays nothing on air.
// Neon Junction and Throne of Anubis were in exactly that state — unreachable
// from the picker, so the gap never showed. Pin it for the next new map.
describe('every competitive map is wired end to end', () => {
  const key = (name) => String(name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '');

  const displayNames = (source) =>
    [...source.matchAll(/display:\s*(?:'([^']+)'|"([^"]+)")/g)].map(m => m[1] || m[2]);

  it.each(['map-music.js', 'flythroughs.js'])('%s defines every map the picker offers', async (file) => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const defined = new Set(displayNames(readFileSync(join(repoRoot, 'server', file), 'utf8')).map(key));
    const missing = OW2_MAPS_FALLBACK.map(m => m.name).filter(n => !defined.has(key(n)));
    expect(missing).toEqual([]);
  });
});
