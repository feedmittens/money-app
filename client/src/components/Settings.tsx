import { useState } from 'react';
import { changePassword, setup2fa, enable2fa, disable2fa } from '../api';
import type { User } from '../api';

interface Props {
  user: User;
  onUserChange: (u: User) => void;
}

function MsgBox({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <div style={{
      padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: 13, marginBottom: 12,
      background: msg.ok ? '#d1fae5' : '#fee2e2',
      color:      msg.ok ? '#065f46' : 'var(--danger)',
    }}>{msg.text}</div>
  );
}

export default function Settings({ user, onUserChange }: Props) {
  // ── Password ──────────────────────────────────────────────────────────────────
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew,     setPwNew]     = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwMsg,     setPwMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (pwNew !== pwConfirm) { setPwMsg({ ok: false, text: 'Passwords do not match' }); return; }
    if (pwNew.length < 8)    { setPwMsg({ ok: false, text: 'Password must be at least 8 characters' }); return; }
    try {
      await changePassword(pwCurrent, pwNew);
      setPwMsg({ ok: true, text: 'Password changed successfully.' });
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
    } catch (e: unknown) {
      setPwMsg({ ok: false, text: (e as Error).message });
    }
  }

  // ── 2FA ───────────────────────────────────────────────────────────────────────
  const [tfaStep,    setTfaStep]    = useState<'idle' | 'setup' | 'disable'>('idle');
  const [qrDataUrl,  setQrDataUrl]  = useState('');
  const [tfaSecret,  setTfaSecret]  = useState('');
  const [tfaCode,    setTfaCode]    = useState('');
  const [tfaMsg,     setTfaMsg]     = useState<{ ok: boolean; text: string } | null>(null);

  async function startSetup() {
    setTfaMsg(null);
    try {
      const res = await setup2fa();
      setQrDataUrl(res.qrDataUrl);
      setTfaSecret(res.secret);
      setTfaStep('setup');
    } catch (e: unknown) {
      setTfaMsg({ ok: false, text: (e as Error).message });
    }
  }

  async function handleEnable(e: React.FormEvent) {
    e.preventDefault();
    setTfaMsg(null);
    try {
      await enable2fa(tfaCode);
      setTfaMsg({ ok: true, text: '2FA enabled. Your authenticator code will be required on every login.' });
      setTfaStep('idle');
      setTfaCode('');
      onUserChange({ ...user, totpEnabled: true });
    } catch (e: unknown) {
      setTfaMsg({ ok: false, text: (e as Error).message });
    }
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setTfaMsg(null);
    try {
      await disable2fa(tfaCode);
      setTfaMsg({ ok: true, text: '2FA disabled.' });
      setTfaStep('idle');
      setTfaCode('');
      onUserChange({ ...user, totpEnabled: false });
    } catch (e: unknown) {
      setTfaMsg({ ok: false, text: (e as Error).message });
    }
  }

  return (
    <div style={{ maxWidth: 520 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-subtitle">{user.email}</div>
        </div>
      </div>

      {/* ── Password ── */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 16 }}>Change Password</div>
        <MsgBox msg={pwMsg} />
        <form onSubmit={handlePasswordChange}>
          <div className="form-group">
            <label>Current password</label>
            <input type="password" value={pwCurrent}
              onChange={e => setPwCurrent(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>New password</label>
            <input type="password" value={pwNew}
              onChange={e => setPwNew(e.target.value)} required minLength={8} />
          </div>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <label>Confirm new password</label>
            <input type="password" value={pwConfirm}
              onChange={e => setPwConfirm(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary">Update Password</button>
        </form>
      </div>

      {/* ── 2FA ── */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div className="card-title" style={{ marginBottom: 4 }}>Two-Factor Authentication</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Status:{' '}
          {user.totpEnabled
            ? <strong style={{ color: 'var(--success)' }}>Enabled 🔒</strong>
            : <span>Disabled</span>}
        </div>
        <MsgBox msg={tfaMsg} />

        {tfaStep === 'idle' && (
          user.totpEnabled ? (
            <button className="btn btn-secondary"
              onClick={() => { setTfaStep('disable'); setTfaMsg(null); }}>
              Disable 2FA
            </button>
          ) : (
            <button className="btn btn-primary" onClick={startSetup}>
              Set up 2FA
            </button>
          )
        )}

        {tfaStep === 'setup' && (
          <div>
            <p style={{ fontSize: 13, marginBottom: 12 }}>
              Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.),
              then enter the 6-digit code to confirm.
            </p>
            <img src={qrDataUrl} alt="2FA QR code"
              style={{ display: 'block', marginBottom: 12, border: '1px solid var(--border)', borderRadius: 4 }} />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, wordBreak: 'break-all' }}>
              Manual key: <code>{tfaSecret}</code>
            </p>
            <form onSubmit={handleEnable} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>6-digit code</label>
                <input autoFocus type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                  value={tfaCode} onChange={e => setTfaCode(e.target.value)}
                  required placeholder="000000"
                  style={{ letterSpacing: '0.2em', textAlign: 'center' }} />
              </div>
              <button type="submit" className="btn btn-primary">Enable 2FA</button>
              <button type="button" className="btn btn-secondary"
                onClick={() => { setTfaStep('idle'); setTfaCode(''); }}>Cancel</button>
            </form>
          </div>
        )}

        {tfaStep === 'disable' && (
          <div>
            <p style={{ fontSize: 13, marginBottom: 12 }}>
              Enter the current 6-digit code from your authenticator app to confirm.
            </p>
            <form onSubmit={handleDisable} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label>6-digit code</label>
                <input autoFocus type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                  value={tfaCode} onChange={e => setTfaCode(e.target.value)}
                  required placeholder="000000"
                  style={{ letterSpacing: '0.2em', textAlign: 'center' }} />
              </div>
              <button type="submit" className="btn btn-sm"
                style={{ color: 'var(--danger)', border: '1px solid var(--danger)', background: 'transparent' }}>
                Disable 2FA
              </button>
              <button type="button" className="btn btn-secondary"
                onClick={() => { setTfaStep('idle'); setTfaCode(''); }}>Cancel</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
