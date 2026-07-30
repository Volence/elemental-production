import { describe, it, expect } from 'vitest';
import { pinwheelSVG } from './pinwheel.js';
globalThis.pinwheelSVG = pinwheelSVG;
import { banTile, teamPlate, safeImg, eventHeader, mapPips, topFrame } from './components-v2.js';

describe('banTile', () => {
  it('renders portrait via provided src with slash overlay and 56px default', () => {
    const html = banTile({ portrait: 'http://localhost:3001/cache/x.png', heroName: 'Genji', teamColor: '#f00' });
    expect(html).toContain('v2-ban-tile');
    expect(html).toContain('x.png');
    expect(html).toContain('Genji');
  });
  it('renders an empty placeholder when no hero', () => {
    const html = banTile({ portrait: '', heroName: '', teamColor: '#f00' });
    expect(html).toContain('v2-ban-tile');
    expect(html).not.toContain('<img');
  });
  it('includes the slash overlay div', () => {
    const html = banTile({ portrait: 'http://localhost:3001/cache/x.png', heroName: 'Genji', teamColor: '#f00' });
    expect(html).toContain('v2-ban-slash');
  });
});

describe('teamPlate', () => {
  it('renders logo, name, score with team color wash side', () => {
    const html = teamPlate({ side: 'left', name: 'ELMT FIRE', logo: 'l.png', score: 2, color: '#f00' });
    expect(html).toContain('ELMT FIRE');
    expect(html).toContain('v2-wash-left');
    expect(html).toContain('>2<');
  });
  it('escapes team names (no HTML injection from FACEIT names)', () => {
    const html = teamPlate({ side: 'left', name: '<img onerror=x>', logo: '', score: 0, color: '#f00' });
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&lt;img onerror');
  });
  it('renders a score of 0 (null-guard should not blank it out)', () => {
    const html = teamPlate({ side: 'left', name: 'ELMT FIRE', logo: '', score: 0, color: '#f00' });
    expect(html).toContain('>0<');
  });
  it('renders petal linework svg when linework: true is passed', () => {
    const html = teamPlate({ side: 'right', name: 'ELMT WATER', logo: '', score: 1, color: '#00f', linework: true });
    expect(html).toContain('v2-plate-linework');
    expect(html).toContain('<svg');
  });
  it('omits linework svg by default', () => {
    const html = teamPlate({ side: 'right', name: 'ELMT WATER', logo: '', score: 1, color: '#00f' });
    expect(html).not.toContain('<svg');
  });
});

describe('safeImg', () => {
  it('routes an external URL through the local proxy', () => {
    const html = safeImg('https://cdn.example.com/logo.png', { alt: 'Team logo' });
    expect(html).toContain('<img');
    expect(html).toContain('http://localhost:3001/api/proxy-image?url=');
    expect(html).toContain(encodeURIComponent('https://cdn.example.com/logo.png'));
    expect(html).toContain('alt="Team logo"');
  });
  it('passes a localhost/cache URL through untouched (proxyImg localhost guard)', () => {
    const html = safeImg('http://localhost:3001/cache/x.png', {});
    expect(html).toContain('src="http://localhost:3001/cache/x.png"');
    expect(html).not.toContain('/api/proxy-image?url=');
  });
});

describe('eventHeader', () => {
  it('renders event name with gradient underline', () => {
    const html = eventHeader({ eventName: 'FACEIT S8 <b>' });
    expect(html).toContain('v2-underline');
    expect(html).toContain('FACEIT S8 &lt;b&gt;');
  });
});

describe('mapPips', () => {
  const maps = [
    { name: 'Busan', status: 'completed', winner: 'team1' },
    { name: "King's Row", status: 'current', winner: null },
  ];
  it('renders one pip per map padded to bestOf, winner-colored / live / dark', () => {
    const html = mapPips({ maps, bestOf: 3, team1Color: '#123456', team2Color: '#654321' });
    expect((html.match(/v2-pip/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(html).toContain('#123456');       // winner fill
    expect(html).toContain('v2-pip-live');   // white-glow live pip
    expect(html).toContain('v2-pip-empty');  // unplayed pad
  });
  it('shows 2-3 letter abbreviations', () => {
    const html = mapPips({ maps, bestOf: 2, team1Color: '#111111', team2Color: '#222222' });
    expect(html).toContain('BUS');
    expect(html).toContain('KIN');
  });
});

describe('topFrame', () => {
  const opts = {
    team1: { name: 'FIRE', logo: 'a.png', score: 2, color: '#f00' },
    team2: { name: 'ICE', logo: 'b.png', score: 1, color: '#00f' },
    eventName: 'ELMT League', bestOf: 5,
    maps: [{ name: 'Busan', status: 'current', winner: null }],
    hubText: '2·1',
  };
  it('composes plates, medallion hub, event pill and pips', () => {
    const html = topFrame(opts);
    expect(html).toContain('FIRE');
    expect(html).toContain('ICE');
    expect(html).toContain('2·1');            // pinwheel hub
    expect(html).toContain('ELMT League');
    expect(html).toContain('v2-pip');
  });
  it('renders ban wings when given, hides when null', () => {
    const wings = { team1: [{ portrait: 'x.png', heroName: 'Genji' }], team2: [] };
    expect(topFrame({ ...opts, banWings: wings })).toContain('v2-ban-tile');
    expect(topFrame({ ...opts, banWings: null })).not.toContain('v2-ban-tile');
  });
  it('swapSides flips which team renders left', () => {
    const html = topFrame({ ...opts, swapSides: true });
    expect(html.indexOf('ICE')).toBeLessThan(html.indexOf('FIRE'));
  });
});

describe('banTile size option', () => {
  it('accepts a size override for the 84px map-board tiles', () => {
    const html = banTile({ portrait: 'x.png', heroName: 'Ana', teamColor: '#f00', size: 84 });
    expect(html).toContain('84px');
  });
});
