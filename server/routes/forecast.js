const router      = require('express').Router();
const pool        = require('../pg');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

// ── Monthly aggregate forecast ─────────────────────────────────────────────────

router.get('/', wrap(async (req, res) => {
  const userId = req.userId;
  const months = Math.min(parseInt(req.query.months || '12', 10), 36);
  const today  = new Date().toISOString().slice(0, 10);
  const now    = new Date();

  const balRow = (await pool.query(`
    SELECT
      (SELECT COALESCE(SUM(initial_balance), 0) FROM accounts WHERE user_id = $1) +
      (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = $1 AND date <= $2)
      AS balance
  `, [userId, today])).rows[0];
  const currentBalance = parseFloat(balRow.balance) || 0;

  const futureTxns = (await pool.query(`
    SELECT LEFT(date::text, 7) AS month, COALESCE(SUM(amount), 0) AS total
    FROM transactions
    WHERE user_id = $1 AND date > $2
    GROUP BY month
  `, [userId, today])).rows;
  const futureTxnMap = {};
  futureTxns.forEach(r => { futureTxnMap[r.month] = parseFloat(r.total); });

  const bills = (await pool.query(
    `SELECT name, amount, frequency, due_day, due_day_2, custom_days, last_paid
     FROM bills WHERE user_id = $1 AND is_active = TRUE`,
    [userId]
  )).rows;

  const points = [{ label: 'Now', month: today.slice(0, 7), balance: Math.round(currentBalance * 100) / 100 }];
  let running = currentBalance;

  for (let i = 1; i <= months; i++) {
    const d        = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label    = d.toLocaleString('default', { month: 'short', year: '2-digit' });

    if (futureTxnMap[monthStr]) running += futureTxnMap[monthStr];

    for (const bill of bills) {
      const amt = parseFloat(bill.amount);
      switch (bill.frequency) {
        case 'monthly':     running += amt;       break;
        case 'semimonthly': running += amt * 2;   break;
        case 'weekly':      running += amt * 4;   break;
        case 'biweekly':    running += amt * 2;   break;
        case 'quarterly': {
          const anchor     = bill.last_paid ? new Date(bill.last_paid) : new Date(now.getFullYear(), now.getMonth() - 3, 1);
          const monthsDiff = (d.getFullYear() - anchor.getFullYear()) * 12 + (d.getMonth() - anchor.getMonth());
          if (monthsDiff > 0 && monthsDiff % 3 === 0) running += amt;
          break;
        }
        case 'annual': {
          const anchor     = bill.last_paid ? new Date(bill.last_paid) : new Date(now.getFullYear() - 1, now.getMonth(), 1);
          const monthsDiff = (d.getFullYear() - anchor.getFullYear()) * 12 + (d.getMonth() - anchor.getMonth());
          if (monthsDiff > 0 && monthsDiff % 12 === 0) running += amt;
          break;
        }
        case 'custom': {
          const count = bill.custom_days
            ? bill.custom_days.split(',').map(x => parseInt(x.trim())).filter(x => x >= 1 && x <= 31).length
            : 1;
          running += amt * count;
          break;
        }
      }
    }

    points.push({ label, month: monthStr, balance: Math.round(running * 100) / 100 });
  }

  res.json(points);
}));

// ── Transaction-level detail forecast ─────────────────────────────────────────

