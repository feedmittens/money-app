import { useState, useEffect, useCallback } from 'react';
import type { BudgetRow, Category } from '../types';
import { getBudgets, saveBudget, getCategories } from '../api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts';

const fmt = (n: number | string) =>
  Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

function prevMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function nextMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtMonth(m: string): string {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

export default function Budget() {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingCatId, setEditingCatId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCatId, setNewCatId] = useState('');
  const [newCatAmount, setNewCatAmount] = useState('');

  const load = useCallback(async () => {
    const [b, c] = await Promise.all([getBudgets(month), getCategories()]);
    setRows(b);
    setCategories(c);
  }, [month]);

  useEffect(() => { load(); }, [load]);

  async function handleSaveBudget(categoryId: number, newAmount: number) {
    const existing = rows.find(r => r.category_id === categoryId);
    await saveBudget({ category_id: categoryId, month, amount: newAmount, rollover: existing?.rollover ?? false });
    setEditingId(null);
    setEditingCatId(null);
    load();
  }

  async function toggleRollover(r: BudgetRow) {
    if (!r.id) return; // unbudgeted rows can't toggle rollover
    await saveBudget({ category_id: r.category_id, month, amount: r.amount, rollover: !r.rollover });
    load();
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCatId) return;
    await saveBudget({ category_id: parseInt(newCatId), month, amount: parseFloat(newCatAmount) || 0 });
    setShowAddCat(false);
    setNewCatId('');
    setNewCatAmount('');
    load();
  }

  const expenseCats = categories.filter(c => c.type === 'expense');
  const usedCatIds = new Set(rows.map(r => r.category_id));
  const availableCats = expenseCats.filter(c => !usedCatIds.has(c.id));

  const totalBudget = rows.reduce((s, r) => s + r.amount, 0);
  const totalActual = rows.reduce((s, r) => s + Math.abs(r.actual), 0);

  const chartData = rows
    .filter(r => r.amount > 0 || r.actual !== 0)
    .map(r => ({
      name: r.category_name.length > 12 ? r.category_name.slice(0, 12) + '…' : r.category_name,
      Budget: r.amount,
      Actual: Math.abs(r.actual),
      color: r.category_color,
    }))
    .sort((a, b) => b.Budget - a.Budget);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Budget</div>
          <div className="page-subtitle">Set budgets and track spending by category</div>
        </div>
        <div className="month-nav">
          <button className="btn btn-secondary btn-sm" onClick={() => setMonth(prevMonth(month))}>‹ Prev</button>
          <span>{fmtMonth(month)}</span>
          <button className="btn btn-secondary btn-sm" onClick={() => setMonth(nextMonth(month))}>Next ›</button>
        </div>
      </div>

      {/* Summary */}
      <div className="summary-cards" style={{ marginBottom: 20 }}>
        <div className="summary-card">
          <div className="label">Total Budget</div>
          <div className="value" style={{ color: 'var(--primary)' }}>{fmt(totalBudget)}</div>
        </div>
        <div className="summary-card">
          <div className="label">Total Spent</div>
          <div className="value" style={{ color: totalActual > totalBudget ? 'var(--danger)' : 'var(--text)' }}>
            {fmt(totalActual)}
          </div>
        </div>
        <div className="summary-card">
          <div className="label">Remaining</div>
          <div className="value" style={{ color: totalBudget - totalActual < 0 ? 'var(--danger)' : 'var(--success)' }}>
            {fmt(totalBudget - totalActual)}
          </div>
        </div>
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: '16px 8px 8px' }}>
          <div style={{ padding: '0 12px 8px', fontWeight: 600, fontSize: 14 }}>Budget vs. Actual</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Budget" fill="#93c5fd" radius={[3, 3, 0, 0]} />
              <Bar dataKey="Actual" radius={[3, 3, 0, 0]}>
                {chartData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.Actual > entry.Budget ? '#fca5a5' : '#86efac'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Budget table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Category Budgets</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddCat(true)}>+ Add Category</button>
        </div>

        {showAddCat && (
          <form onSubmit={handleAddCategory} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ minWidth: 180 }}>
              <label>Category</label>
              <select value={newCatId} onChange={e => setNewCatId(e.target.value)} required>
                <option value="">— Select —</option>
                {availableCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ maxWidth: 120 }}>
              <label>Monthly Budget ($)</label>
              <input type="number" step="0.01" min="0" placeholder="0.00" value={newCatAmount} onChange={e => setNewCatAmount(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary btn-sm">Add</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddCat(false)}>Cancel</button>
          </form>
        )}

        {rows.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 32 }}>📊</div>
            <p>No budgets set for this month. Click "Add Category" to start.</p>
          </div>
        ) : (
          <>
            <div className="budget-row header">
              <span>Category</span>
              <span className="text-right">Budget</span>
              <span className="text-right">Actual</span>
              <span className="text-right">Remaining</span>
              <span>Progress</span>
              <span></span>
            </div>
            {rows.map(r => {
              const actual = Math.abs(r.actual);
              const effective = r.amount + (r.rollover_amount ?? 0);
              const pct = effective > 0 ? Math.min(actual / effective, 1) : 0;
              const over = actual > effective && effective > 0;
              const remaining = effective - actual;
              const isEditing = (editingId === r.id) || (editingCatId === r.category_id && r.id === null);

              return (
                <div key={r.category_id} className="budget-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span
                      style={{
                        width: 10, height: 10, borderRadius: '50%',
                        background: r.category_color, flexShrink: 0,
                      }}
                    />
                    <span style={{ fontWeight: 500 }}>{r.category_name}</span>
                  </div>
                  <div className="text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {isEditing ? (
                      <input
                        autoFocus
                        className="inline-edit-input"
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={r.amount}
                        onBlur={e => handleSaveBudget(r.category_id, parseFloat(e.target.value) || 0)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          if (e.key === 'Escape') { setEditingId(null); setEditingCatId(null); }
                        }}
                        style={{ width: 80, textAlign: 'right' }}
                      />
                    ) : (
                      <div>
                        <span
                          className="text-muted"
                          style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
                          onClick={() => {
                            setEditAmount(String(r.amount));
                            setEditingId(r.id);
                            setEditingCatId(r.category_id);
                          }}
                          title="Click to edit"
                        >
                          {fmt(r.amount)}
                        </span>
                        {r.rollover && (r.rollover_amount ?? 0) > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--success)', marginTop: 1 }}
                            title="Rolled over from previous month">
                            +{fmt(r.rollover_amount)} ↩
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div
                    className="text-right"
                    style={{ fontVariantNumeric: 'tabular-nums', color: actual > 0 ? 'var(--danger)' : 'var(--text-muted)' }}
                  >
                    {fmt(actual)}
                  </div>
                  <div
                    className="text-right"
                    style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: remaining < 0 ? 'var(--danger)' : 'var(--success)' }}
                  >
                    {fmt(remaining)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className="budget-bar-track">
                      <div
                        className="budget-bar-fill"
                        style={{
                          width: `${pct * 100}%`,
                          background: over ? 'var(--danger)' : r.category_color,
                        }}
                      />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 32 }}>
                      {r.amount > 0 ? Math.round(pct * 100) + '%' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {r.id && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => toggleRollover(r)}
                        title={r.rollover ? 'Rollover enabled — click to disable' : 'Enable rollover from previous month'}
                        style={{ opacity: r.rollover ? 1 : 0.35 }}
                      >↩</button>
                    )}
                    {r.id && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={async () => {
                          if (!confirm('Remove this budget entry?')) return;
                          const { deleteBudget } = await import('../api');
                          await deleteBudget(r.id!);
                          load();
                        }}
                        title="Remove"
                      >🗑</button>
                    )}
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
