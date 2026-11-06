import { useState, useEffect, useCallback } from 'react';
import type { Category } from '../types';
import type { FsaAccount } from '../api';
import { getFsaAccounts, getFsaLimits, createFsaAccount, updateFsaAccount, deleteFsaAccount, getCategories } from '../api';

const fmt = (n: number) => Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const TYPE_LABEL: Record<string, string> = { dependent_care: 'Dependent Care FSA', medical: 'Medical FSA' };

interface FormState {
  name: string;
  fsa_type: 'dependent_care' | 'medical';
  plan_year: string;
  annual_election: string;
  category_id: string;
}

const emptyForm = (): FormState => ({
  name: '', fsa_type: 'dependent_care', plan_year: String(new Date().getFullYear()),
  annual_election: '', category_id: '',
});

export default function Fsa() {
  const [accounts, setAccounts] = useState<FsaAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [limits, setLimits] = useState<Record<string, number>>({});
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  const load = useCallback(async () => {
    const [a, c, l] = await Promise.all([getFsaAccounts(), getCategories(), getFsaLimits()]);
    setAccounts(a);
    setCategories(c.filter(cat => cat.type === 'expense'));
    setLimits(l);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openAdd() {
    setEditId(null);
    setForm(emptyForm());
    setShowForm(true);
  }

  function openEdit(a: FsaAccount) {
    setEditId(a.id);
    setForm({
      name: a.name, fsa_type: a.fsa_type, plan_year: String(a.plan_year),
      annual_election: String(a.annual_election), category_id: a.category_id ? String(a.category_id) : '',
    });
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: form.name,
      fsa_type: form.fsa_type,
      plan_year: parseInt(form.plan_year) || new Date().getFullYear(),
      annual_election: parseFloat(form.annual_election) || 0,
      category_id: form.category_id ? parseInt(form.category_id) : null,
    };
    if (editId) await updateFsaAccount(editId, data);
    else        await createFsaAccount(data);
    setShowForm(false);
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm('Remove this FSA account? Historical contributions/spending records remain in your transactions.')) return;
    await deleteFsaAccount(id);
    load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">FSA Accounts</div>
          <div className="page-subtitle">Dependent Care &amp; Medical flexible spending accounts</div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Add FSA</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>{editId ? 'Edit FSA' : 'New FSA'}</div>
          <form onSubmit={handleSubmit}>
            <div className="form-row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
              <div className="form-group">
                <label>Name</label>
                <input autoFocus value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Dependent Care FSA 2027" required />
              </div>
              <div className="form-group" style={{ maxWidth: 200 }}>
                <label>Type</label>
                <select value={form.fsa_type} disabled={!!editId}
                  onChange={e => setForm(f => ({ ...f, fsa_type: e.target.value as FormState['fsa_type'] }))}>
                  <option value="dependent_care">Dependent Care</option>
                  <option value="medical">Medical</option>
                </select>
              </div>
              <div className="form-group" style={{ maxWidth: 120 }}>
                <label>Plan Year</label>
                <input type="number" value={form.plan_year} disabled={!!editId}
                  onChange={e => setForm(f => ({ ...f, plan_year: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ maxWidth: 160 }}>
                <label>Annual Election ($)</label>
                <input type="number" step="0.01" min="0" value={form.annual_election}
                  onChange={e => setForm(f => ({ ...f, annual_election: e.target.value }))} required />
                {limits[form.fsa_type] != null && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                    IRS limit reference: {fmt(limits[form.fsa_type])}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Spending Category</label>
                <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                  <option value="">— None —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  Transactions in this category (e.g. Day Care, Healthcare) count against the election.
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" className="btn btn-primary">{editId ? 'Save' : 'Add FSA'}</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="card empty-state">
          <div style={{ fontSize: 32 }}>🏥</div>
          <p>No FSA accounts yet. Click "+ Add FSA" to track a Dependent Care or Medical election.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {accounts.map(a => {
            const spentPct = a.annual_election > 0 ? Math.min(100, (a.ytd_spent / a.annual_election) * 100) : 0;
            const contribPct = a.annual_election > 0 ? Math.min(100, (a.ytd_contributed / a.annual_election) * 100) : 0;
            return (
              <div key={a.id} className="card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{a.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{TYPE_LABEL[a.fsa_type]} · {a.plan_year}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(a)} title="Edit">✏️</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(a.id)} title="Delete">🗑</button>
                  </div>
                </div>

                <div style={{ fontSize: 24, fontWeight: 700, margin: '10px 0 4px' }}>{fmt(a.annual_election)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Annual election</div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span>Contributed</span><span>{fmt(a.ytd_contributed)}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${contribPct}%`, height: '100%', background: 'var(--primary)' }} />
                  </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                    <span>Spent{a.category_name ? ` (${a.category_name})` : ''}</span><span>{fmt(a.ytd_spent)}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${spentPct}%`, height: '100%', background: spentPct >= 100 ? 'var(--danger)' : 'var(--success, #22c55e)' }} />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <span className="text-muted">Remaining to spend</span>
                  <strong style={{ color: a.remaining_to_spend < 0 ? 'var(--danger)' : undefined }}>{fmt(a.remaining_to_spend)}</strong>
                </div>
                {a.per_pay_period_amount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span className="text-muted">Per paycheck</span><span>{fmt(a.per_pay_period_amount)}</span>
                  </div>
                )}
                {!a.on_track && a.per_pay_period_amount > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>
                    ⚠ Projected contributions ({fmt(a.projected_contribution)}) won't reach your election — check your paycheck deduction in Bills &amp; Income.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
