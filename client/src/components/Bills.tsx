import { useState, useEffect, useCallback } from 'react';
import SortTh from './SortTh';
import CategoryPicker from './CategoryPicker';
import ColumnPicker from './ColumnPicker';
import { useColumnPrefs } from '../hooks/useColumnPrefs';
import type { ColumnDef } from '../hooks/useColumnPrefs';
import type { Account, Bill, Category } from '../types';
import type { BillDeduction, FsaAccount } from '../api';
import { getBills, createBill, updateBill, deleteBill, payBill, getCategories, getFsaAccounts } from '../api';

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

const BILL_COLUMNS: ColumnDef[] = [
  { key: 'name',       label: 'Name',       locked: true },
  { key: 'category',   label: 'Category',   default: true },
  { key: 'account',    label: 'Account',    default: true },
  { key: 'amount',     label: 'Amount',     locked: true },
  { key: 'due',        label: 'Next Due',   default: true },
  { key: 'frequency',  label: 'Frequency',  default: true },
  { key: 'auto_post',  label: 'Auto-post',  default: false },
  { key: 'status',     label: 'Status',     locked: true },
  { key: 'actions',    label: 'Actions',    locked: true },
];

// Builds the full update payload for a bill, applying one field change, so
// inline edits never clobber fields the cell itself doesn't touch (gross
// pay, deductions, etc. are preserved as-is).
function billPatchPayload(bill: Bill, changes: Partial<Record<string, unknown>>) {
  return {
    name:         bill.name,
    amount:       bill.amount,
    due_day:      bill.due_day,
    due_day_2:    bill.due_day_2,
    custom_days:  bill.custom_days,
    frequency:    bill.frequency,
    category_id:  bill.category_id,
    account_id:   bill.account_id,
    is_active:    1,
    auto_post:    bill.auto_post,
    gross_amount: bill.gross_amount,
    deductions:   bill.deductions,
    ...changes,
  };
}

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
  use_deductions: boolean;
  gross_amount: string;
  deductions: BillDeduction[];
}

const EMPTY_BILL_FORM: BillFormState = {
  name: '', amount: '', due_day: '1', due_day_2: '15', custom_days: '',
  frequency: 'monthly', category_id: '', account_id: '', kind: 'expense', auto_post: false,
  use_deductions: false, gross_amount: '', deductions: [],
};

interface Props {
  accounts: Account[];
  onTransactionAdded: () => void;
}

