// Builds a grounded JSON snapshot of the user's real financial data for the
// chatbot's system prompt. The model is instructed to reason only from this
// data — no separate tool-calling loop, which keeps this fast and simple,
// at the cost of the model not being able to drill into arbitrary historical
// detail beyond what's included here. The snapshot is deliberately broad:
// current state, near-term forecast, budget, FSA elections, 12-month
// per-category spending averages, AND recent individual transactions (so
// the assistant can help categorize/analyze specific purchases, not just
// aggregates). Recent transactions include payee/amount/date/category/memo
// and the internal account label (e.g. "B BoA Visa") — never a real bank
// account or routing number, since this app never stores those in the
// first place.
const pool = require('../pg');

const RECENT_TRANSACTION_LIMIT = 400;
const RECENT_TRANSACTION_DAYS  = 180;

async function buildContext(userId) {
  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = new Date(); yearAgo.setMonth(yearAgo.getMonth() - 12);
  const yearAgoStr = yearAgo.toISOString().slice(0, 10);

  const [accounts, bills, fsaRows, categories, spendingByCategory, netWorth, recentTxns] = await Promise.all([
    pool.query(`
      SELECT a.name, a.type, COALESCE(a.initial_balance + SUM(t.amount), a.initial_balance) AS balance
      FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
      WHERE a.user_id = $1 GROUP BY a.id ORDER BY a.created_at
    `, [userId]),
    pool.query(`
      SELECT b.name, b.amount, b.gross_amount, b.frequency, b.due_day, b.due_day_2, c.name AS category_name
      FROM bills b LEFT JOIN categories c ON c.id = b.category_id
      WHERE b.user_id = $1 AND b.is_active = TRUE ORDER BY b.due_day
    `, [userId]),
    pool.query(`
      SELECT f.*, c.name AS category_name FROM fsa_accounts f
      LEFT JOIN categories c ON c.id = f.category_id
      WHERE f.user_id = $1 AND f.is_active = TRUE
    `, [userId]),
    pool.query(`SELECT id, name, type FROM categories WHERE user_id = $1`, [userId]),
    pool.query(`
      SELECT c.name AS category, c.type,
        ROUND(SUM(ABS(t.amount)) / 12.0, 2) AS avg_monthly,
        ROUND(SUM(ABS(t.amount)), 2) AS total_12mo,
        COUNT(*) AS txn_count
      FROM transactions t JOIN categories c ON c.id = t.category_id
      WHERE t.user_id = $1 AND t.date >= $2 AND c.type = 'expense'
      GROUP BY c.name, c.type
      ORDER BY avg_monthly DESC
    `, [userId, yearAgoStr]),
    pool.query(`
      SELECT
        (SELECT COALESCE(SUM(initial_balance + bal.total), 0) FROM accounts a
         LEFT JOIN LATERAL (SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE account_id=a.id) bal ON true
         WHERE a.user_id=$1 AND a.type IN ('checking','savings','investment')) AS assets,
        (SELECT COALESCE(ABS(SUM(initial_balance + bal.total)), 0) FROM accounts a
         LEFT JOIN LATERAL (SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE account_id=a.id) bal ON true
         WHERE a.user_id=$1 AND a.type = 'credit' AND (initial_balance + bal.total) < 0) AS cc_debt
    `, [userId]),
    pool.query(`
      SELECT t.date::text AS date, t.payee, t.amount, t.memo, c.name AS category, a.name AS account_name
      FROM transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      JOIN accounts a ON a.id = t.account_id
      WHERE t.user_id = $1 AND t.date >= $2 AND t.date <= $3
      ORDER BY t.date DESC
      LIMIT $4
    `, [userId, new Date(Date.now() - RECENT_TRANSACTION_DAYS * 86400000).toISOString().slice(0, 10), today, RECENT_TRANSACTION_LIMIT]),
  ]);

  // FSA computed fields (reuse the same math as routes/fsa.js, inlined to avoid a circular import)
  const fsaAccounts = [];
  for (const fsa of fsaRows.rows) {
    const yearStart = `${fsa.plan_year}-01-01`;
    const yearEnd   = `${fsa.plan_year}-12-31`;
    const [contribRes, spendRes] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM fsa_contributions WHERE fsa_account_id=$1`, [fsa.id]),
      fsa.category_id
        ? pool.query(
            `SELECT COALESCE(SUM(ABS(amount)),0) AS total FROM transactions
             WHERE user_id=$1 AND category_id=$2 AND amount<0 AND date BETWEEN $3 AND $4`,
            [userId, fsa.category_id, yearStart, yearEnd]
          )
        : Promise.resolve({ rows: [{ total: 0 }] }),
    ]);
    fsaAccounts.push({
      name: fsa.name,
      type: fsa.fsa_type,
      plan_year: fsa.plan_year,
      annual_election: Number(fsa.annual_election),
      linked_category: fsa.category_name,
      ytd_contributed: Number(contribRes.rows[0].total),
      ytd_spent: Number(spendRes.rows[0].total),
    });
  }

  return {
    today,
    accounts: accounts.rows.map(a => ({ name: a.name, type: a.type, balance: Number(a.balance) })),
    net_worth_estimate: {
      liquid_assets: Number(netWorth.rows[0].assets),
      credit_card_debt: Number(netWorth.rows[0].cc_debt),
    },
    recurring_bills_and_income: bills.rows.map(b => ({
      name: b.name,
      amount: Number(b.amount),
      gross_amount: b.gross_amount != null ? Number(b.gross_amount) : null,
      frequency: b.frequency,
      category: b.category_name,
    })),
    fsa_accounts: fsaAccounts,
    spending_last_12mo_by_category: spendingByCategory.rows.map(r => ({
      category: r.category,
      avg_monthly: Number(r.avg_monthly),
      total_12mo: Number(r.total_12mo),
      transaction_count: Number(r.txn_count),
    })),
    recent_transactions_note: `Up to ${RECENT_TRANSACTION_LIMIT} most recent transactions from the last ${RECENT_TRANSACTION_DAYS} days. No bank account/routing numbers are ever stored by this app — "account" below is just the user's own label for the account.`,
    recent_transactions: recentTxns.rows.map(t => ({
      date: String(t.date).slice(0, 10),
      payee: t.payee,
      amount: Number(t.amount),
      category: t.category,
      memo: t.memo || undefined,
      account: t.account_name,
    })),
    category_count: categories.rows.length,
  };
}

module.exports = { buildContext };
