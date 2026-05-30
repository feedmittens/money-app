import { useState, useEffect } from 'react';
import { reportSpendingByCategory, reportMonthlySummary, reportTaxSummary, getForecast } from '../api';
import type { CategorySpend, MonthlyRow, TaxRow, ForecastPoint } from '../api';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

const fmt = (n: number | string) =>
  Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const fmtK = (n: number) => {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
};

function downloadCsv(filename: string, rows: string[][], headers: string[]) {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

function defaultDateRange() {
  const now = new Date();
  const from = `${now.getFullYear()}-01-01`;
  const to   = now.toISOString().slice(0, 10);
  return { from, to };
}

type Tab = 'spending' | 'monthly' | 'tax' | 'forecast';

export default function Reports() {
  const [tab, setTab]             = useState<Tab>('spending');
  const [range, setRange]         = useState(defaultDateRange());
  const [taxYear, setTaxYear]     = useState(String(new Date().getFullYear()));
  const [forecastMonths,   setForecastMonths]   = useState(12);
  const [forecastCustom,   setForecastCustom]   = useState(false);
  const [forecastEndDate,  setForecastEndDate]  = useState('');
  const [spending, setSpending]   = useState<CategorySpend[]>([]);
  const [monthly,  setMonthly]    = useState<MonthlyRow[]>([]);
  const [taxRows,  setTaxRows]    = useState<TaxRow[]>([]);
  const [forecast, setForecast]   = useState<ForecastPoint[]>([]);
  const [loading,  setLoading]    = useState(false);

  useEffect(() => { runReport(); }, [tab, range, taxYear, forecastMonths, forecastCustom, forecastEndDate]);

  async function runReport() {
    setLoading(true);
    try {
      if (tab === 'spending')  setSpending(await reportSpendingByCategory(range.from, range.to));
      if (tab === 'monthly')   setMonthly(await reportMonthlySummary());
      if (tab === 'tax')       setTaxRows(await reportTaxSummary(taxYear));
      if (tab === 'forecast') {
        let months = forecastMonths;
        if (forecastCustom && forecastEndDate) {
          const end = new Date(forecastEndDate);
          const now = new Date();
          months = Math.max(1, Math.ceil((end.getTime() - now.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
        }
        setForecast(await getForecast(months));
      }
    } finally {
      setLoading(false);
    }
  }

  const totalSpend     = spending.reduce((s, r) => s + r.total, 0);
  const totalTaxDebit  = taxRows.filter(r => r.amount < 0).reduce((s, r) => s + r.amount, 0);
  const totalTaxCredit = taxRows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0);

  const years = Array.from({ length: 10 }, (_, i) => String(new Date().getFullYear() - i));

  const forecastMin  = forecast.length ? Math.min(...forecast.map(p => p.balance)) : 0;
  const forecastMax  = forecast.length ? Math.max(...forecast.map(p => p.balance)) : 0;
  const forecastLast = forecast[forecast.length - 1];
  const forecastNow  = forecast[0];
  const forecastDelta = forecastLast && forecastNow ? forecastLast.balance - forecastNow.balance : 0;

  const tabs: [Tab, string][] = [
    ['spending', 'Spending by Category'],
    ['monthly',  'Monthly Summary'],
    ['tax',      'Tax Summary'],
    ['forecast', 'Balance Forecast'],
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Reports</div>
          <div className="page-subtitle">Aggregated views of your financial data</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {tabs.map(([t, l]) => (
          <button
            key={t}
            className={`btn ${tab === t ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t)}
          >{l}</button>
        ))}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {tab === 'tax' ? (
          <div className="form-group" style={{ maxWidth: 120 }}>
            <label>Tax year</label>
            <select value={taxYear} onChange={e => setTaxYear(e.target.value)}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        ) : tab === 'forecast' ? (
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ maxWidth: 160 }}>
              <label>Look ahead</label>
              <select
                value={forecastCustom ? 'custom' : String(forecastMonths)}
                onChange={e => {
                  if (e.target.value === 'custom') { setForecastCustom(true); }
                  else { setForecastCustom(false); setForecastMonths(parseInt(e.target.value)); }
                }}
              >
                <option value={1}>1 month</option>
                <option value={3}>3 months</option>
                <option value={6}>6 months</option>
                <option value={12}>12 months</option>
                <option value={24}>24 months</option>
                <option value={36}>36 months</option>
                <option value="custom">Custom date…</option>
              </select>
            </div>
            {forecastCustom && (
              <div className="form-group" style={{ maxWidth: 180 }}>
                <label>End date</label>
                <input
                  type="date"
                  value={forecastEndDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={e => setForecastEndDate(e.target.value)}
                />
              </div>
            )}
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
            <button className="btn btn-secondary btn-sm" onClick={() =>
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
            <button className="btn btn-secondary btn-sm" onClick={() =>
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
            <button className="btn btn-secondary btn-sm" onClick={() =>
              downloadCsv(`tax-summary-${taxYear}.csv`,
                taxRows.map(r => [r.date, r.payee, String(r.amount), r.category_name, r.account_name, r.memo, r.attachment_count > 0 ? 'Yes' : 'No']),
                ['Date','Payee','Amount','Category','Account','Memo','Has Attachment'])
            }>Export CSV</button>
          </div>
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

      {/* Balance Forecast */}
      {!loading && tab === 'forecast' && (
        <div className="card">
          <div className="card-header">
            <div>
              <span className="card-title">Balance Forecast — {forecastCustom && forecastEndDate ? `through ${forecastEndDate}` : `next ${forecastMonths} month${forecastMonths === 1 ? '' : 's'}`}</span>
              {forecastLast && (
                <div className="card-subtitle">
                  Projected balance: <strong style={{ color: forecastLast.balance < 0 ? 'var(--danger)' : 'var(--success)' }}>{fmt(forecastLast.balance)}</strong>
                  {' · '}
                  <span style={{ color: forecastDelta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {forecastDelta >= 0 ? '+' : ''}{fmt(forecastDelta)} over period
                  </span>
                </div>
              )}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() =>
              downloadCsv('balance-forecast.csv',
                forecast.map(p => [p.month, p.label, String(p.balance)]),
                ['Month', 'Label', 'Projected Balance'])
            }>Export CSV</button>
          </div>

          {forecast.length === 0 ? (
            <div className="empty-state"><p>No data to forecast. Add accounts and bills first.</p></div>
          ) : (
            <>
              <div style={{ padding: '8px 16px 4px', fontSize: 12, color: 'var(--text-muted)' }}>
                Includes scheduled bills and already-entered future transactions. Weekly bills projected at ×4/month, biweekly at ×2/month.
              </div>
              <div style={{ height: 320, padding: '8px 16px 16px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecast} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={forecastMin < 0 ? '#ef4444' : '#22c55e'} stopOpacity={0.2} />
                        <stop offset="95%" stopColor={forecastMin < 0 ? '#ef4444' : '#22c55e'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={64} domain={['auto', 'auto']} />
                    <Tooltip
                      formatter={(v: number) => [fmt(v), 'Balance']}
                      contentStyle={{ fontSize: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}
                    />
                    {forecastMin < 0 && <ReferenceLine y={0} stroke="var(--danger)" strokeDasharray="4 2" />}
                    <Area
                      type="monotone"
                      dataKey="balance"
                      stroke={forecastMin < 0 ? '#ef4444' : '#22c55e'}
                      strokeWidth={2}
                      fill="url(#forecastGrad)"
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Summary table */}
              <table className="register-table" style={{ borderTop: '1px solid var(--border)' }}>
                <thead>
                  <tr><th>Period</th><th className="text-right">Projected Balance</th><th className="text-right">Change</th></tr>
                </thead>
                <tbody>
                  {forecast.slice(1).map((p, i) => {
                    const prev = forecast[i];
                    const delta = p.balance - prev.balance;
                    return (
                      <tr key={p.month}>
                        <td className="text-muted">{p.label}</td>
                        <td className="text-right" style={{ fontWeight: 600, color: p.balance < 0 ? 'var(--danger)' : undefined }}>
                          {fmt(p.balance)}
                        </td>
                        <td className="text-right" style={{ fontSize: 12, color: delta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                          {delta >= 0 ? '+' : ''}{fmt(delta)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
