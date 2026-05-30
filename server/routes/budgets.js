const router      = require('express').Router();
const pool        = require('../pg');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

const uid  = req => req.session.userId;
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

router.get('/', wrap(async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);

  const budgets = (await pool.query(`
    SELECT b.*, c.name AS category_name, c.color AS category_color,
      COALESCE((
        SELECT SUM(t.amount) FROM transactions t
        WHERE t.category_id = b.category_id AND t.user_id = $1
          AND LEFT(t.date::text, 7) = b.month
      ), 0) AS actual
    FROM budgets b
    JOIN categories c ON c.id = b.category_id
    WHERE b.user_id=$1 AND b.month=$2
    ORDER BY c.name
  `, [uid(req), month])).rows;

  const budgetedIds = budgets.map(b => b.category_id);
  const excludeClause = budgetedIds.length
    ? `AND c.id != ALL($3::int[])`
    : '';
  const params = budgetedIds.length
    ? [uid(req), month, budgetedIds]
    : [uid(req), month];

  const unbudgeted = (await pool.query(`
    SELECT c.id AS category_id, c.name AS category_name, c.color AS category_color,
      0 AS amount, NULL AS id, $2 AS month,
      COALESCE((
        SELECT SUM(t.amount) FROM transactions t
        WHERE t.category_id = c.id AND t.user_id = $1
          AND LEFT(t.date::text, 7) = $2
      ), 0) AS actual
    FROM categories c
    WHERE c.user_id=$1 AND c.type='expense' ${excludeClause}
      AND (
        SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
        WHERE t.category_id = c.id AND t.user_id = $1
          AND LEFT(t.date::text, 7) = $2
      ) != 0
    ORDER BY c.name
  `, params)).rows;

  res.json([...budgets, ...unbudgeted]);
}));

router.post('/', wrap(async (req, res) => {
  const { category_id, month, amount } = req.body;
  const result = await pool.query(`
    INSERT INTO budgets (user_id, category_id, month, amount)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (user_id, category_id, month) DO UPDATE SET amount = EXCLUDED.amount
    RETURNING *
  `, [uid(req), category_id, month, amount]);
  res.json(result.rows[0]);
}));

router.delete('/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM budgets WHERE id=$1 AND user_id=$2', [req.params.id, uid(req)]);
  res.json({ ok: true });
}));

module.exports = router;
