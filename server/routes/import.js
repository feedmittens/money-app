const router      = require('express').Router();
const pool        = require('../pg');
const requireAuth = require('../middleware/requireAuth');

router.use(requireAuth);

const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);

// ─── QIF PARSER ────────────────────────────────────────────────────────────

function parseQifDate(raw) {
  if (!raw) return null;
  // Normalize separators — handles slash, dash, and the apostrophe
  // year separator used by Microsoft Money / older Quicken exports (e.g. "1/ 5'24")
  const s = raw.trim().replace(/[-']/g, '/').replace(/\s+/g, '');
  const parts = s.split('/');
  if (parts.length !== 3) return null;
  let [m, d, y] = parts.map(Number);
  if (y < 100) y += y < 50 ? 2000 : 1900;
  if (!m || !d || !y) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseAmount(raw) {
  if (!raw) return 0;
  return parseFloat(raw.replace(/,/g, '')) || 0;
}

const QIF_ACCOUNT_TYPE = {
  Bank:    'checking',
  CCard:   'credit',
  Cash:    'checking',
  Invst:   'investment',
  'Oth A': 'checking',
  'Oth L': 'credit',
  Savings: 'savings',
};

function parseQif(text) {
  const accounts = [];
  let currentAccount = null;
  let currentTxn = {};
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  function flushTxn() {
    if (currentAccount && (currentTxn.date || currentTxn.amount !== undefined)) {
      currentAccount.transactions.push({ ...currentTxn });
    }
    currentTxn = {};
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) continue;
    const code = line[0];
    const val  = line.slice(1).trim();

    if (line.startsWith('!Account')) {
      flushTxn();
      currentAccount = { name: '', type: 'checking', transactions: [] };
      accounts.push(currentAccount);
      continue;
    }
    if (line.startsWith('!Type:')) {
      const t = line.slice(6).trim();
      if (currentAccount) currentAccount.type = QIF_ACCOUNT_TYPE[t] || 'checking';
      continue;
    }
    if (line.startsWith('!')) continue;

    if (!currentAccount) {
      currentAccount = { name: 'Imported Account', type: 'checking', transactions: [] };
      accounts.push(currentAccount);
    }

    switch (code) {
      case '^':
        flushTxn();
        break;
      case 'D':
        currentTxn.date = parseQifDate(val);
        break;
      case 'T':
        currentTxn.amount = parseAmount(val);
        break;
      case 'U':
        if (currentTxn.amount === undefined) currentTxn.amount = parseAmount(val);
        break;
      case 'P':
        currentTxn.payee = val;
        break;
      case 'M':
        currentTxn.memo = val;
        break;
      case 'L':
        currentTxn.category = val.replace(/^\[|\]$/g, '');
        break;
      case 'C':
        currentTxn.cleared = val === 'X' || val === '*' || val === 'R' ? 1 : 0;
        break;
      case 'N':
        if (currentAccount && currentAccount.transactions.length === 0 && !currentTxn.date) {
          currentAccount.name = val;
        } else {
          currentTxn.checkNum = val;
        }
        break;
      default:
        break;
    }
  }
  flushTxn();

  return accounts.filter(a => a.name || a.transactions.length > 0);
}

// ─── OFX/OFC PARSER ────────────────────────────────────────────────────────

function parseOfxDate(raw) {
  if (!raw) return null;
  const s = raw.trim().slice(0, 8); // YYYYMMDD
  if (s.length < 8) return null;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function parseOfx(text) {
  const ofxStart = text.search(/<OFX>/i);
  const body = ofxStart >= 0 ? text.slice(ofxStart) : text;

  const accounts = [];
  const stmtPattern = /<(?:CC)?STMTRS>([\s\S]*?)<\/(?:CC)?STMTRS>/gi;
  let stmtMatch;

  while ((stmtMatch = stmtPattern.exec(body)) !== null) {
    const block = stmtMatch[1];

    const acctId   = (block.match(/<ACCTID[^>]*>(.*?)(?:<|$)/im) || [])[1]?.trim() || 'Imported';
    const acctType = (block.match(/<ACCTTYPE[^>]*>(.*?)(?:<|$)/im) || [])[1]?.trim()?.toLowerCase();
    const type     = acctType === 'credit' || acctType === 'creditline' ? 'credit'
                   : acctType === 'savings' ? 'savings'
                   : 'checking';

    const acct = { name: acctId, type, transactions: [] };
    accounts.push(acct);

    const trnPattern = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
    let trnMatch;
    while ((trnMatch = trnPattern.exec(block)) !== null) {
      const t = trnMatch[1];
      const get = (tag) => (t.match(new RegExp(`<${tag}[^>]*>(.*?)(?:<|$)`, 'i')) || [])[1]?.trim();
      acct.transactions.push({
        date:    parseOfxDate(get('DTPOSTED')),
        amount:  parseFloat(get('TRNAMT') || '0'),
        payee:   get('NAME') || get('MEMO') || 'Unknown',
        memo:    get('MEMO') || '',
        cleared: 1,
      });
    }
  }

  // SGML fallback
  if (accounts.length === 0) {
    const lines = body.split('\n');
    let inTrn = false, currentTrn = {}, acct = { name: 'Imported', type: 'checking', transactions: [] };
    accounts.push(acct);
    for (const line of lines) {
      const m = line.match(/<([^/][^>]*)>(.*)/);
      if (!m) continue;
      const [, tag, val] = m;
      if (/STMTTRN/i.test(tag)) { inTrn = true; currentTrn = {}; continue; }
      if (inTrn) {
        if (/DTPOSTED/i.test(tag)) currentTrn.date   = parseOfxDate(val.trim());
        if (/TRNAMT/i.test(tag))   currentTrn.amount = parseFloat(val.trim()) || 0;
        if (/^NAME$/i.test(tag))   currentTrn.payee  = val.trim();
        if (/MEMO/i.test(tag))     currentTrn.memo   = val.trim();
        if (/FITID/i.test(tag)) { acct.transactions.push({ ...currentTrn, cleared: 1 }); inTrn = false; }
      }
      if (/ACCTID/i.test(tag)) acct.name = val.trim();
    }
  }

  return accounts;
}

// ─── CSV PARSER ────────────────────────────────────────────────────────────

function parseCsv(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  const find = (...keys) => headers.findIndex(h => keys.some(k => h.includes(k)));

  const dateIdx   = find('date');
  const payeeIdx  = find('payee', 'description', 'merchant', 'name');
  const amtIdx    = find('amount');
  const debitIdx  = find('debit', 'payment', 'withdrawal');
  const creditIdx = find('credit', 'deposit');
  const memoIdx   = find('memo', 'note', 'comment');
  const catIdx    = find('categor');

  const transactions = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].match(/(".*?"|[^,]+|(?<=,)(?=,))/g)?.map(v => v.replace(/^"|"$/g, '').trim()) || [];
    const getCol = (idx) => idx >= 0 ? (cols[idx] || '') : '';

    let amount = 0;
    if (amtIdx >= 0) {
      amount = parseAmount(getCol(amtIdx));
    } else {
      const debit  = parseAmount(getCol(debitIdx));
      const credit = parseAmount(getCol(creditIdx));
      amount = credit > 0 ? credit : -debit;
    }

    const rawDate = getCol(dateIdx);
    if (!rawDate) continue;

    const date = rawDate.match(/^\d{4}-\d{2}-\d{2}$/) ? rawDate : parseQifDate(rawDate);
    if (!date) continue;

    transactions.push({
      date,
      payee:    getCol(payeeIdx) || 'Unknown',
      amount,
      memo:     getCol(memoIdx),
      category: getCol(catIdx),
      cleared:  1,
    });
  }

  return [{ name: 'Imported', type: 'checking', transactions }];
}

// ─── SHARED PARSE HELPER ───────────────────────────────────────────────────

function parseFile(content, filename) {
  const ext = (filename || '').toLowerCase().split('.').pop();
  if (ext === 'ofx' || ext === 'qfx' || ext === 'ofc' || content.includes('<OFX') || content.includes('<ofx')) {
    return { parsed: parseOfx(content), format: ext || 'ofx' };
  }
  if (ext === 'csv' || content.split('\n')[0]?.includes(',')) {
    return { parsed: parseCsv(content), format: 'csv' };
  }
  return { parsed: parseQif(content), format: ext || 'qif' };
}

// ─── ROUTES ────────────────────────────────────────────────────────────────

router.post('/', wrap(async (req, res) => {
  const { content, filename } = req.body;
  if (!content) return res.status(400).json({ error: 'No file content provided' });

  let parsed, format;
  try {
    ({ parsed, format } = parseFile(content, filename));
  } catch (err) {
    return res.status(400).json({ error: `Parse error: ${err.message}` });
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
    const { parsed, format } = parseFile(content, filename);
    const summary = parsed.map(a => ({
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
