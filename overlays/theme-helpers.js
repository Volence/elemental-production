function applyTheme(state) {
  var t = state.theme || {};
  var s = document.documentElement.style;

  var t1Color = t.team1Color || state.teams?.team1?.color || '#3b82f6';
  var t2Color = t.team2Color || state.teams?.team2?.color || '#ef4444';

  s.setProperty('--accent', t.accentColor || '#f97316');
  s.setProperty('--accent-end', (t.accentGradient && t.accentGradient[1]) || '#ef4444');
  s.setProperty('--team1-color', t1Color);
  s.setProperty('--team2-color', t2Color);
  s.setProperty('--team1-color-alpha', hexToAlpha(t1Color, 0.15));
  s.setProperty('--team2-color-alpha', hexToAlpha(t2Color, 0.15));
  s.setProperty('--bg-overlay', t.backgroundColor || 'rgba(10,10,20,0.9)');
  s.setProperty('--text-primary', t.textColor || '#ffffff');
  s.setProperty('--text-secondary', t.textSecondary || 'rgba(255,255,255,0.5)');
  s.setProperty('--countdown-color', t.countdownColor || '#ffffff');
  s.setProperty('--schedule-row-bg', t.scheduleRowBg || 'rgba(15,15,25,0.85)');
  s.setProperty('--schedule-upnext', t.scheduleUpNextColor || '#f97316');
  s.setProperty('--score-bg', t.scoreBg || 'rgba(12,15,18,0.92)');
  s.setProperty('--ban-team1-bg', t.banLabelTeam1Bg || 'rgba(59,130,246,0.15)');
  s.setProperty('--ban-team2-bg', t.banLabelTeam2Bg || 'rgba(239,68,68,0.15)');
  s.setProperty('--map-win-t1', t.mapWinIndicatorTeam1 || t1Color);
  s.setProperty('--map-win-t2', t.mapWinIndicatorTeam2 || t2Color);

  var g = t.accentGradient || ['#f97316', '#ef4444'];
  s.setProperty('--accent-gradient', 'linear-gradient(135deg, ' + g[0] + ', ' + g[1] + ')');

  var lt = t.lowerThirdBg || ['#f97316', '#ef4444'];
  s.setProperty('--lower-third-gradient', 'linear-gradient(135deg, ' + lt[0] + ', ' + lt[1] + ')');

  var cl = t.countdownLabelBg || ['#f97316', '#ef4444'];
  s.setProperty('--countdown-label-gradient', 'linear-gradient(135deg, ' + cl[0] + ', ' + cl[1] + ')');

  if (t.rainbowColors && t.rainbowColors.length > 0) {
    s.setProperty('--rainbow-gradient', 'linear-gradient(90deg, ' + t.rainbowColors.join(', ') + ')');
  }

  var titleFont = t.titleFontFamily || 'Bebas Neue';
  var bodyFont = t.fontFamily || 'Oswald';
  s.setProperty('--font-title', "'" + titleFont + "', sans-serif");
  s.setProperty('--font-body', "'" + bodyFont + "', sans-serif");
}

// Route external image URLs through the local caching proxy — OBS's embedded
// Chromium fails intermittently on direct external CDN fetches.
function proxyImg(u) {
  if (!u || typeof u !== 'string') return '';
  if (/^https?:\/\//i.test(u) && u.indexOf('localhost') === -1 && u.indexOf('127.0.0.1') === -1) {
    return 'http://localhost:3001/api/proxy-image?url=' + encodeURIComponent(u);
  }
  return u;
}

// Shrink an overlay panel to fit the 1080px canvas — single-cam layouts grow
// the cam slot above it, which can push the panel past the bottom edge. Uses
// `zoom` rather than transform: the entrance animation's `forwards` fill owns
// the panel's transform, and the cam slot itself must not move (the OBS caster
// source is aligned to it).
function fitPanelToCanvas(panel, bottomEdge) {
  if (!panel) return;
  bottomEdge = bottomEdge || 1060;
  panel.style.zoom = '';
  var rect = panel.getBoundingClientRect();
  var avail = bottomEdge - rect.top;
  if (rect.height > avail && avail > 0) {
    panel.style.zoom = Math.max(0.6, avail / rect.height);
  }
}

