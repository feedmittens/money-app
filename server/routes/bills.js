const router = require('express').Router();
const db = require('../db');

router.get('/', (req, res) => {
  const bills = db.prepare(`
    SELECT b.*, c.name AS category_name, c.color AS category_color, a.name AS account_name
    FROM bills b
    LEFT JOIN categories c ON c.id = b.category_id
    LEFT JOIN accounts a ON a.id = b.account_id
    WHERE b.is_active = 1
    ORDER BY b.due_day
  `).all();
  res.json(bills);
});

router.post('/', (req, res) => {
  const { name, amount, due_day, frequency, category_id, account_id } = req.body;
  const result = db.prepare(
    'INSERT INTO bills (name, amount, due_day, frequency, category_id, account_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(name, amount, due_day, frequency, category_id ?? null, account_id ?? null);
  res.json(db.prepare(`
    SELECT b.*, c.name AS category_name, c.color AS category_color, a.name AS account_name
    FROM bills b
    LEFT JOIN categories c ON c.id = b.category_id
    LEFT JOIN accounts a ON a.id = b.account_id
    WHERE b.id = ?
  `).get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { name, amount, due_day, frequency, category_id, account_id, is_active } = req.body;
  db.prepare(`
    UPDATE bills SET name=?, amount=?, due_day=?, frequency=?, category_id=?, account_id=?, is_active=? WHERE id=?
  `).run(name, amount, due_day, frequency, category_id ?? null, account_id ?? null, is_active ?? 1, req.params.id);
  res.json(db.prepare(`
    SELECT b.*, c.name AS category_name, c.color AS category_color, a.name AS account_name
    FROM bills b
    LEFT JOIN categories c ON c.id = b.category_id
    LEFT JOIN accounts a ON a.id = b.account_id
    WHERE b.id = ?
  `).get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM bills WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Pay a bill: creates a transaction and marks last_paid
router.post('/:id/pay', (req, res) => {
  const bill = db.prepare('SELECT * FROM bills WHERE id = ?').get(req.params.id);
  if (!bill) return res.status(404).json({ error: 'Bill not found' });

  const { date, account_id } = req.body;
  const payDate = date || new Date().toISOString().slice(0, 10);
  const acctId = account_id || bill.account_id;

  const txResult = db.prepare(`
    INSERT INTO transactions (account_id, date, payee, category_id, amount, memo, cleared, bill_id)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?)
  `).run(acctId, payDate, bill.name, bill.category_id, bill.amount, `Bill payment`, bill.id);

  db.prepare('UPDATE bills SET last_paid = ? WHERE id = ?').run(payDate, bill.id);

  const txn = db.prepare(`
    SELECT t.*, c.name AS category_name, c.color AS category_color
    FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.id = ?
  `).get(txResult.lastInsertRowid);

  res.json({ transaction: txn, bill: db.prepare('SELECT * FROM bills WHERE id = ?').get(bill.id) });
});

module.exports = router;
