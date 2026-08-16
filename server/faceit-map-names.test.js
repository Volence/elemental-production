// FACEIT map-name / map-id resolution.
//
// Regression cover for the producer report on the S9 South America Master
// Central playoffs Bo7 (ELMT x Team Missing vs Agave Garfo): map 6 was
// Antarctic Peninsula, picked MID-SERIES after map 5. It reached state.maps
// fine — FACEIT's voting.map.pick carried all six picks — but FACEIT calls that
// map "Antarctica" while every other name surface in this app (the /api/maps
// OverFast catalog, Settings' Season Map Pool, data/map-images filenames,
// map-music, flythroughs) calls it "Antarctic Peninsula". The Map Pool board
// matches its cards to state.maps by normalized NAME, so the card found no
// series entry and, with Ilios already holding the Control column, drew as an
// out-of-contention sibling: fully grayed, no badge.
//
// Fixture ids/names below are verbatim from the live Data API for that match
// (13-entity reduced veto pool) and from the full 32-map entity list.

import { describe, it, expect } from 'vitest';
import { canonicalMapName, resolveMapId, buildPickedMaps, FACEIT_MAP_IDS } from './faceit.js';
import { normalizeMapName } from './map-image-resolver.js';

// The producers' Bo7, exactly as FACEIT returned it: a REDUCED 13-map veto pool
// and six picks, the sixth made mid-series.
const ENTITY = (id, name, mode) => ({
  game_map_id: id,
  name,
  filters: { voting_tags: [`cat:${mode}`, `tcat:${mode}`] },
  image_lg: `${name}-lg.jpg`,
  image_sm: `${name}-sm.jpg`,
});
const BO7_VOTING = {
  entities: [
    ENTITY('0x080000000000066D', 'Ilios', 'Control'),
    ENTITY('0x0800000000000CF2', 'Antarctica', 'Control'),
    ENTITY('0x08000000000000D4', "King's Row", 'Hybrid'),
    ENTITY('0x0800000000000827', 'Circuit Royal', 'Escort'),
    ENTITY('0x0800000000000EB2', 'Runasapi', 'Push'),
    ENTITY('0x0800000000000D3E', 'Suravasa', 'Flashpoint'),
  ],
  pick: [
    '0x080000000000066D', // Ilios
    '0x08000000000000D4', // King's Row
    '0x0800000000000827', // Circuit Royal
    '0x0800000000000EB2', // Runasapi
    '0x0800000000000D3E', // Suravasa
    '0x0800000000000CF2', // Antarctica  <- picked mid-series, after map 5
  ],
};

describe('canonicalMapName', () => {
  it('folds FACEIT "Antarctica" to the catalog name the rest of the app uses', () => {
    expect(canonicalMapName('Antarctica')).toBe('Antarctic Peninsula');
  });

  it('is insensitive to FACEIT punctuation/casing drift on the alias', () => {
    expect(canonicalMapName('antarctica')).toBe('Antarctic Peninsula');
    expect(canonicalMapName('ANTARCTICA')).toBe('Antarctic Peninsula');
  });

  it('leaves "Ecopoint: Antarctica" alone — a different map, not the alias', () => {
    expect(canonicalMapName('Ecopoint: Antarctica')).toBe('Ecopoint: Antarctica');
  });

  it('passes through every other name untouched (they already fold clean)', () => {
    for (const n of ['Ilios', "King's Row", 'Watchpoint Gibraltar', 'Paraiso', 'Esperança', 'Neon Junction']) {
      expect(canonicalMapName(n)).toBe(n);
    }
  });

  it('is null/empty safe', () => {
    expect(canonicalMapName('')).toBe('');
    expect(canonicalMapName(null)).toBe(null);
    expect(canonicalMapName(undefined)).toBe(undefined);
  });
});

