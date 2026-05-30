const router = require('express').Router();
const db = require('../db');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories ORDER BY type, name').all());
});

router.post('/', (req, res) => {
  const { name, type, color = '#6b7280' } = req.body;
  const result = db.prepare('INSERT INTO categories (name, type, color) VALUES (?, ?, ?)').run(name, type, color);
  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const { name, type, color } = req.body;
  db.prepare('UPDATE categories SET name=?, type=?, color=? WHERE id=?').run(name, type, color, req.params.id);
  res.json(db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
