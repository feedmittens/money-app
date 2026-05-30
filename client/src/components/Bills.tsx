import { useState, useEffect, useCallback } from 'react';
import type { Account, Bill, Category } from '../types';
import { getBills, createBill, updateBill, deleteBill, payBill, getCategories } from '../api';

const fmt = (n: number | string) =>
  Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

function nextDueDate(bill: Bill): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (bill.frequency === 'monthly') {
    const d = new Date(today.getFullYear(), today.getMonth(), bill.due_day);
    if (d < today) d.setMonth(d.getMonth() + 1);
    return d;
  }
  if (bill.frequency === 'annual') {
    const d = new Date(today.getFullYear(), 0, bill.due_day);
    if (d < today) d.setFullYear(d.getFullYear() + 1);
    return d;
  }
  // weekly / biweekly — use last_paid as anchor, or today
  const anchor = bill.last_paid ? new Date(bill.last_paid) : today;
  const days = bill.frequency === 'weekly' ? 7 : 14;
  const d = new Date(anchor);
  while (d <= today) d.setDate(d.getDate() + days);
  return d;
}

function billStatus(bill: Bill): 'overdue' | 'due-soon' | 'upcoming' | 'paid' {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = nextDueDate(bill);
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / 86400000);

  if (bill.last_paid) {
    const lastPaid = new Date(bill.last_paid);
    const daysSince = Math.floor((today.getTime() - lastPaid.getTime()) / 86400000);
    if (bill.frequency === 'monthly' && daysSince < 28) return 'paid';
    if (bill.frequency === 'weekly' && daysSince < 6) return 'paid';
    if (bill.frequency === 'biweekly' && daysSince < 13) return 'paid';
  }

  if (diffDays < 0) return 'overdue';
  if (diffDays <= 5) return 'due-soon';
  return 'upcoming';
}

const STATUS_LABEL: Record<string, string> = {
  overdue: 'Overdue',
  'due-soon': 'Due Soon',
  upcoming: 'Upcoming',
  paid: 'Paid',
};

interface BillFormState {
  name: string;
  amount: string;
  due_day: string;
  frequency: string;
  category_id: string;
  account_id: string;
  kind: 'expense' | 'income';
}

const EMPTY_BILL_FORM: BillFormState = {
  name: '',
  amount: '',
  due_day: '1',
  frequency: 'monthly',
  category_id: '',
  account_id: '',
  kind: 'expense',
};

interface Props {
  accounts: Account[];
  onTransactionAdded: () => void;
}

export default function Bills({ accounts, onTransactionAdded }: Props) {
  const [bills, setBills] = useState<Bill[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editBill, setEditBill] = useState<Bill | null>(null);
  const [form, setForm] = useState<BillFormState>(EMPTY_BILL_FORM);
  const [payingBill, setPayingBill] = useState<Bill | null>(null);
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payAccountId, setPayAccountId] = useState('');

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
      amount: String(Math.abs(b.amount)),
      due_day: String(b.due_day),
      frequency: b.frequency,
      category_id: b.category_id ? String(b.category_id) : '',
      account_id: b.account_id ? String(b.account_id) : '',
      kind: b.amount >= 0 ? 'income' : 'expense',
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditBill(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = parseFloat(form.amount) || 0;
    const data = {
      name: form.name,
      amount: form.kind === 'income' ? raw : -raw,
      due_day: parseInt(form.due_day),
      frequency: form.frequency as Bill['frequency'],
      category_id: form.category_id ? parseInt(form.category_id) : null,
      account_id: form.account_id ? parseInt(form.account_id) : null,
    };
    if (editBill) {
      await updateBill(editBill.id, { ...data, is_active: 1 });
    } else {
      await createBill(data);
    }
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
    await payBill(
      payingBill.id,
      payDate,
      payAccountId ? parseInt(payAccountId) : undefined,
    );
    setPayingBill(null);
    load();
    onTransactionAdded();
  }

  const sorted = [...bills].sort((a, b) => {
    const order = { overdue: 0, 'due-soon': 1, upcoming: 2, paid: 3 };
    return order[billStatus(a)] - order[billStatus(b)];
  });

  const filteredCats = categories.filter(c => c.type === form.kind);

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
          <div style={{ fontWeight: 600, marginBottom: 12 }}>
            {editBill ? 'Edit Bill' : 'New Bill'}
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-row" style={{ marginBottom: 12 }}>
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
                  autoFocus
                  type="text"
                  placeholder={form.kind === 'income' ? 'e.g. Paycheck, Rent Income' : 'e.g. Rent, Electric'}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group" style={{ maxWidth: 120 }}>
                <label>Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group" style={{ maxWidth: 100 }}>
                <label>Due Day</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={form.due_day}
                  onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group" style={{ maxWidth: 130 }}>
                <label>Frequency</label>
                <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value }))}>
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
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
              {payingBill.amount >= 0 ? 'Record Income' : 'Pay Bill'}: {payingBill.name}
              <button className="btn btn-ghost btn-sm" onClick={() => setPayingBill(null)}>✕</button>
            </div>
            <form onSubmit={handlePay}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Payment Date</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={e => setPayDate(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Pay From Account</label>
                  <select
                    value={payAccountId || (payingBill.account_id ? String(payingBill.account_id) : '')}
                    onChange={e => setPayAccountId(e.target.value)}
                  >
                    <option value="">— Select account —</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div style={{ background: 'var(--surface-2)', padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13 }}>
                  <strong>Amount:</strong> {fmt(Math.abs(payingBill.amount))}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setPayingBill(null)}>Cancel</button>
                <button type="submit" className="btn btn-success">
                  {payingBill.amount >= 0 ? 'Record Income' : 'Record Payment'}
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
              <span>Bill</span>
              <span>Amount</span>
              <span>Due</span>
              <span>Frequency</span>
              <span>Status</span>
              <span></span>
            </div>
            {sorted.map(b => {
              const status = billStatus(b);
              const due = nextDueDate(b);
              return (
                <div key={b.id} className="bill-row">
                  <div>
                    <div style={{ fontWeight: 500 }}>{b.name}</div>
                    {b.category_name && (
                      <span
                        className="category-chip"
                        style={{ background: (b.category_color ?? '#888') + '22', color: b.category_color ?? '#888', marginTop: 2 }}
                      >
                        {b.category_name}
                      </span>
                    )}
                  </div>
                  <div style={{ fontVariantNumeric: 'tabular-nums', color: b.amount >= 0 ? 'var(--success, #22c55e)' : 'var(--danger)', fontWeight: 500 }}>
                    {b.amount >= 0 ? '+' : ''}{fmt(b.amount)}
                  </div>
                  <div className="text-muted" style={{ fontSize: 13 }}>
                    {due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <div className="text-muted" style={{ fontSize: 13, textTransform: 'capitalize' }}>{b.frequency}</div>
                  <div>
                    <span className={`status-badge status-${status}`}>{STATUS_LABEL[status]}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => { setPayingBill(b); setPayDate(new Date().toISOString().slice(0, 10)); setPayAccountId(''); }}
                    >{b.amount >= 0 ? 'Record' : 'Pay'}</button>
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
