const router = require('express').Router();
const db = require('../db');

router.get('/', (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);

  const budgets = db.prepare(`
    SELECT b.*, c.name AS category_name, c.color AS category_color,
      COALESCE((
        SELECT SUM(t.amount)
        FROM transactions t
        WHERE t.category_id = b.category_id
          AND strftime('%Y-%m', t.date) = b.month
      ), 0) AS actual
    FROM budgets b
    JOIN categories c ON c.id = b.category_id
    WHERE b.month = ?
    ORDER BY c.name
  `).all(month);

  // Also include expense categories without a budget for this month
  const budgetCatIds = budgets.map(b => b.category_id);
  const unbudgeted = db.prepare(`
    SELECT c.id AS category_id, c.name AS category_name, c.color AS category_color,
      0 AS amount,
      COALESCE((
        SELECT SUM(t.amount)
        FROM transactions t
        WHERE t.category_id = c.id
          AND strftime('%Y-%m', t.date) = ?
      ), 0) AS actual,
      NULL AS id, ? AS month
    FROM categories c
    WHERE c.type = 'expense'
      ${budgetCatIds.length ? `AND c.id NOT IN (${budgetCatIds.map(() => '?').join(',')})` : ''}
    HAVING actual != 0
    ORDER BY c.name
  `).all(month, month, ...budgetCatIds);

  res.json([...budgets, ...unbudgeted]);
});

router.post('/', (req, res) => {
  const { category_id, month, amount } = req.body;
  const existing = db.prepare('SELECT id FROM budgets WHERE category_id=? AND month=?').get(category_id, month);
  if (existing) {
    db.prepare('UPDATE budgets SET amount=? WHERE id=?').run(amount, existing.id);
    return res.json(db.prepare('SELECT * FROM budgets WHERE id=?').get(existing.id));
  }
  const result = db.prepare('INSERT INTO budgets (category_id, month, amount) VALUES (?, ?, ?)').run(category_id, month, amount);
  res.json(db.prepare('SELECT * FROM budgets WHERE id=?').get(result.lastInsertRowid));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
