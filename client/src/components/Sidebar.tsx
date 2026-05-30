import { useState } from 'react';
import type { Account, View } from '../types';
import { createAccount, updateAccount, deleteAccount } from '../api';
import pkg from '../../package.json';

const TYPE_ICONS: Record<string, string> = {
  checking:   '🏦',
  savings:    '💰',
  credit:     '💳',
  investment: '📈',
};

interface Props {
  accounts: Account[];
  view: View;
  onViewChange: (v: View) => void;
  onAccountsChange: () => void;
}

export default function Sidebar({ accounts, view, onViewChange, onAccountsChange }: Props) {
  const [showAdd, setShowAdd]     = useState(false);
  const [addForm, setAddForm]     = useState({ name: '', type: 'checking', initial_balance: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm]   = useState({ name: '', type: 'checking', initial_balance: '' });

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await createAccount({
      name: addForm.name,
      type: addForm.type as Account['type'],
      initial_balance: parseFloat(addForm.initial_balance) || 0,
    });
    setAddForm({ name: '', type: 'checking', initial_balance: '' });
    setShowAdd(false);
    onAccountsChange();
  }

  function startEdit(e: React.MouseEvent, acct: Account) {
    e.stopPropagation();
    setEditingId(acct.id);
    setEditForm({ name: acct.name, type: acct.type, initial_balance: String(acct.initial_balance) });
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    await updateAccount(editingId, {
      name: editForm.name,
      type: editForm.type as Account['type'],
      initial_balance: parseFloat(editForm.initial_balance) || 0,
    });
    setEditingId(null);
    onAccountsChange();
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this account and ALL its transactions? This cannot be undone.')) return;
    await deleteAccount(id);
    setEditingId(null);
    onAccountsChange();
  }

  const accountTypeOptions = (
    <>
      <option value="checking">Checking</option>
      <option value="savings">Savings</option>
      <option value="credit">Credit Card</option>
      <option value="investment">Investment</option>
    </>
  );

  return (
    <nav className="sidebar">
      <div className="sidebar-header">💵 BV Money</div>

      <div className="sidebar-section">
        <div className="sidebar-label">Accounts</div>
        {accounts.map(a => (
          <div key={a.id}>
            {editingId === a.id ? (
              <form
                onSubmit={handleEdit}
                style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}
                onClick={e => e.stopPropagation()}
              >
                <input
                  autoFocus
                  value={editForm.name}
                  onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  required
                  style={{ fontSize: 12, padding: '5px 8px' }}
                />
                <select
                  value={editForm.type}
                  onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
                  style={{ fontSize: 12, padding: '5px 8px' }}
                >
                  {accountTypeOptions}
                </select>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Opening balance"
                  value={editForm.initial_balance}
                  onChange={e => setEditForm(f => ({ ...f, initial_balance: e.target.value }))}
                  style={{ fontSize: 12, padding: '5px 8px' }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }}>Save</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ color: 'var(--danger)', background: 'transparent', border: '1px solid var(--danger)', fontSize: 11 }}
                  onClick={() => handleDelete(a.id)}
                >
                  Delete account &amp; all transactions
                </button>
              </form>
            ) : (
              <div
                className={`sidebar-item ${view.type === 'account' && view.id === a.id ? 'active' : ''}`}
                onClick={() => onViewChange({ type: 'account', id: a.id })}
              >
                <span style={{ fontSize: 14 }}>{TYPE_ICONS[a.type]}</span>
                <span className="item-name">{a.name}</span>
                <span className="item-balance" style={{ color: a.balance < 0 ? '#f87171' : undefined }}>
                  {fmt(a.balance)}
                </span>
                <span
                  className="btn-ghost"
                  style={{ fontSize: 11, padding: '2px 4px', opacity: 0.5 }}
                  onClick={e => startEdit(e, a)}
                  title="Edit account"
                >✏</span>
              </div>
            )}
          </div>
        ))}

        {showAdd ? (
          <form onSubmit={handleAdd} style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              autoFocus
              placeholder="Account name"
              value={addForm.name}
              onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
              required
              style={{ fontSize: 12, padding: '5px 8px' }}
            />
            <select
              value={addForm.type}
              onChange={e => setAddForm(f => ({ ...f, type: e.target.value }))}
              style={{ fontSize: 12, padding: '5px 8px' }}
            >
              {accountTypeOptions}
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="Opening balance"
              value={addForm.initial_balance}
              onChange={e => setAddForm(f => ({ ...f, initial_balance: e.target.value }))}
              style={{ fontSize: 12, padding: '5px 8px' }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }}>Add</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <button className="sidebar-add-btn" onClick={() => setShowAdd(true)}>
            + Add Account
          </button>
        )}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Planning</div>
        {[
          { type: 'bills',    icon: '📋', label: 'Bills & Income' },
          { type: 'budget',   icon: '📊', label: 'Budget' },
          { type: 'networth', icon: '📈', label: 'Net Worth' },
        ].map(item => (
          <div
            key={item.type}
            className={`sidebar-item ${view.type === item.type ? 'active' : ''}`}
            onClick={() => onViewChange({ type: item.type as View['type'] })}
          >
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            <span className="item-name">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Data</div>
        <div
          className={`sidebar-item ${view.type === 'import' ? 'active' : ''}`}
          onClick={() => onViewChange({ type: 'import' })}
        >
          <span style={{ fontSize: 14 }}>⬆️</span>
          <span className="item-name">Import</span>
        </div>
      </div>

      <div style={{ marginTop: 'auto', padding: '12px 16px', fontSize: 11, color: 'var(--text-muted)', opacity: 0.5 }}>
        v{pkg.version}
      </div>
    </nav>
  );
}
