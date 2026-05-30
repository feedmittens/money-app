/**
 * Browser-side SQLite via sql.js (WASM).
 * The database lives in a .db file on the user's local PC.
 * Nothing is sent to any server.
 */
import initSqlJs from 'sql.js';
import type { Database, SqlValue, QueryExecResult } from 'sql.js';
import type { Account, Category, Transaction, Bill, BudgetRow, NetWorthPoint } from './types';

// ── Module state ────────────────────────────────────────────────────────────
let _SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null;
let _db: Database | null = null;
let _fileHandle: FileSystemFileHandle | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

// Callbacks so components can react to save/load events
let _onLoaded: (() => void) | null = null;
let _onSaved: (() => void) | null = null;

export function setOnLoaded(fn: () => void) { _onLoaded = fn; }
export function setOnSaved(fn: () => void)  { _onSaved = fn; }
export function isLoaded(): boolean { return _db !== null; }

// ── sql.js bootstrap ────────────────────────────────────────────────────────
async function getSql() {
  if (!_SQL) {
    _SQL = await initSqlJs({ locateFile: () => '/sql-wasm.wasm' });
  }
  return _SQL;
}

// ── File I/O ────────────────────────────────────────────────────────────────
export async function openFile(): Promise<boolean> {
  try {
    if ('showOpenFilePicker' in window) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'Money database', accept: { 'application/x-sqlite3': ['.db'] } }],
      });
      const file = await handle.getFile();
      const buf  = await file.arrayBuffer();
      const SQL  = await getSql();
      _db?.close();
      _db = new SQL.Database(new Uint8Array(buf));
      _fileHandle = handle;
    } else {
      const file = await pickFileFallback();
      if (!file) return false;
      const buf = await file.arrayBuffer();
      const SQL = await getSql();
      _db?.close();
      _db = new SQL.Database(new Uint8Array(buf));
      _fileHandle = null;
    }
    _onLoaded?.();
    return true;
  } catch (e: unknown) {
    if ((e as { name?: string }).name === 'AbortError') return false;
    throw e;
  }
}

export async function createNew(): Promise<void> {
  const SQL = await getSql();
  _db?.close();
  _db = new SQL.Database();
  _fileHandle = null;

  if ('showSaveFilePicker' in window) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      _fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: 'my-finances.db',
        types: [{ description: 'Money database', accept: { 'application/x-sqlite3': ['.db'] } }],
      });
    } catch (e: unknown) {
      if ((e as { name?: string }).name !== 'AbortError') throw e;
    }
  }

  initSchema();
  seedSampleData();
  await saveNow();
  _onLoaded?.();
}

function pickFileFallback(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.db';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export async function saveNow(): Promise<void> {
  if (!_db) return;
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  const data = _db.export();

  if (_fileHandle) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const writable = await (_fileHandle as any).createWritable();
      await writable.write(data);
      await writable.close();
      _onSaved?.();
    } catch (e) {
      console.error('[money] auto-save failed:', e);
    }
  } else {
    // No file handle (Firefox / user cancelled picker) — offer download
    const blob = new Blob([data.buffer as ArrayBuffer], { type: 'application/x-sqlite3' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'my-finances.db' });
    a.click();
    URL.revokeObjectURL(url);
    _onSaved?.();
  }
}

function markDirty() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveNow, 1500);
}

// ── Internal helpers ────────────────────────────────────────────────────────
function db(): Database {
  if (!_db) throw new Error('No database loaded');
  return _db;
}

type Row = Record<string, SqlValue>;

function toRows<T>(result: QueryExecResult[]): T[] {
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map(vals => {
    const obj: Row = {};
    columns.forEach((col, i) => { obj[col] = vals[i]; });
    return obj as unknown as T;
  });
}

function execQ<T>(sql: string, params?: SqlValue[]): T[] {
  return toRows<T>(db().exec(sql, params));
}

function execOne<T>(sql: string, params?: SqlValue[]): T | null {
  return execQ<T>(sql, params)[0] ?? null;
}

function runInsert(sql: string, params?: SqlValue[]): number {
  db().run(sql, params ?? []);
  return (db().exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] as number) || 0;
}

