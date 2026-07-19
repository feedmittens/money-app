import { useState, useEffect } from 'react';
import type { Account, Bill, ForecastPoint, NewsItem, NewsResponse, NewsFeed, View } from '../types';
import { getBills, getForecast, getNews, getNewsFeeds, addNewsFeed, deleteNewsFeed } from '../api';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts';

const fmt = (n: number | string) =>
  Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const fmtK = (n: number) => {
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
};

interface Props {
  accounts: Account[];
  onNavigate: (view: View) => void;
}

function parseDays(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return raw.split(',').map(d => parseInt(d.trim())).filter(d => d >= 1 && d <= 31).sort((a, b) => a - b);
}

function nextDueDate(bill: Bill): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (bill.frequency === 'monthly') {
    const d = new Date(today.getFullYear(), today.getMonth(), bill.due_day);
    if (d <= today) d.setMonth(d.getMonth() + 1);
    return d;
  }
  if (bill.frequency === 'semimonthly') {
    const day2 = bill.due_day_2 ?? 15;
    const days = [bill.due_day, day2].sort((a, b) => a - b);
    for (const day of days) {
      const d = new Date(today.getFullYear(), today.getMonth(), day);
      if (d >= today) return d;
    }
    return new Date(today.getFullYear(), today.getMonth() + 1, days[0]);
  }
  if (bill.frequency === 'quarterly') {
    const anchor = bill.last_paid ? new Date(bill.last_paid) : new Date(today.getFullYear(), today.getMonth() - 3, bill.due_day);
    const d = new Date(anchor);
    while (d <= today) d.setMonth(d.getMonth() + 3);
    return d;
  }
  if (bill.frequency === 'annual') {
    const d = new Date(today.getFullYear(), 0, bill.due_day);
    if (d < today) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  if (bill.frequency === 'custom') {
    const days = parseDays(bill.custom_days);
    if (!days.length) return new Date(today.getFullYear(), today.getMonth(), bill.due_day);
    for (const day of days) {
      const d = new Date(today.getFullYear(), today.getMonth(), day);
      if (d >= today) return d;
    }
    return new Date(today.getFullYear(), today.getMonth() + 1, days[0]);
  }
  if (bill.last_paid) {
    const anchor = new Date(bill.last_paid);
    const step   = bill.frequency === 'weekly' ? 7 : 14;
    const next   = new Date(anchor);
    while (next <= today) next.setDate(next.getDate() + step);
    return next;
  }
  return new Date(today.getFullYear(), today.getMonth(), bill.due_day);
}

function relDate(d: Date): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff  = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 7)  return `In ${diff} days`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtNewsDate(raw: string): string {
  try {
    const d = new Date(raw);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return raw; }
}

