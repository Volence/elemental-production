import { describe, it, expect } from 'vitest';
import { pinwheelSVG } from './pinwheel.js';
globalThis.pinwheelSVG = pinwheelSVG;
import { banTile, teamPlate, safeImg, eventHeader, mapPips, topFrame, camFrame, banArtTile, banArtFrame, banFocusFromColumns } from './components-v2.js';

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
  it('hideName keeps the portrait + slash but drops the name plate (map board tiles)', () => {
    const html = banTile({ portrait: 'http://localhost:3001/cache/x.png', heroName: 'Genji', teamColor: '#f00', size: 56, hideName: true });
    expect(html).toContain('<img'); // portrait still renders
    expect(html).toContain('v2-ban-slash'); // slash still renders
    expect(html).not.toContain('v2-ban-tile-name'); // no caption plate
    expect(html).toContain('alt="Genji"'); // heroName still drives alt text
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
  it('winner pip text uses _textOnColor contrast against the winner fill', () => {
    const html = mapPips({
      maps: [{ name: 'Ilios', status: 'completed', winner: 'team1' }],
      bestOf: 1, team1Color: '#FFD700', team2Color: '#22c55e',
    });
    expect(html).toContain('background:#FFD700');
    expect(html).toContain('color:#0a0c11');
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
  it('bgFallback paints the dark plate BEHIND a possibly-404 render img', () => {
    const html = banArtTile({ renderUrl: 'http://localhost:3001/hero-renders/newhero.webp', portrait: '', heroName: 'Newhero', teamColor: '#f00', bgFallback: true });
    expect(html).toContain('v2-ban-art-fallback-bg');
    expect(html).toContain('v2-ban-art-render-img');
    // plate must come FIRST so the img (hidden by safeImg's onerror on 404)
    // reveals it rather than covering a hole
    expect(html.indexOf('v2-ban-art-fallback-bg')).toBeLessThan(html.indexOf('v2-ban-art-render-img'));
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
  it('reveal scale (no size) emits the full 5px slash-core half-width', () => {
    const html = banArtTile({ renderUrl: 'x.png', portrait: '', heroName: 'Ana', teamColor: '#f00' });
    expect(html).toContain('--slash-core:5px');
  });
  it('deck scale (size set) emits the thinner 2px slash-core half-width', () => {
    const html = banArtTile({ renderUrl: 'x.png', portrait: '', heroName: 'Ana', teamColor: '#f00', size: 108 });
    expect(html).toContain('--slash-core:2px');
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

// ── Subject-aware ban-art framing ───────────────────────────────────────────
// Regression cover for the v2.1.3 producer report "some heroes are offset in
// their frame, especially dmon and mauga". The numbers below are the real
// measured values: hero-bans' reveal panel is ~710x665 at 1920x1080, and the
// image dimensions / alpha-mass profiles are what data/hero-renders/ actually
// contains (measured off the alpha channel of the shipped pack).
describe('banArtFrame', () => {
  const PANEL = { tileW: 710, tileH: 665 };
  // dmon.webp 2500x1690 — the widest canvas in the pack, and the one whose
  // subject sits furthest off-centre (mass centroid 0.652, i.e. the mech is
  // well right of canvas centre because the sword sweeps out to the left).
  const DMON = { imgW: 2500, imgH: 1690, cx: 0.652, x5: 0.320, x95: 0.926 };
  // mizuki.webp 1850x2350 — portrait-relative to the panel, the common case.
  const MIZUKI = { imgW: 1850, imgH: 2350, cx: 0.397, x5: 0.150, x95: 0.641 };

  it('centres the subject, not the canvas (the reported defect)', () => {
    const f = banArtFrame({ ...PANEL, ...DMON });
    const subjectCentre = f.left + DMON.cx * f.width;
    // Old behaviour put the canvas centre on the tile centre, leaving the
    // subject ~15% of the image width to the right. Allow a small residual:
    // the no-blank-gutter clamp can hold the image back a few px.
    expect(Math.abs(subjectCentre - PANEL.tileW / 2)).toBeLessThan(30);
  });

  it('keeps the subject core fully inside the tile', () => {
    for (const hero of [DMON, MIZUKI]) {
      const f = banArtFrame({ ...PANEL, ...hero });
      expect(f.left + hero.x5 * f.width).toBeGreaterThanOrEqual(-0.5);
      expect(f.left + hero.x95 * f.width).toBeLessThanOrEqual(PANEL.tileW + 0.5);
    }
  });

  it('never crops vertically — a hero\'s head is always in frame', () => {
    for (const hero of [DMON, MIZUKI]) {
      const f = banArtFrame({ ...PANEL, ...hero });
      expect(f.height).toBeLessThanOrEqual(PANEL.tileH + 0.5);
      expect(f.top).toBeGreaterThanOrEqual(-0.5);
    }
  });

  it('stays bottom-anchored, as the CSS it replaces was', () => {
    const f = banArtFrame({ ...PANEL, ...MIZUKI });
    expect(f.top + f.height).toBeCloseTo(PANEL.tileH, 5);
  });

  it('never renders a hero smaller than plain object-fit:contain would', () => {
    for (const hero of [DMON, MIZUKI]) {
      const contain = Math.min(PANEL.tileW / hero.imgW, PANEL.tileH / hero.imgH);
      const f = banArtFrame({ ...PANEL, ...hero });
      expect(f.width / hero.imgW).toBeGreaterThanOrEqual(contain - 1e-9);
    }
  });

  it('leaves portrait-relative renders at exactly the contain scale', () => {
    // Invariant 1: the scale-up is landscape-only, so 47 of the 54 renders in
    // the pack keep the size they have today and only re-centre.
    const f = banArtFrame({ ...PANEL, ...MIZUKI });
    expect(f.height).toBeCloseTo(PANEL.tileH, 5);
    expect(f.width).toBeCloseTo(MIZUKI.imgW * (PANEL.tileH / MIZUKI.imgH), 5);
  });

  it('scales a landscape render up to fill the tile height', () => {
    const f = banArtFrame({ ...PANEL, ...DMON });
    const contain = Math.min(PANEL.tileW / DMON.imgW, PANEL.tileH / DMON.imgH);
    expect(f.width / DMON.imgW).toBeGreaterThan(contain);
    expect(f.height).toBeCloseTo(PANEL.tileH, 5);
  });

  it('opens no blank gutter when the image is wide enough to cover the tile', () => {
    const f = banArtFrame({ ...PANEL, ...DMON });
    expect(f.left).toBeLessThanOrEqual(0);
    expect(f.left + f.width).toBeGreaterThanOrEqual(PANEL.tileW);
  });

  it('falls back to centred framing when no profile is supplied', () => {
    const f = banArtFrame({ ...PANEL, imgW: 1000, imgH: 1000 });
    expect(f.left + f.width / 2).toBeCloseTo(PANEL.tileW / 2, 5);
  });

  it('survives a degenerate profile without dividing by zero', () => {
    const f = banArtFrame({ ...PANEL, imgW: 1000, imgH: 1000, cx: 0.5, x5: 0.5, x95: 0.5 });
    expect(Number.isFinite(f.width)).toBe(true);
    expect(Number.isFinite(f.left)).toBe(true);
  });

  it('returns null for a tile or image with no size (nothing to frame)', () => {
    expect(banArtFrame({ tileW: 0, tileH: 665, imgW: 100, imgH: 100 })).toBeNull();
    expect(banArtFrame({ tileW: 710, tileH: 665, imgW: 0, imgH: 100 })).toBeNull();
  });

  it('also works at map-intro deck-tile scale', () => {
    // .mi-ban-tile is 140px wide with aspect-ratio 1/1.12 (map-intro.html:154).
    const DECK = { tileW: 140, tileH: 140 * 1.12 };
    const f = banArtFrame({ ...DECK, ...DMON });
    expect(f.left + DMON.x5 * f.width).toBeGreaterThanOrEqual(-0.5);
    expect(f.left + DMON.x95 * f.width).toBeLessThanOrEqual(DECK.tileW + 0.5);
    expect(f.height).toBeLessThanOrEqual(DECK.tileH + 0.5);
    expect(f.top + f.height).toBeCloseTo(DECK.tileH, 5);
  });
});

// banFocusFromColumns is the pure half of the alpha measurement — the part
// that decides WHERE a hero is. Split out of _measureBanFocus specifically so
// it can be tested without a canvas, after a review caught the bug pinned by
// the first two cases below.
describe('banFocusFromColumns', () => {
  const uniform = (n) => new Array(n).fill(1);

  it('puts a uniform profile at dead centre', () => {
    // A render with no alpha at all (a JPEG drop-in — .jpg is a supported
    // hero-render extension) profiles as uniform. It must measure as centred,
    // so framing leaves it exactly where object-fit:contain had it.
    // The first implementation returned 0.459 here: it accumulated the
    // centroid inside the quantile loop and broke out at the 95% column, so
    // the right-hand 5% of ink was missing from the numerator while the
    // left-hand 5% was still in it — a systematic leftward bias.
    expect(banFocusFromColumns(uniform(96), 96).cx).toBeCloseTo(0.5, 6);
  });

  it('is not biased by mass beyond the 95% quantile', () => {
    // Body block plus a thin right-hand tail — the "hero holding a long prop"
    // shape this whole feature exists for. cx must be the TRUE centroid.
    const cols = new Array(96).fill(0);
    for (let i = 20; i < 60; i++) cols[i] = 10;
    for (let i = 60; i < 96; i++) cols[i] = 1;
    let num = 0, den = 0;
    cols.forEach((c, i) => { num += c * (i + 0.5); den += c; });
    expect(banFocusFromColumns(cols, 96).cx).toBeCloseTo(num / den / 96, 6);
  });

  it('mirrors: a left-heavy profile is the reflection of a right-heavy one', () => {
    const right = new Array(96).fill(0);
    for (let i = 60; i < 96; i++) right[i] = 5;
    for (let i = 0; i < 60; i++) right[i] = 1;
    const left = [...right].reverse();
    const a = banFocusFromColumns(right, 96);
    const b = banFocusFromColumns(left, 96);
    expect(a.cx).toBeCloseTo(1 - b.cx, 6);
    expect(a.x5).toBeCloseTo(1 - b.x95, 1);
  });

  it('brackets the subject core between the 5% and 95% mass quantiles', () => {
    const cols = new Array(100).fill(0);
    for (let i = 40; i < 60; i++) cols[i] = 1; // all mass in the middle fifth
    const f = banFocusFromColumns(cols, 100);
    expect(f.cx).toBeCloseTo(0.5, 2);
    expect(f.x5).toBeGreaterThanOrEqual(0.39);
    expect(f.x95).toBeLessThanOrEqual(0.61);
    expect(f.x5).toBeLessThan(f.x95);
  });

  it('returns null when there is no ink at all', () => {
    expect(banFocusFromColumns(new Array(96).fill(0), 96)).toBeNull();
    expect(banFocusFromColumns([], 0)).toBeNull();
  });

  it('always reports x5/x95 inside [0, 1]', () => {
    for (const cols of [uniform(8), [0, 0, 5, 0, 0], [1, 0, 0, 0, 9]]) {
      const f = banFocusFromColumns(cols, cols.length);
      expect(f.x5).toBeGreaterThanOrEqual(0);
      expect(f.x95).toBeLessThanOrEqual(1);
      expect(f.cx).toBeGreaterThanOrEqual(0);
      expect(f.cx).toBeLessThanOrEqual(1);
    }
  });
});

describe('banArtTile render img', () => {
  it('carries the focus hook so framing runs once the render loads', () => {
    const html = banArtTile({ renderUrl: 'http://localhost:3001/hero-renders/dmon.webp', heroName: 'D.Mon', teamColor: '#f00' });
    expect(html).toContain('v2-ban-art-render-img');
    expect(html).toContain('applyBanArtFocus');
  });
});