// ── Schema ──────────────────────────────────────────────────────────────────
function initSchema() {
  db().exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      initial_balance REAL DEFAULT 0,
      created_at TEXT DEFAULT (date('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
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

    CREATE INDEX IF NOT EXISTS idx_txn_account ON transactions(account_id, date);

    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      due_day INTEGER NOT NULL,
      frequency TEXT NOT NULL,
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
}

// ── Seed data ───────────────────────────────────────────────────────────────
function seedSampleData() {
  const now  = new Date();
  const y    = now.getFullYear();
  const mo   = String(now.getMonth() + 1).padStart(2, '0');
  const thisMonth = `${y}-${mo}`;

  const checkingId = runInsert('INSERT INTO accounts (name,type,initial_balance) VALUES (?,?,?)', ['Checking','checking',0]);
  runInsert('INSERT INTO accounts (name,type,initial_balance) VALUES (?,?,?)', ['Savings','savings',10000]);
  const creditId = runInsert('INSERT INTO accounts (name,type,initial_balance) VALUES (?,?,?)', ['Credit Card','credit',0]);

  const cats: Record<string, number> = {};
  const catDefs: [string, string, string][] = [
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
  ];
  catDefs.forEach(([name, type, color]) => {
    cats[name] = runInsert('INSERT INTO categories (name,type,color) VALUES (?,?,?)', [name, type, color]);
  });

  const T = (acct: number, d: string, payee: string, cat: string, amount: number, cleared = 1) =>
    runInsert('INSERT INTO transactions (account_id,date,payee,category_id,amount,cleared) VALUES (?,?,?,?,?,?)',
      [acct, `${y}-${mo}-${d}`, payee, cats[cat], amount, cleared]);

  T(checkingId,'01','Opening Deposit',  'Other Income',  3500);
  T(checkingId,'05','Employer Payroll', 'Paycheck',      2800);
  T(checkingId,'01','Rent Payment',     'Housing',      -1350);
  T(checkingId,'03','Kroger',           'Groceries',    -87.42);
  T(checkingId,'04','Shell',            'Gas',          -52.10);
  T(checkingId,'06','Netflix',          'Subscriptions',-15.99);
  T(checkingId,'07','Chipotle',         'Dining',       -13.75);
  T(checkingId,'08','Electric Company', 'Utilities',    -94.22);
  T(checkingId,'09','Whole Foods',      'Groceries',   -112.58);
  T(checkingId,'10','Spotify',          'Subscriptions', -9.99);
  T(checkingId,'12','Starbucks',        'Dining',        -6.45, 0);
  T(checkingId,'14','Target',           'Personal',     -43.20, 0);
  T(checkingId,'15','Internet Provider','Internet',     -79.99, 0);
  T(creditId,  '04','Amazon',           'Personal',     -67.34);
  T(creditId,  '08','Costco',           'Groceries',   -145.20);
  T(creditId,  '11','Restaurant',       'Dining',       -38.90, 0);

  const B = (name: string, amount: number, dueDay: number, freq: string, cat: string, acct: number) =>
    runInsert('INSERT INTO bills (name,amount,due_day,frequency,category_id,account_id) VALUES (?,?,?,?,?,?)',
      [name, amount, dueDay, freq, cats[cat], acct]);

  B('Rent',          -1350,  1, 'monthly', 'Housing',       checkingId);
  B('Electric',       -100,  8, 'monthly', 'Utilities',     checkingId);
  B('Internet',     -79.99, 15, 'monthly', 'Internet',      checkingId);
  B('Netflix',      -15.99,  6, 'monthly', 'Subscriptions', checkingId);
  B('Spotify',       -9.99, 10, 'monthly', 'Subscriptions', checkingId);
  B('Car Insurance',  -145, 20, 'monthly', 'Insurance',     checkingId);
  B('Phone Bill',      -75, 25, 'monthly', 'Utilities',     checkingId);

  const budgetDefs: [string, number][] = [
    ['Housing',1400],['Groceries',600],['Dining',250],['Utilities',200],
    ['Gas',150],['Entertainment',100],['Subscriptions',50],['Insurance',150],
    ['Internet',80],['Personal',200],
  ];
  budgetDefs.forEach(([cat, amt]) =>
    runInsert('INSERT INTO budgets (category_id,month,amount) VALUES (?,?,?)', [cats[cat], thisMonth, amt])
  );
}

// ── Accounts ────────────────────────────────────────────────────────────────
export function getAccounts(): Account[] {
  return execQ<Account>(`
    SELECT a.*, COALESCE(a.initial_balance + SUM(t.amount), a.initial_balance) AS balance
    FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
    GROUP BY a.id ORDER BY a.created_at
  `);
}

export function createAccount(data: Omit<Account, 'id' | 'balance'>): Account {
  const id = runInsert('INSERT INTO accounts (name,type,initial_balance) VALUES (?,?,?)',
    [data.name, data.type, data.initial_balance]);
  markDirty();
  return execOne<Account>('SELECT * FROM accounts WHERE id=?', [id])!;
}

export function updateAccount(id: number, data: Partial<Account>): Account {
  db().run('UPDATE accounts SET name=?,type=?,initial_balance=? WHERE id=?',
    [data.name!, data.type!, data.initial_balance!, id]);
  markDirty();
  return execOne<Account>('SELECT * FROM accounts WHERE id=?', [id])!;
}

export function deleteAccount(id: number): void {
  db().run('DELETE FROM accounts WHERE id=?', [id]);
  markDirty();
}

// ── Categories ──────────────────────────────────────────────────────────────
export function getCategories(): Category[] {
  return execQ<Category>('SELECT * FROM categories ORDER BY type, name');
}

export function createCategory(data: Omit<Category, 'id'>): Category {
  const id = runInsert('INSERT INTO categories (name,type,color) VALUES (?,?,?)',
    [data.name, data.type, data.color]);
  markDirty();
  return execOne<Category>('SELECT * FROM categories WHERE id=?', [id])!;
}

export function updateCategory(id: number, data: Partial<Category>): Category {
  db().run('UPDATE categories SET name=?,type=?,color=? WHERE id=?',
    [data.name!, data.type!, data.color!, id]);
  markDirty();
  return execOne<Category>('SELECT * FROM categories WHERE id=?', [id])!;
}

export function deleteCategory(id: number): void {
  db().run('DELETE FROM categories WHERE id=?', [id]);
  markDirty();
}

// ── Transactions ────────────────────────────────────────────────────────────
export function getTransactions(accountId: number, month?: string): Transaction[] {
  const acct = execOne<Account>('SELECT initial_balance FROM accounts WHERE id=?', [accountId]);
  if (!acct) return [];

  // Full history for running balance
  const all = execQ<{ id: number; amount: number }>(`
    SELECT id, amount FROM transactions WHERE account_id=? ORDER BY date ASC, id ASC
  `, [accountId]);
  let running = acct.initial_balance;
  const balMap: Record<number, number> = {};
  all.forEach(t => { running += t.amount; balMap[t.id] = running; });

  // Filtered rows
  const rows = execQ<Transaction>(`
    SELECT t.*, c.name AS category_name, c.color AS category_color
    FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.account_id=? ${month ? "AND strftime('%Y-%m', t.date)=?" : ''}
    ORDER BY t.date DESC, t.id DESC
  `, month ? [accountId, month] : [accountId]);

  return rows.map(r => ({ ...r, running_balance: balMap[r.id] ?? 0 }));
}

export function createTransaction(data: Partial<Transaction>): Transaction {
  const id = runInsert(`
    INSERT INTO transactions (account_id,date,payee,category_id,amount,memo,cleared,transfer_account_id,bill_id)
    VALUES (?,?,?,?,?,?,?,?,?)
  `, [data.account_id!, data.date!, data.payee!, data.category_id ?? null,
      data.amount!, data.memo ?? '', data.cleared ?? 0,
      data.transfer_account_id ?? null, data.bill_id ?? null]);
  markDirty();
  return execOne<Transaction>(`
    SELECT t.*, c.name AS category_name, c.color AS category_color
    FROM transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE t.id=?
  `, [id])!;
}

export function updateTransaction(id: number, data: Partial<Transaction>): Transaction {
  db().run('UPDATE transactions SET date=?,payee=?,category_id=?,amount=?,memo=?,cleared=? WHERE id=?',
    [data.date!, data.payee!, data.category_id ?? null, data.amount!, data.memo ?? '', data.cleared ?? 0, id]);
  markDirty();
  return execOne<Transaction>(`
    SELECT t.*, c.name AS category_name, c.color AS category_color
    FROM transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE t.id=?
  `, [id])!;
}

export function deleteTransaction(id: number): void {
  db().run('DELETE FROM transactions WHERE id=?', [id]);
  markDirty();
}

// ── Bills ───────────────────────────────────────────────────────────────────
export function getBills(): Bill[] {
  return execQ<Bill>(`
    SELECT b.*, c.name AS category_name, c.color AS category_color, a.name AS account_name
    FROM bills b
    LEFT JOIN categories c ON c.id=b.category_id
    LEFT JOIN accounts a ON a.id=b.account_id
    WHERE b.is_active=1 ORDER BY b.due_day
  `);
}

export function createBill(data: Partial<Bill>): Bill {
  const id = runInsert('INSERT INTO bills (name,amount,due_day,frequency,category_id,account_id) VALUES (?,?,?,?,?,?)',
    [data.name!, data.amount!, data.due_day!, data.frequency!, data.category_id ?? null, data.account_id ?? null]);
  markDirty();
  return execOne<Bill>(`
    SELECT b.*, c.name AS category_name, c.color AS category_color, a.name AS account_name
    FROM bills b LEFT JOIN categories c ON c.id=b.category_id LEFT JOIN accounts a ON a.id=b.account_id WHERE b.id=?
  `, [id])!;
}

export function updateBill(id: number, data: Partial<Bill>): Bill {
  db().run('UPDATE bills SET name=?,amount=?,due_day=?,frequency=?,category_id=?,account_id=?,is_active=? WHERE id=?',
    [data.name!, data.amount!, data.due_day!, data.frequency!, data.category_id ?? null,
     data.account_id ?? null, data.is_active ?? 1, id]);
  markDirty();
  return execOne<Bill>(`
    SELECT b.*, c.name AS category_name, c.color AS category_color, a.name AS account_name
    FROM bills b LEFT JOIN categories c ON c.id=b.category_id LEFT JOIN accounts a ON a.id=b.account_id WHERE b.id=?
  `, [id])!;
}

export function deleteBill(id: number): void {
  db().run('DELETE FROM bills WHERE id=?', [id]);
  markDirty();
}

export function payBill(billId: number, date?: string, accountId?: number): { transaction: Transaction; bill: Bill } {
  const bill = execOne<Bill>('SELECT * FROM bills WHERE id=?', [billId]);
  if (!bill) throw new Error('Bill not found');
  const payDate = date ?? new Date().toISOString().slice(0, 10);
  const acctId  = accountId ?? bill.account_id;

  const txId = runInsert(`
    INSERT INTO transactions (account_id,date,payee,category_id,amount,memo,cleared,bill_id)
    VALUES (?,?,?,?,?,?,1,?)
  `, [acctId!, payDate, bill.name, bill.category_id ?? null, bill.amount, 'Bill payment', billId]);

  db().run('UPDATE bills SET last_paid=? WHERE id=?', [payDate, billId]);
  markDirty();

  return {
    transaction: execOne<Transaction>(`
      SELECT t.*, c.name AS category_name, c.color AS category_color
      FROM transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE t.id=?
    `, [txId])!,
    bill: execOne<Bill>('SELECT * FROM bills WHERE id=?', [billId])!,
  };
}

// ── Budgets ─────────────────────────────────────────────────────────────────
export function getBudgets(month: string): BudgetRow[] {
  const budgeted = execQ<BudgetRow>(`
    SELECT b.*, c.name AS category_name, c.color AS category_color,
      COALESCE((
        SELECT SUM(t.amount) FROM transactions t
        WHERE t.category_id=b.category_id AND strftime('%Y-%m',t.date)=b.month
      ), 0) AS actual
    FROM budgets b JOIN categories c ON c.id=b.category_id
    WHERE b.month=? ORDER BY c.name
  `, [month]);

  const usedIds = budgeted.map(r => r.category_id);
  const placeholder = usedIds.length ? usedIds.map(() => '?').join(',') : 'NULL';
  const unbudgeted = execQ<BudgetRow>(`
    SELECT c.id AS category_id, c.name AS category_name, c.color AS category_color,
      0 AS amount, NULL AS id, ? AS month,
      COALESCE((
        SELECT SUM(t.amount) FROM transactions t
        WHERE t.category_id=c.id AND strftime('%Y-%m',t.date)=?
      ), 0) AS actual
    FROM categories c
    WHERE c.type='expense' ${usedIds.length ? `AND c.id NOT IN (${placeholder})` : ''}
    HAVING actual != 0 ORDER BY c.name
  `, [month, month, ...usedIds]);

  return [...budgeted, ...unbudgeted];
}

export function saveBudget(data: { category_id: number; month: string; amount: number }): BudgetRow {
  const existing = execOne<{ id: number }>('SELECT id FROM budgets WHERE category_id=? AND month=?',
    [data.category_id, data.month]);
  if (existing) {
    db().run('UPDATE budgets SET amount=? WHERE id=?', [data.amount, existing.id]);
    markDirty();
    return execOne<BudgetRow>('SELECT * FROM budgets WHERE id=?', [existing.id])!;
  }
  const id = runInsert('INSERT INTO budgets (category_id,month,amount) VALUES (?,?,?)',
    [data.category_id, data.month, data.amount]);
  markDirty();
  return execOne<BudgetRow>('SELECT * FROM budgets WHERE id=?', [id])!;
}

export function deleteBudget(id: number): void {
  db().run('DELETE FROM budgets WHERE id=?', [id]);
  markDirty();
}

// ── Import ──────────────────────────────────────────────────────────────────

interface ParsedTxn {
  date: string | null;
  amount?: number;
  payee?: string;
  memo?: string;
  category?: string;
  cleared?: number;
}

interface ParsedAccount {
  name: string;
  type: string;
  transactions: ParsedTxn[];
}

export function importData(accounts: ParsedAccount[]): { accounts: number; transactions: number; skipped: number; categories: number } {
  const catsBefore = execOne<{ n: number }>('SELECT COUNT(*) AS n FROM categories')?.n ?? 0;
  const stats = { accounts: 0, transactions: 0, skipped: 0, categories: 0 };
  const colors = ['#6366f1', '#f59e0b', '#f97316', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#0ea5e9'];
  const incomeHints = /salary|paycheck|income|deposit|interest|dividend|refund|reimburs/i;

  for (const acct of accounts) {
    if (!acct.transactions.length) continue;

    const acctName = acct.name || 'Imported';
    const existing = execOne<{ id: number }>('SELECT id FROM accounts WHERE name=?', [acctName]);
    let accountId: number;
    if (existing) {
      accountId = existing.id;
    } else {
      accountId = runInsert(
        'INSERT INTO accounts (name,type,initial_balance) VALUES (?,?,0)',
        [acctName, acct.type || 'checking']
      );
      stats.accounts++;
    }

    const existingTxns = execQ<{ date: string; payee: string | null; amount: number }>(
      'SELECT date, payee, amount FROM transactions WHERE account_id=?', [accountId]
    );
    const seen = new Set(existingTxns.map(t => `${t.date}|${t.payee ?? ''}|${t.amount}`));

    for (const txn of acct.transactions) {
      if (!txn.date || txn.amount === undefined) { stats.skipped++; continue; }

      const key = `${txn.date}|${txn.payee ?? ''}|${txn.amount}`;
      if (seen.has(key)) { stats.skipped++; continue; }
      seen.add(key);

      let catId: number | null = null;
      if (txn.category) {
        const leaf = txn.category.split(':').pop()?.trim();
        if (leaf) {
          const existingCat = execOne<{ id: number }>('SELECT id FROM categories WHERE name=?', [leaf]);
          catId = existingCat
            ? existingCat.id
            : runInsert(
                'INSERT INTO categories (name,type,color) VALUES (?,?,?)',
                [leaf, incomeHints.test(leaf) ? 'income' : 'expense',
                 colors[Math.floor(Math.random() * colors.length)]]
              );
        }
      }

      runInsert(
        'INSERT INTO transactions (account_id,date,payee,category_id,amount,memo,cleared) VALUES (?,?,?,?,?,?,?)',
        [accountId, txn.date, txn.payee ?? 'Unknown', catId, txn.amount, txn.memo ?? '', txn.cleared ?? 0]
      );
      stats.transactions++;
    }
  }

  const catsAfter = execOne<{ n: number }>('SELECT COUNT(*) AS n FROM categories')?.n ?? 0;
  stats.categories = catsAfter - catsBefore;
  markDirty();
  return stats;
}

// ── Net Worth ───────────────────────────────────────────────────────────────
export function getNetWorth(months: number): NetWorthPoint[] {
  const accounts = getAccounts();
  const now = new Date();
  const result: NetWorthPoint[] = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
    const label = d.toLocaleString('default', { month: 'short', year: '2-digit' });
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

    let assets = 0, liabilities = 0;
    accounts.forEach(acct => {
      const row = execOne<{ total: number }>(
        'SELECT COALESCE(SUM(amount),0) AS total FROM transactions WHERE account_id=? AND date<=?',
        [acct.id, end]
      );
      const balance = acct.initial_balance + (row?.total ?? 0);
      if (acct.type === 'credit') {
        if (balance < 0) liabilities += Math.abs(balance);
        else assets += balance;
      } else {
        if (balance >= 0) assets += balance;
        else liabilities += Math.abs(balance);
      }
    });

    result.push({
      label, month,
      assets:      Math.round(assets * 100) / 100,
      liabilities: Math.round(liabilities * 100) / 100,
      net_worth:   Math.round((assets - liabilities) * 100) / 100,
    });
  }

  return result;
}
