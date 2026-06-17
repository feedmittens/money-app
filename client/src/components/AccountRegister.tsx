import { useState, useEffect, useCallback, useRef } from 'react';
import type { Account, Attachment, Category, Transaction } from '../types';
import type { TransactionPage } from '../api';
import SortTh from './SortTh';
import { getTransactions, createTransaction, updateTransaction, deleteTransaction, getCategories,
         getPayees, getAttachments, addAttachment, deleteAttachment, createBill } from '../api';

const fmt = (n: number | string) =>
  Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const today = () => new Date().toISOString().slice(0, 10);

interface FormState {
  date: string;
  payee: string;
  category_id: string;
  payment: string;
  deposit: string;
  memo: string;
  tax_relevant: boolean;
  is_transfer: boolean;
  transfer_account_id: string;
}

const EMPTY_FORM: FormState = {
  date: today(),
  payee: '',
  category_id: '',
  payment: '',
  deposit: '',
  memo: '',
  tax_relevant: false,
  is_transfer: false,
  transfer_account_id: '',
};

interface Props {
  accountId: number;
  accounts: Account[];
  onBalanceChange: () => void;
}

const PAGE_SIZE = 200;

export default function AccountRegister({ accountId, accounts, onBalanceChange }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal]               = useState(0);
  const [page, setPage]                 = useState(1);
  const [categories, setCategories]     = useState<Category[]>([]);
  const [payees, setPayees]             = useState<string[]>([]);
  const [editId, setEditId]             = useState<number | null>(null);
  const [recurringTxn,  setRecurringTxn]   = useState<Transaction | null>(null);
  const [recurringFreq, setRecurringFreq]  = useState<'monthly' | 'quarterly' | 'weekly' | 'biweekly' | 'annual' | 'semimonthly' | 'custom'>('monthly');
  const [recurringDay2, setRecurringDay2]  = useState('15');
  const [recurringDays, setRecurringDays]  = useState('');
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM);
  const [filterMonth, setFilterMonth]   = useState('');
  const [loading, setLoading]           = useState(true);
  const [sortCol, setSortCol]           = useState('date');
  const [sortDir, setSortDir]           = useState<'asc' | 'desc'>('desc');
  const [attachments, setAttachments]   = useState<Omit<Attachment,'data'>[]>([]);
  const [attachErr, setAttachErr]       = useState('');
  const payeeRef  = useRef<HTMLInputElement>(null);
  const fileRef   = useRef<HTMLInputElement>(null);

  const account = accounts.find(a => a.id === accountId);
  const otherAccounts = accounts.filter(a => a.id !== accountId);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function handleSort(col: string) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const sortedTransactions = [...transactions].sort((a, b) => {
    type TKey = keyof Transaction;
    const av = a[sortCol as TKey] as string | number ?? '';
    const bv = b[sortCol as TKey] as string | number ?? '';
    const ac = typeof av === 'string' ? av.toLowerCase() : av;
    const bc = typeof bv === 'string' ? bv.toLowerCase() : bv;
    return sortDir === 'asc' ? (ac < bc ? -1 : ac > bc ? 1 : 0) : (ac > bc ? -1 : ac < bc ? 1 : 0);
  });

  const load = useCallback(async (p = page) => {
    setLoading(true);
    const [result, cats, knownPayees]: [TransactionPage, Category[], string[]] = await Promise.all([
      getTransactions(accountId, filterMonth || undefined, p, PAGE_SIZE),
      getCategories(),
      getPayees(),
    ]);
    setTransactions(result.transactions);
    setTotal(result.total);
    setCategories(cats);
    setPayees(knownPayees);
    setLoading(false);
  }, [accountId, filterMonth, page]);

  useEffect(() => { load(); }, [load]);

  // Reset form and page when switching accounts
  useEffect(() => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, date: today() });
    setPage(1);
  }, [accountId]);

  // Reset page when filter changes
  useEffect(() => { setPage(1); }, [filterMonth]);

  async function startEdit(t: Transaction) {
    if (t.transfer_peer_id) return; // transfers edited via delete + re-enter
    setEditId(t.id);
    setForm({
      date: String(t.date).slice(0, 10),
      payee: t.payee,
      category_id: t.category_id ? String(t.category_id) : '',
      payment: t.amount < 0 ? String(Math.abs(t.amount)) : '',
      deposit: t.amount > 0 ? String(t.amount) : '',
      memo: t.memo,
      tax_relevant: t.tax_relevant === 1,
      is_transfer: false,
      transfer_account_id: '',
    });
    const att = await getAttachments(t.id);
    setAttachments(att);
    setAttachErr('');
    setTimeout(() => payeeRef.current?.focus(), 50);
  }

  function cancelEdit() {
    setEditId(null);
    setForm({ ...EMPTY_FORM, date: today() });
    setAttachments([]);
    setAttachErr('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payment = parseFloat(form.payment) || 0;
    const deposit = parseFloat(form.deposit) || 0;
    const amount  = deposit > 0 ? deposit : -payment;

    if (form.is_transfer) {
      const targetId = parseInt(form.transfer_account_id);
      const targetAcct = accounts.find(a => a.id === targetId);
      const payee = amount < 0
        ? `Transfer to ${targetAcct?.name ?? 'account'}`
        : `Transfer from ${targetAcct?.name ?? 'account'}`;
      await createTransaction({
        account_id: accountId,
        date: form.date,
        payee,
        amount,
        memo: form.memo,
        cleared: 0,
        transfer_account_id: targetId,
      });
    } else if (editId) {
      await updateTransaction(editId, {
        account_id: accountId,
        date: form.date,
        payee: form.payee,
        category_id: form.category_id ? parseInt(form.category_id) : null,
        amount,
        memo: form.memo,
        tax_relevant: form.tax_relevant ? 1 : 0,
      });
    } else {
      await createTransaction({
        account_id: accountId,
        date: form.date,
        payee: form.payee,
        category_id: form.category_id ? parseInt(form.category_id) : null,
        amount,
        memo: form.memo,
        tax_relevant: form.tax_relevant ? 1 : 0,
      });
    }

    cancelEdit();
    await load(page);
    onBalanceChange();
  }

  async function handleDelete(id: number) {
    const txn = transactions.find(t => t.id === id);
    const msg = txn?.transfer_peer_id
      ? 'Delete this transfer? Both sides of the transfer will be removed.'
      : 'Delete this transaction?';
    if (!confirm(msg)) return;
    await deleteTransaction(id);
    if (editId === id) cancelEdit();
    await load(page);
    onBalanceChange();
  }

  async function handleAttachFile(e: React.ChangeEvent<HTMLInputElement>) {
    if (!editId || !e.target.files?.[0]) return;
    setAttachErr('');
    try {
      await addAttachment(editId, e.target.files[0]);
      const updated = await getAttachments(editId);
      setAttachments(updated);
    } catch (err: unknown) {
      setAttachErr((err as Error).message);
    }
    e.target.value = '';
  }

  async function handleDeleteAttachment(id: number) {
    if (!editId) return;
    await deleteAttachment(editId, id);
    setAttachments(await getAttachments(editId));
  }

  function downloadAttachment(txnId: number, id: number, filename: string) {
    const a = document.createElement('a');
    a.href = `/api/transactions/${txnId}/attachments/${id}/download`;
    a.download = filename;
    a.click();
  }

  async function handleMakeRecurring(e: React.FormEvent) {
    e.preventDefault();
    if (!recurringTxn) return;
    const dueDay = parseInt(String(recurringTxn.date).slice(8, 10), 10);
    await createBill({
      name:        recurringTxn.payee,
      amount:      recurringTxn.amount,
      due_day:     dueDay,
      due_day_2:   recurringFreq === 'semimonthly' ? (parseInt(recurringDay2) || 15) : null,
      custom_days: recurringFreq === 'custom' ? (recurringDays.trim() || null) : null,
      frequency:   recurringFreq,
      category_id: recurringTxn.category_id,
      account_id:  accountId,
    });
    setRecurringTxn(null);
  }

  async function toggleCleared(t: Transaction) {
    const cleared = t.cleared === 1 ? 0 : 1;
    await updateTransaction(t.id, { ...t, cleared });
    setTransactions(prev => prev.map(x => x.id === t.id ? { ...x, cleared } : x));
  }

  async function goToPage(p: number) {
    setPage(p);
    await load(p);
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

      {/* Transaction form */}
      <div className="card" style={{
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        borderBottom: '2px solid var(--primary)',
        padding: '12px 16px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {editId ? 'Editing transaction' : 'New Transaction'}
          </div>
          {!editId && (
            <div style={{ display: 'flex', gap: 6, fontSize: 12 }}>
              <button
                type="button"
                className={`btn btn-sm ${!form.is_transfer ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '2px 10px' }}
                onClick={() => setForm(f => ({ ...f, is_transfer: false, transfer_account_id: '' }))}
              >Transaction</button>
              <button
                type="button"
                className={`btn btn-sm ${form.is_transfer ? 'btn-primary' : 'btn-secondary'}`}
                style={{ padding: '2px 10px' }}
                onClick={() => setForm(f => ({ ...f, is_transfer: true, category_id: '', tax_relevant: false }))}
              >⇄ Transfer</button>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-row" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
            <div className="form-group" style={{ maxWidth: 140 }}>
              <label>Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
            </div>

            {form.is_transfer ? (
              <div className="form-group" style={{ minWidth: 180 }}>
                <label>Transfer to/from account</label>
                <select
                  value={form.transfer_account_id}
                  onChange={e => setForm(f => ({ ...f, transfer_account_id: e.target.value }))}
                  required
                >
                  <option value="">— Select account —</option>
                  {otherAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            ) : (
              <div className="form-group" style={{ minWidth: 160 }}>
                <label>Payee</label>
                <input
                  ref={payeeRef}
                  type="text"
                  list="payee-suggestions"
                  placeholder="Who was paid?"
                  value={form.payee}
                  onChange={e => setForm(f => ({ ...f, payee: e.target.value }))}
                  required
                />
                <datalist id="payee-suggestions">
                  {payees.map(p => <option key={p} value={p} />)}
                </datalist>
              </div>
            )}

            {!form.is_transfer && (
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
            )}

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

          {!form.is_transfer && (
            <div className="form-row" style={{ marginBottom: 10, alignItems: 'center', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={form.tax_relevant}
                  onChange={e => setForm(f => ({ ...f, tax_relevant: e.target.checked }))}
                />
                <span>Tax relevant</span>
                {form.tax_relevant && <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>★ TAX</span>}
              </label>
            </div>
          )}

          {/* Attachments — only when editing an existing non-transfer transaction */}
          {editId && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--text-muted)' }}>
                Attachments {attachments.length > 0 && `(${attachments.length})`}
              </div>
              {attachments.map(a => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 4 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => downloadAttachment(editId!, a.id, a.filename)}
                    style={{ fontSize: 12, padding: '2px 8px' }}
                  >
                    📎 {a.filename}
                  </button>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {(a.size / 1024).toFixed(0)} KB
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--danger)', fontSize: 11 }}
                    onClick={() => handleDeleteAttachment(a.id)}
                  >✕</button>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => fileRef.current?.click()}
                  style={{ fontSize: 12 }}
                >
                  + Attach file
                </button>
                <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleAttachFile} />
                {attachErr && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{attachErr}</span>}
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Max 10 MB · stored in your .db file</span>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary">
              {editId ? 'Save Changes' : form.is_transfer ? 'Record Transfer' : 'Add Transaction'}
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
            <p>No transactions yet. Use the form above to add one.</p>
          </div>
        ) : (
          <>
            <table className="register-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }} title="Cleared">C</th>
                  <SortTh label="Date"    col="date"   sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ width: 100 }} />
                  <SortTh label="Payee / Transfer" col="payee" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <th>Category</th>
                  <th>Memo</th>
                  <SortTh label="Payment" col="amount" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-right" style={{ width: 90 }} />
                  <th className="text-right" style={{ width: 90 }}>Deposit</th>
                  <th className="text-right" style={{ width: 100 }}>Balance</th>
                  <th style={{ width: 60 }}></th>
                </tr>
              </thead>
              <tbody>
                {sortedTransactions.map(t => {
                  const isTransfer = !!t.transfer_peer_id || !!t.transfer_account_id;
                  const transferAcct = t.transfer_account_id
                    ? accounts.find(a => a.id === t.transfer_account_id)
                    : null;
                  return (
                    <tr
                      key={t.id}
                      className={editId === t.id ? 'selected' : ''}
                      onDoubleClick={() => startEdit(t)}
                      title={isTransfer ? 'Transfer — delete to re-enter' : 'Double-click to edit'}
                    >
                      <td>
                        <span
                          className={`cleared-badge ${t.cleared ? 'cleared' : ''}`}
                          onClick={() => toggleCleared(t)}
                          title={t.cleared ? 'Cleared — click to unclear' : 'Uncleared — click to clear'}
                        />
                      </td>
                      <td className="text-muted">{String(t.date).slice(0, 10)}</td>
                      <td style={{ fontWeight: 500 }}>
                        {isTransfer ? (
                          <span style={{ color: 'var(--primary)', fontStyle: 'italic' }}>
                            ⇄ {transferAcct ? transferAcct.name : t.payee}
                          </span>
                        ) : (
                          <>
                            {t.payee}
                            {t.tax_relevant === 1 && (
                              <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--primary)', fontWeight: 700 }} title="Tax relevant">★</span>
                            )}
                          </>
                        )}
                      </td>
                      <td>
                        {!isTransfer && t.category_name && (
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
                          {!isTransfer && (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => startEdit(t)} title="Edit">✏️</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => { setRecurringTxn(t); setRecurringFreq('monthly'); }} title="Make recurring">🔁</button>
                            </>
                          )}
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(t.id)} title="Delete">🗑</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={page <= 1}
                  onClick={() => goToPage(page - 1)}
                >← Prev</button>
                <span style={{ color: 'var(--text-muted)' }}>
                  Page {page} of {totalPages} ({total.toLocaleString()} transactions)
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => goToPage(page + 1)}
                >Next →</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Make Recurring modal */}
      {recurringTxn && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }} onClick={() => setRecurringTxn(null)}>
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--radius)',
            border: '1px solid var(--border)', padding: '24px 28px', width: 340,
            boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Make Recurring</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Creates a recurring bill from this transaction.
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Payee</div>
              <div style={{ fontWeight: 600 }}>{recurringTxn.payee}</div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>Amount</div>
              <div style={{ fontWeight: 600, color: recurringTxn.amount < 0 ? 'var(--danger)' : 'var(--success)' }}>
                {fmt(recurringTxn.amount)}
              </div>
            </div>
            <form onSubmit={handleMakeRecurring}>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Frequency</label>
                <select value={recurringFreq} onChange={e => setRecurringFreq(e.target.value as typeof recurringFreq)}>
                  <option value="monthly">Monthly</option>
                  <option value="semimonthly">Semi-monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="annual">Annual</option>
                  <option value="custom">Custom days…</option>
                </select>
              </div>
              {recurringFreq === 'semimonthly' && (
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label>2nd due day</label>
                  <input type="number" min="1" max="28" value={recurringDay2}
                    onChange={e => setRecurringDay2(e.target.value)} />
                </div>
              )}
              {recurringFreq === 'custom' && (
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label>Days of month</label>
                  <input type="text" placeholder="e.g. 1, 8, 15, 22" value={recurringDays}
                    onChange={e => setRecurringDays(e.target.value)} required />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Comma-separated days 1–28</div>
                </div>
              )}
              <div style={{ marginBottom: 20 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary">Create Bill</button>
                <button type="button" className="btn btn-secondary" onClick={() => setRecurringTxn(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
