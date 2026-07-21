const router      = require('express').Router();
const pool        = require('../pg');
const requireAuth = require('../middleware/requireAuth');
const { PlaidApi, PlaidEnvironments, Configuration, Products, CountryCode } = require('plaid');

router.use(requireAuth);

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

function getClient() {
  const { PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV } = process.env;
  if (!PLAID_CLIENT_ID || !PLAID_SECRET) {
    throw Object.assign(new Error('Plaid credentials not configured — set PLAID_CLIENT_ID and PLAID_SECRET in .env'), { status: 503 });
  }
  const env = PLAID_ENV === 'production' ? PlaidEnvironments.production
            : PLAID_ENV === 'development' ? PlaidEnvironments.development
            : PlaidEnvironments.sandbox;
  return new PlaidApi(new Configuration({
    basePath: env,
    baseOptions: { headers: { 'PLAID-CLIENT-ID': PLAID_CLIENT_ID, 'PLAID-SECRET': PLAID_SECRET } },
  }));
}

// ── Create link token (client calls this to initialize Plaid Link) ─────────────
router.post('/link-token', wrap(async (req, res) => {
  const client = getClient();
  const resp = await client.linkTokenCreate({
    user: { client_user_id: String(req.userId) },
    client_name: 'Tally',
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: 'en',
    ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}),
  });
  res.json({ link_token: resp.data.link_token });
}));

// ── Exchange public token → access token, store connection ────────────────────
router.post('/exchange', wrap(async (req, res) => {
  const { public_token, institution_name } = req.body;
  if (!public_token) return res.status(400).json({ error: 'public_token required' });

  const client   = getClient();
  const exchange = await client.itemPublicTokenExchange({ public_token });
  const { access_token, item_id } = exchange.data;

  // Fetch accounts from Plaid
  const acctResp = await client.accountsGet({ access_token });
  const plaidAccounts = acctResp.data.accounts;

  const db = await pool.connect();
  try {
    await db.query('BEGIN');

    // Insert or update the Plaid item
    const itemRow = await db.query(
      `INSERT INTO plaid_items (user_id, item_id, access_token, institution_name)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (item_id) DO UPDATE SET access_token = $3, institution_name = $4
       RETURNING id`,
      [req.userId, item_id, access_token, institution_name || 'Unknown']
    );
    const plaidItemId = itemRow.rows[0].id;

    // For each Plaid account, create a matching Tally account if needed
    for (const pa of plaidAccounts) {
      // Map Plaid type to Tally type
      const type = pa.type === 'credit' ? 'credit'
                 : pa.subtype === 'savings' ? 'savings'
                 : pa.type === 'investment' ? 'investment'
                 : 'checking';

      // Create Tally account
      const tallyAcct = await db.query(
        `INSERT INTO accounts (user_id, name, type, initial_balance)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [req.userId, pa.name, type, pa.balances.current ?? 0]
      );
      const accountId = tallyAcct.rows[0].id;

      await db.query(
        `INSERT INTO plaid_accounts (plaid_item_id, plaid_account_id, account_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (plaid_account_id) DO UPDATE SET account_id = $3`,
        [plaidItemId, pa.account_id, accountId]
      );
    }

    await db.query('COMMIT');
    res.json({ ok: true, accounts: plaidAccounts.length });
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}));

// ── Sync transactions for all of the user's Plaid connections ─────────────────
router.post('/sync', wrap(async (req, res) => {
  const client = getClient();
  const uid    = req.userId;

  const items = (await pool.query(
    'SELECT id, access_token, cursor, institution_name FROM plaid_items WHERE user_id = $1',
    [uid]
  )).rows;

  if (!items.length) return res.json({ synced: 0, added: 0, institutions: [] });

  let totalAdded = 0;
  const institutions = [];

  for (const item of items) {
    let cursor  = item.cursor ?? undefined;
    let hasMore = true;
    let added   = 0;
    const acctMap = Object.fromEntries(
      (await pool.query(
        'SELECT plaid_account_id, account_id FROM plaid_accounts WHERE plaid_item_id = $1',
        [item.id]
      )).rows.map(r => [r.plaid_account_id, r.account_id])
    );

    while (hasMore) {
      const syncResp = await client.transactionsSync({ access_token: item.access_token, cursor });
      const { added: txAdded, modified: txModified, removed: txRemoved, next_cursor, has_more } = syncResp.data;

      for (const tx of txAdded) {
        const accountId = acctMap[tx.account_id];
        if (!accountId) continue;
        // Plaid: positive amount = money out (debit). Tally: negative = expense.
        const amount = -(tx.amount);
        await pool.query(
          `INSERT INTO transactions (user_id, account_id, date, payee, amount, memo, plaid_transaction_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (plaid_transaction_id) DO NOTHING`,
          [uid, accountId, tx.date, tx.merchant_name || tx.name, amount, tx.name, tx.transaction_id]
        );
        added++;
      }

      for (const tx of txModified) {
        const accountId = acctMap[tx.account_id];
        if (!accountId) continue;
        const amount = -(tx.amount);
        await pool.query(
          `UPDATE transactions SET date=$1, payee=$2, amount=$3, memo=$4
           WHERE plaid_transaction_id=$5 AND user_id=$6`,
          [tx.date, tx.merchant_name || tx.name, amount, tx.name, tx.transaction_id, uid]
        );
      }

      for (const tx of txRemoved) {
        await pool.query(
          'DELETE FROM transactions WHERE plaid_transaction_id=$1 AND user_id=$2',
          [tx.transaction_id, uid]
        );
      }

      cursor  = next_cursor;
      hasMore = has_more;
    }

    await pool.query(
      'UPDATE plaid_items SET cursor=$1, last_synced=NOW() WHERE id=$2',
      [cursor, item.id]
    );

    totalAdded += added;
    institutions.push({ name: item.institution_name, added });
  }

  res.json({ ok: true, added: totalAdded, institutions });
}));

// ── List connections ───────────────────────────────────────────────────────────
router.get('/connections', wrap(async (req, res) => {
  const rows = await pool.query(
    `SELECT pi.id, pi.institution_name, pi.last_synced, pi.created_at,
            COUNT(pa.id) AS account_count
     FROM plaid_items pi
     LEFT JOIN plaid_accounts pa ON pa.plaid_item_id = pi.id
     WHERE pi.user_id = $1
     GROUP BY pi.id ORDER BY pi.created_at DESC`,
    [req.userId]
  );
  res.json(rows.rows);
}));

// ── Remove a connection ────────────────────────────────────────────────────────
router.delete('/connections/:id', wrap(async (req, res) => {
  const row = await pool.query(
    'SELECT access_token FROM plaid_items WHERE id=$1 AND user_id=$2',
    [req.params.id, req.userId]
  );
  if (!row.rows.length) return res.status(404).json({ error: 'Not found' });

  try {
    const client = getClient();
    await client.itemRemove({ access_token: row.rows[0].access_token });
  } catch { /* best-effort — remove locally regardless */ }

  await pool.query('DELETE FROM plaid_items WHERE id=$1 AND user_id=$2', [req.params.id, req.userId]);
  res.json({ ok: true });
}));

module.exports = router;
