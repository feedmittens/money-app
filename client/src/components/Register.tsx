import { useState } from 'react';
import { register } from '../api';
import type { User } from '../api';

interface Props {
  onLogin:    (user: User) => void;
  onBack:     () => void;
}

export default function Register({ onLogin, onBack }: Props) {
  const [displayName, setDisplayName] = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [confirm,     setConfirm]     = useState('');
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);
  const [pending,     setPending]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      const result = await register(email, password, displayName);
      if (result.status === 'active' && result.user) {
        onLogin(result.user);
      } else {
        setPending(true);
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (pending) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)',
      }}>
        <div style={{
          width: 380, padding: '40px 36px', textAlign: 'center',
          background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          <h2 style={{ margin: '0 0 8px' }}>Registration submitted</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Your account is pending admin approval. You'll be able to sign in once approved.
          </p>
          <button className="btn btn-secondary" style={{ marginTop: 20 }} onClick={onBack}>
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 380, padding: '40px 36px', background: 'var(--surface)',
        borderRadius: 'var(--radius)', border: '1px solid var(--border)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>💵</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Create Account</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '6px 0 0' }}>
            New accounts require admin approval before first sign-in.
          </p>
        </div>

        {error && (
          <div style={{
            padding: '10px 14px', marginBottom: 16, borderRadius: 'var(--radius)',
            background: '#fee2e2', color: 'var(--danger)', fontSize: 13,
          }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Display Name</label>
            <input
              autoFocus type="text" required
              value={displayName} onChange={e => setDisplayName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Email</label>
            <input
              type="email" required
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label>Password</label>
            <input
              type="password" required minLength={8}
              value={password} onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div className="form-group" style={{ marginBottom: 20 }}>
            <label>Confirm Password</label>
            <input
              type="password" required
              value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', marginBottom: 12 }}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
          <div style={{ textAlign: 'center' }}>
            <a href="/api/auth/google" className="btn btn-secondary" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginBottom: 12 }}>
              Continue with Google
            </a>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
              Already have an account? Sign in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