// Accent/punctuation-insensitive hero matching ("Lúcio" ↔ "Lucio" ↔ "lucio")
function normHeroName(s) {
  if (!s) return '';
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function findHeroEntry(heroData, name) {
  var n = normHeroName(name);
  if (!n) return null;
  for (var i = 0; i < (heroData || []).length; i++) {
    if (normHeroName(heroData[i].key) === n || normHeroName(heroData[i].name) === n) return heroData[i];
  }
  return null;
}

function hexToAlpha(hex, alpha) {
  if (!hex || hex.charAt(0) !== '#') return hex;
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

// Legibility floor for team-colored TEXT on the package's near-black ground
// (owner QA batch 3: an auto-extracted navy like #140251 is a fine FILL but
// unreadable as text). Lifts the color's HSL lightness up to `minL` (0..1)
// while keeping hue/saturation, so the team still reads as "their color",
// just bright enough to see. Colors already at/above the floor pass through
// unchanged; non-#rrggbb input (hsl()/rgba() theme strings) passes through
// untouched. Use ONLY where the color paints text or thin strokes — fills,
// washes and swatches should keep the true team color.
function legibleColor(hex, minL) {
  var m = /^#([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return hex;
  var n = parseInt(m[1], 16);
  var r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var l = (max + min) / 2;
  if (l >= minL) return hex;
  var h = 0, s = 0, d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  l = minL;
  var c = (1 - Math.abs(2 * l - 1)) * s;
  var x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  var m2 = l - c / 2;
  var rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
            h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  var to255 = function (v) { return Math.round((v + m2) * 255); };
  var toHex2 = function (v) { var s2 = to255(v).toString(16); return s2.length === 1 ? '0' + s2 : s2; };
  return '#' + toHex2(rgb[0]) + toHex2(rgb[1]) + toHex2(rgb[2]);
}

// Which map should overlays treat as "the map right now"?
// live map -> next upcoming map -> last played map. Never blindly maps[0]:
// that's the bug where the map intro showed map 1's name all series.
// When bad state carries two `current` maps, the LAST one wins so overlays
// self-heal onto the map the producer just pressed Play on.
function findCurrentMapIndex(maps) {
  maps = maps || [];
  var lastCurrent = -1;
  for (var i = 0; i < maps.length; i++) if (maps[i].status === 'current') lastCurrent = i;
  if (lastCurrent !== -1) return lastCurrent;
  for (var j = 0; j < maps.length; j++) if (maps[j].status === 'upcoming') return j;
  return maps.length - 1;
}

function findCurrentMap(maps) {
  var idx = findCurrentMapIndex(maps);
  return (idx >= 0 && maps[idx]) || {};
}

// Ticker underline class for a series map slot. Colors follow the WINNING
// team's color var — never flipped by swapSides (CSS vars don't flip either;
// that mismatch was the "underscore colors aren't correct" bug).
function mapStripClass(map, index, currentIdx) {
  if (map.status === 'completed' && map.winner === 'team1') return 'won-t1';
  if (map.status === 'completed' && map.winner === 'team2') return 'won-t2';
  return index === currentIdx ? 'current' : '';
}

// CJS export guard so Node/Vitest can import these for tests; harmless in the
// browser since `module` is undefined there and this block never executes.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    findCurrentMapIndex: findCurrentMapIndex,
    findCurrentMap: findCurrentMap,
    mapStripClass: mapStripClass,
    hexToAlpha: hexToAlpha,
    legibleColor: legibleColor,
    proxyImg: proxyImg
  };
}
