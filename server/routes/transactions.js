const router      = require('express').Router();
const pool        = require('../pg');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

const uid  = req => req.userId;
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

// ── Transaction list (paginated) ──────────────────────────────────────────────
router.get('/', wrap(async (req, res) => {
  const { account_id, month } = req.query;
  const pageNum  = Math.max(1, parseInt(req.query.page  || '1'));
  const pageSize = Math.min(500, Math.max(1, parseInt(req.query.limit || '200')));
  const offset   = (pageNum - 1) * pageSize;

  const acct = await pool.query(
    'SELECT initial_balance FROM accounts WHERE id=$1 AND user_id=$2',
    [account_id, uid(req)]
  );
  if (!acct.rows[0]) return res.status(404).json({ error: 'Account not found' });
  const initBal = parseFloat(acct.rows[0].initial_balance);

  const params = [account_id, uid(req), initBal];
  let monthClause = '';
  if (month) {
    params.push(month);
    monthClause = `AND LEFT(t.date::text, 7) = $${params.length}`;
  }
  const pLimit  = params.length + 1;
  const pOffset = params.length + 2;
  params.push(pageSize, offset);

  // Single-query approach: window function computes running balances over all
  // transactions, then we filter/paginate without a second round-trip.
  const q = `
    WITH all_txns AS (
      SELECT t.id, t.account_id, t.date, t.payee, t.category_id, t.amount, t.memo,
             t.cleared, t.tax_relevant, t.transfer_account_id, t.transfer_peer_id, t.bill_id,
             c.name  AS category_name,
             c.color AS category_color,
             $3::numeric + SUM(t.amount) OVER (ORDER BY t.date ASC, t.id ASC) AS running_balance
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      WHERE t.account_id = $1 AND t.user_id = $2
    ),
    visible AS (
      SELECT *, COUNT(*) OVER() AS total_count
      FROM all_txns
      WHERE TRUE ${monthClause}
    )
    SELECT * FROM visible
    ORDER BY date DESC, id DESC
    LIMIT $${pLimit} OFFSET $${pOffset}
  `;

  const { rows } = await pool.query(q, params);
  res.json({
    transactions: rows,
    total:    Number(rows[0]?.total_count ?? 0),
    page:     pageNum,
    pageSize,
  });
}));

