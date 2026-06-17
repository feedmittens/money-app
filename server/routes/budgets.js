const router      = require('express').Router();
const pool        = require('../pg');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

const uid  = req => req.session.userId;
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

function prevMonthStr(month) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

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

  // Compute rollover_amount for categories with rollover enabled
  const rolloverIds = budgets.filter(b => b.rollover).map(b => b.category_id);
  if (rolloverIds.length) {
    const prev = prevMonthStr(month);
    const prevData = (await pool.query(`
      SELECT b.category_id,
        b.amount AS prev_budget,
        COALESCE((
          SELECT SUM(t.amount) FROM transactions t
          WHERE t.category_id = b.category_id AND t.user_id = b.user_id
            AND LEFT(t.date::text, 7) = $2
        ), 0) AS prev_actual
      FROM budgets b
      WHERE b.user_id=$1 AND b.month=$2 AND b.category_id = ANY($3::int[])
    `, [uid(req), prev, rolloverIds])).rows;

    const prevMap = Object.fromEntries(prevData.map(p => [p.category_id, p]));
    for (const b of budgets) {
      if (!b.rollover) { b.rollover_amount = 0; continue; }
      const p = prevMap[b.category_id];
      // actual is negative for expenses; rollover = unspent = prev_budget + prev_actual (capped at 0)
      b.rollover_amount = p ? Math.max(0, Number(p.prev_budget) + Number(p.prev_actual)) : 0;
    }
  } else {
    for (const b of budgets) b.rollover_amount = 0;
  }

  const budgetedIds = budgets.map(b => b.category_id);
  const excludeClause = budgetedIds.length ? `AND c.id != ALL($3::int[])` : '';
  const params = budgetedIds.length ? [uid(req), month, budgetedIds] : [uid(req), month];

  const unbudgeted = (await pool.query(`
    SELECT c.id AS category_id, c.name AS category_name, c.color AS category_color,
      0 AS amount, NULL AS id, $2 AS month, FALSE AS rollover, 0 AS rollover_amount,
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
  const { category_id, month, amount, rollover } = req.body;
  const result = await pool.query(`
    INSERT INTO budgets (user_id, category_id, month, amount, rollover)
    VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (user_id, category_id, month)
    DO UPDATE SET amount = EXCLUDED.amount, rollover = EXCLUDED.rollover
    RETURNING *
  `, [uid(req), category_id, month, amount, !!rollover]);
  res.json(result.rows[0]);
}));

router.get('/income', wrap(async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const [expectedRes, actualRes] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM bills
       WHERE user_id=$1 AND is_active=TRUE AND amount > 0`,
      [uid(req)]
    ),
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
       WHERE user_id=$1 AND LEFT(date::text, 7)=$2 AND amount > 0`,
      [uid(req), month]
    ),
  ]);
  res.json({
    expected: Number(expectedRes.rows[0].total),
    actual:   Number(actualRes.rows[0].total),
  });
}));

router.delete('/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM budgets WHERE id=$1 AND user_id=$2', [req.params.id, uid(req)]);
  res.json({ ok: true });
}));

module.exports = router;
