import { useState, useEffect } from 'react';

const BUILTIN_FONTS = [
  'Bebas Neue', 'Oswald', 'Inter', 'Roboto', 'Montserrat',
  'Open Sans', 'Lato', 'Poppins', 'Raleway', 'Barlow',
];

const DEFAULT_THEME = {
  accentColor: '#f97316',
  accentGradient: ['#f97316', '#ef4444'],
  backgroundColor: 'rgba(10,10,20,0.9)',
  textColor: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.5)',
  fontFamily: 'Oswald',
  titleFontFamily: 'Bebas Neue',
  rainbowBar: true,
  rainbowColors: ['#2563eb', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444', '#f97316'],
  team1Color: '#3b82f6',
  team1ColorAuto: true,
  team2Color: '#ef4444',
  team2ColorAuto: true,
  countdownColor: '#ffffff',
  countdownLabelBg: ['#f97316', '#ef4444'],
  scheduleRowBg: 'rgba(15,15,25,0.85)',
  scheduleUpNextColor: '#f97316',
  scoreBg: 'rgba(12,15,18,0.92)',
  banLabelTeam1Bg: 'rgba(59,130,246,0.15)',
  banLabelTeam2Bg: 'rgba(239,68,68,0.15)',
  mapWinIndicatorTeam1: '#3b82f6',
  mapWinIndicatorTeam2: '#ef4444',
  lowerThirdBg: ['#f97316', '#ef4444'],
};

