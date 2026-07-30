import { describe, it, expect } from 'vitest';
import { banTile, teamPlate, safeImg } from './components-v2.js';

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
