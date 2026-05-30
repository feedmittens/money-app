const router       = require('express').Router();
const pool         = require('../pg');
const requireAdmin = require('../middleware/requireAdmin');

router.use(requireAdmin);

// List all users
router.get('/users', async (req, res) => {
  const result = await pool.query(
    `SELECT id, email, display_name, role, status, totp_enabled, google_id IS NOT NULL AS has_google,
            created_at, last_login
     FROM users ORDER BY created_at DESC`
  );
  res.json(result.rows);
});

// Approve a pending user
router.post('/users/:id/approve', async (req, res) => {
  await pool.query(
    "UPDATE users SET status = 'active' WHERE id = $1",
    [req.params.id]
  );
  res.json({ ok: true });
});

// Suspend a user (cannot suspend yourself)
router.post('/users/:id/suspend', async (req, res) => {
  if (parseInt(req.params.id) === req.session.userId) {
    return res.status(400).json({ error: "You can't suspend yourself. That would be awkward." });
  }
  await pool.query(
    "UPDATE users SET status = 'suspended' WHERE id = $1",
    [req.params.id]
  );
  res.json({ ok: true });
});

// Unsuspend
router.post('/users/:id/unsuspend', async (req, res) => {
  await pool.query(
    "UPDATE users SET status = 'active' WHERE id = $1",
    [req.params.id]
  );
  res.json({ ok: true });
});

// Grant or revoke admin
router.post('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Role must be admin or user' });
  }
  if (parseInt(req.params.id) === req.session.userId && role !== 'admin') {
    return res.status(400).json({ error: "Can't demote yourself" });
  }
  await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, req.params.id]);
  res.json({ ok: true });
});

// Delete a user and all their data
router.delete('/users/:id', async (req, res) => {
  if (parseInt(req.params.id) === req.session.userId) {
    return res.status(400).json({ error: "Can't delete your own account via admin panel" });
  }
  await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