export default function Theming({ state, updateState, api, customFonts }) {
  const theme = state.theme || {};
  const [local, setLocal] = useState({ ...DEFAULT_THEME, ...theme });
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    // Broadcasts arrive every few seconds (FACEIT poll, other producers).
    // Never clobber unsaved local edits — resync only when the form is clean.
    if (dirty) return;
    setLocal({ ...DEFAULT_THEME, ...state.theme });
  }, [state.theme, dirty]);

  const update = (key, value) => {
    setLocal(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  // Programmatic updates (logo color extraction) — change the form without
  // marking it dirty, so background extraction never blocks broadcast resyncs.
  const updateSilent = (key, value) => {
    setLocal(prev => ({ ...prev, [key]: value }));
  };

  const saveTheme = async () => {
    const updates = { theme: local };
    if (local.team1Color || local.team2Color) {
      updates.teams = {
        ...state.teams,
        team1: { ...state.teams?.team1, color: local.team1Color || '#3b82f6' },
        team2: { ...state.teams?.team2, color: local.team2Color || '#ef4444' },
      };
    }
    await updateState(updates);
    if (!local.team1ColorAuto) {
      await fetch(`${api}/api/overrides`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: ['teams.team1.color'] }),
      });
    } else {
      await fetch(`${api}/api/overrides/clear`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'teams.team1.color' }),
      });
    }
    if (!local.team2ColorAuto) {
      await fetch(`${api}/api/overrides`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: ['teams.team2.color'] }),
      });
    } else {
      await fetch(`${api}/api/overrides/clear`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: 'teams.team2.color' }),
      });
    }
    setDirty(false);
  };

  const resetToDefault = async () => {
    setLocal({ ...DEFAULT_THEME });
    await updateState({ theme: { ...DEFAULT_THEME } });
    setDirty(false);
  };

  const allFonts = [...BUILTIN_FONTS, ...(customFonts || []).map(f => f.name)];

  return (
    <div>
      <div className="page-header">
        <h2>Theming</h2>
        <p>Customize overlay appearance and team colors</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={saveTheme} disabled={!dirty}>
          {dirty ? 'Save Theme' : 'Saved'}
        </button>
        <button className="btn btn-ghost" onClick={resetToDefault}>Reset to Default</button>
      </div>

      {/* Live Preview */}
      <div className="card" style={{ marginBottom: 16 }}>
        <span className="card-title">Live Preview</span>
        <div style={{
          width: '100%', maxWidth: 640, aspectRatio: '16/9',
          overflow: 'hidden', borderRadius: 8, border: '1px solid var(--border)',
          margin: '8px auto 0',
        }}>
          <iframe
            src="/overlays/starting-soon.html"
            style={{
              width: '1920px', height: '1080px',
              transform: 'scale(0.333)',
              transformOrigin: '0 0',
              border: 'none', pointerEvents: 'none',
            }}
            title="Theme preview"
          />
        </div>
      </div>

      {/* Global Colors */}
      <div className="card" style={{ marginBottom: 16 }}>
        <span className="card-title">Global Colors</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          <ColorField label="Accent Color" value={local.accentColor} onChange={v => update('accentColor', v)} />
          <ColorField label="Text Color" value={local.textColor} onChange={v => update('textColor', v)} />
          <ColorField label="Text Secondary" value={local.textSecondary} onChange={v => update('textSecondary', v)} isRgba />
          <ColorField label="Overlay Background" value={local.backgroundColor} onChange={v => update('backgroundColor', v)} isRgba />
          <ColorField label="Countdown Color" value={local.countdownColor} onChange={v => update('countdownColor', v)} />
          <ColorField label="Schedule Up-Next" value={local.scheduleUpNextColor} onChange={v => update('scheduleUpNextColor', v)} />
        </div>
      </div>

      {/* Gradients */}
      <div className="card" style={{ marginBottom: 16 }}>
        <span className="card-title">Gradients</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          <GradientField label="Accent Gradient" value={local.accentGradient || ['#f97316', '#ef4444']} onChange={v => update('accentGradient', v)} />
          <GradientField label="Countdown Label" value={local.countdownLabelBg || ['#f97316', '#ef4444']} onChange={v => update('countdownLabelBg', v)} />
          <GradientField label="Lower Third" value={local.lowerThirdBg || ['#f97316', '#ef4444']} onChange={v => update('lowerThirdBg', v)} />
        </div>
      </div>

      {/* Fonts */}
      <div className="card" style={{ marginBottom: 16 }}>
        <span className="card-title">Fonts</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Title Font</label>
            <select value={local.titleFontFamily || 'Bebas Neue'} onChange={e => update('titleFontFamily', e.target.value)}>
              {allFonts.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Body Font</label>
            <select value={local.fontFamily || 'Oswald'} onChange={e => update('fontFamily', e.target.value)}>
              {allFonts.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Team Colors */}
      <div className="card" style={{ marginBottom: 16 }}>
        <span className="card-title">Team Colors</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
          <TeamColorSection
            label={state.teams?.team1?.name || 'Team 1'}
            color={local.team1Color || '#3b82f6'}
            auto={local.team1ColorAuto !== false}
            logoUrl={state.teams?.team1?.logo}
            api={api}
            onColorChange={v => update('team1Color', v)}
            onExtractedColor={v => updateSilent('team1Color', v)}
            onAutoChange={v => update('team1ColorAuto', v)}
          />
          <TeamColorSection
            label={state.teams?.team2?.name || 'Team 2'}
            color={local.team2Color || '#ef4444'}
            auto={local.team2ColorAuto !== false}
            logoUrl={state.teams?.team2?.logo}
            api={api}
            onColorChange={v => update('team2Color', v)}
            onExtractedColor={v => updateSilent('team2Color', v)}
            onAutoChange={v => update('team2ColorAuto', v)}
          />
        </div>
      </div>

      {/* Element Colors */}
      <div className="card" style={{ marginBottom: 16 }}>
        <span className="card-title">Element Colors</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 }}>
          <ColorField label="Score Background" value={local.scoreBg} onChange={v => update('scoreBg', v)} isRgba />
          <ColorField label="Schedule Row Bg" value={local.scheduleRowBg} onChange={v => update('scheduleRowBg', v)} isRgba />
          <ColorField label="Ban Label (Team 1)" value={local.banLabelTeam1Bg} onChange={v => update('banLabelTeam1Bg', v)} isRgba />
          <ColorField label="Ban Label (Team 2)" value={local.banLabelTeam2Bg} onChange={v => update('banLabelTeam2Bg', v)} isRgba />
          <ColorField label="Map Win (Team 1)" value={local.mapWinIndicatorTeam1} onChange={v => update('mapWinIndicatorTeam1', v)} />
          <ColorField label="Map Win (Team 2)" value={local.mapWinIndicatorTeam2} onChange={v => update('mapWinIndicatorTeam2', v)} />
        </div>
      </div>

      {/* Rainbow Bar */}
      <div className="card" style={{ marginBottom: 16 }}>
        <span className="card-title">Rainbow Bar</span>
        <div style={{ marginTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem' }}>
            <input type="checkbox" checked={local.rainbowBar !== false} onChange={e => update('rainbowBar', e.target.checked)} />
            Show rainbow bar
          </label>
          {local.rainbowBar !== false && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {(local.rainbowColors || []).map((c, i) => (
                <input key={i} type="color" value={c}
                  style={{ width: 32, height: 32, border: 'none', cursor: 'pointer' }}
                  onChange={e => {
                    const next = [...(local.rainbowColors || [])];
                    next[i] = e.target.value;
                    update('rainbowColors', next);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

function ColorField({ label, value, onChange, isRgba }) {
  const hexValue = isRgba ? '#888888' : (value || '#000000');
  return (
    <div>
      <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {!isRgba && (
          <input type="color" value={hexValue} onChange={e => onChange(e.target.value)}
            style={{ width: 32, height: 32, border: 'none', cursor: 'pointer' }} />
        )}
        <input type="text" value={value || ''} onChange={e => onChange(e.target.value)}
          style={{ flex: 1, fontSize: '0.8rem' }} placeholder={isRgba ? 'rgba(...)' : '#hex'} />
      </div>
    </div>
  );
}

function GradientField({ label, value, onChange }) {
  const [start, end] = value || ['#f97316', '#ef4444'];
  return (
    <div>
      <label style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'block', marginBottom: 2 }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="color" value={start} onChange={e => onChange([e.target.value, end])}
          style={{ width: 28, height: 28, border: 'none', cursor: 'pointer' }} />
        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>→</span>
        <input type="color" value={end} onChange={e => onChange([start, e.target.value])}
          style={{ width: 28, height: 28, border: 'none', cursor: 'pointer' }} />
        <div style={{
          flex: 1, height: 28, borderRadius: 4,
          background: `linear-gradient(90deg, ${start}, ${end})`,
        }} />
      </div>
    </div>
  );
}

function TeamColorSection({ label, color, auto, logoUrl, api, onColorChange, onExtractedColor, onAutoChange }) {
  const [extractedColor, setExtractedColor] = useState(null);

  useEffect(() => {
    if (!auto || !logoUrl) {
      setExtractedColor(null);
      return;
    }
    const img = new Image();
    const needsProxy = logoUrl.startsWith('http') && !logoUrl.startsWith(api);
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 64;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;

      const buckets = {};
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 128) continue;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2 / 255;
        if (l > 0.85 || l < 0.15) continue;
        const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1)) / 255;
        const key = `${Math.round(r / 16) * 16},${Math.round(g / 16) * 16},${Math.round(b / 16) * 16}`;
        if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, count: 0, satScore: 0 };
        buckets[key].r += r;
        buckets[key].g += g;
        buckets[key].b += b;
        buckets[key].count++;
        buckets[key].satScore += s;
      }

      let best = null, bestScore = 0;
      for (const b of Object.values(buckets)) {
        const score = b.satScore * Math.sqrt(b.count);
        if (score > bestScore) { bestScore = score; best = b; }
      }

      if (best && best.count > 0) {
        const r = Math.round(best.r / best.count);
        const g = Math.round(best.g / best.count);
        const b = Math.round(best.b / best.count);
        const hex = '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
        setExtractedColor(hex);
        onExtractedColor(hex);
      } else {
        setExtractedColor('#6b7280');
        onExtractedColor('#6b7280');
      }
    };
    img.onerror = () => {
      setExtractedColor('#6b7280');
      onExtractedColor('#6b7280');
    };
    img.src = needsProxy ? `${api}/api/proxy-image?url=${encodeURIComponent(logoUrl)}` : logoUrl;
  }, [auto, logoUrl]);

  return (
    <div>
      <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 6,
          background: color, border: '2px solid var(--border)',
        }} />
        {!auto && (
          <input type="color" value={color} onChange={e => onColorChange(e.target.value)}
            style={{ width: 32, height: 32, border: 'none', cursor: 'pointer' }} />
        )}
        <div style={{ flex: 1 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem' }}>
            <input type="checkbox" checked={auto} onChange={e => onAutoChange(e.target.checked)} />
            Auto from logo
          </label>
          {auto && extractedColor && (
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Extracted: {extractedColor}</span>
          )}
          {auto && !logoUrl && (
            <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>No logo — using fallback gray</span>
          )}
        </div>
      </div>
    </div>
  );
}

