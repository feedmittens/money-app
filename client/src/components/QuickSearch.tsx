import { useState, useEffect, useRef } from 'react';
import { searchTransactions } from '../api';
import type { SearchResult } from '../api';

const fmt = (n: number) =>
  Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

interface Props {
  onGoToAccount: (accountId: number, txnId: number) => void;
  onClose: () => void;
}

export default function QuickSearch({ onGoToAccount, onClose }: Props) {
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor,  setCursor]  = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer    = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (query.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await searchTransactions({ query: query.trim() });
        setResults(res.slice(0, 10));
        setCursor(0);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(timer.current);
  }, [query]);

  function select(r: SearchResult) {
    onGoToAccount(r.account_id, r.id);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    if (e.key === 'Enter' && results[cursor]) select(results[cursor]);
  }

  const hasResults = results.length > 0;
  const showHint   = query.trim().length < 2;
  const noResults  = !loading && !showHint && !hasResults;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          width: '100%', maxWidth: 560,
          boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Input row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          borderBottom: (hasResults || loading || noResults) ? '1px solid var(--border)' : 'none',
        }}>
          <span style={{ fontSize: 15, opacity: 0.45, flexShrink: 0 }}>🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search transactions…"
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: 15, background: 'transparent',
              color: 'var(--text)',
            }}
          />
          {loading && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>…</span>}
          <kbd style={{ fontSize: 10, opacity: 0.4, padding: '2px 6px', border: '1px solid var(--border)', borderRadius: 4 }}>Esc</kbd>
        </div>

        {/* Results */}
        {hasResults && (
          <>
            {results.map((r, i) => (
              <div
                key={r.id}
                onClick={() => select(r)}
                onMouseEnter={() => setCursor(i)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 16px', cursor: 'pointer',
                  background: i === cursor ? 'var(--primary-bg, rgba(99,102,241,0.08))' : 'transparent',
                  borderLeft: i === cursor ? '2px solid var(--primary)' : '2px solid transparent',
                  transition: 'background 0.1s',
                }}
              >
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums', minWidth: 72 }}>
                  {r.date}
                </span>
                <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.payee}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.account_name}
                </span>
                <span style={{
                  fontSize: 13, fontVariantNumeric: 'tabular-nums', flexShrink: 0, fontWeight: 600,
                  color: r.amount < 0 ? 'var(--danger)' : 'var(--success)',
                }}>
                  {fmt(r.amount)}
                </span>
              </div>
            ))}
            <div style={{
              padding: '7px 16px', fontSize: 11, color: 'var(--text-muted)',
              borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>↑↓ navigate · Enter to open account</span>
              <span>Showing top {results.length}</span>
            </div>
          </>
        )}

        {noResults && (
          <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
            No transactions found for "{query}"
          </div>
        )}

        {showHint && (
          <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
            Type 2+ characters to search payees and memos across all accounts
          </div>
        )}
      </div>
    </div>
  );
}
