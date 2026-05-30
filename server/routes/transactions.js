const router = require('express').Router();
const db = require('../db');

router.get('/', (req, res) => {
  const { account_id, month } = req.query;
  let query = `
    SELECT t.*, c.name AS category_name, c.color AS category_color
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.account_id = ?
  `;
  const params = [account_id];

  if (month) {
    query += ' AND strftime(\'%Y-%m\', t.date) = ?';
    params.push(month);
  }

  query += ' ORDER BY t.date DESC, t.id DESC';

  const rows = db.prepare(query).all(...params);

  // Compute running balance: start from initial_balance + all older transactions
  const acct = db.prepare('SELECT initial_balance FROM accounts WHERE id = ?').get(account_id);
  if (!acct) return res.status(404).json({ error: 'Account not found' });

  // Get cumulative sum up to (but not including) the filtered set for running balance context
  const allTxns = db.prepare(
    'SELECT amount, date, id FROM transactions WHERE account_id = ? ORDER BY date ASC, id ASC'
  ).all(account_id);

  let runningBalance = acct.initial_balance;
  const balanceMap = {};
  allTxns.forEach(t => {
    runningBalance += t.amount;
    balanceMap[t.id] = runningBalance;
  });

  const result = rows.map(t => ({ ...t, running_balance: balanceMap[t.id] }));
  res.json(result);
});

router.post('/', (req, res) => {
  const { account_id, date, payee, category_id, amount, memo, cleared, transfer_account_id, bill_id } = req.body;
  const result = db.prepare(`
    INSERT INTO transactions (account_id, date, payee, category_id, amount, memo, cleared, transfer_account_id, bill_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(account_id, date, payee, category_id ?? null, amount, memo ?? '', cleared ?? 0, transfer_account_id ?? null, bill_id ?? null);
  res.json(db.prepare(`
    SELECT t.*, c.name AS category_name, c.color AS category_color
    FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.id = ?
  `).get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { date, payee, category_id, amount, memo, cleared } = req.body;
  db.prepare(`
    UPDATE transactions SET date=?, payee=?, category_id=?, amount=?, memo=?, cleared=? WHERE id=?
  `).run(date, payee, category_id ?? null, amount, memo ?? '', cleared ?? 0, req.params.id);
  res.json(db.prepare(`
    SELECT t.*, c.name AS category_name, c.color AS category_color
    FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.id = ?
  `).get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