export default function Bills({ accounts, onTransactionAdded }: Props) {
  const [bills, setBills]         = useState<Bill[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [fsaAccounts, setFsaAccounts] = useState<FsaAccount[]>([]);
  const [showForm, setShowForm]   = useState(false);
  const [editBill, setEditBill]   = useState<Bill | null>(null);
  const [form, setForm]           = useState<BillFormState>(EMPTY_BILL_FORM);
  const [payingBill, setPayingBill] = useState<Bill | null>(null);
  const [payDate, setPayDate]     = useState(new Date().toISOString().slice(0, 10));
  const [payAccountId, setPayAccountId] = useState('');
  const [sortCol, setSortCol]     = useState('status');
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('asc');
  const [inlineEdit, setInlineEdit] = useState<{ id: number; field: string } | null>(null);
  const { isVisible, toggle, reset } = useColumnPrefs('bills', BILL_COLUMNS);

  const load = useCallback(async () => {
    const [b, c, f] = await Promise.all([getBills(), getCategories(), getFsaAccounts().catch(() => [])]);
    setBills(b);
    setCategories(c);
    setFsaAccounts(f);
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
      use_deductions: !!(b.gross_amount && b.deductions?.length),
      gross_amount: b.gross_amount != null ? String(b.gross_amount) : '',
      deductions: b.deductions ?? [],
    });
    setShowForm(true);
  }

  function cancelForm() { setShowForm(false); setEditBill(null); }

  function addDeduction() {
    setForm(f => ({ ...f, deductions: [...f.deductions, { label: '', amount: 0, fsa_account_id: null }] }));
  }
  function updateDeduction(i: number, patch: Partial<BillDeduction>) {
    setForm(f => ({ ...f, deductions: f.deductions.map((d, idx) => idx === i ? { ...d, ...patch } : d) }));
  }
  function removeDeduction(i: number) {
    setForm(f => ({ ...f, deductions: f.deductions.filter((_, idx) => idx !== i) }));
  }

  const deductionsTotal = form.deductions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const computedNet = form.use_deductions ? (parseFloat(form.gross_amount) || 0) - deductionsTotal : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = parseFloat(form.amount) || 0;
    const usingDeductions = form.kind === 'income' && form.use_deductions;
    const netAmount = usingDeductions ? (computedNet ?? 0) : raw;
    const data = {
      name:        form.name,
      amount:      form.kind === 'income' ? netAmount : -raw,
      due_day:     parseInt(form.due_day) || 1,
      due_day_2:   form.frequency === 'semimonthly' ? (parseInt(form.due_day_2) || 15) : null,
      custom_days: form.frequency === 'custom' ? (form.custom_days.trim() || null) : null,
      frequency:   form.frequency as Bill['frequency'],
      category_id: form.category_id ? parseInt(form.category_id) : null,
      account_id:  form.account_id  ? parseInt(form.account_id)  : null,
      auto_post:   form.auto_post && !!form.account_id,
      gross_amount: usingDeductions ? (parseFloat(form.gross_amount) || 0) : null,
      deductions:   usingDeductions ? form.deductions.filter(d => d.label.trim()) : [],
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

  async function patchField(bill: Bill, field: string, value: unknown) {
    const updated = await updateBill(bill.id, billPatchPayload(bill, { [field]: value }));
    setBills(prev => prev.map(b => b.id === bill.id ? updated : b));
    setInlineEdit(null);
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
        <div style={{ display: 'flex', gap: 8 }}>
          <ColumnPicker columns={BILL_COLUMNS} isVisible={isVisible} toggle={toggle} reset={reset} />
          <button className="btn btn-primary" onClick={openAdd}>+ Add Entry</button>
        </div>
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

            {form.kind === 'income' && (
              <div style={{ marginBottom: 12, padding: 12, background: 'var(--surface-2)', borderRadius: 'var(--radius)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none', marginBottom: form.use_deductions ? 10 : 0 }}>
                  <input
                    type="checkbox"
                    checked={form.use_deductions}
                    onChange={e => setForm(f => ({ ...f, use_deductions: e.target.checked }))}
                  />
                  <span>Break down gross pay with payroll deductions (401k, FSA, insurance…)</span>
                </label>

                {form.use_deductions && (
                  <div>
                    <div className="form-group" style={{ maxWidth: 160, marginBottom: 10 }}>
                      <label>Gross Pay ($)</label>
                      <input type="number" step="0.01" min="0" value={form.gross_amount}
                        onChange={e => setForm(f => ({ ...f, gross_amount: e.target.value }))} required />
                    </div>

                    {form.deductions.map((d, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                        <input
                          placeholder="e.g. 401k, FSA Dependent Care"
                          value={d.label}
                          onChange={e => updateDeduction(i, { label: e.target.value })}
                          style={{ flex: 2, fontSize: 13 }}
                        />
                        <input
                          type="number" step="0.01" placeholder="0.00"
                          value={d.amount || ''}
                          onChange={e => updateDeduction(i, { amount: parseFloat(e.target.value) || 0 })}
                          style={{ flex: 1, fontSize: 13 }}
                        />
                        <select
                          value={d.fsa_account_id ?? ''}
                          onChange={e => updateDeduction(i, { fsa_account_id: e.target.value ? parseInt(e.target.value) : null })}
                          style={{ flex: 2, fontSize: 13 }}
                        >
                          <option value="">— Not an FSA —</option>
                          {fsaAccounts.map(fsa => <option key={fsa.id} value={fsa.id}>Funds: {fsa.name}</option>)}
                        </select>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeDeduction(i)}>✕</button>
                      </div>
                    ))}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={addDeduction} style={{ marginBottom: 10 }}>
                      + Add Deduction
                    </button>

                    <div style={{ fontSize: 13, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                      Gross {fmt(parseFloat(form.gross_amount) || 0)} − Deductions {fmt(deductionsTotal)} ={' '}
                      <strong>Net Pay {fmt(computedNet ?? 0)}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}

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
          <div className="register-table-wrapper">
          <table className="register-table">
            <thead>
              <tr>
                <SortTh label="Name" col="name" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                {isVisible('category') && <th>Category</th>}
                {isVisible('account')  && <th>Account</th>}
                <SortTh label="Amount" col="amount" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-right" />
                {isVisible('due')       && <SortTh label="Next Due" col="due" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                {isVisible('frequency') && <SortTh label="Frequency" col="frequency" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                {isVisible('auto_post') && <th>Auto-post</th>}
                <SortTh label="Status" col="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(b => {
                const status = billStatus(b);
                const due    = nextDueDate(b);
                const editingField = (f: string) => inlineEdit?.id === b.id && inlineEdit.field === f;
                const startInline = (f: string) => setInlineEdit({ id: b.id, field: f });
                const hasDeductions = !!(b.gross_amount && b.deductions?.length);
                const cats = categories.filter(c => c.type === (Number(b.amount) >= 0 ? 'income' : 'expense'));

                return (
                  <tr key={b.id}>
                    <td onClick={() => !editingField('name') && startInline('name')} style={{ cursor: 'text' }}>
                      {editingField('name') ? (
                        <input
                          autoFocus defaultValue={b.name}
                          onBlur={e => patchField(b, 'name', e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setInlineEdit(null); }}
                          style={{ fontSize: 13, padding: '3px 6px', width: '100%' }}
                        />
                      ) : (
                        <div style={{ fontWeight: 500 }}>
                          {b.name}
                          {b.auto_post && (
                            <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--primary)', fontWeight: 600 }} title="Auto-posts when due">⚡</span>
                          )}
                        </div>
                      )}
                    </td>

                    {isVisible('category') && (
                      <td onClick={e => e.stopPropagation()}>
                        {editingField('category') ? (
                          <CategoryPicker
                            value={b.category_id ? String(b.category_id) : ''}
                            categories={cats}
                            autoFocus
                            style={{ minWidth: 150 }}
                            onChange={id => patchField(b, 'category_id', id ? parseInt(id) : null)}
                            onClose={() => setInlineEdit(null)}
                          />
                        ) : b.category_name ? (
                          <span
                            className="category-chip" style={{ background: (b.category_color ?? '#888') + '22', color: b.category_color ?? '#888', cursor: 'pointer' }}
                            onClick={() => startInline('category')} title="Click to change category"
                          >{b.category_name}</span>
                        ) : (
                          <span className="text-muted" style={{ cursor: 'pointer', fontSize: 12 }} onClick={() => startInline('category')}>+ category</span>
                        )}
                      </td>
                    )}

                    {isVisible('account') && (
                      <td onClick={e => e.stopPropagation()}>
                        {editingField('account') ? (
                          <select
                            autoFocus defaultValue={b.account_id ? String(b.account_id) : ''}
                            onChange={e => patchField(b, 'account_id', e.target.value ? parseInt(e.target.value) : null)}
                            onBlur={() => setInlineEdit(null)}
                            style={{ fontSize: 13, padding: '3px 6px' }}
                          >
                            <option value="">— None —</option>
                            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        ) : (
                          <span style={{ cursor: 'pointer' }} onClick={() => startInline('account')} title="Click to change account">
                            {b.account_name ?? <span className="text-muted">+ account</span>}
                          </span>
                        )}
                      </td>
                    )}

                    <td
                      className="amount-col"
                      style={{ fontVariantNumeric: 'tabular-nums', color: Number(b.amount) >= 0 ? 'var(--success, #22c55e)' : 'var(--danger)', fontWeight: 500, cursor: hasDeductions ? 'default' : 'text' }}
                      onClick={() => !hasDeductions && !editingField('amount') && startInline('amount')}
                      title={hasDeductions ? 'Computed from gross pay + deductions — edit via ✏️' : 'Click to edit'}
                    >
                      {editingField('amount') ? (
                        <input
                          autoFocus type="number" step="0.01" defaultValue={Math.abs(Number(b.amount))}
                          onBlur={e => {
                            const raw = parseFloat(e.target.value) || 0;
                            patchField(b, 'amount', Number(b.amount) >= 0 ? raw : -raw);
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setInlineEdit(null); }}
                          style={{ fontSize: 13, padding: '3px 6px', width: 90, textAlign: 'right' }}
                        />
                      ) : (
                        <>{Number(b.amount) >= 0 ? '+' : ''}{fmt(b.amount)}</>
                      )}
                    </td>

                    {isVisible('due') && (
                      <td onClick={e => e.stopPropagation()}>
                        {editingField('due') ? (
                          <input
                            autoFocus type="number" min="1" max="28" defaultValue={b.due_day}
                            onBlur={e => patchField(b, 'due_day', parseInt(e.target.value) || b.due_day)}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setInlineEdit(null); }}
                            style={{ fontSize: 13, padding: '3px 6px', width: 60 }}
                          />
                        ) : (
                          <span className="text-muted" style={{ fontSize: 13, cursor: 'pointer' }} onClick={() => startInline('due')} title="Click to edit due day">
                            {due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </td>
                    )}

                    {isVisible('frequency') && (
                      <td onClick={e => e.stopPropagation()}>
                        {editingField('frequency') ? (
                          <select
                            autoFocus defaultValue={b.frequency}
                            onChange={e => patchField(b, 'frequency', e.target.value)}
                            onBlur={() => setInlineEdit(null)}
                            style={{ fontSize: 13, padding: '3px 6px' }}
                          >
                            <option value="monthly">Monthly</option>
                            <option value="semimonthly">Semi-monthly</option>
                            <option value="quarterly">Quarterly</option>
                            <option value="weekly">Weekly</option>
                            <option value="biweekly">Bi-weekly</option>
                            <option value="annual">Annual</option>
                            <option value="custom">Custom days…</option>
                          </select>
                        ) : (
                          <span className="text-muted" style={{ fontSize: 12, cursor: 'pointer' }} onClick={() => startInline('frequency')} title="Click to change frequency">
                            {freqLabel(b)}
                          </span>
                        )}
                      </td>
                    )}

                    {isVisible('auto_post') && (
                      <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={!!b.auto_post}
                          disabled={!b.account_id}
                          title={!b.account_id ? 'Set an account first' : 'Auto-post when due'}
                          onChange={e => patchField(b, 'auto_post', e.target.checked)}
                        />
                      </td>
                    )}

                    <td>
                      <span className={`status-badge status-${status}`}>{STATUS_LABEL[status]}</span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-success btn-sm"
                          onClick={() => { setPayingBill(b); setPayDate(new Date().toISOString().slice(0, 10)); setPayAccountId(''); }}>
                          {Number(b.amount) >= 0 ? 'Record' : 'Pay'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(b)} title="Full editor">✏️</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(b.id)} title="Delete">🗑</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
