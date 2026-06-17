import { useState, useEffect, useCallback } from 'react';
import SortTh from './SortTh';
import type { Account, Bill, Category } from '../types';
import { getBills, createBill, updateBill, deleteBill, payBill, getCategories } from '../api';

const fmt = (n: number | string) =>
  Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

function parseDays(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return raw.split(',').map(d => parseInt(d.trim())).filter(d => d >= 1 && d <= 31).sort((a, b) => a - b);
}

function ordinal(n: number): string {
  const s = ['th','st','nd','rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
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
  // weekly / biweekly
  const anchor = bill.last_paid ? new Date(bill.last_paid) : today;
  const step = bill.frequency === 'weekly' ? 7 : 14;
  const d = new Date(anchor);
  while (d <= today) d.setDate(d.getDate() + step);
  return d;
}

function billStatus(bill: Bill): 'overdue' | 'due-soon' | 'upcoming' | 'paid' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = nextDueDate(bill);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);

  if (bill.last_paid) {
    const daysSince = Math.floor((today.getTime() - new Date(bill.last_paid).getTime()) / 86400000);
    if (bill.frequency === 'monthly'     && daysSince <  28) return 'paid';
    if (bill.frequency === 'quarterly'   && daysSince <  85) return 'paid';
    if (bill.frequency === 'semimonthly' && daysSince <  14) return 'paid';
    if (bill.frequency === 'weekly'      && daysSince <   6) return 'paid';
    if (bill.frequency === 'biweekly'    && daysSince <  13) return 'paid';
    if (bill.frequency === 'custom') {
      const days = parseDays(bill.custom_days);
      const minGap = days.length > 1 ? Math.min(...days.slice(1).map((d, i) => d - days[i])) : 28;
      if (daysSince < minGap - 1) return 'paid';
    }
  }

  if (diffDays < 0)  return 'overdue';
  if (diffDays <= 5) return 'due-soon';
  return 'upcoming';
}

function freqLabel(bill: Bill): string {
  switch (bill.frequency) {
    case 'monthly':     return 'Monthly';
    case 'quarterly':   return 'Quarterly';
    case 'weekly':      return 'Weekly';
    case 'biweekly':    return 'Bi-weekly';
    case 'annual':      return 'Annual';
    case 'semimonthly': {
      const d2 = bill.due_day_2 ?? 15;
      return `Semi-monthly (${ordinal(bill.due_day)} & ${ordinal(d2)})`;
    }
    case 'custom': {
      const days = parseDays(bill.custom_days);
      return days.length ? `Custom (${days.map(ordinal).join(', ')})` : 'Custom';
    }
    default: return bill.frequency;
  }
}

const STATUS_LABEL: Record<string, string> = {
  overdue: 'Overdue', 'due-soon': 'Due Soon', upcoming: 'Upcoming', paid: 'Paid',
};

interface BillFormState {
  name: string;
  amount: string;
  due_day: string;
  due_day_2: string;
  custom_days: string;
  frequency: string;
  category_id: string;
  account_id: string;
  kind: 'expense' | 'income';
  auto_post: boolean;
}

const EMPTY_BILL_FORM: BillFormState = {
  name: '', amount: '', due_day: '1', due_day_2: '15', custom_days: '',
  frequency: 'monthly', category_id: '', account_id: '', kind: 'expense', auto_post: false,
};

interface Props {
  accounts: Account[];
  onTransactionAdded: () => void;
}

