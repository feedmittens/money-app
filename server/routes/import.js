const router = require('express').Router();
const db = require('../db');

// ─── QIF PARSER ────────────────────────────────────────────────────────────

function parseQifDate(raw) {
  if (!raw) return null;
  // Normalize: "1/ 5/2024" or "01/05/24" or "1-5-2024"
  const s = raw.trim().replace(/-/g, '/').replace(/\s+/g, '');
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
  let currentType = null;
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
      currentType = t;
      continue;
    }
    if (line.startsWith('!')) continue; // other directives

    // If no current account, create a default one
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
      case 'U': // alt amount field some exporters use
        if (currentTxn.amount === undefined) currentTxn.amount = parseAmount(val);
        break;
      case 'P':
        currentTxn.payee = val;
        break;
      case 'M':
        currentTxn.memo = val;
        break;
      case 'L':
        // Strip leading [ ] from transfer markers
        currentTxn.category = val.replace(/^\[|\]$/g, '');
        break;
      case 'C':
        currentTxn.cleared = val === 'X' || val === '*' || val === 'R' ? 1 : 0;
        break;
      case 'N': // In !Account section: account name; in transactions: check number
        if (currentAccount && currentAccount.transactions.length === 0 && !currentTxn.date) {
          currentAccount.name = val;
        } else {
          currentTxn.checkNum = val;
        }
        break;
      case 'T': // already handled
        break;
      default:
        break;
    }
  }
  flushTxn();

  // Filter out accounts that are just headers with no transactions
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
  // Handle both SGML (legacy) and XML OFX
  // Strip OFX headers (lines before <OFX> or <ofx>)
  const ofxStart = text.search(/<OFX>/i);
  const body = ofxStart >= 0 ? text.slice(ofxStart) : text;

  const accounts = [];

  // Match all STMTRS blocks (bank) or CCSTMTRS blocks (credit card)
  const stmtPattern = /<(?:CC)?STMTRS>([\s\S]*?)<\/(?:CC)?STMTRS>/gi;
  let stmtMatch;

  while ((stmtMatch = stmtPattern.exec(body)) !== null) {
    const block = stmtMatch[1];

    // Account info
    const acctId   = (block.match(/<ACCTID[^>]*>(.*?)(?:<|$)/im) || [])[1]?.trim() || 'Imported';
    const acctType = (block.match(/<ACCTTYPE[^>]*>(.*?)(?:<|$)/im) || [])[1]?.trim()?.toLowerCase();
    const type     = acctType === 'credit' || acctType === 'creditline' ? 'credit'
                   : acctType === 'savings' ? 'savings'
                   : 'checking';

    const acct = { name: acctId, type, transactions: [] };
    accounts.push(acct);

    // Transactions
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

  // SGML fallback (no closing tags) — scan raw fields
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

  const dateIdx     = find('date');
  const payeeIdx    = find('payee', 'description', 'merchant', 'name');
  const amtIdx      = find('amount');
  const debitIdx    = find('debit', 'payment', 'withdrawal');
  const creditIdx   = find('credit', 'deposit');
  const memoIdx     = find('memo', 'note', 'comment');
  const catIdx      = find('categor');

  const transactions = [];
  for (let i = 1; i < lines.length; i++) {
    // Basic CSV parse (handles quoted fields)
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

    // Try ISO first, then M/D/Y
    let date = rawDate.match(/^\d{4}-\d{2}-\d{2}$/) ? rawDate : parseQifDate(rawDate);
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

// ─── IMPORT LOGIC ──────────────────────────────────────────────────────────

function getOrCreateCategory(name) {
  if (!name) return null;
  // Use only the last part of "Income:Salary" style paths
  const leaf = name.split(':').pop().trim();
  if (!leaf) return null;

  const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(leaf);
  if (existing) return existing.id;

  // Guess type from common names
  const incomeHints = /salary|paycheck|income|deposit|interest|dividend|refund|reimburs/i;
  const type = incomeHints.test(leaf) ? 'income' : 'expense';
  const colors = ['#6366f1','#f59e0b','#f97316','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#0ea5e9'];
  const color = colors[Math.floor(Math.random() * colors.length)];

  return db.prepare('INSERT INTO categories (name, type, color) VALUES (?,?,?)').run(leaf, type, color).lastInsertRowid;
}

function getOrCreateAccount(name, type) {
  const existing = db.prepare('SELECT id FROM accounts WHERE name = ?').get(name);
  if (existing) return existing.id;
  return db.prepare('INSERT INTO accounts (name, type, initial_balance) VALUES (?,?,0)').run(name, type).lastInsertRowid;
}

router.post('/', (req, res) => {
  const { content, filename } = req.body;
  if (!content) return res.status(400).json({ error: 'No file content provided' });

  let parsed;
  const ext = (filename || '').toLowerCase().split('.').pop();

  try {
    if (ext === 'ofx' || ext === 'qfx' || ext === 'ofc' || content.includes('<OFX') || content.includes('<ofx')) {
      parsed = parseOfx(content);
    } else if (ext === 'csv' || content.split('\n')[0]?.includes(',')) {
      parsed = parseCsv(content);
    } else {
      // Default to QIF
      parsed = parseQif(content);
    }
  } catch (err) {
    return res.status(400).json({ error: `Parse error: ${err.message}` });
  }

  const stats = { accounts: 0, transactions: 0, skipped: 0, categories: 0 };
  const catsBefore = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;

  const insertTxn = db.prepare(`
    INSERT INTO transactions (account_id, date, payee, category_id, amount, memo, cleared)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Wrap in a transaction for performance
  const runImport = db.transaction(() => {
    for (const acct of parsed) {
      if (!acct.transactions.length) continue;

      const accountId = getOrCreateAccount(acct.name || 'Imported', acct.type || 'checking');
      const isNew = !db.prepare('SELECT id FROM accounts WHERE id = ?').get(accountId - 1);
      if (acct.name) stats.accounts++;

      // Get existing transactions to detect duplicates (same date+payee+amount)
      const existing = db.prepare(
        'SELECT date, payee, amount FROM transactions WHERE account_id = ?'
      ).all(accountId);
      const existingSet = new Set(existing.map(t => `${t.date}|${t.payee}|${t.amount}`));

      for (const txn of acct.transactions) {
        if (!txn.date || txn.amount === undefined) { stats.skipped++; continue; }

        const key = `${txn.date}|${txn.payee || ''}|${txn.amount}`;
        if (existingSet.has(key)) { stats.skipped++; continue; }
        existingSet.add(key);

        const catId = getOrCreateCategory(txn.category);
        insertTxn.run(accountId, txn.date, txn.payee || 'Unknown', catId, txn.amount, txn.memo || '', txn.cleared ?? 0);
        stats.transactions++;
      }
    }
  });

  runImport();

  const catsAfter = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
  stats.categories = catsAfter - catsBefore;

  res.json({ ok: true, stats, accounts: parsed.map(a => ({ name: a.name, type: a.type, count: a.transactions.length })) });
});

// Preview only — parse but don't save
router.post('/preview', (req, res) => {
  const { content, filename } = req.body;
  if (!content) return res.status(400).json({ error: 'No content' });

  let parsed;
  const ext = (filename || '').toLowerCase().split('.').pop();

  try {
    if (ext === 'ofx' || ext === 'qfx' || ext === 'ofc' || content.includes('<OFX') || content.includes('<ofx')) {
      parsed = parseOfx(content);
    } else if (ext === 'csv' || content.split('\n')[0]?.includes(',')) {
      parsed = parseCsv(content);
    } else {
      parsed = parseQif(content);
    }
  } catch (err) {
    return res.status(400).json({ error: `Parse error: ${err.message}` });
  }

  const summary = parsed.map(a => ({
    name: a.name,
    type: a.type,
    count: a.transactions.length,
    sample: a.transactions.slice(0, 5),
  }));

  res.json({ ok: true, format: ext || 'qif', summary });
});

module.exports = router;
