import { useState, useEffect } from 'react';
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
  open: boolean;
  onViewChange: (v: View) => void;
  onAccountsChange: () => void;
  onLogout: () => void;
}

export default function Sidebar({ accounts, view, user, open, onViewChange, onAccountsChange, onLogout }: Props) {
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  const [showAdd, setShowAdd]         = useState(false);
  const [addForm, setAddForm]         = useState({ name: '', type: 'checking', initial_balance: '' });
  const [editingAcct, setEditingAcct] = useState<Account | null>(null);
  const [editForm, setEditForm]       = useState({ name: '', type: 'checking', initial_balance: '' });
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [editError, setEditError]     = useState('');

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
    setEditingAcct(acct);
    setEditForm({ name: acct.name, type: acct.type, initial_balance: String(acct.initial_balance) });
    setDeleteConfirm('');
    setEditError('');
  }

  function closeModal() {
    setEditingAcct(null);
    setDeleteConfirm('');
    setEditError('');
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingAcct) return;
    try {
      await updateAccount(editingAcct.id, {
        name: editForm.name,
        type: editForm.type as Account['type'],
        initial_balance: parseFloat(editForm.initial_balance) || 0,
      });
      closeModal();
      onAccountsChange();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Save failed');
    }
  }

  async function handleDelete() {
    if (!editingAcct || deleteConfirm !== editingAcct.name) return;
    try {
      await deleteAccount(editingAcct.id);
      closeModal();
      if (view.type === 'account' && view.id === editingAcct.id) {
        onViewChange({ type: 'home' });
      }
      onAccountsChange();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Delete failed');
    }
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
    <nav className={`sidebar${open ? ' open' : ''}`}>
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
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, padding: '2px 6px', flexShrink: 0 }}
              onClick={e => startEdit(e, a)}
              title="Edit account"
            >✏</button>
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
          { type: 'search',   icon: '🔍', label: 'Search' },
          { type: 'reports',  icon: '📑', label: 'Reports' },
          { type: 'import',   icon: '⬆️', label: 'Import' },
          { type: 'tokens',   icon: '🔑', label: 'API Tokens' },
          { type: 'settings', icon: '⚙️', label: 'Settings' },
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

      {user.role === 'admin' && (
        <div className="sidebar-section">
          <div className="sidebar-label">Admin</div>
          <div
            className={`sidebar-item ${view.type === 'admin' ? 'active' : ''}`}
            onClick={() => onViewChange({ type: 'admin' })}
          >
            <span style={{ fontSize: 14 }}>👥</span>
            <span className="item-name">Users</span>
          </div>
        </div>
      )}

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
          onClick={() => setDark(d => !d)}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{ fontSize: 14, padding: '4px 6px', flexShrink: 0 }}
        >{dark ? '☀️' : '🌙'}</button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={onLogout}
          title="Sign out"
          style={{ fontSize: 16, padding: '4px 6px', flexShrink: 0 }}
        >↩</button>
      </div>

      {/* CCG attribution + help */}
      <div style={{ padding: '6px 16px 10px', textAlign: 'center', display: 'flex', justifyContent: 'center', gap: 12 }}>
        <a
          href="https://www.corkscrewconsulting.net"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 10, color: 'var(--text-muted)', textDecoration: 'none', opacity: 0.6 }}
        >
          Corkscrew Consulting Group
        </a>
        <a
          href="/api/manual"
          download="MANUAL.md"
          style={{ fontSize: 10, color: 'var(--text-muted)', textDecoration: 'none', opacity: 0.6 }}
          title="Download user manual (Markdown)"
        >
          📖 Manual
        </a>
      </div>

      {/* Account edit / delete modal */}
      {editingAcct && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={closeModal}
        >
          <div
            style={{
              background: 'var(--surface)', borderRadius: 'var(--radius)',
              border: '1px solid var(--border)', padding: 24, width: 320,
              display: 'flex', flexDirection: 'column', gap: 12,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: 15 }}>Edit Account</div>

            <form onSubmit={handleEdit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                autoFocus
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                required
                style={{ fontSize: 13, padding: '6px 10px' }}
                placeholder="Account name"
              />
              <select
                value={editForm.type}
                onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}
                style={{ fontSize: 13, padding: '6px 10px' }}
              >
                {accountTypeOptions}
              </select>
              <input
                type="number"
                step="0.01"
                placeholder="Opening balance"
                value={editForm.initial_balance}
                onChange={e => setEditForm(f => ({ ...f, initial_balance: e.target.value }))}
                style={{ fontSize: 13, padding: '6px 10px' }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Save</button>
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Cancel</button>
              </div>
            </form>

            {editError && (
              <div style={{ fontSize: 12, color: 'var(--danger)', padding: '6px 10px', background: '#fee2e2', borderRadius: 'var(--radius)' }}>
                {editError}
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                Type <strong style={{ color: 'var(--text)' }}>{editingAcct.name}</strong> to permanently delete this account and all its transactions:
              </div>
              <input
                placeholder={editingAcct.name}
                value={deleteConfirm}
                onChange={e => setDeleteConfirm(e.target.value)}
                style={{
                  fontSize: 13, padding: '6px 10px', width: '100%', boxSizing: 'border-box',
                  borderColor: deleteConfirm && deleteConfirm !== editingAcct.name ? 'var(--danger)' : undefined,
                }}
              />
              <button
                type="button"
                className="btn"
                style={{
                  marginTop: 8, width: '100%', fontSize: 12,
                  color: 'var(--danger)', background: 'transparent', border: '1px solid var(--danger)',
                  opacity: deleteConfirm === editingAcct.name ? 1 : 0.35,
                  cursor: deleteConfirm === editingAcct.name ? 'pointer' : 'not-allowed',
                }}
                disabled={deleteConfirm !== editingAcct.name}
                onClick={handleDelete}
              >
                Delete account &amp; all transactions
              </button>
            </div>
          </div>
        </div>
      )}

    </nav>
  );
}
