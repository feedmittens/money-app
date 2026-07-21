import { useState, useEffect } from 'react';
import { getForecast, getForecastDetail } from '../api';
import type { ForecastPoint, CashFlowItem } from '../api';
import type { Account } from '../types';
import {
  AreaChart,  Area,
  LineChart,  Line,
  BarChart,   Bar,  Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts';

const fmt = (n: number | string) =>
  Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const fmtK = (n: number) => {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
};

function downloadCsv(filename: string, rows: string[][], headers: string[]) {
  const esc   = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))];
  const blob  = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url   = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: filename }).click();
  URL.revokeObjectURL(url);
}

type ChartType = 'area' | 'line' | 'bar';

const CHART_LABELS: Record<ChartType, string> = {
  area: 'Area',
  line: 'Line',
  bar:  'Bar',
};

const SHARED_AXES = (fmtK: (n: number) => string) => ({
  xAxis: <XAxis dataKey="label" tick={{ fontSize: 11 }} />,
  yAxis: <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} width={64} domain={['auto', 'auto']} />,
  grid:  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />,
  tooltip: (
    <Tooltip
      formatter={(v) => [fmt(Number(v ?? 0)), 'Balance']}
      contentStyle={{ fontSize: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}
    />
  ),
});

interface Props {
  accounts: Account[];
}

