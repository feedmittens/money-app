import { useState } from 'react';
import type { Account, View } from '../types';
import type { User } from '../api';
import { createAccount, updateAccount, deleteAccount } from '../api';
import pkg from '../../package.json';
import tallyLogo from '../assets/tally-logo.svg';

const TYPE_ICONS: Record<string, string> = {
  checking:   '🏦',
  savings:    '💰',
  credit:     '💳',
  investment: '📈',
};

interface Props {
  accounts: Account[];
  view: View;
  user: User;
  onViewChange: (v: View) => void;
  onAccountsChange: () => void;
  onLogout: () => void;
}

export default function Sidebar({ accounts, view, user, onViewChange, onAccountsChange, onLogout }: Props) {
  const [showAdd, setShowAdd]     = useState(false);
  const [addForm, setAddForm]     = useState({ name: '', type: 'checking', initial_balance: '' });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm]   = useState({ name: '', type: 'checking', initial_balance: '' });

  const fmt = (n: number | string) =>
    Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

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
      <div className="sidebar-header">
        <a
          href="https://github.com/feedmittens/money-app"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'inherit', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
          title="View on GitHub"
        >
          <img src={tallyLogo} alt="" style={{ width: 22, height: 22, flexShrink: 0 }} />
          Tally
        </a>
        <div style={{ fontSize: 10, fontWeight: 400, opacity: 0.55, marginTop: 2, letterSpacing: '0.03em' }}>v{pkg.version}</div>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Overview</div>
        <div
          className={`sidebar-item ${view.type === 'home' ? 'active' : ''}`}
          onClick={() => onViewChange({ type: 'home' })}
        >
          <span style={{ fontSize: 14 }}>🏠</span>
          <span className="item-name">Dashboard</span>
        </div>
      </div>

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
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, padding: '2px 6px', flexShrink: 0 }}
                  onClick={e => startEdit(e, a)}
                  title="Edit account name, type, or opening balance"
                >✏</button>
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
          { type: 'forecast', icon: '🔮', label: 'Balance Forecast' },
        ].map(item => (
          <div
            key={item.type}
            className={`sidebar-item ${view.type === item.type ? 'active' : ''}`}
            onClick={() => onViewChange({ type: item.type } as View)}
          >
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            <span className="item-name">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Data</div>
        {[
          { type: 'search',  icon: '🔍', label: 'Search' },
          { type: 'reports', icon: '📑', label: 'Reports' },
          { type: 'import',  icon: '⬆️', label: 'Import' },
        ].map(item => (
          <div
            key={item.type}
            className={`sidebar-item ${view.type === item.type ? 'active' : ''}`}
            onClick={() => onViewChange({ type: item.type } as View)}
          >
            <span style={{ fontSize: 14 }}>{item.icon}</span>
            <span className="item-name">{item.label}</span>
          </div>
        ))}
      </div>

      {/* User footer */}
      <div style={{
        marginTop: 'auto', padding: '12px 16px',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.displayName}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user.role === 'admin' ? '⭐ Admin' : user.email}
          </div>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onLogout}
          title="Sign out"
          style={{ fontSize: 16, padding: '4px 6px', flexShrink: 0 }}
        >↩</button>
      </div>

      {/* CCG attribution */}
      <div style={{ padding: '6px 16px 10px', textAlign: 'center' }}>
        <a
          href="https://www.corkscrewconsulting.net"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 10, color: 'var(--text-muted)', textDecoration: 'none', opacity: 0.6 }}
        >
          Corkscrew Consulting Group
        </a>
      </div>

    </nav>
  );
}
