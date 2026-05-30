const router      = require('express').Router();
const pool        = require('../pg');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

const uid = req => req.session.userId;

router.get('/', async (req, res) => {
  const { account_id, month } = req.query;

  // Verify account belongs to this user
  const acct = await pool.query(
    'SELECT initial_balance FROM accounts WHERE id=$1 AND user_id=$2',
    [account_id, uid(req)]
  );
  if (!acct.rows[0]) return res.status(404).json({ error: 'Account not found' });

  let q = `
    SELECT t.*, c.name AS category_name, c.color AS category_color
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.account_id = $1 AND t.user_id = $2
  `;
  const params = [account_id, uid(req)];
  if (month) {
    q += ` AND LEFT(t.date::text, 7) = $${params.length + 1}`;
    params.push(month);
  }
  q += ' ORDER BY t.date DESC, t.id DESC';

  const rows = (await pool.query(q, params)).rows;

  // Running balance: compute from all transactions chronologically
  const all = (await pool.query(
    'SELECT id, amount FROM transactions WHERE account_id=$1 AND user_id=$2 ORDER BY date ASC, id ASC',
    [account_id, uid(req)]
  )).rows;

  let running = parseFloat(acct.rows[0].initial_balance);
  const balMap = {};
  all.forEach(t => { running += parseFloat(t.amount); balMap[t.id] = running; });

  res.json(rows.map(t => ({ ...t, running_balance: balMap[t.id] ?? 0 })));
});

router.post('/', async (req, res) => {
  const { account_id, date, payee, category_id, amount, memo, cleared,
          tax_relevant, transfer_account_id, bill_id } = req.body;
  const result = await pool.query(`
    INSERT INTO transactions
      (user_id, account_id, date, payee, category_id, amount, memo, cleared,
       tax_relevant, transfer_account_id, bill_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
  `, [uid(req), account_id, date, payee, category_id ?? null, amount,
      memo ?? '', cleared ?? false, tax_relevant ?? false,
      transfer_account_id ?? null, bill_id ?? null]);

  const row = result.rows[0];
  const cat = category_id
    ? (await pool.query('SELECT name, color FROM categories WHERE id=$1', [category_id])).rows[0]
    : null;
  res.json({ ...row, category_name: cat?.name ?? null, category_color: cat?.color ?? null });
});

router.put('/:id', async (req, res) => {
  const { date, payee, category_id, amount, memo, cleared, tax_relevant } = req.body;
  const result = await pool.query(`
    UPDATE transactions
    SET date=$1, payee=$2, category_id=$3, amount=$4, memo=$5, cleared=$6, tax_relevant=$7
    WHERE id=$8 AND user_id=$9
    RETURNING *
  `, [date, payee, category_id ?? null, amount, memo ?? '', cleared ?? false,
      tax_relevant ?? false, req.params.id, uid(req)]);

  if (!result.rows[0]) return res.status(404).json({ error: 'Transaction not found' });
  const row = result.rows[0];
  const cat = row.category_id
    ? (await pool.query('SELECT name, color FROM categories WHERE id=$1', [row.category_id])).rows[0]
    : null;
  res.json({ ...row, category_name: cat?.name ?? null, category_color: cat?.color ?? null });
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM transactions WHERE id=$1 AND user_id=$2', [req.params.id, uid(req)]);
  res.json({ ok: true });
});

// ── Payees (autocomplete) ─────────────────────────────────────────────────────
router.get('/payees', async (req, res) => {
  const result = await pool.query(
    'SELECT DISTINCT payee FROM transactions WHERE user_id=$1 ORDER BY payee',
    [uid(req)]
  );
  res.json(result.rows.map(r => r.payee).filter(Boolean));
});

// ── Attachments ───────────────────────────────────────────────────────────────
router.get('/:id/attachments', async (req, res) => {
  const result = await pool.query(
    `SELECT id, transaction_id, filename, mime_type, size, created_at
     FROM attachments WHERE transaction_id=$1 AND user_id=$2 ORDER BY created_at`,
    [req.params.id, uid(req)]
  );
  res.json(result.rows);
});

