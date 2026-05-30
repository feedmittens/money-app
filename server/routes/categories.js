const router      = require('express').Router();
const pool        = require('../pg');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

const uid = req => req.session.userId;

router.get('/', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM categories WHERE user_id=$1 ORDER BY type, name',
    [uid(req)]
  );
  res.json(result.rows);
});

router.post('/', async (req, res) => {
  const { name, type, color = '#6b7280' } = req.body;
  const result = await pool.query(
    'INSERT INTO categories (user_id, name, type, color) VALUES ($1,$2,$3,$4) RETURNING *',
    [uid(req), name, type, color]
  );
  res.json(result.rows[0]);
});

router.put('/:id', async (req, res) => {
  const { name, type, color } = req.body;
  const result = await pool.query(
    'UPDATE categories SET name=$1, type=$2, color=$3 WHERE id=$4 AND user_id=$5 RETURNING *',
    [name, type, color, req.params.id, uid(req)]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Category not found' });
  res.json(result.rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM categories WHERE id=$1 AND user_id=$2', [req.params.id, uid(req)]);
  res.json({ ok: true });
});

module.exports = router;
