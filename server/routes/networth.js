const router = require('express').Router();
const db = require('../db');

router.get('/', (req, res) => {
  const months = parseInt(req.query.months || '12', 10);
  const accounts = db.prepare('SELECT * FROM accounts ORDER BY id').all();

  const result = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const endStr = endOfMonth.toISOString().slice(0, 10);
    const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });

    let assets = 0;
    let liabilities = 0;

    accounts.forEach(acct => {
      const sumRow = db.prepare(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE account_id = ? AND date <= ?"
      ).get(acct.id, endStr);
      const balance = acct.initial_balance + sumRow.total;

      if (acct.type === 'credit') {
        // Credit card: negative balance = debt (liability), positive = credit (asset)
        if (balance < 0) liabilities += Math.abs(balance);
        else assets += balance;
      } else {
        if (balance >= 0) assets += balance;
        else liabilities += Math.abs(balance);
      }
    });

    result.push({
      label,
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      assets: Math.round(assets * 100) / 100,
      liabilities: Math.round(liabilities * 100) / 100,
      net_worth: Math.round((assets - liabilities) * 100) / 100,
    });
  }

  res.json(result);
});

module.exports = router;
