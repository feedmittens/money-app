const router = require('express').Router();
const db = require('../db');

router.get('/', (req, res) => {
  const accounts = db.prepare(`
    SELECT a.*,
      COALESCE(a.initial_balance + SUM(t.amount), a.initial_balance) AS balance
    FROM accounts a
    LEFT JOIN transactions t ON t.account_id = a.id
    GROUP BY a.id
    ORDER BY a.created_at
  `).all();
  res.json(accounts);
});

router.post('/', (req, res) => {
  const { name, type, initial_balance = 0 } = req.body;
  const result = db.prepare(
    'INSERT INTO accounts (name, type, initial_balance) VALUES (?, ?, ?)'
  ).run(name, type, initial_balance);
  res.json(db.prepare('SELECT * FROM accounts WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { name, type, initial_balance } = req.body;
  db.prepare('UPDATE accounts SET name=?, type=?, initial_balance=? WHERE id=?')
    .run(name, type, initial_balance, req.params.id);
  res.json(db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