// ── Create transaction ────────────────────────────────────────────────────────
router.post('/', wrap(async (req, res) => {
  const { account_id, date, payee, category_id, amount, memo, cleared,
          tax_relevant, transfer_account_id, bill_id } = req.body;

  // Verify account ownership before writing — prevents IDOR via account_id
  const acctCheck = await pool.query(
    'SELECT id FROM accounts WHERE id=$1 AND user_id=$2', [account_id, uid(req)]
  );
  if (!acctCheck.rows[0]) return res.status(404).json({ error: 'Account not found' });

  if (transfer_account_id) {
    const destCheck = await pool.query(
      'SELECT id FROM accounts WHERE id=$1 AND user_id=$2', [transfer_account_id, uid(req)]
    );
    if (!destCheck.rows[0]) return res.status(404).json({ error: 'Destination account not found' });

    // Transfers: insert both legs atomically and cross-link them.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const r1 = await client.query(`
        INSERT INTO transactions
          (user_id, account_id, date, payee, amount, memo, cleared, transfer_account_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
      `, [uid(req), account_id, date, payee, amount,
          memo ?? '', cleared ?? false, transfer_account_id]);

      const r2 = await client.query(`
        INSERT INTO transactions
          (user_id, account_id, date, payee, amount, memo, cleared, transfer_account_id, transfer_peer_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
      `, [uid(req), transfer_account_id, date, payee, -amount,
          memo ?? '', cleared ?? false, account_id, r1.rows[0].id]);

      await client.query(
        'UPDATE transactions SET transfer_peer_id=$1 WHERE id=$2',
        [r2.rows[0].id, r1.rows[0].id]
      );

      await client.query('COMMIT');
      res.json({ ...r1.rows[0], transfer_peer_id: r2.rows[0].id,
                 category_name: null, category_color: null });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return;
  }

  const result = await pool.query(`
    INSERT INTO transactions
      (user_id, account_id, date, payee, category_id, amount, memo, cleared,
       tax_relevant, transfer_account_id, bill_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    RETURNING *
  `, [uid(req), account_id, date, payee, category_id ?? null, amount,
      memo ?? '', cleared ?? false, tax_relevant ?? false,
      null, bill_id ?? null]);

  const row = result.rows[0];
  const cat = category_id
    ? (await pool.query('SELECT name, color FROM categories WHERE id=$1', [category_id])).rows[0]
    : null;
  res.json({ ...row, category_name: cat?.name ?? null, category_color: cat?.color ?? null });
}));

// ── Update transaction ────────────────────────────────────────────────────────
router.put('/:id', wrap(async (req, res) => {
  const { date, payee, category_id, amount, memo, cleared, tax_relevant } = req.body;

  const existing = await pool.query(
    'SELECT transfer_peer_id FROM transactions WHERE id=$1 AND user_id=$2',
    [req.params.id, uid(req)]
  );
  if (!existing.rows[0]) return res.status(404).json({ error: 'Transaction not found' });
  const peerId = existing.rows[0].transfer_peer_id;

  const result = await pool.query(`
    UPDATE transactions
    SET date=$1, payee=$2, category_id=$3, amount=$4, memo=$5, cleared=$6, tax_relevant=$7
    WHERE id=$8 AND user_id=$9
    RETURNING *
  `, [date, payee, category_id ?? null, amount, memo ?? '', cleared ?? false,
      tax_relevant ?? false, req.params.id, uid(req)]);

  // Keep the peer leg in sync (date, memo, cleared, and the mirrored amount)
  if (peerId) {
    await pool.query(
      'UPDATE transactions SET date=$1, memo=$2, cleared=$3, amount=$4 WHERE id=$5 AND user_id=$6',
      [date, memo ?? '', cleared ?? false, -amount, peerId, uid(req)]
    );
  }

  const row = result.rows[0];
  const cat = row.category_id
    ? (await pool.query('SELECT name, color FROM categories WHERE id=$1', [row.category_id])).rows[0]
    : null;
  res.json({ ...row, category_name: cat?.name ?? null, category_color: cat?.color ?? null });
}));

// ── Delete transaction ────────────────────────────────────────────────────────
router.delete('/:id', wrap(async (req, res) => {
  const txn = await pool.query(
    'SELECT transfer_peer_id FROM transactions WHERE id=$1 AND user_id=$2',
    [req.params.id, uid(req)]
  );
  const peerId = txn.rows[0]?.transfer_peer_id;

  if (peerId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Null out peer links first so neither row blocks the other's delete
      await client.query(
        'UPDATE transactions SET transfer_peer_id = NULL WHERE id = ANY($1)',
        [[req.params.id, peerId]]
      );
      await client.query(
        'DELETE FROM transactions WHERE id = ANY($1) AND user_id = $2',
        [[req.params.id, peerId], uid(req)]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } else {
    await pool.query('DELETE FROM transactions WHERE id=$1 AND user_id=$2', [req.params.id, uid(req)]);
  }

  res.json({ ok: true });
}));

// ── Payees (autocomplete) ─────────────────────────────────────────────────────
router.get('/payees', wrap(async (req, res) => {
  const result = await pool.query(
    'SELECT DISTINCT payee FROM transactions WHERE user_id=$1 ORDER BY payee',
    [uid(req)]
  );
  res.json(result.rows.map(r => r.payee).filter(Boolean));
}));

// ── Attachments ───────────────────────────────────────────────────────────────
router.get('/:id/attachments', wrap(async (req, res) => {
  const result = await pool.query(
    `SELECT id, transaction_id, filename, mime_type, size, created_at
     FROM attachments WHERE transaction_id=$1 AND user_id=$2 ORDER BY created_at`,
    [req.params.id, uid(req)]
  );
  res.json(result.rows);
}));

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'text/plain', 'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

router.post('/:id/attachments', wrap(async (req, res) => {
  // Verify the transaction belongs to this user before attaching (IDOR fix)
  const txnCheck = await pool.query(
    'SELECT id FROM transactions WHERE id=$1 AND user_id=$2', [req.params.id, uid(req)]
  );
  if (!txnCheck.rows[0]) return res.status(404).json({ error: 'Transaction not found' });

  const { filename, mime_type, data } = req.body;

  if (!ALLOWED_MIME_TYPES.has(mime_type)) {
    return res.status(400).json({ error: 'File type not allowed' });
  }

  const buffer = Buffer.from(data, 'base64');
  // Check actual decoded size — not the client-supplied value, which can be spoofed
  if (buffer.length > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'Attachment must be under 10 MB' });
  }

  const result = await pool.query(
    `INSERT INTO attachments (user_id, transaction_id, filename, mime_type, size, data)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, transaction_id, filename, mime_type, size, created_at`,
    [uid(req), req.params.id, filename, mime_type, buffer.length, buffer]
  );
  res.json(result.rows[0]);
}));

router.get('/:txnId/attachments/:id/download', wrap(async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM attachments WHERE id=$1 AND user_id=$2',
    [req.params.id, uid(req)]
  );
  const att = result.rows[0];
  if (!att) return res.status(404).json({ error: 'Attachment not found' });

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', att.mime_type);
  // RFC 8187 encoding prevents header injection via filenames containing " or \r\n
  const encoded = encodeURIComponent(att.filename).replace(/'/g, '%27');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encoded}`);
  res.send(att.data);
}));

router.delete('/:txnId/attachments/:id', wrap(async (req, res) => {
  await pool.query(
    'DELETE FROM attachments WHERE id=$1 AND user_id=$2',
    [req.params.id, uid(req)]
  );
  res.json({ ok: true });
}));

// ── Search ────────────────────────────────────────────────────────────────────
router.get('/search', wrap(async (req, res) => {
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
}));

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/reports/spending', wrap(async (req, res) => {
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
}));

router.get('/reports/monthly', wrap(async (req, res) => {
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
}));

router.get('/reports/tax', wrap(async (req, res) => {
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
}));

module.exports = router;
