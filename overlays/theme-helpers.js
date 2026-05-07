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

function hexToAlpha(hex, alpha) {
  if (!hex || hex.charAt(0) !== '#') return hex;
  var r = parseInt(hex.slice(1, 3), 16);
  var g = parseInt(hex.slice(3, 5), 16);
  var b = parseInt(hex.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}
