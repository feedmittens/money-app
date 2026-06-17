import { useState } from 'react';
import { login, verifyTotp } from '../api';
import type { User } from '../api';
import tallyLogo from '../assets/tally-logo.svg';

interface Props {
  onLogin: (user: User) => void;
  onRegister: () => void;
}

export default function Login({ onLogin, onRegister }: Props) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [step,     setStep]     = useState<'credentials' | 'totp'>('credentials');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const urlParams = new URLSearchParams(window.location.search);
  const urlError  = urlParams.get('error');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (step === 'credentials') {
        const result = await login(email, password);
        if (result.status === 'totp_required') {
          setStep('totp');
        } else if (result.user) {
          onLogin(result.user);
        }
      } else {
        const result = await verifyTotp(totpCode);
        if (result.user) onLogin(result.user);
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const googleEnabled = true; // server sends 501 if not configured

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
          <div style={{ marginBottom: 10 }}>
            <img src={tallyLogo} alt="Tally" style={{ width: 44, height: 44 }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Tally</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '6px 0 0' }}>
            {step === 'totp' ? 'Enter your authenticator code' : 'Sign in to your account'}
          </p>
        </div>

        {(error || urlError) && (
          <div style={{
            padding: '10px 14px', marginBottom: 16, borderRadius: 'var(--radius)',
            background: '#fee2e2', color: 'var(--danger)', fontSize: 13,
          }}>
            {error || (urlError === 'pending_approval' ? 'Your account is pending admin approval.'
                     : urlError === 'suspended'       ? 'Your account has been suspended.'
                     : 'Google sign-in failed. Please try again.')}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {step === 'credentials' ? (
            <>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Email</label>
                <input
                  autoFocus type="email" required
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label>Password</label>
                <input
                  type="password" required
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
            </>
          ) : (
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label>6-digit authenticator code</label>
              <input
                autoFocus type="text" inputMode="numeric" pattern="[0-9]{6}"
                maxLength={6} required
                value={totpCode} onChange={e => setTotpCode(e.target.value)}
                placeholder="000000"
                style={{ letterSpacing: '0.3em', textAlign: 'center', fontSize: 20 }}
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', marginBottom: 12 }}
          >
            {loading ? 'Signing in…' : step === 'totp' ? 'Verify' : 'Sign In'}
          </button>

          {step === 'totp' && (
            <button type="button" className="btn btn-ghost" style={{ width: '100%', marginBottom: 12 }}
              onClick={() => { setStep('credentials'); setTotpCode(''); setError(''); }}>
              ← Back
            </button>
          )}
        </form>

        {step === 'credentials' && (
          <>
            {googleEnabled && (
              <>
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, margin: '12px 0' }}>or</div>
                <a
                  href="/api/auth/google"
                  className="btn btn-secondary"
                  style={{ width: '100%', textAlign: 'center', display: 'block', textDecoration: 'none' }}
                >
                  Sign in with Google
                </a>
              </>
            )}
            <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', marginTop: 20 }}>
              Don't have an account?{' '}
              <button className="btn btn-ghost btn-sm" onClick={onRegister} style={{ padding: 0, fontWeight: 600 }}>
                Register
              </button>
            </p>
          </>
        )}
        <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 24, opacity: 0.55 }}>
          A{' '}
          <a href="https://www.corkscrewconsulting.net" target="_blank" rel="noopener noreferrer"
             style={{ color: 'inherit', textDecoration: 'underline' }}>
            Corkscrew Consulting Group
          </a>{' '}
          product
        </p>
      </div>
    </div>
  );
}
