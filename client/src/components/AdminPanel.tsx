import { useState, useEffect, useRef } from 'react';
import { getUsers, approveUser, suspendUser, unsuspendUser, setUserRole, deleteUser, getAppInfo } from '../api';
import type { User, AppInfo } from '../api';

interface AdminUser extends User {
  status: 'pending' | 'active' | 'suspended';
  has_google: boolean;
  created_at: string;
  last_login: string | null;
}

interface LogEntry { type: 'step' | 'log' | 'done' | 'error'; text: string; }

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

function UpdateSection() {
  const [appInfo,      setAppInfo]      = useState<AppInfo | null>(null);
  const [latestCommit, setLatestCommit] = useState<string | null>(null);
  const [updating,     setUpdating]     = useState(false);
  const [updateDone,   setUpdateDone]   = useState(false);
  const [updateErr,    setUpdateErr]    = useState(false);
  const [log,          setLog]          = useState<LogEntry[]>([]);
  const [countdown,    setCountdown]    = useState(0);
  const logRef   = useRef<HTMLDivElement>(null);
  const esRef    = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getAppInfo().then(info => {
      setAppInfo(info);
      // Check GitHub for the latest commit on main (public repo, no auth needed)
      fetch('https://api.github.com/repos/feedmittens/money-app/commits/main')
        .then(r => r.json())
        .then(d => { if (d.sha) setLatestCommit(d.sha.slice(0, 7)); })
        .catch(() => {}); // silently ignore if GitHub is unreachable
    }).catch(() => {});
    return () => {
      esRef.current?.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  function startUpdate() {
    setUpdating(true);
    setUpdateDone(false);
    setUpdateErr(false);
    setLog([]);
    setCountdown(0);

    const es = new EventSource('/api/admin/update-stream');
    esRef.current = es;

    es.onmessage = (e) => {
      const entry: LogEntry = JSON.parse(e.data);
      setLog(prev => [...prev, entry]);

      if (entry.type === 'done') {
        es.close();
        setUpdateDone(true);
        setUpdating(false);
        // Countdown for page refresh
        let secs = 5;
        setCountdown(secs);
        timerRef.current = setInterval(() => {
          secs--;
          setCountdown(secs);
          if (secs <= 0) {
            if (timerRef.current) clearInterval(timerRef.current);
            window.location.reload();
          }
        }, 1000);
      } else if (entry.type === 'error') {
        es.close();
        setUpdateErr(true);
        setUpdating(false);
      }
    };

    es.onerror = () => {
      es.close();
      // onerror fires when the server closes the stream (expected during restart)
      // If we already got 'done', this is normal — don't flag as error.
      setUpdating(false);
    };
  }

  const updateAvailable = appInfo && latestCommit && latestCommit !== appInfo.gitCommit;

  return (
    <div className="card" style={{ marginBottom: 24, padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>
            App Update
            {updateAvailable && (
              <span style={{
                marginLeft: 10, fontSize: 11, fontWeight: 700,
                color: '#fff', background: '#f59e0b',
                padding: '2px 8px', borderRadius: 99,
              }}>Update available</span>
            )}
            {latestCommit && !updateAvailable && appInfo && (
              <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, color: '#10b981' }}>✓ Up to date</span>
            )}
          </div>
          {appInfo ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              v{appInfo.version} · {appInfo.gitBranch}@{appInfo.gitCommit}
              {appInfo.gitMessage && <span> · {appInfo.gitMessage}</span>}
              {updateAvailable && (
                <span style={{ marginLeft: 6, color: '#f59e0b' }}>→ {latestCommit} on GitHub</span>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
          )}
        </div>
        <button
          className="btn btn-primary"
          onClick={startUpdate}
          disabled={updating || updateDone}
        >
          {updating ? '⏳ Updating…' : '↑ Update App'}
        </button>
      </div>

      {log.length > 0 && (
        <div
          ref={logRef}
          style={{
            marginTop: 12,
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '10px 12px',
            fontFamily: 'monospace',
            fontSize: 12,
            lineHeight: 1.5,
            maxHeight: 320,
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {log.map((entry, i) => (
            <div key={i} style={{
              color: entry.type === 'step'  ? 'var(--primary)'  :
                     entry.type === 'done'  ? '#10b981'         :
                     entry.type === 'error' ? 'var(--danger)'   :
                     'var(--text)',
              fontWeight: entry.type === 'step' || entry.type === 'done' || entry.type === 'error' ? 700 : 400,
            }}>
              {entry.text}
            </div>
          ))}
          {updating && <div style={{ color: 'var(--text-muted)' }}>▌</div>}
        </div>
      )}

      {updateDone && (
        <div style={{ marginTop: 10, color: '#10b981', fontSize: 13, fontWeight: 600 }}>
          Restarting… page will reload in {countdown}s
        </div>
      )}

      {updateErr && (
        <div style={{ marginTop: 10, color: 'var(--danger)', fontSize: 13 }}>
          Update failed — see log above. Check server logs for details.
        </div>
      )}
    </div>
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
          <div className="page-title">Admin</div>
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

      <UpdateSection />

      <div className="card" style={{ overflowX: 'auto' }}>
        <div style={{ padding: '12px 16px 8px', fontWeight: 600, fontSize: 14 }}>User Management</div>
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
