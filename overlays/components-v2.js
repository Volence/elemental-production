// ELMT Broadcast Package v2 — shared HTML-string component builders.
// Classic script: ES5 only (var/function, no arrows/template literals/?./??)
// so it can be loaded directly by OBS browser sources without a bundler.
// CJS export guard at the bottom lets Node/Vitest import these for tests;
// harmless in the browser since `module` is undefined there.
//
// hexToAlpha/proxyImg: theme-helpers.js exports both from its CJS guard
// (same pattern as this file) and is also the source of truth used at
// runtime. This file does NOT `require('./theme-helpers.js')` to reach
// them, despite that being the originally-planned approach (option (a) in
// the task spec) — verified during implementation that it doesn't work in
// this repo: package.json has "type": "module", so Node's native
// require() of a same-shaped .js file evaluates it as real ESM (module/
// exports are not defined there), which short-circuits theme-helpers.js's
// own CJS guard and yields an empty exports object. `import()` doesn't
// have this problem (vite-node applies CJS interop on the import graph),
// but it's async and these builders must stay synchronous. Adding real
// `export` syntax to theme-helpers.js to dodge this would break it as a
// classic <script> in the browser. So: `_hexToAlpha`/`_proxyImg` below are
// deliberate, minimal, self-contained duplicates of theme-helpers.js's
// same-named functions — pure one-liners, low drift risk. Keep them in
// sync if theme-helpers.js's versions ever change.
function _hexToAlpha(hex, alpha) {
  if (!hex || hex.charAt(0) !== '#') return hex;
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

// Private copy of theme-helpers.js's textOnColor — same "can't require()
// theme-helpers.js from this classic script" reason as _hexToAlpha above.
// Foreground (near-black vs white) readable ON a team-color FILL. Uses WCAG
// relative luminance (not YIQ) to compute white's contrast against the
// fill, but biases TOWARD white rather than picking whichever of white/
// #0a0c11 wins outright — the broadcast convention for large bold type on a
// mid-tone fill. White is kept whenever it clears 3.5:1 (above WCAG's 3:1
// large-text floor, with headroom) and only yields to near-black on
// genuinely bright fills (yellow/green/pink). Keep in sync with
// theme-helpers.js's version (byte-identical body).
function _textOnColor(hex) {
  var m = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '#ffffff';
  var n = parseInt(m[1], 16);
  var lin = function (c) { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  var L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return (1.05 / (L + 0.05)) >= 3.5 ? '#ffffff' : '#0a0c11';
}

function _proxyImg(u) {
  if (!u || typeof u !== 'string') return '';
  if (/^https?:\/\//i.test(u) && u.indexOf('localhost') === -1 && u.indexOf('127.0.0.1') === -1) {
    return 'http://localhost:3001/api/proxy-image?url=' + encodeURIComponent(u);
  }
  return u;
}

// FACEIT-sourced strings (team names, hero names, logos) are untrusted —
// every text/attribute interpolation in this file must go through this.
function escapeHtml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Faint 3-path decorative petal linework (approved v7 mockup), absolutely
// positioned to sit behind the plate content. `position:relative` is set on
// the plate wrapper (inline, alongside --wash-color) so the absolute layer
// tracks the panel rather than an ancestor.
var PETAL_LINEWORK_SVG =
  '<svg class="v2-plate-linework" style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;" ' +
  'viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">' +
  '<path d="M0,80 C40,20 80,120 200,40" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1.5"/>' +
  '<path d="M0,50 C60,90 120,10 200,70" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="1.5"/>' +
  '<path d="M0,20 C50,60 150,40 200,10" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1.5"/>' +
  '</svg>';

// Returns an <img> tag string whose src is ALWAYS routed through the global
// proxyImg — makes unproxied external images structurally impossible in v2
// markup (audit shopping-list item 8). `attrs` values are escaped.
function safeImg(src, attrs) {
  attrs = attrs || {};
  var url = _proxyImg(src);
  var html = '<img src="' + escapeHtml(url) + '"';
  for (var key in attrs) {
    if (Object.prototype.hasOwnProperty.call(attrs, key)) {
      html += ' ' + escapeHtml(key) + '="' + escapeHtml(attrs[key]) + '"';
    }
  }
  // Dead source (e.g. a FACEIT avatar the CDN 400s on — real occurrence,
  // owner QA batch 3 release sweep) must not paint the browser's
  // broken-image glyph on stream. visibility (not display) so the box keeps
  // its layout slot and rows don't reflow.
  html += ' onerror="this.style.visibility=\'hidden\'"';
  html += '>';
  return html;
}

// Hero ban tile (mobile legibility floor: 56px, enforced by .v2-ban-tile in
// theme-v2.css). `opts.portrait` is normally ALREADY PROXIED by the caller —
// the server pre-proxies hero portraits at the data-fetch layer — so routing
// it through _proxyImg here is normally a pass-through, not a transform
// (_proxyImg is idempotent: localhost/relative /cache paths are untouched,
// only raw external URLs get rewritten). We still call it defensively so
// "unproxied external images are structurally impossible in v2 markup"
// (audit item 8) holds even if a caller ever forgets to pre-proxy.
function banTile(opts) {
  opts = opts || {};
  var portrait = _proxyImg(opts.portrait || '');
  var heroName = opts.heroName || '';
  var teamColor = opts.teamColor || '';
  var size = opts.size;
  // hideName keeps the portrait + slash but drops the name caption (heroName
  // still drives the portrait render + alt text). Used by the map board, whose
  // tiny per-column ban tiles read cleaner without name plates (owner: "we
  // don't need the names"). Default false — every other caller keeps its name.
  var hideName = !!opts.hideName;

  // Default tile is 56px via .v2-ban-tile in theme-v2.css (mobile legibility
  // floor). `opts.size` is an inline override for contexts that need a
  // different fixed size (e.g. the 84px map-board tiles) — scene CSS still
  // owns everything else about the tile's look.
  var sizeStyle = size ? ('width:' + size + 'px;height:' + size + 'px;') : '';
  // Non-default sizes scale the name plate's width too — theme-v2.css's
  // .v2-ban-tile-name max-width matches only the 56px default tile.
  var nameStyle = size ? (' style="font-size:' + Math.round(size * 0.2) + 'px;max-width:' + size + 'px;"') : '';

  var tileInner;
  if (heroName) {
    // Pure red (not --elmt-red, which is an hsl brand accent) is intentional
    // here — the ban slash reads as a universal "denied" signal, distinct
    // from team/brand color.
    tileInner =
      '<img class="v2-ban-tile-img" src="' + escapeHtml(portrait) + '" alt="' + escapeHtml(heroName) + '">' +
      // Hard px stops (not % gradient stops — those blur badly at small tile
      // sizes too, just less dramatically than at reveal scale) — same
      // 2px-core deck treatment as banArtTile's --slash-core:2px.
      '<div class="v2-ban-slash" style="position:absolute;inset:0;background-image:linear-gradient(45deg,' +
      'transparent calc(50% - 4px), rgba(0,0,0,0.9) calc(50% - 4px), rgba(0,0,0,0.9) calc(50% - 2px),' +
      '#ff2323 calc(50% - 2px), #ff2323 calc(50% + 2px), rgba(0,0,0,0.9) calc(50% + 2px),' +
      'rgba(0,0,0,0.9) calc(50% + 4px), transparent calc(50% + 4px));"></div>';
  } else {
    tileInner = '<div class="v2-ban-tile-empty"></div>';
  }

  var html =
    '<div class="v2-ban-tile" style="position:relative;border-color:' + escapeHtml(teamColor) + ';' + sizeStyle + '">' +
    tileInner +
    '</div>';

  if (heroName && !hideName) {
    html += '<div class="v2-ban-tile-name"' + nameStyle + '>' + escapeHtml(heroName) + '</div>';
  }

  return html;
}

// Team plate: logo + name + score, panel background with a team-color wash
// on the given side. `.v2-wash-<side>` is applied to the SAME element as
// `.v2-panel` (theme-v2.css: the wash uses background-image so it composites
// over the panel's background-color rather than replacing it).
function teamPlate(opts) {
  opts = opts || {};
  var side = opts.side === 'right' ? 'right' : 'left';
  var name = opts.name || '';
  var logo = opts.logo || '';
  var score = (opts.score === undefined || opts.score === null) ? '' : opts.score;
  var color = opts.color || '';
  var linework = !!opts.linework;

  var washColor = color ? _hexToAlpha(color, 0.38) : 'transparent';

  var html =
    '<div class="v2-panel v2-wash-' + side + '" style="position:relative;--wash-color:' + escapeHtml(washColor) + '">';

  if (linework) {
    html += PETAL_LINEWORK_SVG;
  }

  html += '<div class="v2-plate-content" style="position:relative;">';
  if (logo) {
    // v2-idle-breathe (Owner QA batch 2 Task 3b): safe here — the logo <img>
    // is a leaf several levels below its scene's entrance-animated wrapper
    // (teamPlate's own root carries no animation of its own), see theme-v2.css.
    html += safeImg(logo, { 'class': 'v2-plate-logo v2-idle-breathe', alt: name });
  }
  html += '<div class="v2-plate-name">' + escapeHtml(name) + '</div>';
  html += '<div class="v2-plate-score">' + escapeHtml(String(score)) + '</div>';
  html += '</div>';
  html += '</div>';

  return html;
}

// Cam cutout frame (Plan 3 Task 1): absolutely-positioned at `rect` (inline
// position/size — geometry is data-driven from cam-layout.js's CAM_LAYOUTS,
// NEVER scene CSS, so a producer's OBS scene-collection cam source and this
// frame always agree on where the window is). The interior is deliberately
// left fully TRANSPARENT — no background is ever set here — because the
// caster/interviewee browser source sits BEHIND this overlay in OBS and
// must show through the cutout; camFrame only draws the frame's chrome
// (hairline border, a gradient underline base edge, and a name pill that
// hangs off the bottom per the mockup). `accent` (optional) tints the
// border + pill border — a caster desk with per-seat accent colors, or ''
// for a neutral hairline.
//
// opts: { rect: {x,y,w,h}, name, accent }
function camFrame(opts) {
  opts = opts || {};
  var rect = opts.rect || {};
  var name = opts.name || '';
  var accent = opts.accent || '';

  var x = rect.x || 0;
  var y = rect.y || 0;
  var w = rect.w || 0;
  var h = rect.h || 0;

  var frameStyle = 'position:absolute;left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px;';
  if (accent) frameStyle += 'border-color:' + escapeHtml(accent) + ';';

  var pillStyle = accent ? ' style="border-color:' + escapeHtml(accent) + '"' : '';
  // No name -> no pill: an unnamed cam slot shows a clean frame instead of
  // an empty chrome box. All cam scenes inherit this; don't re-guard per scene.
  var pillHtml = name ? ('<div class="v2-cam-pill"' + pillStyle + '>' + escapeHtml(name) + '</div>') : '';

  return '<div class="v2-cam-frame" style="' + frameStyle + '">' +
    '<span class="v2-underline v2-cam-frame-underline"></span>' +
    pillHtml +
    '</div>';
}

// Hero ban ART tile (Plan 2 carry-over consolidation): render-vs-portrait
// art + a red "denied" slash + an optional name overlay. Extracted from
// hero-bans.html's panelHtml() and map-intro.html's banTileDeck(), which
// had independently grown near-identical render/fallback/slash markup —
// this is the single copy both scenes now call. Like banTile/teamPlate
// elsewhere in this file, banArtTile owns the WHOLE tile (including the
// bordered wrapper); the scene only contributes its own layout class via
// `wrapperClass` (how the tile sizes/positions within its parent) and,
// for hero-bans' reveal panels, its own slam-in entrance animation via
// `extraStyle` spliced onto the same element.
//
// opts: { renderUrl, portrait, heroName, teamColor, size, animated, delay,
//   nameOverlay, wrapperClass, extraStyle, beforeSlashHtml, afterNameHtml,
//   bgFallback }
//
// `beforeSlashHtml`/`afterNameHtml` (raw HTML, optional): extra layers the
// caller wants inside the SAME tile, spliced in around the shared art/slash/
// name anatomy so DOM paint order (later sibling paints on top, since
// nothing here sets z-index) matches exactly what the pre-extraction scenes
// had. hero-bans.html's reveal panels need MORE than banArtTile's own
// anatomy — a team-color wash gradient that must paint BETWEEN the art and
// the slash (beforeSlashHtml), and a BANNED chip + role/name foot bar that
// must paint LAST, on top of everything (afterNameHtml).
//
// `size` (px, optional): deck-tile bust scale. Omitted -> "reveal" scale
// (180px fallback bust, 4px ring, drop shadow — hero-bans.html's full-screen
// panels, which have no fixed tile size of their own). A number -> "deck"
// scale, bust = round(size * 64/108) so passing map-intro's actual 108px
// tile width reproduces its exact pre-existing 64px bust with a thinner
// 2px ring and no shadow.
//
// `animated` (default false): false emits a static, always-visible slash
// (map-intro's steady-state deck tiles — a card visible for the whole
// map-intro hold, not a reveal moment). true emits the sweep-in slash with
// the FULL inline `animation` shorthand — mirrors hero-bans.html's own
// documented render-output-animation rule: state-sync's replayAnimation
// stashes/restores style.animation, which reads '' if only the
// animation-delay longhand were set, so a bare delay would be dropped on
// OBS visibility replay and every slash would sweep simultaneously instead
// of staggered. `delay` (seconds) is the slam-in delay the CALLER already
// staggered per panel; the slash's own delay is delay + 0.35s (it starts
// once the slam-in has mostly settled) — same arithmetic hero-bans.html
// used inline before this extraction.
//
// `nameOverlay` (default false): renders heroName as a bottom bar directly
// on the tile (map-intro's look). hero-bans.html leaves this off and shows
// the name (plus a role chip) in its own foot bar OUTSIDE the art tile
// instead — the two scenes' name treatments differ enough (role chip vs.
// none, reveal-scale vs. deck-scale type) that forcing them into one
// shared visual would itself be a visual change, so only the on/off
// plumbing is shared here, not a single fixed look.
function banArtTile(opts) {
  opts = opts || {};
  var renderUrl = opts.renderUrl || null;
  var portrait = opts.portrait || '';
  var heroName = opts.heroName || '';
  var teamColor = opts.teamColor || '';
  var size = opts.size;
  var animated = !!opts.animated;
  var delay = opts.delay || 0;
  var nameOverlay = !!opts.nameOverlay;
  var wrapperClass = opts.wrapperClass || '';
  var extraStyle = opts.extraStyle || '';
  var beforeSlashHtml = opts.beforeSlashHtml || '';
  var afterNameHtml = opts.afterNameHtml || '';

  // Deck ratio (64/108) is map-intro's exact pre-existing bust/tile ratio —
  // baking it in here reproduces its old pixel values exactly rather than
  // approximating them.
  var bustSize = size ? Math.round(size * 64 / 108) : 180;
  var bustBorder = size ? 2 : 4;
  var bustStyle = 'width:' + bustSize + 'px;height:' + bustSize + 'px;border-width:' + bustBorder + 'px;' +
    (size ? 'box-shadow:none;' : '');

  // Reveal-scale tiles (no `size` — hero-bans' full-screen panels) get the
  // character-idle sway on the art LEAF (render img / fallback portrait img
  // — neither carries any animation of its own, so this is safe under the
  // idle-motion rules). Deck-scale tiles (map-intro bookends) stay still —
  // eight small swaying cards would read as noise, not life.
  var idleClass = size ? '' : ' v2-idle-sway';

  var artHtml;
  if (renderUrl) {
    // `bgFallback`: the caller GUESSED this render URL rather than reading it
    // from the hero catalog (hero-bans.html does this when OverFast has no
    // entry for a ban), so it may 404. safeImg's onerror only HIDES the img —
    // with nothing behind it the tile would be an empty hole — so paint the
    // styled dark plate underneath first and let the hidden img reveal it.
    // Callers with a catalog-provided URL pass nothing and get byte-identical
    // markup to before this flag existed.
    // onload -> subject-aware framing (see banArtFrame above). Inline because
    // this builder returns a STRING; the handler is defensive so a scene that
    // somehow loads components-v2.js without the runtime half still renders.
    artHtml = '<div class="v2-ban-art">' +
      (opts.bgFallback ? '<div class="v2-ban-art-fallback-bg"></div>' : '') +
      safeImg(renderUrl, {
        'class': 'v2-ban-art-render-img' + idleClass, alt: heroName,
        onload: 'if(window.applyBanArtFocus)window.applyBanArtFocus(this)'
      }) +
      '</div>';
  } else {
    var portraitHtml = portrait
      ? safeImg(portrait, { 'class': 'v2-ban-art-fallback-img' + idleClass, alt: heroName, style: bustStyle })
      : '';
    artHtml = '<div class="v2-ban-art">' +
      '<div class="v2-ban-art-fallback-bg"></div>' +
      '<div class="v2-ban-art-fallback-portrait">' + portraitHtml + '</div>' +
      '</div>';
  }

  // Slash core HALF-width (theme-v2.css --slash-core mirrors it either side
  // of center, so the actual core is 2x this): reveal-scale (no `size`) gets
  // a 5px half-width (10px core); deck-scale tiles get a thinner 2px
  // half-width (4px core) so the line doesn't overwhelm the small bust.
  var slashCoreStyle = '--slash-core:' + (size ? 2 : 5) + 'px;';
  var slashStyle = animated
    ? (slashCoreStyle + 'animation:hbSlashSweep 0.5s ease-out ' + (delay + 0.35).toFixed(2) + 's both')
    : slashCoreStyle;
  var slashHtml = '<div class="v2-ban-art-slash" style="' + slashStyle + '"></div>';

  var nameHtml = nameOverlay
    ? '<div class="v2-ban-art-name">' + escapeHtml(heroName) + '</div>'
    : '';

  var wrapperStyle = 'border-color:' + escapeHtml(_hexToAlpha(teamColor, 0.6)) + ';' + extraStyle;
  var cls = 'v2-ban-art-tile' + (wrapperClass ? ' ' + wrapperClass : '');

  return '<div class="' + cls + '" style="' + wrapperStyle + '">' +
    artHtml + beforeSlashHtml + slashHtml + nameHtml + afterNameHtml +
    '</div>';
}

/* ===========================================================================
   SUBJECT-AWARE BAN-ART FRAMING (producer report, v2.1.3: "some heroes are
   offset in their frame, especially dmon and mauga")
   ===========================================================================
   The pack's hero renders are official OW2 art with wildly different canvas
   aspects (ramattra 1561x3147 = 0.50, dmon 2500x1690 = 1.48) and, worse,
   subjects that are NOT centred on their own canvas: a prop pushes the
   character to one side. Measured alpha-mass centroids across the 53-render
   pack run from mercy 0.32 to dmon 0.65 (0.50 would be centred).

   Plain `object-fit:contain; object-position:bottom center` (still the CSS
   default in theme-v2.css, and the fallback if anything below fails) centres
   the CANVAS, so those subjects land off-centre in the tile. And for a
   canvas wider than the tile, contain fits the WIDTH — leaving zero
   horizontal slack — so `object-position` cannot correct it at all. That is
   exactly why dmon and mauga were the two the producer named: they are the
   two widest canvases in the pack.

   Fix: measure where the art's ink actually is (alpha mass profile, once per
   URL, off a 96px-wide offscreen raster) and size/position the <img>
   explicitly instead of leaning on object-fit.

   Two invariants keep this safe for live broadcast — see banArtFrame():
     1. The scale never goes BELOW contain, and never above "fills the tile
        height", so a hero is never smaller than before and is NEVER cropped
        vertically (no clipped heads, ever).
     2. Horizontal cropping is bounded by the subject's core mass box (the
        5%..95% mass quantiles), so only thin prop tails — a sword tip, a
        minigun barrel — can leave the frame.
   For every render that is portrait-relative to its tile (49 of the 53 at
   hero-bans' measured 710x673 panel — all but dmon, mauga, jetpack-cat and
   wrecking-ball) invariant 1 pins the scale to exactly what contain already
   produced, so those tiles only re-centre horizontally; the scale-up is
   landscape-only. Vertical placement stays bottom-anchored throughout.

   Measurement is browser-only (canvas). banArtFrame() itself is pure
   geometry and is unit-tested in components-v2.test.js. */

// Largest raster we decode for a profile. The profile only feeds a centring
// decision, so 96 columns is ample and keeps the work at ~10k pixels.
var _BAN_FOCUS_RASTER = 96;
// Mass quantiles bounding the "subject core" that must stay in frame. 5%/95%
// means the thin outer tails of the art (a trailing cape, a gun barrel) may
// crop, but the body of the character may not.
var _BAN_FOCUS_CORE_Q = 0.05;
// url -> {cx, x5, x95} once measured, or null if the measurement failed
// (tainted canvas, decode error). null is sticky: we do not retry per tile.
var _banFocusCache = {};

/* Alpha-mass profile of a loaded <img>. Returns {cx, x5, x95} as fractions of
   image width, or null if the pixels can't be read.

   Same-origin in practice: hero renders are served by our own Express at
   /hero-renders/ and every overlay is served from the same origin, so the
   canvas is clean. The try/catch is for the case where a producer's drop-in
   render is pointed at some other origin — then we simply keep the CSS
   fallback rather than throwing on air. */
/* The pure half, split out so it can be unit-tested without a canvas: turn a
   per-column alpha-mass profile into {cx, x5, x95}. Exported via the CJS
   guard; `cols` is any indexable of column sums, `w` its length. */
function banFocusFromColumns(cols, w) {
  if (!w) return null;
  var total = 0, i;
  for (i = 0; i < w; i++) total += cols[i];
  // A fully opaque rectangle (a JPEG drop-in, or a render exported without
  // alpha) profiles as perfectly uniform. That yields cx=0.5 and a core of
  // [0.05, 0.95] — the neutral answer, which is the right one: with no alpha
  // there is no subject information, so framing reduces to centred.
  if (total <= 0) return null;

  // The centroid MUST be summed over every column, not just up to the 95%
  // quantile. An earlier version folded it into the quantile loop below and
  // broke out at x95, so the right-hand 5% of ink was missing from the
  // numerator while the left-hand 5% was still in it — a systematic leftward
  // bias of up to ~0.04 of image width. It fell hardest on exactly the
  // prop-on-one-side heroes this code exists to correct, and it shifted a
  // no-alpha render off-centre when it should have been left alone. The
  // "uniform profile gives cx exactly 0.5" test below pins it.
  var centroid = 0;
  for (i = 0; i < w; i++) centroid += cols[i] * (i + 0.5);

  var acc = 0, x5 = 0, x95 = w, seen5 = false;
  for (i = 0; i < w; i++) {
    acc += cols[i];
    if (!seen5 && acc >= total * _BAN_FOCUS_CORE_Q) { x5 = i; seen5 = true; }
    if (acc >= total * (1 - _BAN_FOCUS_CORE_Q)) { x95 = i + 1; break; }
  }
  return { cx: centroid / total / w, x5: x5 / w, x95: Math.min(1, x95 / w) };
}

function _measureBanFocus(img) {
  var iw = img.naturalWidth, ih = img.naturalHeight;
  if (!iw || !ih) return null;
  try {
    var w = Math.min(_BAN_FOCUS_RASTER, iw);
    var h = Math.max(1, Math.round(ih * (w / iw)));
    var cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    var ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    var data = ctx.getImageData(0, 0, w, h).data;

    var cols = new Float64Array(w);
    for (var y = 0; y < h; y++) {
      var row = y * w * 4;
      for (var x = 0; x < w; x++) cols[x] += data[row + x * 4 + 3] / 255;
    }
    return banFocusFromColumns(cols, w);
  } catch (e) {
    return null; // tainted/undecodable — keep the CSS fallback
  }
}

/* Pure geometry: where to put an imgW x imgH render inside a tileW x tileH
   tile so the subject reads centred. `cx` is the alpha-mass centroid and
   [x5, x95] the core-mass box, both as fractions of image width (what
   _measureBanFocus returns). Returns pixel {left, top, width, height} for an
   absolutely-positioned <img>.

   Order of the clamps matters and is load-bearing:
     a. scale  = min(fill-height, largest scale whose core still fits the
                 tile width), floored at contain — invariants 1 and 2 above.
     b. place  so the centroid lands on the tile's horizontal centre,
     c. nudge  so the core box is fully inside the tile (only possible when
               the core actually fits), then
     d. clamp  so no blank gutter opens on a tile the image is wide enough to
               cover. (d) is the hard constraint and therefore runs last.
   Vertical is always bottom-anchored, matching the CSS this replaces. */
function banArtFrame(opts) {
  opts = opts || {};
  var tileW = opts.tileW, tileH = opts.tileH, imgW = opts.imgW, imgH = opts.imgH;
  if (!(tileW > 0) || !(tileH > 0) || !(imgW > 0) || !(imgH > 0)) return null;

  var cx = typeof opts.cx === 'number' ? opts.cx : 0.5;
  var x5 = typeof opts.x5 === 'number' ? opts.x5 : 0;
  var x95 = typeof opts.x95 === 'number' ? opts.x95 : 1;
  var coreFrac = Math.max(0.05, x95 - x5); // guard a degenerate profile

  var sContain = Math.min(tileW / imgW, tileH / imgH);
  var sFillH = tileH / imgH;
  var sCoreFit = tileW / (coreFrac * imgW);
  var s = Math.max(sContain, Math.min(sFillH, sCoreFit));

  var w = imgW * s, h = imgH * s;

  var left = tileW / 2 - cx * w;                       // (b)
  var coreL = left + x5 * w, coreR = left + x95 * w;   // (c)
  if (coreR - coreL <= tileW) {
    if (coreL < 0) left -= coreL;
    else if (coreR > tileW) left -= (coreR - tileW);
  }
  if (w >= tileW) left = Math.min(0, Math.max(tileW - w, left)); // (d) no gutter
  else left = Math.max(0, Math.min(tileW - w, left));            //     stay inside

  return { left: left, top: tileH - h, width: w, height: h };
}

/* Glue, called from the render <img>'s inline onload (see banArtTile). Kept
   on `window` because banArtTile emits HTML STRINGS — there is no element to
   bind a listener to at build time, and an inline hook means no scene has to
   remember to call anything after innerHTML (the same reason safeImg emits
   an inline onerror). No-ops harmlessly if measurement fails, leaving the
   theme-v2.css contain/bottom-center fallback in place. */
function applyBanArtFocus(img) {
  if (!img || img.getAttribute('data-focus-applied')) return;
  var box = img.parentNode;
  if (!box) return;
  var tileW = box.clientWidth, tileH = box.clientHeight;
  // Inserted-but-not-yet-laid-out (cached image, load before first layout):
  // retry once on the next frame rather than measuring a zero-size box.
  if (!(tileW > 0) || !(tileH > 0)) {
    if (img.getAttribute('data-focus-retry')) return;
    img.setAttribute('data-focus-retry', '1');
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(function () { applyBanArtFocus(img); });
    }
    return;
  }

  var src = img.getAttribute('src') || '';
  var focus = Object.prototype.hasOwnProperty.call(_banFocusCache, src)
    ? _banFocusCache[src]
    : (_banFocusCache[src] = _measureBanFocus(img));
  if (!focus) return;

  var f = banArtFrame({
    tileW: tileW, tileH: tileH,
    imgW: img.naturalWidth, imgH: img.naturalHeight,
    cx: focus.cx, x5: focus.x5, x95: focus.x95
  });
  if (!f) return;

  img.setAttribute('data-focus-applied', '1');
  // Explicit box wins over the class's inset:0/100%/object-fit — which stay
  // in the stylesheet as the pre-measurement and failure look. `transform`
  // is deliberately untouched: v2-idle-sway owns it on this same element.
  img.style.left = f.left.toFixed(1) + 'px';
  img.style.top = f.top.toFixed(1) + 'px';
  img.style.right = 'auto';
  img.style.bottom = 'auto';
  img.style.width = f.width.toFixed(1) + 'px';
  img.style.height = f.height.toFixed(1) + 'px';
}

/* The framed box is in PIXELS, derived from the tile's size at load time,
   whereas the CSS it replaces was resolution-independent (inset:0/100%). So
   anything that resizes the tile without reloading the page would otherwise
   leave a stale box until the next render() — most plausibly a producer
   editing the Ban Reveal browser source's width/height (or hitting "Fit to
   screen") in OBS, which resizes the CEF viewport in place while
   hero-bans' percentage-based panel geometry relayouts around it. Clearing
   the applied flag and re-running restores the invariant. Cheap: the alpha
   profile is cached per URL, so a re-frame is arithmetic only. */
function _reframeBanArt() {
  if (typeof document === 'undefined') return;
  var imgs = document.querySelectorAll('.v2-ban-art-render-img');
  for (var i = 0; i < imgs.length; i++) {
    imgs[i].removeAttribute('data-focus-applied');
    imgs[i].removeAttribute('data-focus-retry');
    applyBanArtFocus(imgs[i]);
  }
}

if (typeof window !== 'undefined') {
  window.applyBanArtFocus = applyBanArtFocus;
  if (window.addEventListener) window.addEventListener('resize', _reframeBanArt);
}

// Accent/punctuation-insensitive first-word extraction for map abbreviations
// ("King's Row" -> "KIN"). Same NFD-strip technique as theme-helpers.js's
// normHeroName, kept as a private local copy for the same reason _hexToAlpha/
// _proxyImg above are duplicated rather than required: this file must not
// depend on theme-helpers.js at require time (see the big comment up top).
function _mapAbbrev(name) {
  if (!name) return '';
  var stripped = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  var firstWord = stripped.split(/[^a-zA-Z0-9]+/)[0] || '';
  return firstWord.slice(0, 3).toUpperCase();
}

// Event name pill: dark block with the event name and a gradient underline
// bar (the underline gradient itself — team1->accent->accent->team2 — is
// scene CSS's job via .v2-underline; this just emits the hook element).
// Class prefix v2-event-.
function eventHeader(opts) {
  opts = opts || {};
  var eventName = opts.eventName || '';
  var subtitle = opts.subtitle || '';

  var html =
    '<div class="v2-event-header">' +
    '<div class="v2-event-name">' + escapeHtml(eventName) + '<span class="v2-underline"></span></div>';

  if (subtitle) {
    html += '<div class="v2-event-subtitle">' + escapeHtml(subtitle) + '</div>';
  }

  html += '</div>';
  return html;
}

// Per-series map-winner pip row (v7/v8 mockups). One .v2-pip per map,
// padded with .v2-pip-empty up to bestOf so the row never reflows as the
// series progresses. Winner fill/live glow are read off team colors passed
// in by the caller — these are ALWAYS the true team1/team2 colors, never
// swapSides-flipped (same invariant as theme-helpers' mapStripClass: map
// results belong to the team that won them, not to a screen side).
function mapPips(opts) {
  opts = opts || {};
  var maps = opts.maps || [];
  var bestOf = opts.bestOf || maps.length;
  var team1Color = opts.team1Color || '';
  var team2Color = opts.team2Color || '';

  // Stale data can carry more map entries than the series' bestOf (a
  // corrected/lowered bestOf after maps were already recorded). Truncate to
  // bestOf real pips rather than overflowing the fixed-width row; when no
  // bestOf is given at all, fall back to showing every map (original
  // behavior, used by callers that don't track a series length).
  var realCount = opts.bestOf ? Math.min(maps.length, bestOf) : maps.length;

  var html = '<div class="v2-pips">';
  var i;
  for (i = 0; i < realCount; i++) {
    var map = maps[i] || {};
    var abbrev = _mapAbbrev(map.name);
    var cls = 'v2-pip';
    var style = '';

    if (map.status === 'completed') {
      var winnerColor = map.winner === 'team1' ? team1Color : (map.winner === 'team2' ? team2Color : '');
      if (winnerColor) {
        style = ' style="background:' + escapeHtml(winnerColor) + ';color:' + escapeHtml(_textOnColor(winnerColor)) + '"';
      }
    } else if (map.status === 'current') {
      // v2-idle-glow (Owner QA batch 2 Task 3b): the live pip already had a
      // static glow (box-shadow in theme-v2.css); this makes it pulse. Safe
      // as a leaf — opacity/filter only, no transform to collide with an
      // ancestor's entrance animation.
      cls += ' v2-pip-live v2-idle-glow';
    }

    html += '<div class="' + cls + '"' + style + '>' + escapeHtml(abbrev) + '</div>';
  }
  for (; i < bestOf; i++) {
    html += '<div class="v2-pip v2-pip-empty"></div>';
  }
  html += '</div>';

  return html;
}

// Indirection to reach pinwheelSVG (defined in pinwheel.js) without this
// file requiring that module at load time. In the browser both files load
// as classic <script> tags and pinwheelSVG is a plain global by the time
// topFrame() is actually CALLED (script order, not module graph, decides
// that). In Vitest there is no shared global scope across ES module
// imports, so overlays/components-v2.test.js sets `globalThis.pinwheelSVG =
// pinwheelSVG` (imported from ./pinwheel.js) before calling topFrame() —
// the lookup below is a lazy, call-time `typeof` check, so it works
// regardless of import/require ordering as long as the global is set
// before topFrame() actually runs.
/* global pinwheelSVG */
var _pinwheelWarned = false;
function _pinwheel(opts) {
  if (typeof pinwheelSVG !== 'undefined') return pinwheelSVG(opts);
  // Loud in the dev console (missing <script src="pinwheel.js"> is a real
  // authoring mistake worth surfacing), but still graceful on air — the
  // medallion just renders blank instead of throwing. Warn once per page
  // load so a busy overlay refreshing every state tick doesn't spam it.
  if (!_pinwheelWarned && typeof console !== 'undefined' && console.warn) {
    console.warn('components-v2.js: pinwheelSVG global is not defined — is pinwheel.js loaded before this script?');
    _pinwheelWarned = true;
  }
  return '';
}

// Private mirror of theme-helpers.js's findCurrentMapIndex/findCurrentMap
// fallback order (live -> next upcoming -> last played). topFrame can't
// require('./theme-helpers.js') at load time (see the big comment at the
// top of this file explaining why), so this is a deliberate, minimal,
// self-contained duplicate of that same logic — used ONLY as topFrame's
// last resort when the caller doesn't pass opts.currentMapName. Mirrors
// findCurrentMapIndex; keep in sync if that function's order ever changes.
function _fallbackMapName(maps) {
  var i;
  var lastCurrent = -1;
  for (i = 0; i < maps.length; i++) {
    if (maps[i] && maps[i].status === 'current') lastCurrent = i;
  }
  if (lastCurrent !== -1) return maps[lastCurrent].name || '';
  for (i = 0; i < maps.length; i++) {
    if (maps[i] && maps[i].status === 'upcoming') return maps[i].name || '';
  }
  if (maps.length > 0 && maps[maps.length - 1]) return maps[maps.length - 1].name || '';
  return '';
}

// One hero-ban wing (v7 mockup): a row of banTile()s in the team's color,
// sitting between a team plate and the center block. Empty array -> an
// empty (but present) wing container; topFrame omits the wing entirely
// when banWings itself is absent so "no bans configured yet" doesn't leave
// a stray empty box on screen.
function _banWing(bans, teamColor) {
  var html = '<div class="v2-wing" style="border-color:' + escapeHtml(teamColor) + '">';
  for (var i = 0; i < bans.length; i++) {
    var ban = bans[i] || {};
    html += banTile({ portrait: ban.portrait, heroName: ban.heroName, teamColor: teamColor, size: 56 });
  }
  html += '</div>';
  return html;
}

// Persistent top frame shared by the gameplay HUD, map-pick, and map-intro
// scenes (v7 plates/wings + v8 center band). This function owns internal
// layout only (the flex row of plate/wing/center/wing/plate) — absolute
// positioning, scale, and fit-to-canvas placement of the whole
// .v2-top-frame block onto the 1080p stream is scene CSS's job.
//
// opts: { team1, team2 (each {name, logo, score, color}), eventName,
//   bestOf, maps, banWings ({team1:[], team2:[]} or null/absent),
//   hubText, swapSides, currentMapName }
//
// team1.color/team2.color and hubText are interpolated RAW into pinwheelSVG's
// output (fill/stroke/filter attributes and the hub <text> respectively) —
// topFrame does not escape or otherwise sanitize them, per pinwheelSVG's
// own documented contract that callers must pass trusted, pre-sanitized
// values (team theme colors and series scores like '2·1', never raw
// FACEIT strings).
function topFrame(opts) {
  opts = opts || {};
  var team1 = opts.team1 || {};
  var team2 = opts.team2 || {};
  var swapSides = !!opts.swapSides;
  var bestOf = opts.bestOf;
  var maps = opts.maps || [];
  var banWings = opts.banWings;
  var hubText = opts.hubText || '';

  var leftTeam = swapSides ? team2 : team1;
  var rightTeam = swapSides ? team1 : team2;
  var leftColor = leftTeam.color || '';
  var rightColor = rightTeam.color || '';

  var leftPlate = teamPlate({
    side: 'left', name: leftTeam.name, logo: leftTeam.logo, score: leftTeam.score,
    color: leftColor, linework: true
  });
  var rightPlate = teamPlate({
    side: 'right', name: rightTeam.name, logo: rightTeam.logo, score: rightTeam.score,
    color: rightColor, linework: true
  });

  var leftWingHtml = '';
  var rightWingHtml = '';
  if (banWings) {
    var leftBans = (swapSides ? banWings.team2 : banWings.team1) || [];
    var rightBans = (swapSides ? banWings.team1 : banWings.team2) || [];
    leftWingHtml = _banWing(leftBans, leftColor);
    rightWingHtml = _banWing(rightBans, rightColor);
  }

  // opts.currentMapName lets callers (e.g. the Task 4 HUD) inject a richer,
  // server-computed fallback (usually findCurrentMap() itself) — that
  // still takes precedence when given. When omitted, _fallbackMapName()
  // mirrors findCurrentMapIndex's own live -> next upcoming -> last played
  // order (upgraded from the old plain "first map with status === 'current'"
  // scan, which went blank once every map was completed).
  var currentMapName = opts.currentMapName;
  if (!currentMapName) {
    currentMapName = _fallbackMapName(maps);
  }

  var eventPill = eventHeader({ eventName: opts.eventName, subtitle: bestOf ? ('BO' + bestOf) : '' });
  // Pinwheel petals map to TRUE team identity (p-group = team 1, s-group =
  // team 2 — pinwheel.js contract / design spec §2), NOT to screen side.
  // Plates and wings flip with swapSides; the medallion, like mapPips, does
  // not. Keeps the medallion consistent with gameplay-hud's.
  var medallion = '<div class="v2-medallion">' + _pinwheel({ color1: team1.color, color2: team2.color, size: 62, hubText: hubText }) + '</div>';
  var mapPill = '<div class="v2-map-pill">' + escapeHtml(currentMapName) + '</div>';
  var pipsRow = mapPips({ maps: maps, bestOf: bestOf, team1Color: team1.color, team2Color: team2.color });

  var centerHtml =
    '<div class="v2-center-block">' + eventPill + medallion + mapPill + pipsRow + '</div>';

  var html =
    '<div class="v2-top-frame" style="display:flex;align-items:stretch;">' +
    '<div class="v2-frame-side v2-frame-left">' + leftPlate + '</div>' +
    leftWingHtml +
    centerHtml +
    rightWingHtml +
    '<div class="v2-frame-side v2-frame-right">' + rightPlate + '</div>' +
    '</div>';

  return html;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml: escapeHtml,
    banTile: banTile,
    teamPlate: teamPlate,
    safeImg: safeImg,
    eventHeader: eventHeader,
    mapPips: mapPips,
    topFrame: topFrame,
    camFrame: camFrame,
    banArtTile: banArtTile,
    banArtFrame: banArtFrame,
    banFocusFromColumns: banFocusFromColumns
  };
}
