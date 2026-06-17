const router      = require('express').Router();
const pool        = require('../pg');
const crypto      = require('crypto');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

router.get('/', wrap(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name, LEFT(token, 8) || '...' AS token_preview, created_at
     FROM api_tokens WHERE user_id=$1 ORDER BY created_at DESC`,
    [req.userId]
  );
  res.json(rows);
}));

router.post('/', wrap(async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  const token = crypto.randomBytes(32).toString('hex');
  const { rows } = await pool.query(
    `INSERT INTO api_tokens (user_id, name, token)
     VALUES ($1,$2,$3) RETURNING id, name, token, created_at`,
    [req.userId, name.trim(), token]
  );
  res.json(rows[0]); // full token returned only on creation
}));

router.delete('/:id', wrap(async (req, res) => {
  await pool.query(
    'DELETE FROM api_tokens WHERE id=$1 AND user_id=$2',
    [req.params.id, req.userId]
  );
  res.json({ ok: true });
}));

module.exports = router;
