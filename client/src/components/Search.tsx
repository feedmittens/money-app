import { useState } from 'react';
import { searchTransactions } from '../api';
import type { SearchResult, SearchParams } from '../api';
import type { Account } from '../types';
import SortTh from './SortTh';

const fmt = (n: number | string) =>
  Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

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
  const [sortCol,    setSortCol]    = useState('date');
  const [sortDir,    setSortDir]    = useState<'asc' | 'desc'>('desc');

  function handleSort(col: string) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const sorted = results ? [...results].sort((a, b) => {
    let av: string | number = a[sortCol as keyof SearchResult] as string | number ?? '';
    let bv: string | number = b[sortCol as keyof SearchResult] as string | number ?? '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    return sortDir === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
  }) : null;

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

  function exportCsv() {
    if (!results?.length) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [
      ['Date', 'Account', 'Payee', 'Category', 'Memo', 'Amount', 'Cleared', 'Tax Relevant'].map(esc).join(','),
      ...results.map(r => [r.date, r.account_name, r.payee, r.category_name, r.memo ?? '',
        r.amount, r.cleared ? 'Y' : 'N', r.tax_relevant ? 'Y' : 'N'].map(esc).join(',')),
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'tally-search.csv' });
    a.click(); URL.revokeObjectURL(a.href);
  }

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
            {totalFound > 0 && (
              <button className="btn btn-secondary btn-sm" onClick={exportCsv} title="Export results to CSV">
                Export CSV
              </button>
            )}
          </div>
          {totalFound === 0 ? (
            <div className="empty-state"><p>No transactions matched. Try different filters — or maybe the data really isn't there.</p></div>
          ) : (
            <div className="register-table-wrapper">
            <table className="register-table">
              <thead>
                <tr>
                  <SortTh label="Date"    col="date"         sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Account" col="account_name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh label="Payee"   col="payee"        sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <th>Category</th>
                  <th>Memo</th>
                  <SortTh label="Amount"  col="amount"       sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-right" />
                  <th style={{ width: 28 }}></th>
                </tr>
              </thead>
              <tbody>
                {(sorted ?? []).map(r => (
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
