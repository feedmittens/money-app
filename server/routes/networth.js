const router      = require('express').Router();
const pool        = require('../pg');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

const uid = req => req.session.userId;

router.get('/', async (req, res) => {
  const months   = parseInt(req.query.months || '12', 10);
  const accounts = (await pool.query(
    'SELECT * FROM accounts WHERE user_id=$1 ORDER BY id', [uid(req)]
  )).rows;

  const result = [];
  const now    = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });

    let assets = 0, liabilities = 0;

    for (const acct of accounts) {
      const sumRow = (await pool.query(
        'SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE account_id=$1 AND user_id=$2 AND date<=$3',
        [acct.id, uid(req), end]
      )).rows[0];
      const balance = parseFloat(acct.initial_balance) + parseFloat(sumRow.total);

      if (acct.type === 'credit') {
        if (balance < 0) liabilities += Math.abs(balance);
        else assets += balance;
      } else {
        if (balance >= 0) assets += balance;
        else liabilities += Math.abs(balance);
      }
    }

    result.push({
      label,
      month:       `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      assets:      Math.round(assets * 100) / 100,
      liabilities: Math.round(liabilities * 100) / 100,
      net_worth:   Math.round((assets - liabilities) * 100) / 100,
    });
  }

  res.json(result);
});

module.exports = router;
