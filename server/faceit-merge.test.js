import { describe, it, expect } from 'vitest';
import { buildTeamsUpdate, buildMapsUpdate } from './faceit-merge.js';

const faction1 = { id: 'f1', name: 'Alpha', avatar: 'a.png', roster: [] };
const faction2 = { id: 'f2', name: 'Beta', avatar: 'b.png', roster: [] };
const notOverridden = () => false;

describe('buildTeamsUpdate', () => {
  it('preserves existing team colors instead of hardcoding blue/red', () => {
    const currentTeams = { team1: { color: '#22c55e' }, team2: { color: '#a855f7' } };
    const u = buildTeamsUpdate({ currentTeams, faction1, faction2, score1: 1, score2: 0, isOverridden: notOverridden });
    expect(u.team1.color).toBe('#22c55e');
    expect(u.team2.color).toBe('#a855f7');
  });

  it('falls back to defaults when no color exists yet', () => {
    const u = buildTeamsUpdate({ currentTeams: {}, faction1, faction2, score1: 0, score2: 0, isOverridden: notOverridden });
    expect(u.team1.color).toBe('#3b82f6');
    expect(u.team2.color).toBe('#ef4444');
  });

  it('respects score overrides (omits score so setState merge keeps the manual value)', () => {
    const isOverridden = (p) => p === 'teams.team1.score';
    const u = buildTeamsUpdate({ currentTeams: {}, faction1, faction2, score1: 2, score2: 1, isOverridden });
    expect(u.team1.score).toBeUndefined();
    expect(u.team2.score).toBe(1);
  });

  it('respects name/logo overrides', () => {
    const isOverridden = (p) => p === 'teams.team2.name' || p === 'teams.team2.logo';
    const u = buildTeamsUpdate({ currentTeams: {}, faction1, faction2, score1: 0, score2: 0, isOverridden });
    expect(u.team1.name).toBe('Alpha');
    expect(u.team2.name).toBeUndefined();
    expect(u.team2.logo).toBeUndefined();
  });
});

describe('buildMapsUpdate', () => {
  const faceitMaps = [
    { name: 'Oasis', mode: 'Control', image: 'oasis-sm.jpg', status: 'completed', winner: 'team1', roundScore: '2-0' },
    { name: 'Dorado', mode: 'Escort', image: 'dorado-sm.jpg', status: 'current', winner: null, roundScore: null },
  ];
  const perMapBans = [{ picker: 'team1' }, { picker: 'team2' }];

  it('passes faceit maps through (with picker) when maps are not overridden', () => {
    const u = buildMapsUpdate({ currentMaps: [], faceitMaps, perMapBans, mapsOverridden: false });
    expect(u).toHaveLength(2);
    expect(u[0].picker).toBe('team1');
    expect(u[1].name).toBe('Dorado');
  });

  it('keeps producer map list when overridden, but still advances status/winner/roundScore', () => {
    const currentMaps = [
      { name: 'Oasis', mode: 'Control', image: 'local-oasis.png', status: 'current', winner: null, roundScore: null, picker: 'team1' },
      { name: 'Dorado', mode: 'Escort', image: 'local-dorado.png', status: 'upcoming', winner: null, roundScore: null },
      { name: 'Nepal', mode: 'Control', image: 'local-nepal.png', status: 'upcoming', winner: null, roundScore: null },
    ];
    const u = buildMapsUpdate({ currentMaps, faceitMaps, perMapBans, mapsOverridden: true });
    expect(u).toHaveLength(3);
    expect(u[0].image).toBe('local-oasis.png');
    expect(u[0].status).toBe('completed');
    expect(u[0].winner).toBe('team1');
    expect(u[0].roundScore).toBe('2-0');
    expect(u[2].name).toBe('Nepal');
  });
});
