-- Tally — PostgreSQL schema
-- Run once on first deploy, then only migrations thereafter.
-- Safe to run multiple times (all CREATE TABLE use IF NOT EXISTS).

-- ── Users & Auth ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT    UNIQUE NOT NULL,
  display_name  TEXT,
  password_hash TEXT,                          -- NULL for OAuth-only accounts
  google_id     TEXT    UNIQUE,
  totp_secret   TEXT,                          -- NULL if 2FA not enabled
  totp_enabled  BOOLEAN DEFAULT FALSE,
  role          TEXT    NOT NULL DEFAULT 'user'
                CHECK (role IN ('admin', 'user')),
  status        TEXT    NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'active', 'suspended')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);

-- Session store — managed by connect-pg-simple (createTableIfMissing: true)
-- Table created automatically; listed here for documentation only.

-- ── Financial data ────────────────────────────────────────────────────────────
-- Every table has user_id so data is strictly scoped per user.

CREATE TABLE IF NOT EXISTS accounts (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT    NOT NULL,
  type            TEXT    NOT NULL CHECK (type IN ('checking','savings','credit','investment')),
  initial_balance DECIMAL(15,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

CREATE TABLE IF NOT EXISTS categories (
  id      SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name    TEXT    NOT NULL,
  type    TEXT    NOT NULL CHECK (type IN ('income','expense')),
  color   TEXT    DEFAULT '#6b7280',
  UNIQUE (user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);

CREATE TABLE IF NOT EXISTS transactions (
  id                  SERIAL PRIMARY KEY,
  user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id          INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  date                DATE    NOT NULL,
  payee               TEXT    NOT NULL,
  category_id         INTEGER REFERENCES categories(id),
  amount              DECIMAL(15,2) NOT NULL,
  memo                TEXT    DEFAULT '',
  cleared             BOOLEAN DEFAULT FALSE,
  tax_relevant        BOOLEAN DEFAULT FALSE,
  transfer_account_id INTEGER REFERENCES accounts(id),
  bill_id             INTEGER,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_txn_user        ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_txn_account     ON transactions(account_id, date);
CREATE INDEX IF NOT EXISTS idx_txn_account_usr ON transactions(account_id, user_id, date DESC, id DESC);

-- Migration: transfer peer link (safe to run repeatedly)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transfer_peer_id INTEGER;

CREATE TABLE IF NOT EXISTS bills (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  amount      DECIMAL(15,2) NOT NULL,
  due_day     INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  due_day_2   INTEGER CHECK (due_day_2 BETWEEN 1 AND 31),
  frequency   TEXT    NOT NULL CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','annual','semimonthly','custom')),
  category_id INTEGER REFERENCES categories(id),
  account_id  INTEGER REFERENCES accounts(id),
  is_active   BOOLEAN DEFAULT TRUE,
  last_paid   DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bills_user ON bills(user_id);

-- Migration: semimonthly + custom frequency (safe to run repeatedly)
ALTER TABLE bills ADD COLUMN IF NOT EXISTS due_day_2   INTEGER CHECK (due_day_2 BETWEEN 1 AND 31);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS custom_days TEXT;
ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_frequency_check;
ALTER TABLE bills ADD CONSTRAINT bills_frequency_check
  CHECK (frequency IN ('weekly','biweekly','monthly','quarterly','annual','semimonthly','custom'));

-- Migration: auto-post flag
ALTER TABLE bills ADD COLUMN IF NOT EXISTS auto_post BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS budgets (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  month       TEXT    NOT NULL,    -- 'YYYY-MM'
  amount      DECIMAL(15,2) NOT NULL,
  UNIQUE (user_id, category_id, month)
);
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);

CREATE TABLE IF NOT EXISTS attachments (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  filename       TEXT    NOT NULL,
  mime_type      TEXT    NOT NULL,
  size           INTEGER NOT NULL,
  data           BYTEA   NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attach_txn ON attachments(transaction_id);
