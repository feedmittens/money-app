const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'money.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('checking','savings','credit','investment')),
    initial_balance REAL DEFAULT 0,
    created_at TEXT DEFAULT (date('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('income','expense')),
    color TEXT DEFAULT '#6b7280'
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    payee TEXT NOT NULL,
    category_id INTEGER,
    amount REAL NOT NULL,
    memo TEXT DEFAULT '',
    cleared INTEGER DEFAULT 0,
    transfer_account_id INTEGER,
    bill_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id, date);

  CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    due_day INTEGER NOT NULL CHECK(due_day BETWEEN 1 AND 31),
    frequency TEXT NOT NULL CHECK(frequency IN ('weekly','biweekly','monthly','annual')),
    category_id INTEGER,
    account_id INTEGER,
    is_active INTEGER DEFAULT 1,
    last_paid TEXT,
    created_at TEXT DEFAULT (date('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (account_id) REFERENCES accounts(id)
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    month TEXT NOT NULL,
    amount REAL NOT NULL,
    UNIQUE(category_id, month),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  );
`);

function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) as n FROM accounts').get().n;
  if (count > 0) return;

  const insertAccount = db.prepare(
    'INSERT INTO accounts (name, type, initial_balance) VALUES (?, ?, ?)'
  );
  const insertCategory = db.prepare(
    'INSERT INTO categories (name, type, color) VALUES (?, ?, ?)'
  );
  const insertTransaction = db.prepare(
    'INSERT INTO transactions (account_id, date, payee, category_id, amount, cleared) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertBill = db.prepare(
    'INSERT INTO bills (name, amount, due_day, frequency, category_id, account_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertBudget = db.prepare(
    'INSERT INTO budgets (category_id, month, amount) VALUES (?, ?, ?)'
  );

  const checking = insertAccount.run('Checking', 'checking', 0).lastInsertRowid;
  const savings   = insertAccount.run('Savings', 'savings', 10000).lastInsertRowid;
  const credit    = insertAccount.run('Credit Card', 'credit', 0).lastInsertRowid;

  const cats = {};
  [
    ['Paycheck',      'income',  '#22c55e'],
    ['Other Income',  'income',  '#86efac'],
    ['Housing',       'expense', '#6366f1'],
    ['Groceries',     'expense', '#f59e0b'],
    ['Dining',        'expense', '#f97316'],
    ['Utilities',     'expense', '#3b82f6'],
    ['Gas',           'expense', '#8b5cf6'],
    ['Entertainment', 'expense', '#ec4899'],
    ['Insurance',     'expense', '#14b8a6'],
    ['Internet',      'expense', '#0ea5e9'],
    ['Subscriptions', 'expense', '#a855f7'],
    ['Personal',      'expense', '#f43f5e'],
  ].forEach(([name, type, color]) => {
    cats[name] = insertCategory.run(name, type, color).lastInsertRowid;
  });

  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const thisMonth = `${y}-${m}`;

  // Seed transactions for current month
  const txns = [
    [checking, `${y}-${m}-01`, 'Opening Deposit',       cats['Other Income'],  3500,   1],
    [checking, `${y}-${m}-05`, 'Employer Payroll',      cats['Paycheck'],      2800,   1],
    [checking, `${y}-${m}-01`, 'Rent Payment',          cats['Housing'],      -1350,   1],
    [checking, `${y}-${m}-03`, 'Kroger',                cats['Groceries'],     -87.42, 1],
    [checking, `${y}-${m}-04`, 'Shell',                 cats['Gas'],           -52.10, 1],
    [checking, `${y}-${m}-06`, 'Netflix',               cats['Subscriptions'], -15.99, 1],
    [checking, `${y}-${m}-07`, 'Chipotle',              cats['Dining'],        -13.75, 1],
    [checking, `${y}-${m}-08`, 'Electric Company',      cats['Utilities'],     -94.22, 1],
    [checking, `${y}-${m}-09`, 'Whole Foods',           cats['Groceries'],    -112.58, 1],
    [checking, `${y}-${m}-10`, 'Spotify',               cats['Subscriptions'],  -9.99, 1],
    [checking, `${y}-${m}-12`, 'Starbucks',             cats['Dining'],         -6.45, 0],
    [checking, `${y}-${m}-14`, 'Target',                cats['Personal'],      -43.20, 0],
    [checking, `${y}-${m}-15`, 'Internet Provider',     cats['Internet'],      -79.99, 0],
    [credit,   `${y}-${m}-04`, 'Amazon',                cats['Personal'],      -67.34, 1],
    [credit,   `${y}-${m}-08`, 'Costco',                cats['Groceries'],    -145.20, 1],
    [credit,   `${y}-${m}-11`, 'Restaurant',            cats['Dining'],        -38.90, 0],
  ];
  txns.forEach(t => insertTransaction.run(...t));

  // Seed bills
  insertBill.run('Rent',              -1350,  1, 'monthly', cats['Housing'],       checking);
  insertBill.run('Electric',           -100,  8, 'monthly', cats['Utilities'],     checking);
  insertBill.run('Internet',           -79.99,15, 'monthly', cats['Internet'],     checking);
  insertBill.run('Netflix',            -15.99, 6, 'monthly', cats['Subscriptions'],checking);
  insertBill.run('Spotify',             -9.99,10, 'monthly', cats['Subscriptions'],checking);
  insertBill.run('Car Insurance',      -145,  20, 'monthly', cats['Insurance'],    checking);
  insertBill.run('Phone Bill',          -75,  25, 'monthly', cats['Utilities'],    checking);

  // Seed budgets
  [
    [cats['Housing'],       1400],
    [cats['Groceries'],      600],
    [cats['Dining'],         250],
    [cats['Utilities'],      200],
    [cats['Gas'],            150],
    [cats['Entertainment'],  100],
    [cats['Subscriptions'],   50],
    [cats['Insurance'],      150],
    [cats['Internet'],        80],
    [cats['Personal'],       200],
  ].forEach(([cid, amt]) => insertBudget.run(cid, thisMonth, amt));
}

seedIfEmpty();

module.exports = db;
