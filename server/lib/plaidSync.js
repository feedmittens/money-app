// Core Plaid sync logic, extracted so it can run both from the authenticated
// HTTP route (routes/plaid.js) and from a standalone cron script
// (scripts/auto-sync-plaid.js) without duplicating the transactionsSync loop.
const pool = require('../pg');
const { PlaidApi, PlaidEnvironments, Configuration } = require('plaid');
const { getHistoryCategory } = require('./autocategorize');

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

// Syncs every Plaid connection for one user. Returns { added, institutions }.
async function syncUser(userId) {
  const client = getClient();

  const items = (await pool.query(
    'SELECT id, access_token, cursor, institution_name FROM plaid_items WHERE user_id = $1',
    [userId]
  )).rows;

  if (!items.length) return { added: 0, institutions: [] };

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
        const amount  = -(tx.amount);
        const payee   = tx.merchant_name || tx.name;
        const catId   = await getHistoryCategory(userId, payee);
        await pool.query(
          `INSERT INTO transactions (user_id, account_id, date, payee, amount, memo, plaid_transaction_id, category_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (plaid_transaction_id) WHERE plaid_transaction_id IS NOT NULL DO NOTHING`,
          [userId, accountId, tx.date, payee, amount, tx.name, tx.transaction_id, catId]
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
          [tx.date, tx.merchant_name || tx.name, amount, tx.name, tx.transaction_id, userId]
        );
      }

      for (const tx of txRemoved) {
        await pool.query(
          'DELETE FROM transactions WHERE plaid_transaction_id=$1 AND user_id=$2',
          [tx.transaction_id, userId]
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

  return { added: totalAdded, institutions };
}

module.exports = { syncUser, getClient };