router.post('/:id/attachments', async (req, res) => {
  const { filename, mime_type, size, data } = req.body;
  if (size > 10 * 1024 * 1024) return res.status(400).json({ error: 'Attachment must be under 10 MB' });

  // data arrives as base64 string from client
  const buffer = Buffer.from(data, 'base64');
  const result = await pool.query(
    `INSERT INTO attachments (user_id, transaction_id, filename, mime_type, size, data)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, transaction_id, filename, mime_type, size, created_at`,
    [uid(req), req.params.id, filename, mime_type, size, buffer]
  );
  res.json(result.rows[0]);
});

router.get('/:txnId/attachments/:id/download', async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM attachments WHERE id=$1 AND user_id=$2',
    [req.params.id, uid(req)]
  );
  const att = result.rows[0];
  if (!att) return res.status(404).json({ error: 'Attachment not found' });

  res.setHeader('Content-Type', att.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${att.filename}"`);
  res.send(att.data);
});

router.delete('/:txnId/attachments/:id', async (req, res) => {
  await pool.query(
    'DELETE FROM attachments WHERE id=$1 AND user_id=$2',
    [req.params.id, uid(req)]
  );
  res.json({ ok: true });
});

// ── Search ────────────────────────────────────────────────────────────────────
router.get('/search', async (req, res) => {
  const { q, account_id, date_from, date_to, amount_min, amount_max, tax_only } = req.query;

  const conditions = ['t.user_id = $1'];
  const params = [uid(req)];
  let n = 2;

  if (q) {
    conditions.push(`(t.payee ILIKE $${n} OR t.memo ILIKE $${n})`);
    params.push(`%${q}%`); n++;
  }
  if (account_id) { conditions.push(`t.account_id = $${n}`); params.push(account_id); n++; }
  if (date_from)  { conditions.push(`t.date >= $${n}`);       params.push(date_from); n++; }
  if (date_to)    { conditions.push(`t.date <= $${n}`);       params.push(date_to);   n++; }
  if (amount_min) { conditions.push(`t.amount >= $${n}`);     params.push(amount_min); n++; }
  if (amount_max) { conditions.push(`t.amount <= $${n}`);     params.push(amount_max); n++; }
  if (tax_only === 'true') conditions.push('t.tax_relevant = TRUE');

  const result = await pool.query(`
    SELECT t.id, t.date, t.payee, t.amount, t.memo, t.cleared, t.tax_relevant, t.account_id,
      COALESCE(c.name,  'Uncategorized') AS category_name,
      COALESCE(c.color, '#6b7280')       AS category_color,
      COALESCE(a.name,  'Unknown')       AS account_name
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN accounts   a ON a.id = t.account_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.date DESC, t.id DESC
    LIMIT 500
  `, params);

  res.json(result.rows);
});

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/reports/spending', async (req, res) => {
  const { from, to } = req.query;
  const result = await pool.query(`
    SELECT COALESCE(c.name, 'Uncategorized') AS category_name,
           COALESCE(c.color, '#6b7280')      AS category_color,
           SUM(t.amount) AS total, COUNT(*) AS count
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.user_id=$1 AND t.amount < 0 AND t.date >= $2 AND t.date <= $3
    GROUP BY t.category_id, c.name, c.color
    ORDER BY total ASC
  `, [uid(req), from, to]);
  res.json(result.rows);
});

router.get('/reports/monthly', async (req, res) => {
  const result = await pool.query(`
    SELECT LEFT(date::text, 7) AS month,
      SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END)       AS income,
      SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END)  AS expenses,
      SUM(amount) AS net
    FROM transactions
    WHERE user_id=$1
    GROUP BY month
    ORDER BY month DESC
    LIMIT 24
  `, [uid(req)]);
  res.json(result.rows);
});

router.get('/reports/tax', async (req, res) => {
  const { year } = req.query;
  const params = [uid(req)];
  const yearFilter = year ? ` AND LEFT(t.date::text, 4) = $2` : '';
  if (year) params.push(year);

  const result = await pool.query(`
    SELECT t.id, t.date, t.payee, t.amount, t.memo,
      COALESCE(c.name, 'Uncategorized') AS category_name,
      COALESCE(a.name, 'Unknown')       AS account_name,
      (SELECT COUNT(*) FROM attachments att WHERE att.transaction_id = t.id) AS attachment_count
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN accounts   a ON a.id = t.account_id
    WHERE t.user_id=$1 AND t.tax_relevant = TRUE ${yearFilter}
    ORDER BY t.date DESC
  `, params);
  res.json(result.rows);
});

module.exports = router;
