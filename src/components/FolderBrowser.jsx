import { useState, useEffect, useRef } from 'react';

export default function FolderBrowser({ api, currentPath, onSelect, onClose }) {
  const [browsePath, setBrowsePath] = useState(currentPath || '');
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [parent, setParent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const modalRef = useRef(null);

  const browse = async (dir) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${api}/api/browse?path=${encodeURIComponent(dir)}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setBrowsePath(data.path);
        setParent(data.parent);
        setFolders(data.folders || []);
        setFiles(data.files || []);
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  useEffect(() => {
    browse(currentPath || '/home');
  }, []);

  // Close on click outside
  useEffect(() => {
    const handler = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }}>
      <div ref={modalRef} style={{
        background: 'var(--bg-card, #1a1f2e)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, width: 560, maxHeight: '70vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>📂 Select Folder</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: '1.1rem', padding: '2px 6px',
          }}>✕</button>
        </div>

        {/* Path bar */}
        <div style={{
          padding: '8px 16px', display: 'flex', gap: 6, alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          <input
            className="input"
            style={{ flex: 1, fontSize: '0.75rem', fontFamily: 'monospace' }}
            value={browsePath}
            onChange={e => setBrowsePath(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && browse(browsePath)}
          />
          <button className="btn btn-ghost btn-sm" onClick={() => browse(browsePath)}
            style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>Go</button>
        </div>

        {error && (
          <div style={{ padding: '6px 16px', fontSize: '0.7rem', color: '#ef4444' }}>{error}</div>
        )}

        {/* Directory listing */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {loading ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Loading...</div>
          ) : (
            <>
              {/* Parent directory */}
              {parent && parent !== browsePath && (
                <div
                  onClick={() => browse(parent)}
                  style={{
                    padding: '7px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: '0.8rem', color: 'var(--text-secondary)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span>⬆️</span>
                  <span style={{ opacity: 0.7 }}>..</span>
                </div>
              )}

              {/* Folders */}
              {folders.map(f => (
                <div
                  key={f}
                  onClick={() => browse(browsePath.replace(/\/$/, '') + '/' + f)}
                  style={{
                    padding: '7px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: '0.8rem', color: 'var(--text-primary)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span>📁</span>
                  <span>{f}</span>
                </div>
              ))}

              {/* Files (read-only info) */}
              {files.map(f => (
                <div
                  key={f}
                  style={{
                    padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: '0.75rem', color: 'var(--text-muted)',
                  }}
                >
                  <span>{/\.(mp4|webm|mkv|avi|mov)$/i.test(f) ? '🎬' : '🎵'}</span>
                  <span>{f}</span>
                </div>
              ))}

              {folders.length === 0 && files.length === 0 && (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  Empty folder
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer — file count + select button */}
        <div style={{
          padding: '10px 16px', borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {folders.length} folders{files.length > 0 ? `, ${files.length} media files` : ''}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={() => { onSelect(browsePath); onClose(); }}>
              ✓ Select This Folder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