export default function Bills({ accounts, onTransactionAdded }: Props) {
  const [bills, setBills]         = useState<Bill[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm]   = useState(false);
  const [editBill, setEditBill]   = useState<Bill | null>(null);
  const [form, setForm]           = useState<BillFormState>(EMPTY_BILL_FORM);
  const [payingBill, setPayingBill] = useState<Bill | null>(null);
  const [payDate, setPayDate]     = useState(new Date().toISOString().slice(0, 10));
  const [payAccountId, setPayAccountId] = useState('');
  const [sortCol, setSortCol]     = useState('status');
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('asc');

  const load = useCallback(async () => {
    const [b, c] = await Promise.all([getBills(), getCategories()]);
    setBills(b);
    setCategories(c);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditBill(null);
    setForm(EMPTY_BILL_FORM);
    setShowForm(true);
  }

  function openEdit(b: Bill) {
    setEditBill(b);
    setForm({
      name: b.name,
      amount: String(Math.abs(Number(b.amount))),
      due_day: String(b.due_day),
      due_day_2: String(b.due_day_2 ?? 15),
      custom_days: b.custom_days ?? '',
      frequency: b.frequency,
      category_id: b.category_id ? String(b.category_id) : '',
      account_id: b.account_id ? String(b.account_id) : '',
      kind: Number(b.amount) >= 0 ? 'income' : 'expense',
      auto_post: !!b.auto_post,
    });
    setShowForm(true);
  }

  function cancelForm() { setShowForm(false); setEditBill(null); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = parseFloat(form.amount) || 0;
    const data = {
      name:        form.name,
      amount:      form.kind === 'income' ? raw : -raw,
      due_day:     parseInt(form.due_day) || 1,
      due_day_2:   form.frequency === 'semimonthly' ? (parseInt(form.due_day_2) || 15) : null,
      custom_days: form.frequency === 'custom' ? (form.custom_days.trim() || null) : null,
      frequency:   form.frequency as Bill['frequency'],
      category_id: form.category_id ? parseInt(form.category_id) : null,
      account_id:  form.account_id  ? parseInt(form.account_id)  : null,
      auto_post:   form.auto_post && !!form.account_id,
    };
    if (editBill) await updateBill(editBill.id, { ...data, is_active: 1 });
    else          await createBill(data);
    cancelForm();
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this bill?')) return;
    await deleteBill(id);
    load();
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!payingBill) return;
    await payBill(payingBill.id, payDate, payAccountId ? parseInt(payAccountId) : undefined);
    setPayingBill(null);
    load();
    onTransactionAdded();
  }

  function handleSort(col: string) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const statusOrder = { overdue: 0, 'due-soon': 1, upcoming: 2, paid: 3 };
  const sorted = [...bills].sort((a, b) => {
    let av: number | string;
    let bv: number | string;
    if (sortCol === 'status') {
      av = statusOrder[billStatus(a)];
      bv = statusOrder[billStatus(b)];
    } else if (sortCol === 'due') {
      av = nextDueDate(a).getTime();
      bv = nextDueDate(b).getTime();
    } else {
      av = (a[sortCol as keyof Bill] as string | number) ?? '';
      bv = (b[sortCol as keyof Bill] as string | number) ?? '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
    }
    return sortDir === 'asc' ? (av < bv ? -1 : av > bv ? 1 : 0) : (av > bv ? -1 : av < bv ? 1 : 0);
  });

  const filteredCats = categories.filter(c => c.type === form.kind);
  const isSemimonthly = form.frequency === 'semimonthly';
  const isCustom      = form.frequency === 'custom';

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Bills &amp; Income</div>
          <div className="page-subtitle">Track recurring payments and expected income</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Entry</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>{editBill ? 'Edit Bill' : 'New Bill'}</div>
          <form onSubmit={handleSubmit}>
            <div className="form-row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
              <div className="form-group" style={{ maxWidth: 160 }}>
                <label>Type</label>
                <select value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value as 'expense' | 'income', category_id: '' }))}>
                  <option value="expense">Expense / Bill</option>
                  <option value="income">Income / Deposit</option>
                </select>
              </div>
              <div className="form-group">
                <label>{form.kind === 'income' ? 'Income Name' : 'Bill Name'}</label>
                <input
                  autoFocus type="text"
                  placeholder={form.kind === 'income' ? 'e.g. Paycheck, Rent Income' : 'e.g. Rent, Electric'}
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required
                />
              </div>
              <div className="form-group" style={{ maxWidth: 120 }}>
                <label>Amount ($)</label>
                <input type="number" step="0.01" min="0" placeholder="0.00"
                  value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ maxWidth: 140 }}>
                <label>Frequency</label>
                <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
                  <option value="monthly">Monthly</option>
                  <option value="semimonthly">Semi-monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="annual">Annual</option>
                  <option value="custom">Custom days…</option>
                </select>
              </div>

              {/* Due day fields — vary by frequency */}
              {!isCustom && (
                <div className="form-group" style={{ maxWidth: 100 }}>
                  <label>{isSemimonthly ? '1st Day' : 'Due Day'}</label>
                  <input type="number" min="1" max="28" value={form.due_day}
                    onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))} required />
                </div>
              )}
              {isSemimonthly && (
                <div className="form-group" style={{ maxWidth: 100 }}>
                  <label>2nd Day</label>
                  <input type="number" min="1" max="28" value={form.due_day_2}
                    onChange={e => setForm(f => ({ ...f, due_day_2: e.target.value }))} required />
                </div>
              )}
              {isCustom && (
                <div className="form-group" style={{ minWidth: 200 }}>
                  <label>Days of month</label>
                  <input
                    type="text"
                    placeholder="e.g. 1, 8, 15, 22"
                    value={form.custom_days}
                    onChange={e => setForm(f => ({ ...f, custom_days: e.target.value }))}
                    required
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    Comma-separated days 1–28
                  </div>
                </div>
              )}
            </div>

            <div className="form-row" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label>Category</label>
                <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                  <option value="">— None —</option>
                  {filteredCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Pay From Account</label>
                <select value={form.account_id} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))}>
                  <option value="">— None —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            </div>

            {form.account_id && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={form.auto_post}
                    onChange={e => setForm(f => ({ ...f, auto_post: e.target.checked }))}
                  />
                  <span>Auto-post when due</span>
                </label>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, marginLeft: 22 }}>
                  The daily auto-post job will record this bill automatically when it comes due.
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary">{editBill ? 'Save' : 'Add Bill'}</button>
              <button type="button" className="btn btn-secondary" onClick={cancelForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Pay bill modal */}
      {payingBill && (
        <div className="modal-overlay" onClick={() => setPayingBill(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              {Number(payingBill.amount) >= 0 ? 'Record Income' : 'Pay Bill'}: {payingBill.name}
              <button className="btn btn-ghost btn-sm" onClick={() => setPayingBill(null)} title="Close">✕</button>
            </div>
            <form onSubmit={handlePay}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Account</label>
                  <select
                    value={payAccountId || (payingBill.account_id ? String(payingBill.account_id) : '')}
                    onChange={e => setPayAccountId(e.target.value)}
                  >
                    <option value="">— Select account —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div style={{ background: 'var(--surface-2)', padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13 }}>
                  <strong>Amount:</strong> {fmt(Math.abs(Number(payingBill.amount)))}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setPayingBill(null)}>Cancel</button>
                <button type="submit" className="btn btn-success">
                  {Number(payingBill.amount) >= 0 ? 'Record Income' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        {sorted.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 32 }}>📋</div>
            <p>No entries yet. Click "+ Add Entry" to track a bill or recurring income.</p>
          </div>
        ) : (
          <>
            <div className="bill-row header">
              {(['name','amount','due','frequency','status'] as const).map((col, i) => {
                const labels: Record<string, string> = { name: 'Bill', amount: 'Amount', due: 'Next Due', frequency: 'Frequency', status: 'Status' };
                const active = sortCol === col;
                return (
                  <span key={col} onClick={() => handleSort(col)}
                    style={{ cursor: 'pointer', userSelect: 'none', display: i < 5 ? undefined : 'none' }}>
                    {labels[col]}
                    <span style={{ marginLeft: 3, fontSize: 9, opacity: active ? 1 : 0.25 }}>
                      {active && sortDir === 'desc' ? '▼' : '▲'}
                    </span>
                  </span>
                );
              })}
              <span></span>
            </div>
            {sorted.map(b => {
              const status = billStatus(b);
              const due    = nextDueDate(b);
              return (
                <div key={b.id} className="bill-row">
                  <div>
                    <div style={{ fontWeight: 500 }}>
                      {b.name}
                      {b.auto_post && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--primary)', fontWeight: 600 }} title="Auto-posts when due">⚡</span>
                      )}
                    </div>
                    {b.category_name && (
                      <span className="category-chip"
                        style={{ background: (b.category_color ?? '#888') + '22', color: b.category_color ?? '#888', marginTop: 2 }}>
                        {b.category_name}
                      </span>
                    )}
                  </div>
                  <div style={{ fontVariantNumeric: 'tabular-nums', color: Number(b.amount) >= 0 ? 'var(--success, #22c55e)' : 'var(--danger)', fontWeight: 500 }}>
                    {Number(b.amount) >= 0 ? '+' : ''}{fmt(b.amount)}
                  </div>
                  <div className="text-muted" style={{ fontSize: 13 }}>
                    {due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <div className="text-muted" style={{ fontSize: 12 }}>{freqLabel(b)}</div>
                  <div>
                    <span className={`status-badge status-${status}`}>{STATUS_LABEL[status]}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-success btn-sm"
                      onClick={() => { setPayingBill(b); setPayDate(new Date().toISOString().slice(0, 10)); setPayAccountId(''); }}>
                      {Number(b.amount) >= 0 ? 'Record' : 'Pay'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(b)} title="Edit">✏️</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(b.id)} title="Delete">🗑</button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
