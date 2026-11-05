const router      = require('express').Router();
const pool        = require('../pg');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

const uid  = req => req.userId;
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

router.get('/', wrap(async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM categories WHERE user_id=$1 ORDER BY type, name',
    [uid(req)]
  );
  res.json(result.rows);
}));

router.post('/', wrap(async (req, res) => {
  const { name, type, color = '#6b7280', parent_id = null } = req.body;
  const result = await pool.query(
    'INSERT INTO categories (user_id, name, type, color, parent_id) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [uid(req), name, type, color, parent_id]
  );
  res.json(result.rows[0]);
}));

router.put('/:id', wrap(async (req, res) => {
  const { name, type, color, parent_id = null } = req.body;
  const result = await pool.query(
    'UPDATE categories SET name=$1, type=$2, color=$3, parent_id=$4 WHERE id=$5 AND user_id=$6 RETURNING *',
    [name, type, color, parent_id, req.params.id, uid(req)]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Category not found' });
  res.json(result.rows[0]);
}));

router.delete('/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM categories WHERE id=$1 AND user_id=$2', [req.params.id, uid(req)]);
  res.json({ ok: true });
}));

module.exports = router;
