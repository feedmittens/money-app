const router       = require('express').Router();
const pool         = require('../pg');
const requireAdmin = require('../middleware/requireAdmin');

router.use(requireAdmin);

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

router.get('/users', wrap(async (req, res) => {
  const result = await pool.query(
    `SELECT id, email, display_name, role, status, totp_enabled, google_id IS NOT NULL AS has_google,
            created_at, last_login
     FROM users ORDER BY created_at DESC`
  );
  res.json(result.rows);
}));

router.post('/users/:id/approve', wrap(async (req, res) => {
  await pool.query(
    "UPDATE users SET status = 'active' WHERE id = $1",
    [req.params.id]
  );
  res.json({ ok: true });
}));

router.post('/users/:id/suspend', wrap(async (req, res) => {
  if (parseInt(req.params.id) === req.userId) {
    return res.status(400).json({ error: "You can't suspend yourself. That would be awkward." });
  }
  await pool.query(
    "UPDATE users SET status = 'suspended' WHERE id = $1",
    [req.params.id]
  );
  res.json({ ok: true });
}));

router.post('/users/:id/unsuspend', wrap(async (req, res) => {
  await pool.query(
    "UPDATE users SET status = 'active' WHERE id = $1",
    [req.params.id]
  );
  res.json({ ok: true });
}));

router.post('/users/:id/role', wrap(async (req, res) => {
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or user' });
  }
  if (parseInt(req.params.id) === req.userId && role !== 'admin') {
    return res.status(400).json({ error: "Can't demote yourself" });
  }
  await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/users/:id', wrap(async (req, res) => {
  if (parseInt(req.params.id) === req.userId) {
    return res.status(400).json({ error: "Can't delete your own account via admin panel" });
  }
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
