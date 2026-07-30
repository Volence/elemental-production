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
// theme-v2.css). `opts.portrait` is expected ALREADY PROXIED by the caller —
// the server pre-proxies hero portraits at the data-fetch layer — so this
// function does NOT call proxyImg/safeImg on it; doing so would double-wrap
// an already-proxied URL.
function banTile(opts) {
  opts = opts || {};
  var portrait = opts.portrait || '';
  var heroName = opts.heroName || '';
  var teamColor = opts.teamColor || '';

  var tileInner;
  if (heroName) {
    tileInner =
      '<img class="v2-ban-tile-img" src="' + escapeHtml(portrait) + '" alt="' + escapeHtml(heroName) + '">' +
      '<div class="v2-ban-slash" style="position:absolute;inset:0;background-image:linear-gradient(45deg, transparent 46%, ' + _hexToAlpha('#ff0000', 0.85) + ' 49%, ' + _hexToAlpha('#ff0000', 0.85) + ' 51%, transparent 54%);"></div>';
  } else {
    tileInner = '<div class="v2-ban-tile-empty"></div>';
  }

  var html =
    '<div class="v2-ban-tile" style="position:relative;border-color:' + escapeHtml(teamColor) + '">' +
    tileInner +
    '</div>';

  if (heroName) {
    html += '<div class="v2-ban-tile-name">' + escapeHtml(heroName) + '</div>';
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    escapeHtml: escapeHtml,
    banTile: banTile,
    teamPlate: teamPlate,
    safeImg: safeImg
  };
}
