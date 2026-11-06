import { useState, useRef, useEffect } from 'react';
import type { ColumnDef } from '../hooks/useColumnPrefs';

interface Props {
  columns: ColumnDef[];
  isVisible: (key: string) => boolean;
  toggle: (key: string) => void;
  reset: () => void;
}

// A "⚙ Columns" button that opens a checkbox dropdown for toggling optional
// table columns. Locked columns (e.g. Actions) are shown but disabled.
export default function ColumnPicker({ columns, isVisible, toggle, reset }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setOpen(o => !o)}
        title="Choose which columns to show"
      >
        ⚙ Columns
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50,
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.16)', padding: '8px 0', minWidth: 180,
          }}
        >
          {columns.map(c => (
            <label
              key={c.key}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
                fontSize: 13, cursor: c.locked ? 'default' : 'pointer', userSelect: 'none',
                opacity: c.locked ? 0.55 : 1,
              }}
            >
              <input
                type="checkbox"
                checked={isVisible(c.key)}
                disabled={c.locked}
                onChange={() => toggle(c.key)}
              />
              <span>{c.label}{c.locked ? ' (always shown)' : ''}</span>
            </label>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ width: '100%', fontSize: 12, textAlign: 'left', padding: '4px 14px' }}
              onClick={reset}
            >
              ↺ Reset to default
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
