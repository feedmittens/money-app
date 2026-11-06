const router      = require('express').Router();
const pool        = require('../pg');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

const uid  = req => req.userId;
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

const FSA_LIMITS_2026 = { dependent_care: 7500, medical: 3400 }; // IRS limits for reference only — not enforced

// Estimate remaining pay periods in the plan year for a given bill frequency,
// counting from today through Dec 31 of planYear.
function remainingPayPeriods(frequency, dueDay, dueDay2, planYear) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yearEnd = new Date(planYear, 11, 31);
  if (today > yearEnd) return 0;

  const perMonth = { monthly: 1, semimonthly: 2, quarterly: 1 / 3, annual: 1 / 12, weekly: 52 / 12, biweekly: 26 / 12 };
  if (frequency === 'semimonthly' || frequency === 'monthly') {
    // Count actual remaining due dates this year for accuracy
    let count = 0;
    const days = frequency === 'semimonthly' ? [dueDay, dueDay2 ?? 15].sort((a, b) => a - b) : [dueDay];
    for (let m = today.getMonth(); m <= 11; m++) {
      for (const day of days) {
        const d = new Date(today.getFullYear(), m, day);
        if (d >= today && d.getFullYear() === planYear) count++;
      }
    }
    return count;
  }
  const monthsLeft = 12 - today.getMonth() - (today.getDate() > 1 ? 0 : 1);
  return Math.max(0, Math.round((perMonth[frequency] ?? 1) * monthsLeft));
}

async function withComputed(fsa, userId) {
  const planYear = fsa.plan_year;
  const yearStart = `${planYear}-01-01`;
  const yearEnd   = `${planYear}-12-31`;

  const [contribRes, spendRes, billRes] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM fsa_contributions
       WHERE fsa_account_id = $1 AND user_id = $2`,
      [fsa.id, userId]
    ),
    fsa.category_id
      ? pool.query(
          `SELECT COALESCE(SUM(ABS(amount)), 0) AS total, COUNT(*) AS cnt FROM transactions
           WHERE user_id = $1 AND category_id = $2 AND amount < 0
             AND date BETWEEN $3 AND $4`,
          [userId, fsa.category_id, yearStart, yearEnd]
        )
      : Promise.resolve({ rows: [{ total: 0, cnt: 0 }] }),
    pool.query(
      `SELECT b.frequency, b.due_day, b.due_day_2, bd.amount
       FROM bill_deductions bd JOIN bills b ON b.id = bd.bill_id
       WHERE bd.fsa_account_id = $1 AND bd.user_id = $2 AND b.is_active = TRUE`,
      [fsa.id, userId]
    ),
  ]);

  const ytdContributed = Number(contribRes.rows[0].total);
  const ytdSpent        = Number(spendRes.rows[0].total);
  const spendCount      = Number(spendRes.rows[0].cnt);
  const election         = Number(fsa.annual_election);

  let projectedContribution = ytdContributed;
  let perPayPeriod = 0;
  for (const b of billRes.rows) {
    perPayPeriod += Number(b.amount);
    const remaining = remainingPayPeriods(b.frequency, b.due_day, b.due_day_2, planYear);
    projectedContribution += Number(b.amount) * remaining;
  }

  return {
    ...fsa,
    annual_election:        election,
    ytd_contributed:        Math.round(ytdContributed * 100) / 100,
    ytd_spent:              Math.round(ytdSpent * 100) / 100,
    spend_transaction_count: spendCount,
    remaining_to_spend:     Math.round((election - ytdSpent) * 100) / 100,
    per_pay_period_amount:  Math.round(perPayPeriod * 100) / 100,
    projected_contribution: Math.round(projectedContribution * 100) / 100,
    on_track: Math.round(projectedContribution * 100) >= Math.round(election * 100) - 100, // within $1 rounding
  };
}

router.get('/', wrap(async (req, res) => {
  const rows = (await pool.query(
    `SELECT f.*, c.name AS category_name, c.color AS category_color
     FROM fsa_accounts f LEFT JOIN categories c ON c.id = f.category_id
     WHERE f.user_id = $1 AND f.is_active = TRUE ORDER BY f.plan_year DESC, f.fsa_type`,
    [uid(req)]
  )).rows;
  res.json(await Promise.all(rows.map(r => withComputed(r, uid(req)))));
}));

router.get('/limits', (_req, res) => res.json(FSA_LIMITS_2026));

router.post('/', wrap(async (req, res) => {
  const { name, fsa_type, plan_year, annual_election, category_id } = req.body;
  const result = await pool.query(
    `INSERT INTO fsa_accounts (user_id, name, fsa_type, plan_year, annual_election, category_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [uid(req), name, fsa_type, plan_year, annual_election || 0, category_id || null]
  );
  res.json(await withComputed(result.rows[0], uid(req)));
}));

router.put('/:id', wrap(async (req, res) => {
  const { name, annual_election, category_id, is_active } = req.body;
  const result = await pool.query(
    `UPDATE fsa_accounts SET name=$1, annual_election=$2, category_id=$3, is_active=$4
     WHERE id=$5 AND user_id=$6 RETURNING *`,
    [name, annual_election, category_id || null, is_active ?? true, req.params.id, uid(req)]
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'FSA account not found' });
  res.json(await withComputed(result.rows[0], uid(req)));
}));

router.delete('/:id', wrap(async (req, res) => {
  await pool.query('DELETE FROM fsa_accounts WHERE id=$1 AND user_id=$2', [req.params.id, uid(req)]);
  res.json({ ok: true });
}));

router.get('/:id/contributions', wrap(async (req, res) => {
  const rows = (await pool.query(
    `SELECT * FROM fsa_contributions WHERE fsa_account_id=$1 AND user_id=$2 ORDER BY date DESC`,
    [req.params.id, uid(req)]
  )).rows;
  res.json(rows);
}));

router.get('/:id/spending', wrap(async (req, res) => {
  const fsa = (await pool.query(
    'SELECT * FROM fsa_accounts WHERE id=$1 AND user_id=$2', [req.params.id, uid(req)]
  )).rows[0];
  if (!fsa) return res.status(404).json({ error: 'FSA account not found' });
  if (!fsa.category_id) return res.json([]);

  const rows = (await pool.query(
    `SELECT t.id, t.date, t.payee, t.amount, t.memo
     FROM transactions t
     WHERE t.user_id=$1 AND t.category_id=$2 AND t.amount < 0
       AND t.date BETWEEN $3 AND $4
     ORDER BY t.date DESC`,
    [uid(req), fsa.category_id, `${fsa.plan_year}-01-01`, `${fsa.plan_year}-12-31`]
  )).rows;
  res.json(rows);
}));

module.exports = router;
