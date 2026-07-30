import { describe, it, expect } from 'vitest';
import { pinwheelSVG } from './pinwheel.js';
globalThis.pinwheelSVG = pinwheelSVG;
import { banTile, teamPlate, safeImg, eventHeader, mapPips, topFrame, camFrame, banArtTile } from './components-v2.js';

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
  it('truncates rather than overflows when maps.length exceeds bestOf (stale data)', () => {
    const staleMaps = [
      { name: 'Busan', status: 'completed', winner: 'team1' },
      { name: 'Dorado', status: 'completed', winner: 'team2' },
      { name: "King's Row", status: 'current', winner: null },
    ];
    const html = mapPips({ maps: staleMaps, bestOf: 2, team1Color: '#111111', team2Color: '#222222' });
    const pipCount = (html.match(/class="v2-pip(?:"| )/g) || []).length;
    expect(pipCount).toBe(2);
    expect(html).not.toContain('v2-pip-empty');
    expect(html).not.toContain('KIN'); // 3rd map truncated, not rendered
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
  it('accepts an explicit currentMapName, overriding the internal fallback', () => {
    const html = topFrame({
      ...opts,
      maps: [{ name: 'Busan', status: 'completed', winner: 'team1' }],
      currentMapName: 'Nepal',
    });
    expect(html).toContain('Nepal');
  });
  it('falls back to the next upcoming map when nothing is current (no opts.currentMapName)', () => {
    const html = topFrame({
      ...opts,
      maps: [
        { name: 'Busan', status: 'completed', winner: 'team1' },
        { name: 'Dorado', status: 'upcoming' },
      ],
    });
    expect(html).toContain('Dorado');
  });
  it('falls back to the LAST map name when every map is completed (findCurrentMap semantics, not blank)', () => {
    const html = topFrame({
      ...opts,
      maps: [
        { name: 'Busan', status: 'completed', winner: 'team1' },
        { name: 'Ilios', status: 'completed', winner: 'team2' },
      ],
    });
    expect(html).toContain('Ilios');
    expect(html).not.toMatch(/v2-map-pill">\s*</);
  });
});

describe('camFrame', () => {
  it('positions the frame absolutely from the rect (inline, data-driven)', () => {
    const html = camFrame({ rect: { x: 330, y: 120, w: 580, h: 362 }, name: 'Desk Caster', accent: '#f00' });
    expect(html).toContain('left:330px');
    expect(html).toContain('top:120px');
    expect(html).toContain('width:580px');
    expect(html).toContain('height:362px');
  });
  it('escapes the caster name', () => {
    const html = camFrame({ rect: { x: 0, y: 0, w: 100, h: 100 }, name: '<img onerror=x>' });
    expect(html).not.toContain('<img onerror');
    expect(html).toContain('&lt;img onerror');
  });
  it('has a transparent interior — no background is ever set on the frame', () => {
    const html = camFrame({ rect: { x: 0, y: 0, w: 100, h: 100 }, name: 'Caster' });
    expect(html).not.toContain('background');
  });
  it('includes the v2-underline base edge and a name pill', () => {
    const html = camFrame({ rect: { x: 0, y: 0, w: 100, h: 100 }, name: 'Caster' });
    expect(html).toContain('v2-underline');
    expect(html).toContain('v2-cam-pill');
  });
  it('omits the pill entirely when name is empty', () => {
    const html = camFrame({ rect: { x: 0, y: 0, w: 100, h: 100 }, name: '' });
    expect(html).not.toContain('v2-cam-pill');
  });
});