export default function Dashboard({ accounts, onNavigate }: Props) {
  const [bills,       setBills]       = useState<Bill[]>([]);
  const [forecast,    setForecast]    = useState<ForecastPoint[]>([]);
  const [newsResp,    setNewsResp]    = useState<NewsResponse | null>(null);
  const [newsErr,     setNewsErr]     = useState(false);
  const [feeds,       setFeeds]       = useState<NewsFeed[]>([]);
  const [showSources, setShowSources] = useState(false);
  const [addUrl,      setAddUrl]      = useState('');
  const [addLabel,    setAddLabel]    = useState('');
  const [addErr,      setAddErr]      = useState('');
  const [addLoading,  setAddLoading]  = useState(false);

  useEffect(() => {
    getBills().then(setBills).catch(() => {});
    getForecast(12).then(setForecast).catch(() => {});
    getNews().then(setNewsResp).catch(() => setNewsErr(true));
    getNewsFeeds().then(setFeeds).catch(() => {});
  }, []);

  async function handleAddFeed(e: React.FormEvent) {
    e.preventDefault();
    setAddErr('');
    setAddLoading(true);
    try {
      const feed = await addNewsFeed(addUrl.trim(), addLabel.trim());
      setFeeds(f => [...f, feed]);
      setAddUrl('');
      setAddLabel('');
      // Refresh news from the new source set
      getNews().then(setNewsResp).catch(() => {});
    } catch (err: unknown) {
      setAddErr(err instanceof Error ? err.message : 'Failed to add feed');
    } finally {
      setAddLoading(false);
    }
  }

  async function handleDeleteFeed(id: number) {
    await deleteNewsFeed(id);
    setFeeds(f => f.filter(x => x.id !== id));
    // Refresh news without the removed source
    getNews().then(setNewsResp).catch(() => {});
  }

  const news: NewsItem[] = newsResp?.items ?? [];

  // Account summary
  const assets      = accounts.filter(a => a.type !== 'credit').reduce((s, a) => s + Number(a.balance), 0);
  const liabilities = accounts.filter(a => a.type === 'credit').reduce((s, a) => s + Math.abs(Math.min(Number(a.balance), 0)), 0);
  const netWorth    = assets - liabilities;

  // Upcoming bills — next 30 days
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const in30days = new Date(today); in30days.setDate(in30days.getDate() + 30);
  const upcoming = bills
    .map(b => ({ bill: b, due: nextDueDate(b) }))
    .filter(({ due }) => due >= today && due <= in30days)
    .sort((a, b) => a.due.getTime() - b.due.getTime());

  const forecastMin   = forecast.length ? Math.min(...forecast.map(p => p.balance)) : 0;
  const forecastLast  = forecast[forecast.length - 1];
  const forecastNow   = forecast[0];
  const forecastDelta = forecastLast && forecastNow ? forecastLast.balance - forecastNow.balance : 0;
  const forecastFuture  = forecast.slice(1);
  const forecastHighPt  = forecastFuture.reduce((b, p) => p.balance > b.balance ? p : b, forecastFuture[0] ?? forecast[0]);
  const forecastLowPt   = forecastFuture.reduce((b, p) => p.balance < b.balance ? p : b, forecastFuture[0] ?? forecast[0]);

  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div style={{ padding: '0 0 32px' }}>

      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">Tally Dashboard</div>
          <div className="page-subtitle">{todayStr}</div>
        </div>
      </div>

      {/* Top row: account KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Net Worth</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: netWorth < 0 ? 'var(--danger)' : 'var(--success)' }}>{fmt(netWorth)}</div>
        </div>
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Total Assets</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>{fmt(assets)}</div>
        </div>
        <div className="card" style={{ padding: '16px 20px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Liabilities</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: liabilities > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{fmt(liabilities)}</div>
        </div>
        {accounts.map(a => (
          <div key={a.id} className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {a.name}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: Number(a.balance) < 0 ? 'var(--danger)' : undefined }}>{fmt(a.balance)}</div>
          </div>
        ))}
      </div>

      {/* Middle row: forecast + upcoming */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 16, alignItems: 'start' }}>

        {/* Forecast chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <span className="card-title">12-Month Balance Forecast</span>
              {forecastLast && (
                <div className="card-subtitle">
                  Projected: <strong style={{ color: forecastLast.balance < 0 ? 'var(--danger)' : 'var(--success)' }}>{fmt(forecastLast.balance)}</strong>
                  {' · '}
                  <span style={{ color: forecastDelta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {forecastDelta >= 0 ? '+' : ''}{fmt(forecastDelta)} over 12 months
                  </span>
                </div>
              )}
            </div>
          </div>
          {forecast.length === 0 ? (
            <div className="empty-state"><p>No data yet — add accounts and bills to see a forecast.</p></div>
          ) : (
            <div style={{ height: 240, padding: '8px 16px 16px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecast} margin={{ top: 4, right: 8, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dashForecastGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={forecastMin < 0 ? '#ef4444' : '#22c55e'} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={forecastMin < 0 ? '#ef4444' : '#22c55e'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={fmtK} tick={{ fontSize: 10 }} width={56} domain={['auto', 'auto']} />
                  <Tooltip
                    formatter={(v) => [fmt(Number(v ?? 0)), 'Balance']}
                    contentStyle={{ fontSize: 12, background: 'var(--surface)', border: '1px solid var(--border)' }}
                  />
                  {forecastMin < 0 && <ReferenceLine y={0} stroke="var(--danger)" strokeDasharray="4 2" />}
                  <Area
                    type="monotone"
                    dataKey="balance"
                    stroke={forecastMin < 0 ? '#ef4444' : '#22c55e'}
                    strokeWidth={2}
                    fill="url(#dashForecastGrad)"
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  {forecastHighPt && forecastHighPt !== forecastLowPt && (
                    <ReferenceDot x={forecastHighPt.label} y={forecastHighPt.balance}
                      r={4} fill="#22c55e" stroke="white" strokeWidth={2}
                      label={{ value: `▲ ${fmtK(forecastHighPt.balance)}`, position: 'top', fill: '#22c55e', fontSize: 10, fontWeight: 600 }} />
                  )}
                  {forecastLowPt && forecastHighPt !== forecastLowPt && (
                    <ReferenceDot x={forecastLowPt.label} y={forecastLowPt.balance}
                      r={4} fill="#ef4444" stroke="white" strokeWidth={2}
                      label={{ value: `▼ ${fmtK(forecastLowPt.balance)}`, position: 'bottom', fill: '#ef4444', fontSize: 10, fontWeight: 600 }} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Upcoming bills */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Upcoming — Next 30 Days</span>
          </div>
          {upcoming.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 16px' }}>
              <p style={{ fontSize: 13 }}>No bills or income due in the next 30 days.</p>
            </div>
          ) : (
            <div>
              {upcoming.map(({ bill, due }) => (
                <button
                  key={bill.id}
                  onClick={() => onNavigate({ type: 'bills' })}
                  title="Go to Bills & Income"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 16px', borderBottom: '1px solid var(--border)',
                    width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                    textAlign: 'left', color: 'inherit',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bill.name}</div>
                    <div style={{ fontSize: 11, color: due.getTime() - today.getTime() <= 3 * 86400000 ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {relDate(due)}
                    </div>
                  </div>
                  <div style={{
                    fontWeight: 600, fontSize: 13, marginLeft: 12, flexShrink: 0,
                    color: Number(bill.amount) < 0 ? 'var(--danger)' : 'var(--success)',
                  }}>
                    {Number(bill.amount) >= 0 ? '+' : ''}{fmt(bill.amount)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* News */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Financial News</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {newsResp?.fetchedAt
                ? `Updated ${new Date(newsResp.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                : 'Updated hourly'}
            </span>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowSources(s => !s)}
              title="Manage news sources"
              style={{ fontSize: 12 }}
            >⚙ Sources</button>
          </div>
        </div>

        {/* Sources management panel */}
        {showSources && (
          <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 16px', background: 'var(--bg)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-muted)' }}>RSS FEEDS</div>
            {feeds.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>No feeds configured yet.</div>
            )}
            {feeds.map(f => (
              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, minWidth: 100, flexShrink: 0 }}>{f.label}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.url}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleDeleteFeed(f.id)}
                  title="Remove this feed"
                  style={{ fontSize: 11, color: 'var(--danger)', flexShrink: 0 }}
                >✕</button>
              </div>
            ))}
            <form onSubmit={handleAddFeed} style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <input
                type="url"
                placeholder="https://example.com/rss.xml"
                value={addUrl}
                onChange={e => setAddUrl(e.target.value)}
                required
                style={{ flex: '2 1 220px', fontSize: 12, padding: '5px 8px' }}
              />
              <input
                type="text"
                placeholder="Label (e.g. Reuters)"
                value={addLabel}
                onChange={e => setAddLabel(e.target.value)}
                required
                style={{ flex: '1 1 120px', fontSize: 12, padding: '5px 8px' }}
              />
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={addLoading}
                style={{ flexShrink: 0 }}
              >Add</button>
            </form>
            {addErr && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{addErr}</div>}
          </div>
        )}

        {newsErr ? (
          <div className="empty-state"><p>Couldn't load news — check network connectivity from the server.</p></div>
        ) : news.length === 0 ? (
          <div className="empty-state"><p>Loading news…</p></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 0 }}>
            {news.map((item, i) => (
              <a
                key={i}
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'block', padding: '14px 16px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                    color: 'var(--primary)', background: 'var(--primary)18', padding: '1px 6px', borderRadius: 3,
                  }}>{item.source}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtNewsDate(item.pubDate)}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginBottom: 4, color: 'var(--text)' }}>
                  {item.title}
                </div>
                {item.description && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {item.description.length > 200 ? item.description.slice(0, 200) + '…' : item.description}
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