function billOccurrences(bill, after, before) {
  const dates = [];
  const push  = d => { if (d > after && d <= before) dates.push(new Date(d)); };

  if (bill.frequency === 'monthly') {
    for (let m = 0; m <= 14; m++) {
      const d = new Date(after.getFullYear(), after.getMonth() + m, parseInt(bill.due_day));
      if (d > before) break;
      push(d);
    }
  } else if (bill.frequency === 'semimonthly') {
    for (const day of [parseInt(bill.due_day), parseInt(bill.due_day_2 || 15)]) {
      for (let m = 0; m <= 14; m++) {
        const d = new Date(after.getFullYear(), after.getMonth() + m, day);
        if (d > before) break;
        push(d);
      }
    }
  } else if (bill.frequency === 'weekly' || bill.frequency === 'biweekly') {
    const step   = bill.frequency === 'weekly' ? 7 : 14;
    const anchor = bill.last_paid ? new Date(bill.last_paid) : new Date(after);
    const d      = new Date(anchor);
    while (d <= after) d.setDate(d.getDate() + step);
    while (d <= before) { push(d); d.setDate(d.getDate() + step); }
  } else if (bill.frequency === 'quarterly') {
    const anchor = bill.last_paid
      ? new Date(bill.last_paid)
      : new Date(after.getFullYear(), after.getMonth() - 3, parseInt(bill.due_day));
    const d = new Date(anchor);
    while (d <= after) d.setMonth(d.getMonth() + 3);
    while (d <= before) { push(d); d.setMonth(d.getMonth() + 3); }
  } else if (bill.frequency === 'annual') {
    const anchor = bill.last_paid
      ? new Date(bill.last_paid)
      : new Date(after.getFullYear() - 1, after.getMonth(), parseInt(bill.due_day));
    const d = new Date(anchor);
    while (d <= after) d.setFullYear(d.getFullYear() + 1);
    if (d <= before) push(d);
  } else if (bill.frequency === 'custom' && bill.custom_days) {
    const days = bill.custom_days.split(',').map(x => parseInt(x.trim())).filter(x => x >= 1 && x <= 31);
    for (const day of days) {
      for (let m = 0; m <= 14; m++) {
        const d = new Date(after.getFullYear(), after.getMonth() + m, day);
        if (d > before) break;
        push(d);
      }
    }
  }

  return dates.sort((a, b) => a - b);
}

router.get('/detail', wrap(async (req, res) => {
  const userId = req.userId;
  const days   = Math.min(parseInt(req.query.days || '90', 10), 365);
  const today  = new Date().toISOString().slice(0, 10);
  const now    = new Date(); now.setHours(0, 0, 0, 0);
  const end    = new Date(now); end.setDate(end.getDate() + days);
  const endStr = end.toISOString().slice(0, 10);

  // Current balance
  const balRow = (await pool.query(`
    SELECT
      (SELECT COALESCE(SUM(initial_balance), 0) FROM accounts WHERE user_id = $1) +
      (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = $1 AND date <= $2)
      AS balance
  `, [userId, today])).rows[0];
  let running = parseFloat(balRow.balance) || 0;

  const events = [];

  // Future transactions already on the ledger
  const txns = (await pool.query(`
    SELECT t.date::text AS date, t.payee AS description, t.amount,
           COALESCE(c.name, '') AS category
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.user_id = $1 AND t.date > $2 AND t.date <= $3
    ORDER BY t.date
  `, [userId, today, endStr])).rows;

  txns.forEach(t => events.push({
    date:        t.date.slice(0, 10),
    description: t.description,
    category:    t.category,
    amount:      parseFloat(t.amount),
    source:      'transaction',
  }));

  // Bill occurrences
  const bills = (await pool.query(
    `SELECT name, amount, frequency, due_day, due_day_2, custom_days, last_paid
     FROM bills WHERE user_id = $1 AND is_active = TRUE`,
    [userId]
  )).rows;

  for (const bill of bills) {
    for (const d of billOccurrences(bill, now, end)) {
      events.push({
        date:        d.toISOString().slice(0, 10),
        description: bill.name,
        category:    '',
        amount:      parseFloat(bill.amount),
        source:      'bill',
      });
    }
  }

  // Sort by date and compute running balance
  events.sort((a, b) => a.date.localeCompare(b.date));

  res.json(events.map(e => {
    running = Math.round((running + e.amount) * 100) / 100;
    return { ...e, running_balance: running };
  }));
}));

module.exports = router;
