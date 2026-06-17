const router      = require('express').Router();
const pool        = require('../pg');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

const uid  = req => req.session.userId;
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

const billWithJoins = (id, userId) => pool.query(`
  SELECT b.*, c.name AS category_name, c.color AS category_color, a.name AS account_name
  FROM bills b
  LEFT JOIN categories c ON c.id = b.category_id
  LEFT JOIN accounts   a ON a.id = b.account_id
  WHERE b.id=$1 AND b.user_id=$2
`, [id, userId]).then(r => r.rows[0]);

router.get('/', wrap(async (req, res) => {
  const result = await pool.query(`
    SELECT b.*, c.name AS category_name, c.color AS category_color, a.name AS account_name
    FROM bills b
    LEFT JOIN categories c ON c.id = b.category_id
    LEFT JOIN accounts   a ON a.id = b.account_id
    WHERE b.user_id=$1 AND b.is_active = TRUE
    ORDER BY b.due_day
  `, [uid(req)]);
  res.json(result.rows);
}));

router.post('/', wrap(async (req, res) => {
  const { name, amount, due_day, due_day_2, custom_days, frequency, category_id, account_id } = req.body;
  const result = await pool.query(
    `INSERT INTO bills (user_id, name, amount, due_day, due_day_2, custom_days, frequency, category_id, account_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [uid(req), name, amount, due_day, due_day_2 ?? null, custom_days ?? null,
     frequency, category_id ?? null, account_id ?? null]
  );
  res.json(await billWithJoins(result.rows[0].id, uid(req)));
}));

router.put('/:id', wrap(async (req, res) => {
  const { name, amount, due_day, due_day_2, custom_days, frequency, category_id, account_id, is_active } = req.body;
  await pool.query(`
    UPDATE bills SET name=$1, amount=$2, due_day=$3, due_day_2=$4, custom_days=$5,
      frequency=$6, category_id=$7, account_id=$8, is_active=$9
    WHERE id=$10 AND user_id=$11
  `, [name, amount, due_day, due_day_2 ?? null, custom_days ?? null, frequency,
      category_id ?? null, account_id ?? null, is_active ?? true, req.params.id, uid(req)]);
  res.json(await billWithJoins(req.params.id, uid(req)));
}));

router.delete('/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM bills WHERE id=$1 AND user_id=$2', [req.params.id, uid(req)]);
  res.json({ ok: true });
}));

router.post('/:id/pay', wrap(async (req, res) => {
  const bill = (await pool.query(
    'SELECT * FROM bills WHERE id=$1 AND user_id=$2', [req.params.id, uid(req)]
  )).rows[0];
  if (!bill) return res.status(404).json({ error: 'Bill not found' });

  const { date, account_id } = req.body;
  const payDate = date || new Date().toISOString().slice(0, 10);
  const acctId  = account_id || bill.account_id;

  // Verify the account belongs to this user — prevents IDOR via account_id
  if (acctId) {
    const acctCheck = await pool.query(
      'SELECT id FROM accounts WHERE id=$1 AND user_id=$2', [acctId, uid(req)]
    );
    if (!acctCheck.rows[0]) return res.status(404).json({ error: 'Account not found' });
  }

  const txResult = await pool.query(`
    INSERT INTO transactions (user_id, account_id, date, payee, category_id, amount, memo, cleared, bill_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8) RETURNING *
  `, [uid(req), acctId, payDate, bill.name, bill.category_id, bill.amount, 'Bill payment', bill.id]);

  await pool.query('UPDATE bills SET last_paid=$1 WHERE id=$2', [payDate, bill.id]);

  const txn = txResult.rows[0];
  const cat = txn.category_id
    ? (await pool.query('SELECT name, color FROM categories WHERE id=$1', [txn.category_id])).rows[0]
    : null;

  res.json({
    transaction: { ...txn, category_name: cat?.name ?? null, category_color: cat?.color ?? null },
    bill: (await pool.query('SELECT * FROM bills WHERE id=$1', [bill.id])).rows[0],
  });
}));

module.exports = router;
