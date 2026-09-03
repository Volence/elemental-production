import { describe, it, expect } from 'vitest';
import { banTargetIdx } from './ban-target.js';
import { getActiveBanIdx } from '../../server/faceit-merge.js';

const up = (name) => ({ name, status: 'upcoming', winner: null });
const cur = (name) => ({ name, status: 'current', winner: null });
const done = (name, winner = 'team1') => ({ name, status: 'completed', winner });

// Simulate the dashboard's toggleBan: write bans at the target index, then ask
// the server which map it resolves heroBans from. The two MUST agree, or the
// next maps PATCH (▶ Play) re-derives heroBans from an empty slot and the bans
// the producer just entered vanish on air (producer report, manual mode).
function writeThenResolve(maps, selected = -1) {
  const idx = banTargetIdx(maps, selected);
  const perMapBans = [];
  perMapBans[idx] = { team1Ban: { name: 'Ana' }, team2Ban: { name: 'Genji' } };
  return { idx, resolved: getActiveBanIdx(maps, -1, perMapBans) };
}

describe('banTargetIdx', () => {
  it('selected map wins', () => {
    expect(banTargetIdx([up('a'), up('b'), up('c')], 2)).toBe(2);
  });

  it('live map wins over everything but selection', () => {
    expect(banTargetIdx([done('a'), cur('b'), up('c')])).toBe(1);
  });

  it('fresh manual match (all upcoming): bans go on the FIRST map, not the last', () => {
    // Regression: the old rule returned maps.length - 1 here, so a Bo3 set up
    // before Play got its bans stored on map 3; pressing ▶ Play on map 1 then
    // derived heroBans from map 1's empty slot and wiped the on-air chips.
    expect(banTargetIdx([up('a'), up('b'), up('c')])).toBe(0);
  });

  it('between maps (no live map): bans go on the NEXT upcoming map', () => {
    // Manual-mode "Win" completes a map without promoting the next one, so
    // this is the normal state while the producer enters the next map's bans.
    expect(banTargetIdx([done('a'), up('b'), up('c')])).toBe(1);
  });

  it('all maps completed: bans belong to a map that is not added yet', () => {
    expect(banTargetIdx([done('a'), done('b')])).toBe(2);
  });

  it('no maps at all: index 0', () => {
    expect(banTargetIdx([])).toBe(0);
    expect(banTargetIdx(undefined)).toBe(0);
  });
});

describe('banTargetIdx agrees with the server resolver (getActiveBanIdx)', () => {
  const cases = {
    'all upcoming': [up('a'), up('b'), up('c')],
    'one live': [up('a'), cur('b'), up('c')],
    'between maps': [done('a'), up('b'), up('c')],
    'late in series': [done('a'), done('b', 'team2'), up('c'), up('d'), up('e')],
  };
  for (const [label, maps] of Object.entries(cases)) {
    it(label, () => {
      const { idx, resolved } = writeThenResolve(maps);
      expect(resolved).toBe(idx);
    });
  }

  it('still agrees once the targeted map is promoted to current (▶ Play)', () => {
    const maps = [done('a'), up('b'), up('c')];
    const idx = banTargetIdx(maps);
    const perMapBans = [];
    perMapBans[idx] = { team1Ban: { name: 'Ana' }, team2Ban: { name: 'Genji' } };
    const played = maps.map((m, i) => (i === idx ? { ...m, status: 'current' } : m));
    expect(getActiveBanIdx(played, -1, perMapBans)).toBe(idx);
  });
});