describe('banArtTile', () => {
  it('renders the render-image path when renderUrl is given', () => {
    const html = banArtTile({ renderUrl: 'http://localhost:3001/cache/genji.png', portrait: 'http://localhost:3001/cache/genji-p.png', heroName: 'Genji', teamColor: '#f00' });
    expect(html).toContain('v2-ban-art-render-img');
    expect(html).toContain('genji.png');
    expect(html).not.toContain('v2-ban-art-fallback-bg');
  });
  it('falls back to the portrait bust when no renderUrl', () => {
    const html = banArtTile({ renderUrl: null, portrait: 'http://localhost:3001/cache/genji-p.png', heroName: 'Genji', teamColor: '#f00' });
    expect(html).toContain('v2-ban-art-fallback-bg');
    expect(html).toContain('v2-ban-art-fallback-img');
    expect(html).toContain('genji-p.png');
  });
  it('escapes the hero name (alt text and name overlay)', () => {
    const html = banArtTile({ renderUrl: 'x.png', portrait: '', heroName: '<script>x</script>', teamColor: '#f00', nameOverlay: true });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('animated:false (default) renders a static slash with no animation', () => {
    const html = banArtTile({ renderUrl: 'x.png', portrait: '', heroName: 'Ana', teamColor: '#f00' });
    expect(html).toContain('v2-ban-art-slash');
    expect(html).not.toContain('animation:hbSlashSweep');
  });
  it('animated:true sets the FULL inline animation shorthand on the slash', () => {
    const html = banArtTile({ renderUrl: 'x.png', portrait: '', heroName: 'Ana', teamColor: '#f00', animated: true, delay: 0.15 });
    expect(html).toContain('animation:hbSlashSweep 0.5s ease-out 0.50s both');
  });
  it('nameOverlay renders the bottom name bar; omitted by default', () => {
    const withOverlay = banArtTile({ renderUrl: 'x.png', portrait: '', heroName: 'Ana', teamColor: '#f00', nameOverlay: true });
    expect(withOverlay).toContain('v2-ban-art-name');
    const without = banArtTile({ renderUrl: 'x.png', portrait: '', heroName: 'Ana', teamColor: '#f00' });
    expect(without).not.toContain('v2-ban-art-name');
  });
  it('deck size scales the fallback bust exactly (108 -> 64px, matching map-intro\'s old value)', () => {
    const html = banArtTile({ renderUrl: null, portrait: 'p.png', heroName: 'Ana', teamColor: '#f00', size: 108 });
    expect(html).toContain('width:64px;height:64px');
  });
  it('splices beforeSlashHtml/afterNameHtml in the DOM order hero-bans needs (art, wash, slash, chip)', () => {
    const html = banArtTile({
      renderUrl: 'x.png', portrait: '', heroName: 'Ana', teamColor: '#f00',
      beforeSlashHtml: '<div class="MARK-WASH"></div>',
      afterNameHtml: '<div class="MARK-CHIP"></div>',
    });
    const artIdx = html.indexOf('v2-ban-art"');
    const washIdx = html.indexOf('MARK-WASH');
    const slashIdx = html.indexOf('v2-ban-art-slash');
    const chipIdx = html.indexOf('MARK-CHIP');
    expect(artIdx).toBeLessThan(washIdx);
    expect(washIdx).toBeLessThan(slashIdx);
    expect(slashIdx).toBeLessThan(chipIdx);
  });
});

describe('topFrame color semantics under swapSides', () => {
  // Full 6-digit hex here (not the '#f00'/'#00f' shorthand used above) so
  // the asserted rgba(...) strings are exact and unambiguous.
  const optsFull = {
    team1: { name: 'FIRE', logo: 'a.png', score: 2, color: '#ff0000' },
    team2: { name: 'ICE', logo: 'b.png', score: 1, color: '#0000ff' },
    eventName: 'ELMT League', bestOf: 5,
    maps: [{ name: 'Busan', status: 'completed', winner: 'team1' }],
    hubText: '2·1',
  };
  it('left plate wash comes from the team now on the left (team2 under swap), right from team1', () => {
    const html = topFrame({ ...optsFull, swapSides: true });
    const idxBlue = html.indexOf('rgba(0,0,255');
    const idxRed = html.indexOf('rgba(255,0,0');
    expect(idxBlue).toBeGreaterThan(-1);
    expect(idxRed).toBeGreaterThan(-1);
    expect(idxBlue).toBeLessThan(idxRed);
  });
  it('mapPips keeps TRUE team colors regardless of swapSides (never screen-side-flipped)', () => {
    const html = topFrame({ ...optsFull, swapSides: true });
    // map winner is 'team1' -> its pip must stay team1's true color (#ff0000)
    // even though team1 is now rendering on the right.
    expect(html).toContain('background:#ff0000');
  });
  it('medallion petals keep TRUE team identity under swapSides (p-group = team1)', () => {
    const html = topFrame({ ...optsFull, swapSides: true });
    // pinwheelSVG's p-group strokes take color1 — which must be team1's true
    // color even when team1 renders on the right (matches gameplay-hud).
    expect((html.match(/stroke="#ff0000"/g) || []).length).toBe(4);
    expect((html.match(/stroke="#0000ff"/g) || []).length).toBe(4);
  });
});

describe('banTile size option', () => {
  it('accepts a size override for the 84px map-board tiles', () => {
    const html = banTile({ portrait: 'x.png', heroName: 'Ana', teamColor: '#f00', size: 84 });
    expect(html).toContain('84px');
  });
});
