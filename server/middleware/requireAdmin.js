const pool = require('../pg');

module.exports = async function requireAdmin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.session.totpPending) {
    return res.status(401).json({ error: '2FA verification required', code: 'TOTP_REQUIRED' });
  }
  try {
    // Re-fetch the role from the database on every admin request — the session
    // role value could be stale if the role was changed since the session was created.
    const result = await pool.query('SELECT role FROM users WHERE id=$1', [req.userId]);
    const user   = result.rows[0];
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (err) {
    next(err);
  }
};