export default function Forecast({ accounts }: Props) {
  const [forecastMonths,   setForecastMonths]   = useState(12);
  const [forecastCustom,   setForecastCustom]   = useState(false);
  const [forecastEndDate,  setForecastEndDate]  = useState('');
  const [chartType,        setChartType]        = useState<ChartType>('area');
  const [forecast,         setForecast]         = useState<ForecastPoint[]>([]);
  const [cashFlow,         setCashFlow]         = useState<CashFlowItem[]>([]);
  const [loading,          setLoading]          = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<number[]>([]);

  useEffect(() => { load(); }, [forecastMonths, forecastCustom, forecastEndDate, selectedAccounts]);

  async function load() {
    setLoading(true);
    let months = forecastMonths;
    if (forecastCustom && forecastEndDate) {
      months = Math.max(1, Math.ceil(
        (new Date(forecastEndDate).getTime() - Date.now()) / (30.44 * 24 * 60 * 60 * 1000)
      ));
    }
    setCashFlow([]);
    const days    = Math.min(months * 31, 365);
    const ids     = selectedAccounts.length ? selectedAccounts : undefined;
    const [fc, cf] = await Promise.all([getForecast(months, ids), getForecastDetail(days, ids)]);
    setForecast(fc);
    setCashFlow(cf);
    setLoading(false);
  }

  function toggleAccount(id: number) {
    setSelectedAccounts(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  const forecastMin   = forecast.length ? Math.min(...forecast.map(p => p.balance)) : 0;
  const forecastLast  = forecast[forecast.length - 1];
  const forecastNow   = forecast[0];
  const forecastDelta = forecastLast && forecastNow ? forecastLast.balance - forecastNow.balance : 0;
  const forecastFuture  = forecast.slice(1);
  const forecastHighPt  = forecastFuture.length ? forecastFuture.reduce((b, p) => p.balance > b.balance ? p : b) : null;
  const forecastLowPt   = forecastFuture.length ? forecastFuture.reduce((b, p) => p.balance < b.balance ? p : b) : null;
  const highlightColor  = forecastMin < 0 ? '#ef4444' : '#22c55e';

  const axes = SHARED_AXES(fmtK);

  const refElements = (
    <>
      {forecastMin < 0 && <ReferenceLine y={0} stroke="var(--danger)" strokeDasharray="4 2" />}
      {forecastHighPt && forecastHighPt !== forecastLowPt && chartType !== 'bar' && (
        <ReferenceDot x={forecastHighPt.label} y={forecastHighPt.balance}
          r={5} fill="#22c55e" stroke="white" strokeWidth={2}
          label={{ value: `▲ ${fmtK(forecastHighPt.balance)}`, position: 'top', fill: '#22c55e', fontSize: 11, fontWeight: 600 }} />
      )}
      {forecastLowPt && forecastHighPt !== forecastLowPt && chartType !== 'bar' && (
        <ReferenceDot x={forecastLowPt.label} y={forecastLowPt.balance}
          r={5} fill="#ef4444" stroke="white" strokeWidth={2}
          label={{ value: `▼ ${fmtK(forecastLowPt.balance)}`, position: 'bottom', fill: '#ef4444', fontSize: 11, fontWeight: 600 }} />
      )}
    </>
  );

  const titleSuffix = forecastCustom && forecastEndDate
    ? `through ${forecastEndDate}`
    : `next ${forecastMonths} month${forecastMonths === 1 ? '' : 's'}`;

  const accountLabel = selectedAccounts.length === 0
    ? 'All accounts'
    : selectedAccounts.length === 1
      ? accounts.find(a => a.id === selectedAccounts[0])?.name ?? '1 account'
      : `${selectedAccounts.length} accounts`;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Balance Forecast</div>
          {forecastLast && (
            <div className="page-subtitle">
              {titleSuffix} · {accountLabel} · Projected: <strong style={{ color: forecastLast.balance < 0 ? 'var(--danger)' : 'var(--success)' }}>{fmt(forecastLast.balance)}</strong>
              {' '}
              <span style={{ color: forecastDelta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                ({forecastDelta >= 0 ? '+' : ''}{fmt(forecastDelta)})
              </span>
            </div>
          )}
        </div>
        <button className="btn btn-secondary no-print" onClick={() => window.print()}
          title="Print or save as PDF">🖨 Print / Save as PDF</button>
      </div>

      {/* Controls */}
      <div className="card no-print" style={{ padding: '12px 16px', marginBottom: 16, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {/* Account filter */}
        {accounts.length > 1 && (
          <div className="form-group">
            <label>Accounts</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              <button
                className={`btn btn-sm ${selectedAccounts.length === 0 ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedAccounts([])}
              >All</button>
              {accounts.map(a => (
                <button
                  key={a.id}
                  className={`btn btn-sm ${selectedAccounts.includes(a.id) ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => toggleAccount(a.id)}
                  title={a.name}
                  style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >{a.name}</button>
              ))}
            </div>
          </div>
        )}
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
            <input type="date" value={forecastEndDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={e => setForecastEndDate(e.target.value)} />
          </div>
        )}
        <div className="form-group">
          <label>Chart type</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['area', 'line', 'bar'] as ChartType[]).map(t => (
              <button key={t}
                className={`btn btn-sm ${chartType === t ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setChartType(t)}
              >{CHART_LABELS[t]}</button>
            ))}
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-end' }}
          onClick={() => downloadCsv('cash-flow-forecast.csv',
            cashFlow.map(i => [i.date, i.description, i.source, String(i.amount), String(i.running_balance)]),
            ['Date', 'Description', 'Type', 'Amount', 'Running Balance']
          )}>Export CSV</button>
      </div>

      {loading && <div className="empty-state">Loading…</div>}

      {!loading && forecast.length > 0 && (
        <div className="card">
          <div style={{ padding: '8px 16px 4px', fontSize: 12, color: 'var(--text-muted)' }} className="no-print">
            Includes scheduled bills and future-dated transactions. Weekly ×4/month, biweekly ×2/month.
          </div>

          {/* Chart */}
          <div style={{ height: 340, padding: '8px 16px 16px' }}>
            <ResponsiveContainer width="100%" height="100%">
              {chartType === 'area' ? (
                <AreaChart data={forecast} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="fcastGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={highlightColor} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={highlightColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  {axes.grid} {axes.xAxis} {axes.yAxis} {axes.tooltip}
                  {refElements}
                  <Area type="monotone" dataKey="balance"
                    stroke={highlightColor} strokeWidth={2}
                    fill="url(#fcastGrad)" dot={false} activeDot={{ r: 4 }} />
                </AreaChart>
              ) : chartType === 'line' ? (
                <LineChart data={forecast} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
                  {axes.grid} {axes.xAxis} {axes.yAxis} {axes.tooltip}
                  {refElements}
                  <Line type="monotone" dataKey="balance"
                    stroke={highlightColor} strokeWidth={2}
                    dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              ) : (
                <BarChart data={forecast} margin={{ top: 10, right: 16, left: 8, bottom: 0 }}>
                  {axes.grid} {axes.xAxis} {axes.yAxis} {axes.tooltip}
                  {forecastMin < 0 && <ReferenceLine y={0} stroke="var(--danger)" strokeDasharray="4 2" />}
                  <Bar dataKey="balance" radius={[3, 3, 0, 0]}>
                    {forecast.map((entry, i) => (
                      <Cell key={i} fill={
                        entry === forecastHighPt ? '#22c55e' :
                        entry === forecastLowPt  ? '#ef4444' :
                        i === 0                  ? '#94a3b8' :
                        highlightColor + 'bb'
                      } />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* Legend for bar chart */}
          {chartType === 'bar' && forecastHighPt && forecastHighPt !== forecastLowPt && (
            <div className="no-print" style={{ display: 'flex', gap: 16, padding: '4px 16px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
              <span><span style={{ color: '#22c55e', fontWeight: 700 }}>■</span> Peak — {forecastHighPt.label} ({fmt(forecastHighPt.balance)})</span>
              <span><span style={{ color: '#ef4444', fontWeight: 700 }}>■</span> Trough — {forecastLowPt!.label} ({fmt(forecastLowPt!.balance)})</span>
              <span><span style={{ color: '#94a3b8', fontWeight: 700 }}>■</span> Now</span>
            </div>
          )}

          {/* Cash flow table */}
          {cashFlow.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 16px' }}>
              <p>No future bills or scheduled transactions in this window.</p>
            </div>
          ) : (
            <table className="register-table" style={{ borderTop: '1px solid var(--border)' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th className="no-print">Type</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">Running Balance</th>
                </tr>
              </thead>
              <tbody>
                {cashFlow.map((item, i) => (
                  <tr key={i}>
                    <td className="text-muted">{item.date}</td>
                    <td style={{ fontWeight: 500 }}>
                      {item.description}
                      {item.category && <span className="text-muted" style={{ fontSize: 11, marginLeft: 6 }}>{item.category}</span>}
                    </td>
                    <td className="no-print">
                      <span style={{
                        fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                        padding: '1px 6px', borderRadius: 3,
                        background: item.source === 'bill' ? 'var(--primary)18' : '#8b5cf618',
                        color:      item.source === 'bill' ? 'var(--primary)'   : '#8b5cf6',
                      }}>{item.source === 'bill' ? 'Bill' : 'Txn'}</span>
                    </td>
                    <td className={`text-right ${item.amount < 0 ? 'amount-negative' : 'amount-positive'}`} style={{ fontWeight: 500 }}>
                      {item.amount >= 0 ? '+' : ''}{fmt(item.amount)}
                    </td>
                    <td className="text-right" style={{ fontWeight: 600, color: item.running_balance < 0 ? 'var(--danger)' : undefined }}>
                      {fmt(item.running_balance)}
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
