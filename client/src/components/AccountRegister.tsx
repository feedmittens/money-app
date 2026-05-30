import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [categories, setCategories]     = useState<Category[]>([]);
  const [editId, setEditId]             = useState<number | null>(null);
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM);
  const [filterMonth, setFilterMonth]   = useState('');
  const [loading, setLoading]           = useState(true);
  const payeeRef = useRef<HTMLInputElement>(null);

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

  // Reset form when switching accounts
  useEffect(() => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, date: today() });
  }, [accountId]);

  function startEdit(t: Transaction) {
    setEditId(t.id);
    setForm({
      date: t.date,
      payee: t.payee,
      category_id: t.category_id ? String(t.category_id) : '',
      payment: t.amount < 0 ? String(Math.abs(t.amount)) : '',
      deposit: t.amount > 0 ? String(t.amount) : '',
      memo: t.memo,
    });
    setTimeout(() => payeeRef.current?.focus(), 50);
  }

  function cancelEdit() {
    setEditId(null);
    setForm({ ...EMPTY_FORM, date: today() });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payment = parseFloat(form.payment) || 0;
    const deposit = parseFloat(form.deposit) || 0;
    const amount  = deposit > 0 ? deposit : -payment;
    const data = {
      account_id: accountId,
      date:        form.date,
      payee:       form.payee,
      category_id: form.category_id ? parseInt(form.category_id) : null,
      amount,
      memo: form.memo,
    };
    if (editId) {
      await updateTransaction(editId, data);
    } else {
      await createTransaction(data);
    }
    cancelEdit();
    await load();
    onBalanceChange();
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this transaction?')) return;
    await deleteTransaction(id);
    if (editId === id) cancelEdit();
    await load();
    onBalanceChange();
  }

  async function toggleCleared(t: Transaction) {
    const cleared = t.cleared === 1 ? 0 : 1;
    await updateTransaction(t.id, { ...t, cleared });
    setTransactions(prev => prev.map(x => x.id === t.id ? { ...x, cleared } : x));
  }

  const expenseCategories = categories.filter(c => c.type === 'expense');
  const incomeCategories  = categories.filter(c => c.type === 'income');

  const months: { value: string; label: string }[] = [];
  for (let i = 0; i < 24; i++) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const val = d.toISOString().slice(0, 7);
    months.push({ value: val, label: d.toLocaleString('default', { month: 'long', year: 'numeric' }) });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div className="page-header">
        <div>
          <div className="page-title">{account?.name}</div>
          <div className="page-subtitle" style={{ fontVariantNumeric: 'tabular-nums' }}>
            Balance:{' '}
            <strong style={{ color: (account?.balance ?? 0) < 0 ? 'var(--danger)' : 'var(--success)' }}>
              {fmt(account?.balance ?? 0)}
            </strong>
          </div>
        </div>
        <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)} style={{ fontSize: 13 }}>
          <option value="">All time</option>
          {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      {/* Permanent transaction form pinned at the top */}
      <div className="card" style={{
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        borderBottom: '2px solid var(--primary)',
        padding: '12px 16px',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {editId ? `Editing transaction` : 'New Transaction'}
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-row" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ maxWidth: 140 }}>
              <label>Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
            </div>
            <div className="form-group" style={{ minWidth: 160 }}>
              <label>Payee</label>
              <input
                ref={payeeRef}
                type="text"
                placeholder="Who was paid?"
                value={form.payee}
                onChange={e => setForm(f => ({ ...f, payee: e.target.value }))}
                required
              />
            </div>
            <div className="form-group" style={{ minWidth: 140 }}>
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
            <div className="form-group" style={{ maxWidth: 110 }}>
              <label>Payment ($)</label>
              <input
                type="number" step="0.01" min="0" placeholder="0.00"
                value={form.payment}
                onChange={e => setForm(f => ({ ...f, payment: e.target.value, deposit: e.target.value ? '' : f.deposit }))}
              />
            </div>
            <div className="form-group" style={{ maxWidth: 110 }}>
              <label>Deposit ($)</label>
              <input
                type="number" step="0.01" min="0" placeholder="0.00"
                value={form.deposit}
                onChange={e => setForm(f => ({ ...f, deposit: e.target.value, payment: e.target.value ? '' : f.payment }))}
              />
            </div>
            <div className="form-group" style={{ minWidth: 140 }}>
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
            <button type="submit" className="btn btn-primary">
              {editId ? 'Save Changes' : 'Add Transaction'}
            </button>
            {editId && (
              <button type="button" className="btn btn-secondary" onClick={cancelEdit}>Cancel</button>
            )}
          </div>
        </form>
      </div>

      {/* Transaction list */}
      <div className="card" style={{ flex: 1, overflowY: 'auto', marginBottom: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : transactions.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 32 }}>📒</div>
            <p>No transactions yet. Use the form below to add one.</p>
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
                  onDoubleClick={() => startEdit(t)}
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
                        style={{ background: (t.category_color ?? '#888') + '22', color: t.category_color ?? '#888' }}
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
                      <button className="btn btn-ghost btn-sm" onClick={() => startEdit(t)} title="Edit">✏️</button>
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
