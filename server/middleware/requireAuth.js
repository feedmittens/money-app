const pool = require('../pg');

module.exports = async function requireAuth(req, res, next) {
  // Session auth (web app)
  if (req.session?.userId) {
    if (req.session.totpPending) {
      return res.status(401).json({ error: '2FA verification required', code: 'TOTP_REQUIRED' });
    }
    req.userId = req.session.userId;
    return next();
  }

  // Bearer token auth (API/mobile clients)
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7);
    try {
      const { rows } = await pool.query(
        'SELECT user_id FROM api_tokens WHERE token=$1', [token]
      );
      if (rows[0]) {
        req.userId = rows[0].user_id;
        return next();
      }
    } catch {
      return res.status(500).json({ error: 'Auth check failed' });
    }
  }

  res.status(401).json({ error: 'Not authenticated' });
};
