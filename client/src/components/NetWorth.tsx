import { useState, useEffect } from 'react';
import type { Account, NetWorthPoint } from '../types';
import { getNetWorth } from '../api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Area, AreaChart, ReferenceLine,
} from 'recharts';

const fmt = (n: number | string) =>
  Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const fmtK = (n: number) => {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
};

interface Props {
  accounts: Account[];
}

export default function NetWorth({ accounts }: Props) {
  const [data, setData] = useState<NetWorthPoint[]>([]);
  const [months, setMonths] = useState(12);

  useEffect(() => {
    getNetWorth(months).then(setData);
  }, [months]);

  const latest = data[data.length - 1];
  const first   = data[0];
  const change  = latest && first ? latest.net_worth - first.net_worth : 0;

  const totalAssets      = accounts.filter(a => a.type !== 'credit').reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = accounts.filter(a => a.type === 'credit').reduce((s, a) => s + Math.abs(Math.min(a.balance, 0)), 0);
  const currentNetWorth  = totalAssets - totalLiabilities;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Net Worth</div>
          <div className="page-subtitle">Assets minus liabilities over time</div>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Show:</span>
          {[6, 12, 24].map(m => (
            <button
              key={m}
              className={`btn btn-sm ${months === m ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setMonths(m)}
            >
              {m}mo
            </button>
          ))}
        </div>
      </div>

      <div className="summary-cards">
        <div className="summary-card">
          <div className="label">Net Worth</div>
          <div className="value" style={{ color: currentNetWorth >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {fmt(currentNetWorth)}
          </div>
        </div>
        <div className="summary-card">
          <div className="label">Total Assets</div>
          <div className="value" style={{ color: 'var(--primary)' }}>{fmt(totalAssets)}</div>
        </div>
        <div className="summary-card">
          <div className="label">Total Liabilities</div>
          <div className="value" style={{ color: 'var(--danger)' }}>{fmt(totalLiabilities)}</div>
        </div>
      </div>

      {/* Net Worth Trend */}
      <div className="card" style={{ marginBottom: 20, padding: '16px 8px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 12px 12px' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Net Worth Trend</span>
          {latest && first && (
            <span style={{ fontSize: 13, color: change >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
              {change >= 0 ? '▲' : '▼'} {fmt(Math.abs(change))} over {months} months
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
            <defs>
              <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtK} />
            <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
            <ReferenceLine y={0} stroke="var(--border-2)" strokeDasharray="4 2" />
            <Area
              type="monotone"
              dataKey="net_worth"
              name="Net Worth"
              stroke="#2563eb"
              strokeWidth={2}
              fill="url(#nwGrad)"
              dot={{ r: 3, fill: '#2563eb' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Assets vs Liabilities */}
      <div className="card" style={{ padding: '16px 8px 8px' }}>
        <div style={{ padding: '0 12px 12px', fontWeight: 600, fontSize: 14 }}>Assets vs. Liabilities</div>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={fmtK} />
            <Tooltip formatter={(v) => fmt(Number(v ?? 0))} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="assets" name="Assets" stroke="#16a34a" strokeWidth={2} dot={{ r: 2 }} />
            <Line type="monotone" dataKey="liabilities" name="Liabilities" stroke="#dc2626" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Account breakdown */}
      <div className="card mt-4">
        <div className="card-header">
          <span className="card-title">Account Breakdown</span>
        </div>
        <table className="register-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Type</th>
              <th className="text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(a => (
              <tr key={a.id}>
                <td style={{ fontWeight: 500 }}>{a.name}</td>
                <td className={`text-muted type-${a.type}`} style={{ textTransform: 'capitalize' }}>{a.type}</td>
                <td
                  className="amount-col"
                  style={{ fontWeight: 600, color: a.balance < 0 ? 'var(--danger)' : undefined }}
                >
                  {fmt(a.balance)}
                </td>
              </tr>
            ))}
            <tr style={{ background: 'var(--surface-2)', fontWeight: 700 }}>
              <td colSpan={2}>Net Worth</td>
              <td
                className="amount-col"
                style={{ color: currentNetWorth >= 0 ? 'var(--success)' : 'var(--danger)' }}
              >
                {fmt(currentNetWorth)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
