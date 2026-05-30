import { useState } from 'react';
import { searchTransactions } from '../api';
import type { SearchResult, SearchParams } from '../api';
import type { Account } from '../types';

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

interface Props {
  accounts: Account[];
  onGoToAccount: (accountId: number) => void;
}

export default function Search({ accounts, onGoToAccount }: Props) {
  const [query,      setQuery]      = useState('');
  const [accountId,  setAccountId]  = useState('');
  const [dateFrom,   setDateFrom]   = useState('');
  const [dateTo,     setDateTo]     = useState('');
  const [amtMin,     setAmtMin]     = useState('');
  const [amtMax,     setAmtMax]     = useState('');
  const [taxOnly,    setTaxOnly]    = useState(false);
  const [results,    setResults]    = useState<SearchResult[] | null>(null);
  const [loading,    setLoading]    = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const params: SearchParams = {
      query:      query.trim() || undefined,
      account_id: accountId ? parseInt(accountId) : null,
      date_from:  dateFrom || undefined,
      date_to:    dateTo   || undefined,
      amount_min: amtMin ? parseFloat(amtMin) : null,
      amount_max: amtMax ? parseFloat(amtMax) : null,
      tax_only:   taxOnly,
    };
    setResults(await searchTransactions(params));
    setLoading(false);
  }

  function reset() {
    setQuery(''); setAccountId(''); setDateFrom(''); setDateTo('');
    setAmtMin(''); setAmtMax(''); setTaxOnly(false); setResults(null);
  }

  const totalFound = results?.length ?? 0;
  const totalAmt   = results?.reduce((s, r) => s + r.amount, 0) ?? 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Search</div>
          <div className="page-subtitle">Find transactions across all accounts</div>
        </div>
      </div>

      <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
        <form onSubmit={handleSearch}>
          <div className="form-row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ minWidth: 220 }}>
              <label>Search (payee or memo)</label>
              <input
                autoFocus
                type="text"
                placeholder="e.g. Amazon, grocery, rent…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <div className="form-group" style={{ minWidth: 160 }}>
              <label>Account</label>
              <select value={accountId} onChange={e => setAccountId(e.target.value)}>
                <option value="">All accounts</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ maxWidth: 145 }}>
              <label>Date from</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="form-group" style={{ maxWidth: 145 }}>
              <label>Date to</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div className="form-group" style={{ maxWidth: 110 }}>
              <label>Amount ≥</label>
              <input type="number" step="0.01" placeholder="0.00" value={amtMin} onChange={e => setAmtMin(e.target.value)} />
            </div>
            <div className="form-group" style={{ maxWidth: 110 }}>
              <label>Amount ≤</label>
              <input type="number" step="0.01" placeholder="0.00" value={amtMax} onChange={e => setAmtMax(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={taxOnly} onChange={e => setTaxOnly(e.target.checked)} />
              Tax relevant only
            </label>
            <button type="submit" className="btn btn-primary">Search</button>
            {results !== null && (
              <button type="button" className="btn btn-ghost" onClick={reset}>Clear</button>
            )}
          </div>
        </form>
      </div>

      {loading && <div className="empty-state">Searching…</div>}

      {!loading && results !== null && (
        <div className="card">
          <div className="card-header">
            <div>
              <span className="card-title">{totalFound} result{totalFound !== 1 ? 's' : ''}</span>
              {totalFound > 0 && (
                <div className="card-subtitle">
                  Net: <strong style={{ color: totalAmt >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(totalAmt)}</strong>
                </div>
              )}
            </div>
          </div>
          {totalFound === 0 ? (
            <div className="empty-state"><p>No transactions matched. Try different filters — or maybe the data really isn't there.</p></div>
          ) : (
            <table className="register-table">
              <thead>
                <tr>
                  <th>Date</th><th>Account</th><th>Payee</th><th>Category</th>
                  <th>Memo</th><th className="text-right">Amount</th><th style={{ width: 28 }}></th>
                </tr>
              </thead>
              <tbody>
                {results.map(r => (
                  <tr
                    key={r.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => onGoToAccount(r.account_id)}
                    title="Click to open this account"
                  >
                    <td className="text-muted">{r.date}</td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{r.account_name}</td>
                    <td style={{ fontWeight: 500 }}>
                      {r.payee}
                      {!!r.tax_relevant && <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--primary)', fontWeight: 700 }}>★</span>}
                    </td>
                    <td>
                      {r.category_name !== 'Uncategorized' && (
                        <span className="category-chip" style={{ background: r.category_color + '22', color: r.category_color }}>
                          {r.category_name}
                        </span>
                      )}
                    </td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{r.memo}</td>
                    <td className={`text-right ${r.amount < 0 ? 'amount-negative' : 'amount-positive'}`}>
                      {fmt(r.amount)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {!!r.cleared && <span className="cleared-badge cleared" style={{ pointerEvents: 'none' }} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
