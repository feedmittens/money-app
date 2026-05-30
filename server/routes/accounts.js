const router      = require('express').Router();
const pool        = require('../pg');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

const uid  = req => req.session.userId;
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

router.get('/', wrap(async (req, res) => {
  const result = await pool.query(`
    SELECT a.*,
      COALESCE(a.initial_balance + SUM(t.amount), a.initial_balance) AS balance
    FROM accounts a
    LEFT JOIN transactions t ON t.account_id = a.id
    WHERE a.user_id = $1
    GROUP BY a.id
    ORDER BY a.created_at
  `, [uid(req)]);
  res.json(result.rows);
}));

router.post('/', wrap(async (req, res) => {
  const { name, type, initial_balance = 0 } = req.body;
  const result = await pool.query(
    'INSERT INTO accounts (user_id, name, type, initial_balance) VALUES ($1,$2,$3,$4) RETURNING *',
    [uid(req), name, type, initial_balance]
  );
  res.json(result.rows[0]);
}));

router.put('/:id', wrap(async (req, res) => {
  const { name, type, initial_balance } = req.body;
  const result = await pool.query(
    'UPDATE accounts SET name=$1, type=$2, initial_balance=$3 WHERE id=$4 AND user_id=$5 RETURNING *',
    [name, type, initial_balance, req.params.id, uid(req)]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Account not found' });
  res.json(result.rows[0]);
}));

router.delete('/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM accounts WHERE id=$1 AND user_id=$2', [req.params.id, uid(req)]);
  res.json({ ok: true });
}));

module.exports = router;
