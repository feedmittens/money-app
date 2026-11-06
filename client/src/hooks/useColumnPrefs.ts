import { useState, useEffect } from 'react';

export interface ColumnDef {
  key: string;
  label: string;
  default?: boolean;   // visible out of the box
  locked?: boolean;    // always visible, not toggleable (e.g. Actions)
}

// Persists which optional columns are visible for a given table, per browser,
// via localStorage. `locked` columns are always included regardless of
// saved state — this lets us add new locked columns later without breaking
// anyone's saved preferences.
export function useColumnPrefs(storageKey: string, allColumns: ColumnDef[]) {
  const key = `tally-columns-${storageKey}`;
  const defaults = () => new Set(allColumns.filter(c => c.default || c.locked).map(c => c.key));

  const [visible, setVisible] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        const set = new Set(parsed);
        for (const c of allColumns) if (c.locked) set.add(c.key);
        return set;
      }
    } catch { /* fall through to defaults */ }
    return defaults();
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify([...visible]));
  }, [visible, key]);

  function toggle(colKey: string) {
    const col = allColumns.find(c => c.key === colKey);
    if (col?.locked) return;
    setVisible(prev => {
      const next = new Set(prev);
      if (next.has(colKey)) next.delete(colKey);
      else next.add(colKey);
      return next;
    });
  }

  function reset() { setVisible(defaults()); }
  function isVisible(colKey: string) { return visible.has(colKey); }

  return { isVisible, toggle, reset, visible };
}
