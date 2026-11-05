const pool      = require('../pg');
const Anthropic  = require('@anthropic-ai/sdk');

// Tier 1: look up the most-used category for this payee from existing transactions.
async function getHistoryCategory(userId, payee) {
  const result = await pool.query(
    `SELECT category_id, COUNT(*) AS cnt
     FROM transactions
     WHERE user_id = $1 AND LOWER(payee) = LOWER($2) AND category_id IS NOT NULL
     GROUP BY category_id ORDER BY cnt DESC LIMIT 1`,
    [userId, payee]
  );
  return result.rows[0]?.category_id ?? null;
}

// Tier 1 batch: update all uncategorized Plaid transactions in one SQL pass.
// Returns the count of transactions updated.
async function batchHistoryCategorize(userId) {
  const result = await pool.query(
    `WITH history AS (
       SELECT
         LOWER(payee) AS payee_lower,
         category_id,
         ROW_NUMBER() OVER (PARTITION BY LOWER(payee) ORDER BY COUNT(*) DESC) AS rn
       FROM transactions
       WHERE user_id = $1 AND category_id IS NOT NULL
       GROUP BY LOWER(payee), category_id
     )
     UPDATE transactions t
     SET category_id = h.category_id
     FROM history h
     WHERE LOWER(t.payee) = h.payee_lower
       AND h.rn = 1
       AND t.user_id = $1
       AND t.plaid_transaction_id IS NOT NULL
       AND t.category_id IS NULL`,
    [userId]
  );
  return result.rowCount;
}

// Tier 2: ask Claude Haiku to pick a category from the user's list.
// Called once per unique payee, not once per transaction.
async function getAICategory(payee, categories) {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  const client     = new Anthropic();
  const categoryList = categories.map(c => c.name).join('\n');

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-5-5',
      max_tokens: 50,
      messages: [{
        role: 'user',
        content:
          `You are categorizing a personal finance transaction.\n` +
          `Payee: "${payee}"\n\n` +
          `Choose the single best matching category from this list. ` +
          `Reply with ONLY the exact category name, nothing else:\n\n` +
          categoryList,
      }],
    });

    const suggested = response.content[0].text.trim();
    const match = categories.find(
      c => c.name.toLowerCase() === suggested.toLowerCase()
    );
    return match?.id ?? null;
  } catch {
    return null;
  }
}

// Batch AI categorization: categorizes all remaining uncategorized Plaid
// transactions for a user, calling Claude once per unique payee.
// Returns { aiCategorized, skipped } counts.
async function batchAICategorize(userId) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { aiCategorized: 0, skipped: 0, reason: 'ANTHROPIC_API_KEY not set' };
  }

  // Fetch the user's category list once
  const catRows = (await pool.query('SELECT id, name FROM categories ORDER BY name')).rows;

  // Get distinct payees still needing a category
  const pending = (await pool.query(
    `SELECT DISTINCT payee
     FROM transactions
     WHERE user_id = $1
       AND plaid_transaction_id IS NOT NULL
       AND category_id IS NULL`,
    [userId]
  )).rows.map(r => r.payee);

  let aiCategorized = 0;
  let skipped       = 0;

  for (const payee of pending) {
    const categoryId = await getAICategory(payee, catRows);
    if (categoryId) {
      await pool.query(
        `UPDATE transactions
         SET category_id = $1
         WHERE user_id = $2 AND LOWER(payee) = LOWER($3)
           AND plaid_transaction_id IS NOT NULL AND category_id IS NULL`,
        [categoryId, userId, payee]
      );
      aiCategorized++;
    } else {
      skipped++;
    }
  }

  return { aiCategorized, skipped };
}

module.exports = { getHistoryCategory, batchHistoryCategorize, batchAICategorize };
