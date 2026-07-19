import { useState, useEffect } from 'react';
import { reportSpendingByCategory, reportMonthlySummary, reportTaxSummary, downloadTaxAttachmentsZip } from '../api';
import type { CategorySpend, MonthlyRow, TaxRow } from '../api';

const fmt = (n: number | string) =>
  Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

function downloadCsv(filename: string, rows: string[][], headers: string[]) {
  const esc   = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))];
  const blob  = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url   = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

function defaultDateRange() {
  const now  = new Date();
  const from = `${now.getFullYear()}-01-01`;
  const to   = now.toISOString().slice(0, 10);
  return { from, to };
}

type Tab = 'spending' | 'monthly' | 'tax';

export default function Reports() {
  const [tab,     setTab]     = useState<Tab>('spending');
  const [range,   setRange]   = useState(defaultDateRange());
  const [taxYear, setTaxYear] = useState(String(new Date().getFullYear()));
  const [spending, setSpending] = useState<CategorySpend[]>([]);
  const [monthly,  setMonthly]  = useState<MonthlyRow[]>([]);
  const [taxRows,  setTaxRows]  = useState<TaxRow[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [zipBusy,  setZipBusy]  = useState(false);
  const [zipError, setZipError] = useState('');

  useEffect(() => { runReport(); }, [tab, range, taxYear]);

  async function runReport() {
    setLoading(true);
    try {
      if (tab === 'spending') setSpending(await reportSpendingByCategory(range.from, range.to));
      if (tab === 'monthly')  setMonthly(await reportMonthlySummary());
      if (tab === 'tax')      setTaxRows(await reportTaxSummary(taxYear));
    } finally {
      setLoading(false);
    }
  }

  const totalSpend     = spending.reduce((s, r) => s + r.total, 0);
  const totalTaxDebit  = taxRows.filter(r => r.amount < 0).reduce((s, r) => s + r.amount, 0);
  const totalTaxCredit = taxRows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const years = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - i));

  const tabs: [Tab, string][] = [
    ['spending', 'Spending by Category'],
    ['monthly',  'Monthly Summary'],
    ['tax',      'Tax Summary'],
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Reports</div>
          <div className="page-subtitle">Aggregated views of your financial data</div>
        </div>
        <button className="btn btn-secondary no-print" onClick={() => window.print()}
          title="Print or save as PDF">🖨 Print / Save as PDF</button>
      </div>

      {/* Tabs */}
      <div className="no-print" style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(([t, l]) => (
          <button key={t}
            className={`btn ${tab === t ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t)}
          >{l}</button>
        ))}
      </div>

      {/* Filters */}
      <div className="card no-print" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {tab === 'tax' ? (
          <div className="form-group" style={{ maxWidth: 120 }}>
            <label>Tax year</label>
            <select value={taxYear} onChange={e => setTaxYear(e.target.value)}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        ) : (
          <>
            <div className="form-group" style={{ maxWidth: 150 }}>
              <label>From</label>
              <input type="date" value={range.from} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} />
            </div>
            <div className="form-group" style={{ maxWidth: 150 }}>
              <label>To</label>
              <input type="date" value={range.to} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} />
            </div>
          </>
        )}
      </div>

      {loading && <div className="empty-state">Loading…</div>}

      {/* Spending by Category */}
      {!loading && tab === 'spending' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Spending by Category — {range.from} to {range.to}</span>
            <button className="btn btn-secondary btn-sm no-print" onClick={() =>
              downloadCsv('spending-by-category.csv',
                spending.map(r => [r.category_name, String(Math.abs(r.total)), String(r.count)]),
                ['Category', 'Total Spent', 'Transactions'])
            }>Export CSV</button>
          </div>
          {spending.length === 0 ? (
            <div className="empty-state"><p>No expense transactions in this date range.</p></div>
          ) : (
            <table className="register-table">
              <thead><tr><th>Category</th><th className="text-right">Transactions</th><th className="text-right">Total</th><th className="text-right">% of Spending</th></tr></thead>
              <tbody>
                {spending.map(r => (
                  <tr key={r.category_name}>
                    <td>
                      <span className="category-chip" style={{ background: r.category_color + '22', color: r.category_color }}>
                        {r.category_name}
                      </span>
                    </td>
                    <td className="text-right text-muted">{r.count}</td>
                    <td className="text-right amount-negative">{fmt(Math.abs(r.total))}</td>
                    <td className="text-right text-muted">
                      {totalSpend !== 0 ? ((r.total / totalSpend) * 100).toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid var(--border)' }}>
                  <td>Total</td><td></td>
                  <td className="text-right amount-negative">{fmt(Math.abs(totalSpend))}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* Monthly Summary */}
      {!loading && tab === 'monthly' && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Monthly Income vs. Expenses (last 24 months)</span>
            <button className="btn btn-secondary btn-sm no-print" onClick={() =>
              downloadCsv('monthly-summary.csv',
                monthly.map(r => [r.month, String(r.income), String(r.expenses), String(r.net)]),
                ['Month', 'Income', 'Expenses', 'Net'])
            }>Export CSV</button>
          </div>
          {monthly.length === 0 ? (
            <div className="empty-state"><p>No transactions found.</p></div>
          ) : (
            <table className="register-table">
              <thead><tr><th>Month</th><th className="text-right">Income</th><th className="text-right">Expenses</th><th className="text-right">Net</th></tr></thead>
              <tbody>
                {monthly.map(r => (
                  <tr key={r.month}>
                    <td className="text-muted">{r.month}</td>
                    <td className="text-right amount-positive">{fmt(r.income)}</td>
                    <td className="text-right amount-negative">{fmt(r.expenses)}</td>
                    <td className="text-right" style={{ fontWeight: 600, color: r.net >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {fmt(r.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tax Summary */}
      {!loading && tab === 'tax' && (
        <div className="card">
          <div className="card-header">
            <div>
              <span className="card-title">Tax-Relevant Transactions — {taxYear}</span>
              <div className="card-subtitle">
                {taxRows.length} transactions · Debits: {fmt(Math.abs(totalTaxDebit))} · Credits: {fmt(totalTaxCredit)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm no-print" onClick={() =>
                downloadCsv(`tax-summary-${taxYear}.csv`,
                  taxRows.map(r => [r.date, r.payee, String(r.amount), r.category_name, r.account_name, r.memo, r.attachment_count > 0 ? 'Yes' : 'No']),
                  ['Date','Payee','Amount','Category','Account','Memo','Has Attachment'])
              }>Export CSV</button>
              <button className="btn btn-secondary btn-sm no-print"
                disabled={zipBusy}
                title="Download a ZIP of all attachments on tax-relevant transactions for this year"
                onClick={async () => {
                  setZipBusy(true); setZipError('');
                  try { await downloadTaxAttachmentsZip(taxYear); }
                  catch (e: unknown) { setZipError((e as Error).message); }
                  finally { setZipBusy(false); }
                }}>
                {zipBusy ? 'Preparing…' : '⬇ Download Attachments ZIP'}
              </button>
            </div>
          </div>
          {zipError && (
            <div style={{ padding: '8px 16px', color: 'var(--danger)', fontSize: 13 }}>{zipError}</div>
          )}
          {taxRows.length === 0 ? (
            <div className="empty-state">
              <p>No tax-relevant transactions for {taxYear}. Mark transactions as "Tax relevant" in the register.</p>
            </div>
          ) : (
            <table className="register-table">
              <thead>
                <tr>
                  <th>Date</th><th>Payee</th><th>Category</th><th>Account</th>
                  <th className="text-right">Amount</th><th style={{ width: 40 }}>📎</th>
                </tr>
              </thead>
              <tbody>
                {taxRows.map(r => (
                  <tr key={r.id}>
                    <td className="text-muted">{r.date}</td>
                    <td style={{ fontWeight: 500 }}>{r.payee}</td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{r.category_name}</td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{r.account_name}</td>
                    <td className={`text-right ${r.amount < 0 ? 'amount-negative' : 'amount-positive'}`}>
                      {fmt(r.amount)}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: 12 }}>
                      {r.attachment_count > 0 && <span title={`${r.attachment_count} attachment(s)`}>📎</span>}
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
