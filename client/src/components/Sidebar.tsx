import { useState } from 'react';
import type { Account, View } from '../types';
import { createAccount, deleteAccount } from '../api';

const TYPE_ICONS: Record<string, string> = {
  checking: '🏦',
  savings: '💰',
  credit: '💳',
  investment: '📈',
};

interface Props {
  accounts: Account[];
  view: View;
  onViewChange: (v: View) => void;
  onAccountsChange: () => void;
}

export default function Sidebar({ accounts, view, onViewChange, onAccountsChange }: Props) {
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'checking', initial_balance: '' });

  const fmt = (n: number) =>
    n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    await createAccount({
      name: form.name,
      type: form.type as Account['type'],
      initial_balance: parseFloat(form.initial_balance) || 0,
    });
    setForm({ name: '', type: 'checking', initial_balance: '' });
    setShowAddAccount(false);
    onAccountsChange();
  }

  async function handleDelete(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    if (!confirm('Delete this account and all its transactions?')) return;
    await deleteAccount(id);
    onAccountsChange();
  }

  return (
    <nav className="sidebar">
      <div className="sidebar-header">💵 Money</div>

      <div className="sidebar-section">
        <div className="sidebar-label">Accounts</div>
        {accounts.map(a => (
          <div
            key={a.id}
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
              style={{ fontSize: 11, padding: '2px 4px', opacity: 0.6 }}
              onClick={e => handleDelete(e, a.id)}
              title="Delete account"
            >✕</span>
          </div>
        ))}

        {showAddAccount ? (
          <form onSubmit={handleAdd} style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              autoFocus
              placeholder="Account name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
              style={{ fontSize: 12, padding: '5px 8px' }}
            />
            <select
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              style={{ fontSize: 12, padding: '5px 8px' }}
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit">Credit Card</option>
              <option value="investment">Investment</option>
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="Opening balance"
              value={form.initial_balance}
              onChange={e => setForm(f => ({ ...f, initial_balance: e.target.value }))}
              style={{ fontSize: 12, padding: '5px 8px' }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }}>Add</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowAddAccount(false)}>Cancel</button>
            </div>
          </form>
        ) : (
          <button className="sidebar-add-btn" onClick={() => setShowAddAccount(true)}>
            + Add Account
          </button>
        )}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Planning</div>
        <div
          className={`sidebar-item ${view.type === 'bills' ? 'active' : ''}`}
          onClick={() => onViewChange({ type: 'bills' })}
        >
          <span style={{ fontSize: 14 }}>📋</span>
          <span className="item-name">Bills</span>
        </div>
        <div
          className={`sidebar-item ${view.type === 'budget' ? 'active' : ''}`}
          onClick={() => onViewChange({ type: 'budget' })}
        >
          <span style={{ fontSize: 14 }}>📊</span>
          <span className="item-name">Budget</span>
        </div>
        <div
          className={`sidebar-item ${view.type === 'networth' ? 'active' : ''}`}
          onClick={() => onViewChange({ type: 'networth' })}
        >
          <span style={{ fontSize: 14 }}>📈</span>
          <span className="item-name">Net Worth</span>
        </div>
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
    </nav>
  );
}
