const router   = require('express').Router();
const bcrypt   = require('bcrypt');
const passport = require('passport');
const { authenticator } = require('otplib');
const QRCode   = require('qrcode');
const pool     = require('../pg');

const SALT_ROUNDS = 12;
const APP_NAME    = 'Tally';

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

// ── Helpers ───────────────────────────────────────────────────────────────────

function sessionUser(user) {
  return {
    id:          user.id,
    email:       user.email,
    displayName: user.display_name,
    role:        user.role,
    totpEnabled: user.totp_enabled,
  };
}

async function findOrCreateGoogleUser(profile) {
  const email = profile.emails?.[0]?.value;
  if (!email) throw new Error('No email returned from Google');

  let res = await pool.query('SELECT * FROM users WHERE google_id = $1', [profile.id]);
  if (res.rows[0]) return res.rows[0];

  res = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  if (res.rows[0]) {
    await pool.query('UPDATE users SET google_id = $1 WHERE id = $2', [profile.id, res.rows[0].id]);
    return (await pool.query('SELECT * FROM users WHERE id = $1', [res.rows[0].id])).rows[0];
  }

  const isAdmin  = email === process.env.ADMIN_EMAIL;
  const status   = isAdmin ? 'active'  : 'pending';
  const role     = isAdmin ? 'admin'   : 'user';
  const name     = profile.displayName || email.split('@')[0];

  const insert = await pool.query(
    `INSERT INTO users (email, display_name, google_id, role, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [email, name, profile.id, role, status]
  );
  return insert.rows[0];
}

// ── Passport — Google OAuth ───────────────────────────────────────────────────

const GoogleStrategy = require('passport-google-oauth20').Strategy;

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID:     process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:  `${process.env.APP_URL || ''}/api/auth/google/callback`,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        done(null, await findOrCreateGoogleUser(profile));
      } catch (err) {
        done(err);
      }
    }
  ));
} else {
  console.warn('[auth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set — Google OAuth disabled');
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    done(null, res.rows[0] || false);
  } catch (e) { done(e); }
});

// ── Register ──────────────────────────────────────────────────────────────────

router.post('/register', wrap(async (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length) return res.status(409).json({ error: 'An account with that email already exists' });

  const isAdmin      = email.toLowerCase() === (process.env.ADMIN_EMAIL || '').toLowerCase();
  const status       = isAdmin ? 'active'  : 'pending';
  const role         = isAdmin ? 'admin'   : 'user';
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const name         = displayName || email.split('@')[0];

  const result = await pool.query(
    `INSERT INTO users (email, display_name, password_hash, role, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [email.toLowerCase(), name, passwordHash, role, status]
  );
  const user = result.rows[0];

  if (status === 'active') {
    req.session.userId      = user.id;
    req.session.role        = user.role;
    req.session.displayName = user.display_name;
    return res.json({ status: 'active', user: sessionUser(user) });
  }

  res.json({ status: 'pending', message: 'Account created — waiting for admin approval before you can log in.' });
}));

// ── Login ─────────────────────────────────────────────────────────────────────

router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  const user   = result.rows[0];

  if (!user || !user.password_hash) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  if (user.status === 'pending')   return res.status(403).json({ error: 'Your account is pending admin approval', code: 'PENDING' });
  if (user.status === 'suspended') return res.status(403).json({ error: 'Your account has been suspended', code: 'SUSPENDED' });

  await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  if (user.totp_enabled) {
    req.session.totpPending = true;
    req.session.userId      = user.id;
    req.session.role        = user.role;
    req.session.displayName = user.display_name;
    return res.json({ status: 'totp_required' });
  }

  req.session.userId      = user.id;
  req.session.role        = user.role;
  req.session.displayName = user.display_name;
  req.session.totpPending = false;
  res.json({ status: 'ok', user: sessionUser(user) });
}));

// ── Logout ────────────────────────────────────────────────────────────────────

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// ── Current user ──────────────────────────────────────────────────────────────

router.get('/me', wrap(async (req, res) => {
  if (!req.session?.userId || req.session.totpPending) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
  const user   = result.rows[0];
  if (!user) return res.status(401).json({ error: 'User not found' });
  res.json(sessionUser(user));
}));

// ── Google OAuth ──────────────────────────────────────────────────────────────

router.get('/google',
  (req, res, next) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(501).json({ error: 'Google OAuth not configured on this server' });
    }
    next();
  },
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/?error=google_auth_failed' }),
  wrap(async (req, res) => {
    const user = req.user;
    if (!user) return res.redirect('/?error=google_auth_failed');

    if (user.status === 'pending')   return res.redirect('/?error=pending_approval');
    if (user.status === 'suspended') return res.redirect('/?error=suspended');

    await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    req.session.userId      = user.id;
    req.session.role        = user.role;
    req.session.displayName = user.display_name;
    req.session.totpPending = false;
    res.redirect('/');
  })
);

// ── 2FA Setup ─────────────────────────────────────────────────────────────────

router.post('/2fa/setup', wrap(async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });

  const secret     = authenticator.generateSecret();
  const user       = (await pool.query('SELECT email FROM users WHERE id = $1', [req.session.userId])).rows[0];
  const otpauthUrl = authenticator.keyuri(user.email, APP_NAME, secret);
  const qrDataUrl  = await QRCode.toDataURL(otpauthUrl);

  req.session.pendingTotpSecret = secret;
  res.json({ secret, qrDataUrl });
}));

router.post('/2fa/enable', wrap(async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });

  const { code } = req.body;
  const secret   = req.session.pendingTotpSecret;
  if (!secret) return res.status(400).json({ error: 'No 2FA setup in progress — call /2fa/setup first' });

  if (!authenticator.check(code, secret)) {
    return res.status(400).json({ error: 'Invalid code — make sure your authenticator app is synced' });
  }

  await pool.query(
    'UPDATE users SET totp_secret = $1, totp_enabled = TRUE WHERE id = $2',
    [secret, req.session.userId]
  );
  delete req.session.pendingTotpSecret;
  res.json({ ok: true });
}));

router.post('/2fa/disable', wrap(async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });

  const { code } = req.body;
  const user = (await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId])).rows[0];

  if (!user.totp_enabled) return res.status(400).json({ error: '2FA is not enabled' });
  if (!authenticator.check(code, user.totp_secret)) {
    return res.status(400).json({ error: 'Invalid code' });
  }

  await pool.query(
    'UPDATE users SET totp_secret = NULL, totp_enabled = FALSE WHERE id = $1',
    [req.session.userId]
  );
  res.json({ ok: true });
}));

// ── 2FA Verification (during login) ──────────────────────────────────────────

router.post('/2fa/verify', wrap(async (req, res) => {
  if (!req.session?.totpPending || !req.session?.userId) {
    return res.status(400).json({ error: 'No 2FA verification in progress' });
  }

  const { code } = req.body;
  const user = (await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId])).rows[0];

  if (!authenticator.check(code, user.totp_secret)) {
    return res.status(400).json({ error: 'Invalid code' });
  }

  req.session.totpPending = false;
  await pool.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
  res.json({ status: 'ok', user: sessionUser(user) });
}));

// ── Change password ───────────────────────────────────────────────────────────

router.post('/change-password', wrap(async (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not authenticated' });

  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const user = (await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId])).rows[0];
  if (user.password_hash) {
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.session.userId]);
  res.json({ ok: true });
}));

module.exports = { router, passport };
