import { useState, useEffect, useCallback } from 'react';
import type { Account, Category, Transaction } from '../types';
import { getTransactions, createTransaction, updateTransaction, deleteTransaction, getCategories } from '../api';

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const today = () => new Date().toISOString().slice(0, 10);

interface FormState {
  date: string;
  payee: string;
  category_id: string;
  payment: string;
  deposit: string;
  memo: string;
}

const EMPTY_FORM: FormState = {
  date: today(),
  payee: '',
  category_id: '',
  payment: '',
  deposit: '',
  memo: '',
};

interface Props {
  accountId: number;
  accounts: Account[];
  onBalanceChange: () => void;
}

export default function AccountRegister({ accountId, accounts, onBalanceChange }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [filterMonth, setFilterMonth] = useState('');
  const [loading, setLoading] = useState(true);

  const account = accounts.find(a => a.id === accountId);

  const load = useCallback(async () => {
    setLoading(true);
    const [txns, cats] = await Promise.all([
      getTransactions(accountId, filterMonth || undefined),
      getCategories(),
    ]);
    setTransactions(txns);
    setCategories(cats);
    setLoading(false);
  }, [accountId, filterMonth]);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditId(null);
    setForm({ ...EMPTY_FORM, date: today() });
    setShowForm(true);
  }

  function openEdit(t: Transaction) {
    setEditId(t.id);
    setForm({
      date: t.date,
      payee: t.payee,
      category_id: t.category_id ? String(t.category_id) : '',
      payment: t.amount < 0 ? String(Math.abs(t.amount)) : '',
      deposit: t.amount > 0 ? String(t.amount) : '',
      memo: t.memo,
    });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payment = parseFloat(form.payment) || 0;
    const deposit = parseFloat(form.deposit) || 0;
    const amount = deposit > 0 ? deposit : -payment;
    const data = {
      account_id: accountId,
      date: form.date,
      payee: form.payee,
      category_id: form.category_id ? parseInt(form.category_id) : null,
      amount,
      memo: form.memo,
    };
    if (editId) {
      await updateTransaction(editId, data);
    } else {
      await createTransaction(data);
    }
    cancelForm();
    await load();
    onBalanceChange();
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this transaction?')) return;
    await deleteTransaction(id);
    await load();
    onBalanceChange();
  }

  async function toggleCleared(t: Transaction) {
    const cleared = t.cleared === 1 ? 0 : 1;
    await updateTransaction(t.id, { ...t, cleared });
    setTransactions(prev => prev.map(x => x.id === t.id ? { ...x, cleared } : x));
  }

  const expenseCategories = categories.filter(c => c.type === 'expense');
  const incomeCategories = categories.filter(c => c.type === 'income');

  // Current month selector
  const months: { value: string; label: string }[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const val = d.toISOString().slice(0, 7);
    months.push({
      value: val,
      label: d.toLocaleString('default', { month: 'long', year: 'numeric' }),
    });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">{account?.name}</div>
          <div className="page-subtitle" style={{ fontVariantNumeric: 'tabular-nums' }}>
            Balance: <strong style={{ color: (account?.balance ?? 0) < 0 ? 'var(--danger)' : 'var(--success)' }}>
              {fmt(account?.balance ?? 0)}
            </strong>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterMonth}
            onChange={e => setFilterMonth(e.target.value)}
            style={{ fontSize: 13 }}
          >
            <option value="">All time</option>
            {months.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={openAdd}>+ Add Transaction</button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>
            {editId ? 'Edit Transaction' : 'New Transaction'}
          </div>
          <form onSubmit={handleSubmit}>
            <div className="form-row" style={{ marginBottom: 12 }}>
              <div className="form-group" style={{ maxWidth: 140 }}>
                <label>Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Payee</label>
                <input
                  type="text"
                  placeholder="Who was paid?"
                  value={form.payee}
                  onChange={e => setForm(f => ({ ...f, payee: e.target.value }))}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                  <option value="">— None —</option>
                  {incomeCategories.length > 0 && (
                    <optgroup label="Income">
                      {incomeCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  )}
                  {expenseCategories.length > 0 && (
                    <optgroup label="Expenses">
                      {expenseCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>
            <div className="form-row" style={{ marginBottom: 12 }}>
              <div className="form-group">
                <label>Payment ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.payment}
                  onChange={e => setForm(f => ({ ...f, payment: e.target.value, deposit: e.target.value ? '' : f.deposit }))}
                />
              </div>
              <div className="form-group">
                <label>Deposit ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.deposit}
                  onChange={e => setForm(f => ({ ...f, deposit: e.target.value, payment: e.target.value ? '' : f.payment }))}
                />
              </div>
              <div className="form-group">
                <label>Memo</label>
                <input
                  type="text"
                  placeholder="Optional note"
                  value={form.memo}
                  onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary">{editId ? 'Save Changes' : 'Add Transaction'}</button>
              <button type="button" className="btn btn-secondary" onClick={cancelForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : transactions.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 32 }}>📒</div>
            <p>No transactions yet. Click "Add Transaction" to get started.</p>
          </div>
        ) : (
          <table className="register-table">
            <thead>
              <tr>
                <th style={{ width: 28 }}>C</th>
                <th style={{ width: 100 }}>Date</th>
                <th>Payee</th>
                <th>Category</th>
                <th>Memo</th>
                <th className="text-right" style={{ width: 90 }}>Payment</th>
                <th className="text-right" style={{ width: 90 }}>Deposit</th>
                <th className="text-right" style={{ width: 100 }}>Balance</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr
                  key={t.id}
                  className={editId === t.id ? 'selected' : ''}
                  onDoubleClick={() => openEdit(t)}
                  title="Double-click to edit"
                >
                  <td>
                    <span
                      className={`cleared-badge ${t.cleared ? 'cleared' : ''}`}
                      onClick={() => toggleCleared(t)}
                      title={t.cleared ? 'Cleared — click to unclear' : 'Uncleared — click to clear'}
                    />
                  </td>
                  <td className="text-muted">{t.date}</td>
                  <td style={{ fontWeight: 500 }}>{t.payee}</td>
                  <td>
                    {t.category_name && (
                      <span
                        className="category-chip"
                        style={{
                          background: (t.category_color ?? '#888') + '22',
                          color: t.category_color ?? '#888',
                        }}
                      >
                        {t.category_name}
                      </span>
                    )}
                  </td>
                  <td className="text-muted" style={{ fontSize: 12 }}>{t.memo}</td>
                  <td className="amount-col">
                    {t.amount < 0 && <span className="amount-negative">{fmt(Math.abs(t.amount))}</span>}
                  </td>
                  <td className="amount-col">
                    {t.amount > 0 && <span className="amount-positive">{fmt(t.amount)}</span>}
                  </td>
                  <td className="amount-col" style={{ fontWeight: 600, color: t.running_balance < 0 ? 'var(--danger)' : undefined }}>
                    {fmt(t.running_balance)}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)} title="Edit">✏️</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(t.id)} title="Delete">🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
