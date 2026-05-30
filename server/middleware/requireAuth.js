module.exports = function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (req.session.totpPending) {
    return res.status(401).json({ error: '2FA verification required', code: 'TOTP_REQUIRED' });
  }
  next();
};
