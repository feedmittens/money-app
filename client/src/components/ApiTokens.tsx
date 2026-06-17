import { useState, useEffect } from 'react';
import { getTokens, createToken, deleteToken } from '../api';
import type { ApiToken } from '../api';

export default function ApiTokens() {
  const [tokens, setTokens]   = useState<ApiToken[]>([]);
  const [name, setName]       = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setTokens(await getTokens());
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const created = await createToken(name.trim());
    setNewToken(created.token ?? null);
    setName('');
    await load();
  }

  async function handleDelete(id: number) {
    if (!confirm('Revoke this token? Any client using it will lose access immediately.')) return;
    await deleteToken(id);
    await load();
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">API Tokens</div>
          <div className="page-subtitle">Generate tokens for mobile apps and CLI clients</div>
        </div>
      </div>

      {newToken && (
        <div className="card" style={{ padding: 20, marginBottom: 16, borderColor: 'var(--success)', background: '#f0fdf4' }}>
          <div style={{ fontWeight: 600, marginBottom: 8, color: '#16a34a' }}>Token created — copy it now</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            This is the only time the full token will be shown.
          </div>
          <code style={{
            display: 'block', padding: '10px 12px', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            fontSize: 12, wordBreak: 'break-all', letterSpacing: '0.02em',
          }}>{newToken}</code>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => { navigator.clipboard.writeText(newToken); }}
            >Copy to clipboard</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setNewToken(null)}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16, padding: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Create new token</div>
        <form onSubmit={handleCreate} style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
            <label>Token name</label>
            <input
              type="text"
              placeholder="e.g. My Phone, Home CLI"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary">Create</button>
        </form>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
          Use the token as a Bearer token in the <code>Authorization</code> header:{' '}
          <code>Authorization: Bearer &lt;token&gt;</code>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Active tokens</span>
        </div>
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : tokens.length === 0 ? (
          <div className="empty-state">
            <p>No tokens yet. Create one above to enable API access.</p>
          </div>
        ) : (
          <table className="register-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Token prefix</th>
                <th>Created</th>
                <th style={{ width: 60 }}></th>
              </tr>
            </thead>
            <tbody>
              {tokens.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 500 }}>{t.name}</td>
                  <td><code style={{ fontSize: 12 }}>{t.token_preview}</code></td>
                  <td className="text-muted" style={{ fontSize: 12 }}>
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => handleDelete(t.id)}
                      title="Revoke token"
                    >Revoke</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