describe('resolveMapId', () => {
  it('prefers this match\'s own voting entities over the static table', () => {
    const entities = [{ id: '0x080000000000066D', name: 'Ilios', mode: 'Control', imageLg: 'x.jpg' }];
    expect(resolveMapId('0x080000000000066D', entities)).toBe(entities[0]);
  });

  it('resolves a pick id that is MISSING from the reduced veto pool', () => {
    // Numbani was never in this match's entity list, but it is a real map.
    const r = resolveMapId('0x08000000000001D4', BO7_VOTING.entities.map(e => ({ id: e.game_map_id })));
    expect(r.name).toBe('Numbani');
    expect(r.mode).toBe('Hybrid');
  });

  it('returns the CANONICAL name from the static table, not FACEIT\'s', () => {
    expect(resolveMapId('0x0800000000000CF2', []).name).toBe('Antarctic Peninsula');
    expect(FACEIT_MAP_IDS['0x0800000000000CF2'].name).toBe('Antarctic Peninsula');
  });

  it('matches ids case-insensitively', () => {
    expect(resolveMapId('0x0800000000000cf2', []).name).toBe('Antarctic Peninsula');
  });

  it('never surfaces a raw hex id as a display name for an unknown map', () => {
    const r = resolveMapId('0x0800000000009999', []);
    expect(r.name).not.toBe('0x0800000000009999');
    expect(r.name).toBe('Map 9999');     // short, obviously a placeholder
    expect(r.mode).toBe('Unknown');
    expect(r.id).toBe('0x0800000000009999'); // full id retained for tracing
  });

  it('is defined even for a null id', () => {
    expect(resolveMapId(null, []).name).toBeTruthy();
  });
});

describe('buildPickedMaps (the producers\' Bo7 payload)', () => {
  const { mapPool, pickedMaps } = buildPickedMaps(BO7_VOTING);

  it('reaches state with all six picks, the mid-series one included', () => {
    expect(pickedMaps).toHaveLength(6);
    expect(pickedMaps.map(m => m.name)).toEqual([
      'Ilios', "King's Row", 'Circuit Royal', 'Runasapi', 'Suravasa', 'Antarctic Peninsula',
    ]);
  });

  it('gives the late pick a name the Map Pool board can cross-reference', () => {
    // seriesIndex() in overlays/map-pool.html compares normalized names; this
    // exact comparison used to be 'antarctica' vs 'antarctic-peninsula' -> -1.
    const late = pickedMaps[5];
    expect(normalizeMapName(late.name)).toBe(normalizeMapName('Antarctic Peninsula'));
  });

  it('canonicalizes the POOL too, so the map-pool entity and the pick agree', () => {
    expect(mapPool.map(m => m.name)).toContain('Antarctic Peninsula');
    expect(mapPool.map(m => m.name)).not.toContain('Antarctica');
  });

  it('keeps mode and image fields on picks resolved from entities', () => {
    expect(pickedMaps[5].mode).toBe('Control');
    expect(pickedMaps[5].imageLg).toBe('Antarctica-lg.jpg');
  });

  it('handles an empty / absent voting payload', () => {
    expect(buildPickedMaps({})).toEqual({ mapPool: [], pickedMaps: [] });
    expect(buildPickedMaps(null)).toEqual({ mapPool: [], pickedMaps: [] });
  });

  it('resolves a pick whose id is absent from the reduced entity list', () => {
    const { pickedMaps: p } = buildPickedMaps({
      entities: BO7_VOTING.entities,
      pick: [...BO7_VOTING.pick, '0x08000000000001D4'], // a 7th, off-pool pick
    });
    expect(p).toHaveLength(7);
    expect(p[6].name).toBe('Numbani');
    expect(p[6].mode).toBe('Hybrid');
  });
});

describe('the static id table agrees with the catalog vocabulary', () => {
  it('holds the full 32-map OW2 pool', () => {
    expect(Object.keys(FACEIT_MAP_IDS)).toHaveLength(32);
  });

  it('stores no un-canonicalized FACEIT name', () => {
    for (const entry of Object.values(FACEIT_MAP_IDS)) {
      expect(canonicalMapName(entry.name)).toBe(entry.name);
    }
  });
});
