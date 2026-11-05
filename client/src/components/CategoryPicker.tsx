import { useState, useEffect, useRef, useCallback } from 'react';
import type { Category } from '../types';

interface Props {
  value: string;            // selected category ID as string, or ''
  categories: Category[];
  onChange: (id: string) => void;
  onClose?: () => void;     // called on Esc or blur without selection
  autoFocus?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
}

export default function CategoryPicker({
  value, categories, onChange, onClose, autoFocus,
  placeholder = 'Search categories…', style, inputStyle,
}: Props) {
  const displayName = useCallback((cat: Category): string => {
    if (cat.parent_id) {
      const parent = categories.find(c => c.id === cat.parent_id);
      return parent ? `${parent.name}:${cat.name}` : cat.name;
    }
    return cat.name;
  }, [categories]);

  const currentCat  = categories.find(c => String(c.id) === value);
  const [query, setQuery]   = useState(currentCat ? displayName(currentCat) : '');
  const [open, setOpen]     = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      inputRef.current?.select();
      setOpen(true);
    }
  }, [autoFocus]);

  // Sync display when value changes externally
  useEffect(() => {
    const cat = categories.find(c => String(c.id) === value);
    setQuery(cat ? displayName(cat) : '');
  }, [value, categories, displayName]);

  const q = query.toLowerCase().trim();
  const filtered = categories
    .filter(cat => {
      const dn = displayName(cat).toLowerCase();
      return !q || dn.includes(q) || cat.name.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      // Exact-start matches first
      const adn = displayName(a).toLowerCase();
      const bdn = displayName(b).toLowerCase();
      const aStart = adn.startsWith(q) ? 0 : 1;
      const bStart = bdn.startsWith(q) ? 0 : 1;
      return aStart - bStart || adn.localeCompare(bdn);
    })
    .slice(0, 60);

  function select(cat: Category) {
    setQuery(displayName(cat));
    setOpen(false);
    onChange(String(cat.id));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && e.key !== 'Escape') {
      setOpen(true);
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setCursor(c => Math.min(c + 1, filtered.length - 1));
        scrollCursorIntoView(Math.min(cursor + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setCursor(c => Math.max(c - 1, 0));
        scrollCursorIntoView(Math.max(cursor - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (open && filtered[cursor]) select(filtered[cursor]);
        break;
      case 'Tab':
        if (open && filtered[cursor]) {
          e.preventDefault();
          select(filtered[cursor]);
        }
        setOpen(false);
        break;
      case 'Escape':
        setOpen(false);
        onClose?.();
        break;
    }
  }

  function scrollCursorIntoView(idx: number) {
    if (!listRef.current) return;
    const item = listRef.current.children[idx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }

  function handleBlur() {
    // Small delay so a mousedown on a list item fires before blur closes it
    setTimeout(() => {
      setOpen(false);
      onClose?.();
    }, 150);
  }

  // Group by parent for display
  const grouped = filtered.reduce<{ label: string; items: Category[] }[]>((acc, cat) => {
    const groupLabel = cat.parent_id
      ? (categories.find(c => c.id === cat.parent_id)?.name ?? 'Other')
      : cat.type === 'income' ? 'Income' : 'Expense';
    const existing = acc.find(g => g.label === groupLabel);
    if (existing) existing.items.push(cat);
    else acc.push({ label: groupLabel, items: [cat] });
    return acc;
  }, []);

  // Flat index into filtered for cursor tracking
  let flatIdx = 0;

  return (
    <div style={{ position: 'relative', ...style }}>
      <input
        ref={inputRef}
        value={query}
        placeholder={placeholder}
        onChange={e => { setQuery(e.target.value); setOpen(true); setCursor(0); }}
        onFocus={() => { setOpen(true); setCursor(0); }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        style={{
          width: '100%',
          fontSize: 13,
          padding: '4px 8px',
          borderRadius: 4,
          border: '1px solid var(--border)',
          background: 'var(--bg)',
          color: 'var(--text)',
          boxSizing: 'border-box',
          ...inputStyle,
        }}
      />
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          style={{
            position: 'absolute',
            zIndex: 2000,
            top: 'calc(100% + 2px)',
            left: 0,
            minWidth: '100%',
            maxHeight: 260,
            overflowY: 'auto',
            margin: 0,
            padding: 0,
            listStyle: 'none',
            background: 'var(--card-bg, var(--bg))',
            border: '1px solid var(--border)',
            borderRadius: 6,
            boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
          }}
        >
          {grouped.map(group => (
            <li key={group.label}>
              {/* Only show group header when not actively filtering */}
              {!q && (
                <div style={{
                  padding: '4px 10px 2px',
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: 'var(--text-muted)',
                  background: 'var(--bg)',
                  position: 'sticky',
                  top: 0,
                }}>
                  {group.label}
                </div>
              )}
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {group.items.map(cat => {
                  const idx = flatIdx++;
                  const isActive = idx === cursor;
                  return (
                    <li
                      key={cat.id}
                      onMouseDown={e => { e.preventDefault(); select(cat); }}
                      onMouseEnter={() => setCursor(idx)}
                      style={{
                        padding: '6px 12px',
                        fontSize: 13,
                        cursor: 'pointer',
                        background: isActive ? 'var(--primary)' : undefined,
                        color: isActive ? '#fff' : undefined,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {displayName(cat)}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
