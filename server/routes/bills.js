const router      = require('express').Router();
const pool        = require('../pg');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

const uid  = req => req.userId;
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

const billWithJoins = (id, userId) => pool.query(`
  SELECT b.*, c.name AS category_name, c.color AS category_color, a.name AS account_name
  FROM bills b
  LEFT JOIN categories c ON c.id = b.category_id
  LEFT JOIN accounts   a ON a.id = b.account_id
  WHERE b.id=$1 AND b.user_id=$2
`, [id, userId]).then(r => r.rows[0]);

const getDeductions = (billId, userId) => pool.query(
  `SELECT * FROM bill_deductions WHERE bill_id=$1 AND user_id=$2 ORDER BY sort_order, id`,
  [billId, userId]
).then(r => r.rows);

// Replaces all deduction line items for a bill in one pass and returns the
// net amount (gross - sum(deductions)) when gross_amount is provided.
// Deduction amounts reduce net pay but are NOT subtracted twice — the caller
// computes bills.amount directly from this.
async function syncDeductions(billId, userId, grossAmount, deductions) {
  await pool.query('DELETE FROM bill_deductions WHERE bill_id=$1 AND user_id=$2', [billId, userId]);
  let total = 0;
  if (Array.isArray(deductions)) {
    let i = 0;
    for (const d of deductions) {
      const amt = parseFloat(d.amount) || 0;
      total += amt;
      await pool.query(
        `INSERT INTO bill_deductions (bill_id, user_id, label, amount, fsa_account_id, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [billId, userId, d.label, amt, d.fsa_account_id || null, i++]
      );
    }
  }
  if (grossAmount == null) return null;
  return Math.round((parseFloat(grossAmount) - total) * 100) / 100;
}

router.get('/', wrap(async (req, res) => {
  const result = await pool.query(`
    SELECT b.*, c.name AS category_name, c.color AS category_color, a.name AS account_name
    FROM bills b
    LEFT JOIN categories c ON c.id = b.category_id
    LEFT JOIN accounts   a ON a.id = b.account_id
    WHERE b.user_id=$1 AND b.is_active = TRUE
    ORDER BY b.due_day
  `, [uid(req)]);

  const bills = result.rows;
  const deductionRows = (await pool.query(
    `SELECT bd.* FROM bill_deductions bd
     JOIN bills b ON b.id = bd.bill_id
     WHERE b.user_id=$1 ORDER BY bd.sort_order, bd.id`,
    [uid(req)]
  )).rows;
  const byBill = {};
  for (const d of deductionRows) (byBill[d.bill_id] ??= []).push(d);
  for (const b of bills) b.deductions = byBill[b.id] || [];

  res.json(bills);
}));

router.post('/', wrap(async (req, res) => {
  const { name, amount, due_day, due_day_2, custom_days, frequency, category_id, account_id, auto_post,
          gross_amount, deductions } = req.body;
  const result = await pool.query(
    `INSERT INTO bills (user_id, name, amount, due_day, due_day_2, custom_days, frequency, category_id, account_id, auto_post, gross_amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [uid(req), name, amount, due_day, due_day_2 ?? null, custom_days ?? null,
     frequency, category_id ?? null, account_id ?? null, !!auto_post, gross_amount ?? null]
  );
  const billId = result.rows[0].id;
  if (deductions?.length) {
    const net = await syncDeductions(billId, uid(req), gross_amount, deductions);
    if (net != null) await pool.query('UPDATE bills SET amount=$1 WHERE id=$2', [net, billId]);
  }
  res.json({ ...(await billWithJoins(billId, uid(req))), deductions: await getDeductions(billId, uid(req)) });
}));

router.put('/:id', wrap(async (req, res) => {
  const { name, amount, due_day, due_day_2, custom_days, frequency, category_id, account_id, is_active, auto_post,
          gross_amount, deductions } = req.body;

  let finalAmount = amount;
  if (deductions !== undefined) {
    const net = await syncDeductions(req.params.id, uid(req), gross_amount, deductions);
    if (net != null) finalAmount = net;
  }

  await pool.query(`
    UPDATE bills SET name=$1, amount=$2, due_day=$3, due_day_2=$4, custom_days=$5,
      frequency=$6, category_id=$7, account_id=$8, is_active=$9, auto_post=$10, gross_amount=$11
    WHERE id=$12 AND user_id=$13
  `, [name, finalAmount, due_day, due_day_2 ?? null, custom_days ?? null, frequency,
      category_id ?? null, account_id ?? null, is_active ?? true, !!auto_post, gross_amount ?? null,
      req.params.id, uid(req)]);
  res.json({ ...(await billWithJoins(req.params.id, uid(req))), deductions: await getDeductions(req.params.id, uid(req)) });
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

  // Post FSA contributions for any deduction line items tied to an FSA account —
  // keeps the FSA's "contributed to date" in sync every time this paycheck is recorded.
  const fsaDeductions = (await pool.query(
    `SELECT * FROM bill_deductions WHERE bill_id=$1 AND user_id=$2 AND fsa_account_id IS NOT NULL`,
    [bill.id, uid(req)]
  )).rows;
  for (const d of fsaDeductions) {
    await pool.query(
      `INSERT INTO fsa_contributions (fsa_account_id, user_id, date, amount, bill_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [d.fsa_account_id, uid(req), payDate, d.amount, bill.id]
    );
  }

  const txn = txResult.rows[0];
  const cat = txn.category_id
    ? (await pool.query('SELECT name, color FROM categories WHERE id=$1', [txn.category_id])).rows[0]
    : null;

  res.json({
    transaction: { ...txn, category_name: cat?.name ?? null, category_color: cat?.color ?? null },
    bill: (await pool.query('SELECT * FROM bills WHERE id=$1', [bill.id])).rows[0],
    fsa_contributions_posted: fsaDeductions.length,
  });
}));

module.exports = router;
