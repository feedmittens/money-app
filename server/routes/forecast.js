const router      = require('express').Router();
const pool        = require('../pg');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

router.get('/', wrap(async (req, res) => {
  const userId = req.session.userId;
  const months = Math.min(parseInt(req.query.months || '12', 10), 36);
  const today  = new Date().toISOString().slice(0, 10);
  const now    = new Date();

  // Current balance: sum of all initial_balances + all transactions up to today
  const balRow = (await pool.query(`
    SELECT
      (SELECT COALESCE(SUM(initial_balance), 0) FROM accounts WHERE user_id = $1) +
      (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE user_id = $1 AND date <= $2)
      AS balance
  `, [userId, today])).rows[0];
  const currentBalance = parseFloat(balRow.balance) || 0;

  // Future transactions already entered, grouped by month
  const futureTxns = (await pool.query(`
    SELECT LEFT(date::text, 7) AS month, COALESCE(SUM(amount), 0) AS total
    FROM transactions
    WHERE user_id = $1 AND date > $2
    GROUP BY month
  `, [userId, today])).rows;
  const futureTxnMap = {};
  futureTxns.forEach(r => { futureTxnMap[r.month] = parseFloat(r.total); });

  // Active bills
  const bills = (await pool.query(
    'SELECT name, amount, frequency, due_day, last_paid FROM bills WHERE user_id = $1 AND is_active = TRUE',
    [userId]
  )).rows;

  const points = [{
    label:   'Now',
    month:   today.slice(0, 7),
    balance: Math.round(currentBalance * 100) / 100,
  }];
  let running = currentBalance;

  for (let i = 1; i <= months; i++) {
    const d        = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label    = d.toLocaleString('default', { month: 'short', year: '2-digit' });

    if (futureTxnMap[monthStr]) running += futureTxnMap[monthStr];

    for (const bill of bills) {
      const amt = parseFloat(bill.amount);
      switch (bill.frequency) {
        case 'monthly':
          running += amt;
          break;
        case 'semimonthly':
          running += amt * 2;
          break;
        case 'weekly':
          running += amt * 4;
          break;
        case 'biweekly':
          running += amt * 2;
          break;
        case 'annual': {
          const anchor      = bill.last_paid ? new Date(bill.last_paid) : new Date(now.getFullYear() - 1, now.getMonth(), 1);
          const monthsDiff  = (d.getFullYear() - anchor.getFullYear()) * 12 + (d.getMonth() - anchor.getMonth());
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

module.exports = router;
