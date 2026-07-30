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
      '<div class="v2-ban-slash" style="position:absolute;inset:0;background-image:linear-gradient(45deg, transparent 46%, rgba(255,0,0,0.85) 49%, rgba(255,0,0,0.85) 51%, transparent 54%);"></div>';
  } else {
    tileInner = '<div class="v2-ban-tile-empty"></div>';
  }

  var html =
    '<div class="v2-ban-tile" style="position:relative;border-color:' + escapeHtml(teamColor) + ';' + sizeStyle + '">' +
    tileInner +
    '</div>';

  if (heroName) {
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
    html += safeImg(logo, { 'class': 'v2-plate-logo', alt: name });
  }
  html += '<div class="v2-plate-name">' + escapeHtml(name) + '</div>';
  html += '<div class="v2-plate-score">' + escapeHtml(String(score)) + '</div>';
  html += '</div>';
  html += '</div>';

  return html;
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
        style = ' style="background:' + escapeHtml(winnerColor) + '"';
      }
    } else if (map.status === 'current') {
      cls += ' v2-pip-live';
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

  // opts.currentMapName lets callers (e.g. the Task 4 HUD) inject a richer
  // fallback than this inline scan — findCurrentMap()'s live -> next
  // upcoming -> last played order — so the map pill doesn't go blank
  // between maps when nothing is 'current' yet/anymore. Falls back to a
  // plain "first map with status === 'current'" scan when omitted.
  var currentMapName = opts.currentMapName;
  if (!currentMapName) {
    currentMapName = '';
    for (var i = 0; i < maps.length; i++) {
      if (maps[i] && maps[i].status === 'current') {
        currentMapName = maps[i].name || '';
        break;
      }
    }
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
    topFrame: topFrame
  };
}
