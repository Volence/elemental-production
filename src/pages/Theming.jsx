import { useState, useEffect, useRef } from 'react';
import { sampleBuckets, pickBestBucket, ELMT_ACCENT_FALLBACK } from '../lib/color-extract.js';

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
  const teamTimers = useRef({});
  const teamPending = useRef({});
  useEffect(() => {
    // Broadcasts arrive every few seconds (FACEIT poll, other producers).
    // Never clobber unsaved local edits — resync only when the form is clean.
    if (dirty) return;
    // Team-color edits still inside saveTeamColor's debounce win over the
    // broadcast, or a dragged picker / the Auto box flickers back mid-save.
    const pending = { ...teamPending.current[1], ...teamPending.current[2] };
    setLocal({ ...DEFAULT_THEME, ...state.theme, ...pending });
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

  // Team colors are a live broadcast control, so they save the moment they
  // change instead of waiting on Save Theme. Producer report (MetalOBS,
  // 2026-09): "can't change color in manual, it stays on auto from logo" — the
  // Save button sat ~1000px above this card, and switching tabs silently
  // dropped the unsaved toggle, so the box came back checked. Debounced
  // because a dragged color picker fires a change per mouse move. Only these
  // team keys are written: other unsaved edits on the page stay unsaved.
  // The Save bar sticks just under the (also sticky) scene toolbar, whose
  // height depends on how many rows its buttons wrap to.
  const [stickyTop, setStickyTop] = useState(0);
  useEffect(() => {
    const measure = () => setStickyTop(document.querySelector('.scene-toolbar')?.offsetHeight || 0);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const saveTeamColor = (n, fields) => {
    setLocal(prev => ({ ...prev, ...fields }));
    teamPending.current[n] = { ...teamPending.current[n], ...fields };
    clearTimeout(teamTimers.current[n]);
    teamTimers.current[n] = setTimeout(async () => {
      const pending = teamPending.current[n];
      teamPending.current[n] = {};
      const color = pending[`team${n}Color`];
      const updates = { theme: pending };
      if (color) updates.teams = { [`team${n}`]: { color } };
      await updateState(updates);
      const auto = pending[`team${n}ColorAuto`];
      if (auto === undefined) return;
      await fetch(`${api}/api/overrides${auto ? '/clear' : ''}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(auto ? { path: `teams.team${n}.color` } : { paths: [`teams.team${n}.color`] }),
      });
    }, 250);
  };
  // Logo extraction while Auto is on: persist only a real change (same
  // pickBestBucket primary App.jsx's extractor writes, so they can't fight).
  const onExtracted = (n, hex) => {
    if ((state.theme || {})[`team${n}Color`] === hex) return updateSilent(`team${n}Color`, hex);
    saveTeamColor(n, { [`team${n}Color`]: hex });
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
    // A team-color save still in its debounce would re-apply the old color.
    for (const n of [1, 2]) { clearTimeout(teamTimers.current[n]); teamPending.current[n] = {}; }
    setLocal({ ...DEFAULT_THEME });
    await updateState({ theme: { ...DEFAULT_THEME } });
    // Also release any team-color locks left over from a prior save, so a
    // "reset" actually resets — otherwise FACEIT sync stays locked out.
    await fetch(`${api}/api/overrides/clear`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'teams.team1.color' }),
    });
    await fetch(`${api}/api/overrides/clear`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'teams.team2.color' }),
    });
    setDirty(false);
  };

  const allFonts = [...BUILTIN_FONTS, ...(customFonts || []).map(f => f.name)];

  return (
    <div>
      <div className="page-header">
        <h2>Theming</h2>
        <p>Customize overlay appearance and team colors</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, position: 'sticky', top: stickyTop, zIndex: 5, padding: '8px 0', background: 'var(--bg-primary, #0b0d14)' }}>
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
        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>Changes here go live immediately — no need to Save Theme.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 8 }}>
          <TeamColorSection
            label={state.teams?.team1?.name || 'Team 1'}
            color={local.team1Color || '#3b82f6'}
            auto={local.team1ColorAuto !== false}
            logoUrl={state.teams?.team1?.logo}
            api={api}
            onColorChange={v => saveTeamColor(1, { team1Color: v })}
            onExtractedColor={v => onExtracted(1, v)}
            onAutoChange={v => saveTeamColor(1, { team1ColorAuto: v })}
          />
          <TeamColorSection
            label={state.teams?.team2?.name || 'Team 2'}
            color={local.team2Color || '#ef4444'}
            auto={local.team2ColorAuto !== false}
            logoUrl={state.teams?.team2?.logo}
            api={api}
            onColorChange={v => saveTeamColor(2, { team2Color: v })}
            onExtractedColor={v => onExtracted(2, v)}
            onAutoChange={v => saveTeamColor(2, { team2ColorAuto: v })}
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

// onColorChange = user edits (dirties the form); onExtractedColor = programmatic
// logo extraction (must NOT dirty — a dirty form blocks broadcast resyncs).
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
      const buckets = sampleBuckets(data);
      const hex = pickBestBucket(buckets);
      setExtractedColor(hex);
      onExtractedColor(hex);
    };
    img.onerror = () => {
      setExtractedColor(ELMT_ACCENT_FALLBACK);
      onExtractedColor(ELMT_ACCENT_FALLBACK);
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

