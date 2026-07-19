import { useState, useEffect } from 'react';
import { getUsers, approveUser, suspendUser, unsuspendUser, setUserRole, deleteUser } from '../api';
import type { User } from '../api';

interface AdminUser extends User {
  status: 'pending' | 'active' | 'suspended';
  has_google: boolean;
  created_at: string;
  last_login: string | null;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending:   '#f59e0b',
    active:    '#10b981',
    suspended: '#ef4444',
  };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 600, color: '#fff',
      background: colors[status] || '#6b7280',
    }}>{status}</span>
  );
}

export default function AdminPanel() {
  const [users,   setUsers]   = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await getUsers();
      setUsers(data as AdminUser[]);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function act(fn: () => Promise<unknown>) {
    try { await fn(); await load(); }
    catch (e: unknown) { alert((e as Error).message); }
  }

  if (loading) return <div className="empty-state">Loading…</div>;
  if (error)   return <div className="empty-state" style={{ color: 'var(--danger)' }}>{error}</div>;

  const pending = users.filter(u => u.status === 'pending');

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Admin — User Management</div>
          <div className="page-subtitle">
            {users.length} user{users.length !== 1 ? 's' : ''}
            {pending.length > 0 && (
              <span style={{ marginLeft: 8, color: '#f59e0b', fontWeight: 600 }}>
                · {pending.length} pending approval
              </span>
            )}
          </div>
        </div>
        <button className="btn btn-secondary" onClick={load}>↺ Refresh</button>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="register-table" style={{ minWidth: 680 }}>
          <thead>
            <tr>
              <th>User</th>
              <th>Status</th>
              <th>Role</th>
              <th>Auth</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{u.displayName}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{u.email}</div>
                </td>
                <td><StatusBadge status={u.status} /></td>
                <td style={{ fontSize: 12 }}>
                  {u.role === 'admin' ? '⭐ admin' : 'user'}
                </td>
                <td style={{ fontSize: 12 }}>
                  {u.has_google  && <span title="Google OAuth">G </span>}
                  {u.totpEnabled && <span title="2FA enabled">🔒 </span>}
                  {!u.has_google && !u.totpEnabled && <span className="text-muted">password</span>}
                </td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {u.last_login ? new Date(u.last_login).toLocaleDateString() : '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {u.status === 'pending' && (
                      <button className="btn btn-primary btn-sm"
                        onClick={() => act(() => approveUser(u.id))}>
                        Approve
                      </button>
                    )}
                    {u.status === 'active' && (
                      <button className="btn btn-sm"
                        style={{ color: 'var(--danger)', border: '1px solid var(--danger)', background: 'transparent' }}
                        onClick={() => act(() => suspendUser(u.id))}>
                        Suspend
                      </button>
                    )}
                    {u.status === 'suspended' && (
                      <button className="btn btn-secondary btn-sm"
                        onClick={() => act(() => unsuspendUser(u.id))}>
                        Unsuspend
                      </button>
                    )}
                    <button className="btn btn-secondary btn-sm"
                      onClick={() => act(() => setUserRole(u.id, u.role === 'admin' ? 'user' : 'admin'))}>
                      → {u.role === 'admin' ? 'user' : 'admin'}
                    </button>
                    <button className="btn btn-sm"
                      style={{ color: 'var(--danger)', border: '1px solid var(--danger)', background: 'transparent' }}
                      onClick={() => {
                        if (confirm(`Permanently delete ${u.email} and ALL their financial data?`))
                          act(() => deleteUser(u.id));
                      }}>
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
