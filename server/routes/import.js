const router      = require('express').Router();
const AdmZip      = require('adm-zip');
const pool        = require('../pg');
const requireAuth = require('../middleware/requireAuth');
const { parseFile } = require('../lib/parsers');

router.use(requireAuth);

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

// ─── HELPERS ───────────────────────────────────────────────────────────────

const SUPPORTED_EXT = /\.(qif|ofx|qfx|ofc|csv|txt)$/i;

function extractZip(base64Content) {
  const buffer = Buffer.from(base64Content, 'base64');
  const zip    = new AdmZip(buffer);
  const files  = [];
  for (const entry of zip.getEntries()) {
    if (!entry.isDirectory && SUPPORTED_EXT.test(entry.entryName)) {
      files.push({
        filename: entry.name,
        content:  entry.getData().toString('utf8'),
      });
    }
  }
  return files;
}

// ─── ROUTES ────────────────────────────────────────────────────────────────

router.post('/', wrap(async (req, res) => {
  const { content, filename } = req.body;
  if (!content) return res.status(400).json({ error: 'No file content provided' });

  // Expand ZIP into individual files; single file otherwise
  let filesToProcess;
  if (filename && filename.toLowerCase().endsWith('.zip')) {
    try {
      const entries = extractZip(content);
      if (!entries.length) return res.status(400).json({ error: 'ZIP contains no supported files (.qif, .ofx, .csv, etc.)' });
      filesToProcess = entries;
    } catch (err) {
      return res.status(400).json({ error: `Could not read ZIP: ${err.message}` });
    }
  } else {
    filesToProcess = [{ filename, content }];
  }

  let parsed = [], format = 'zip';
  for (const { filename: fn, content: fc } of filesToProcess) {
    try {
      const result = parseFile(fc, fn);
      parsed = parsed.concat(result.parsed);
      if (filesToProcess.length === 1) format = result.format;
    } catch (err) {
      return res.status(400).json({ error: `Parse error in ${fn}: ${err.message}` });
    }
  }

  const userId = req.userId;
  const stats  = { accounts: 0, transactions: 0, skipped: 0, categories: 0 };
  const log    = [];
  const incomeHints = /salary|paycheck|income|deposit|interest|dividend|refund|reimburs/i;
  const colors = ['#6366f1','#f59e0b','#f97316','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#0ea5e9'];

  for (const acct of parsed) {
    if (!acct.transactions.length) continue;

    const acctName = acct.name || 'Imported';
    let accountId;
    const existing = await pool.query(
      'SELECT id FROM accounts WHERE user_id=$1 AND name=$2', [userId, acctName]
    );
    if (existing.rows[0]) {
      accountId = existing.rows[0].id;
    } else {
      const ins = await pool.query(
        'INSERT INTO accounts (user_id, name, type, initial_balance) VALUES ($1,$2,$3,0) RETURNING id',
        [userId, acctName, acct.type || 'checking']
      );
      accountId = ins.rows[0].id;
      stats.accounts++;
    }

    const existingTxns = await pool.query(
      'SELECT date::text, payee, amount FROM transactions WHERE account_id=$1 AND user_id=$2',
      [accountId, userId]
    );
    const seen = new Set(existingTxns.rows.map(t => `${t.date}|${t.payee}|${t.amount}|`));

    for (const txn of acct.transactions) {
      const base = { account: acctName, date: txn.date ?? '', payee: txn.payee ?? '', amount: String(txn.amount ?? '') };

      if (!txn.date) {
        stats.skipped++;
        log.push({ ...base, status: 'skipped', reason: 'invalid or missing date' });
        continue;
      }
      if (txn.amount === undefined) {
        stats.skipped++;
        log.push({ ...base, status: 'skipped', reason: 'missing amount' });
        continue;
      }

      const key = `${txn.date}|${txn.payee ?? ''}|${txn.amount}|${txn.memo ?? ''}`;
      if (seen.has(key)) {
        stats.skipped++;
        log.push({ ...base, status: 'skipped', reason: 'duplicate' });
        continue;
      }
      seen.add(key);

      let catId = null;
      if (txn.category) {
        const leaf = txn.category.split(':').pop()?.trim();
        if (leaf) {
          const existingCat = await pool.query(
            'SELECT id FROM categories WHERE user_id=$1 AND name=$2', [userId, leaf]
          );
          if (existingCat.rows[0]) {
            catId = existingCat.rows[0].id;
          } else {
            const color = colors[Math.floor(Math.random() * colors.length)];
            const type  = incomeHints.test(leaf) ? 'income' : 'expense';
            const ins   = await pool.query(
              'INSERT INTO categories (user_id, name, type, color) VALUES ($1,$2,$3,$4) RETURNING id',
              [userId, leaf, type, color]
            );
            catId = ins.rows[0].id;
            stats.categories++;
          }
        }
      }

      await pool.query(
        `INSERT INTO transactions (user_id, account_id, date, payee, category_id, amount, memo, cleared)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [userId, accountId, txn.date, txn.payee ?? 'Unknown', catId,
         txn.amount, txn.memo ?? '', txn.cleared ? true : false]
      );
      stats.transactions++;
      log.push({ ...base, status: 'imported', reason: '' });
    }
  }

  res.json({ ok: true, format, stats, log });
}));

router.post('/preview', (req, res) => {
  const { content, filename } = req.body;
  if (!content) return res.status(400).json({ error: 'No content' });

  try {
    let filesToProcess, format = 'zip';

    if (filename && filename.toLowerCase().endsWith('.zip')) {
      const entries = extractZip(content);
      if (!entries.length) return res.status(400).json({ error: 'ZIP contains no supported files (.qif, .ofx, .csv, etc.)' });
      filesToProcess = entries;
    } else {
      filesToProcess = [{ filename, content }];
    }

    let allParsed = [];
    for (const { filename: fn, content: fc } of filesToProcess) {
      const result = parseFile(fc, fn);
      allParsed = allParsed.concat(result.parsed);
      if (filesToProcess.length === 1) format = result.format;
    }

    const summary = allParsed.map(a => ({
      name:   a.name,
      type:   a.type,
      count:  a.transactions.length,
      sample: a.transactions.slice(0, 5),
    }));
    res.json({ ok: true, format, summary });
  } catch (err) {
    res.status(400).json({ error: `Parse error: ${err.message}` });
  }
});

module.exports = router;
