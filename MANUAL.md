# Tally — User Manual

**Version:** 1.12.0  
**Last updated:** 2026-06-16  
**Source:** https://github.com/feedmittens/money-app

> Convert to PDF: `pandoc MANUAL.md -o Tally-Manual.pdf` (requires pandoc + a PDF engine like wkhtmltopdf or LaTeX)

---

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Dashboard](#dashboard)
4. [Accounts](#accounts)
5. [Transaction Register](#transaction-register)
6. [Bills & Income](#bills--income)
7. [Budget](#budget)
8. [Net Worth](#net-worth)
9. [Reports](#reports)
10. [Search](#search)
11. [Import](#import)
12. [Account Settings & Security](#account-settings--security)
13. [Admin Panel](#admin-panel)
14. [Technical Reference](#technical-reference)

---

## Overview

Tally is a self-hosted personal finance tracker. All financial data is stored in a PostgreSQL database on your own server — no third-party cloud sync, no subscription, no data sharing.

**Key capabilities:**
- Track checking, savings, credit card, and investment accounts
- Record and categorize transactions
- Track recurring bills and income
- Monthly budget tracking by category
- Net worth history chart
- Balance forecast up to 36 months
- Import transactions from QIF, OFX/QFX, and CSV files
- Tax-relevant transaction tagging with file attachments
- Financial news feed (NPR Business, BBC Business)
- Multi-user support with admin approval and optional 2FA

---

## Getting Started

### Registration

New accounts require admin approval before first sign-in.

1. Navigate to the app URL (e.g., `https://192.168.1.126`)
2. Click **Register** on the sign-in page
3. Enter your display name, email, and a password (minimum 8 characters)
4. Click **Create Account**
5. Your account will show as pending until an admin approves it

> **Admin accounts:** If your email matches the `ADMIN_EMAIL` environment variable set by the server administrator, your account is automatically approved and granted admin privileges.

### Signing In

1. Enter your email and password on the sign-in page
2. Click **Sign In**
3. If 2FA is enabled on your account, enter the 6-digit code from your authenticator app

### Google OAuth

If configured by the server administrator, you can sign in with Google using the **Sign in with Google** button. The first Google sign-in creates a pending account (or links to an existing account with the same email).

---

## Dashboard

The Dashboard is the home screen, showing a financial overview at a glance.

**Sections:**

- **KPI Cards** — Net Worth, Total Assets, Total Liabilities, and each individual account balance
- **12-Month Forecast** — Area chart projecting your total balance over the next year based on scheduled bills and pre-entered future transactions
- **Upcoming Bills & Income** — All bills/income due within the next 30 days, sorted by due date. Items due within 3 days are highlighted in red
- **Financial News** — Recent articles from NPR Business and BBC Business, refreshed hourly from the server

Click **Tally** in the top-left to open the GitHub repository.

---

## Accounts

### Account Types

| Type | Description |
|---|---|
| Checking | Standard bank account; positive balance = money you have |
| Savings | Same as checking; shown separately for organization |
| Credit Card | Negative balance = money you owe; positive = credit |
| Investment | Brokerage, retirement, etc. |

### Adding an Account

1. Click **+ Add Account** in the left sidebar
2. Enter a name, select a type, and enter the opening balance
3. Click **Add**

> **Opening balance:** Enter the balance as of the date you start tracking. For credit cards, enter the current balance as a negative number (e.g., `-2400` if you owe $2,400).

### Editing or Deleting an Account

Click the ✏ pencil icon next to an account name in the sidebar. From the edit form you can rename it, change the type, adjust the opening balance, or permanently delete the account and all its transactions.

---

## Transaction Register

Each account has a register — a chronological list of all transactions with a running balance.

### Adding a Transaction

The form at the top of the register is always visible.

| Field | Notes |
|---|---|
| Date | Defaults to today. Future dates are allowed (they appear in the forecast). |
| Payee | Who was paid / who paid you. Autocomplete suggests from existing payees. |
| Category | Optional. Choose from income or expense categories. |
| Payment | A debit (money out). Enter as a positive number. |
| Deposit | A credit (money in). Enter as a positive number. |
| Memo | Optional free-text note. |
| Tax relevant | Check this to flag the transaction for the tax report. |

Click **Add Transaction** to save.

### Editing a Transaction

Double-click any row to load it into the edit form. Make changes and click **Save Changes**. Click **Cancel** to discard.

### Clearing Transactions

Click the circle indicator (●) in the far-left column to toggle a transaction between uncleared and cleared. Cleared transactions have been verified against a bank statement.

### Attachments

When editing an existing transaction, an **Attachments** section appears. Click **+ Attach file** to upload a receipt, statement, or any document (max 10 MB per file). Attachments are stored in the database.

To download an attachment, click its filename link. To delete it, click ✕ next to it.

### Make Recurring

Click the 🔁 button on any transaction row to convert it into a recurring bill. A dialog lets you choose the frequency (monthly, weekly, biweekly, or annual). The transaction remains in the register as historical data; the new bill will track future occurrences.

### Filtering by Month

Use the month selector in the top-right of the register to filter to a specific month. Select **All time** to see every transaction.

---

## Bills & Income

Bills track recurring expenses and income (paychecks, subscriptions, rent, etc.).

### Adding a Bill

Click **+ Add Bill / Income** and fill in:

| Field | Notes |
|---|---|
| Name | Descriptive name (e.g., "Electric Bill", "Paycheck") |
| Amount | Use a negative number for expenses, positive for income |
| Due Day | Day of the month (1–28) the bill is due |
| Frequency | Monthly, weekly, bi-weekly, or annual |
| Category | Optional |
| Account | Optional — the account it's typically paid from/deposited to |

### Paying a Bill

Click **Pay** on a bill to record a payment. A dialog lets you confirm the date and account. This creates a transaction in the register and updates the bill's **Last Paid** date.

### Status Indicators

- **Paid** — paid within the expected recurrence window
- **Due soon** — due within the next 7 days
- **Overdue** — past the expected due date

### Income

Bills with a positive amount are treated as income (paychecks, transfers in). They appear in the same list and work identically.

---

## Budget

Set monthly spending targets by category and track actuals.

### Setting a Budget

1. Navigate to **Budget** in the sidebar
2. Use the ← → arrows to navigate to any month
3. Click **Set** or **Edit** next to any expense category to enter a target amount
4. Actuals are calculated automatically from transactions in that month

### Reading the Bar Chart

Each bar shows **budgeted** vs **actual** spending for the category. Green bars are under budget; red bars exceed the target. Categories with spending but no budget target appear below the set budgets.

---

## Net Worth

The Net Worth chart shows assets, liabilities, and net worth over time.

- **Assets** — sum of all non-credit account balances (positive values only)
- **Liabilities** — sum of all credit card balances owed (negative values, shown as positive)
- **Net Worth** — Assets minus Liabilities

Use the **3 / 6 / 12 month** selector to adjust the time window. Hover over any point to see exact values.

---

## Reports

Reports has four tabs:

### Spending by Category

Shows total spending per category for a date range. The default range is January 1 through today. Use the From / To date pickers to adjust. Click **Export CSV** to download.

### Monthly Summary

Income, expenses, and net for each of the last 24 months. Useful for spotting seasonal trends. Export to CSV for spreadsheet analysis.

### Tax Summary

Lists all transactions marked **Tax relevant** for a selected year. Shows attached document counts (📎). Export to CSV to hand off to your accountant.

### Balance Forecast

Projects your total balance over time using:
- **Current balance** — sum of all account balances as of today
- **Already-entered future transactions** — any transaction with a future date counts
- **Active bills** — applied monthly (or at their configured frequency)

Weekly bills are estimated at ×4 per month; biweekly at ×2. Annual bills fire once per year based on their last paid date.

**Forecast controls:**
- **Look ahead selector** — 1, 3, 6, 12, 24, or 36 months
- **Custom date** — select "Custom date…" and pick any future date; the system calculates the month count automatically

If the projected balance goes negative, a red dashed reference line appears at zero. Export the table to CSV for detailed month-by-month review.

---

## Search

Search all transactions across all accounts.

**Filters:**
| Filter | Description |
|---|---|
| Keyword | Searches payee and memo fields (case-insensitive) |
| Account | Limit to one account |
| Date range | From / To dates |
| Amount range | Min / Max amounts (use negative values for expenses) |
| Tax relevant only | Show only tax-tagged transactions |

Click any result row to jump to the account register at that transaction (via the account name link).

---

## Import

Import transactions from a financial export file.

### Supported Formats

| Format | Extension | Notes |
|---|---|---|
| Quicken Interchange Format | `.qif` | Most bank and Quicken exports |
| Open Financial Exchange | `.ofx`, `.qfx` | Bank and brokerage exports |
| Comma-Separated Values | `.csv` | Generic spreadsheet export |

### Import Process

1. Navigate to **Import** in the sidebar
2. Drag a file onto the drop zone, or click to browse
3. Review the **Preview** — shows how many transactions were found per account, with sample rows
4. If the preview looks correct, click **Import**
5. The import will skip duplicate transactions (matched by date + payee + amount)

### After Importing

Categories from QIF files are automatically created if they don't exist. New accounts are created if an account name in the file doesn't match an existing one. You can rename or merge accounts afterward.

---

## Account Settings & Security

### Changing Your Password

1. Click your name in the bottom-left of the sidebar
2. Navigate to settings (if available in the UI) or use the API directly at `POST /api/auth/change-password`

### Two-Factor Authentication (2FA)

2FA uses a time-based one-time password (TOTP) compatible with any authenticator app (Google Authenticator, Authy, 1Password, etc.).

**To enable:**
1. Go to your account settings
2. Click **Enable 2FA**
3. Scan the QR code with your authenticator app
4. Enter the 6-digit code to confirm

**To disable:**
1. Go to account settings
2. Click **Disable 2FA**
3. Enter your current authenticator code to confirm

Once enabled, 2FA is required at every sign-in.

---

## Admin Panel

Accessible only to accounts with the **Admin** role. Navigate to **Admin** in the sidebar (if you have the role).

### User Management

The admin panel shows all registered users with their status, role, last login, and whether they have Google OAuth or 2FA linked.

**Actions:**
- **Approve** — activates a pending account
- **Suspend** — blocks a user from signing in
- **Unsuspend** — re-activates a suspended account
- **Set Role** — grant or revoke admin privileges
- **Delete** — permanently removes the user and all their financial data

> You cannot suspend, demote, or delete your own account from the admin panel.

---

## Technical Reference

### Architecture

```
Browser (React + TypeScript)
  └── HTTPS → Nginx (port 443)
        ├── Static files: /var/www/html (client/dist)
        └── /api/* → Express (port 3001, localhost)
              └── PostgreSQL (tally database)
```

### Data Storage

All financial data is stored in PostgreSQL on the server. The database (`tally`) contains:

| Table | Contents |
|---|---|
| `users` | User accounts, roles, password hashes, 2FA secrets |
| `session` | Active login sessions |
| `accounts` | Financial accounts |
| `transactions` | Individual transactions with amounts, dates, categories |
| `categories` | Income/expense categories with colors |
| `bills` | Recurring bills/income configuration |
| `budgets` | Monthly budget targets per category |
| `attachments` | Binary file attachments linked to transactions |

### Backup

Back up the PostgreSQL database using standard tools:

```bash
# Dump the database
pg_dump tally > tally-backup-$(date +%Y%m%d).sql

# Restore
psql tally < tally-backup-20260530.sql
```

Automate with a cron job or systemd timer. Store backups off-server (external drive, S3-compatible object storage, etc.).

### Environment Variables

The server reads from `/opt/money-app/server/.env`:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Secret for signing session cookies. Use a long random string. |
| `ADMIN_EMAIL` | Recommended | Email that auto-approves as admin on first registration |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth client secret |
| `APP_URL` | Optional | Public URL (used for OAuth callback, e.g. `https://money.example.com`) |
| `NODE_ENV` | Optional | Set to `production` to enable secure cookies |
| `PORT` | Optional | API server port (default: 3001) |

### Deployment

Updates are deployed via the companion infra repo:

```bash
# On your local machine (after pushing changes to money-app)
cd ~/money-app-infra
bash deploy.sh
```

The deploy script pulls the latest code into the LXC container, runs schema migrations, rebuilds the frontend, and restarts the API server.

### API

The Express server exposes a REST API at `/api/`. All endpoints require an authenticated session (cookie-based). The web app is itself a client of this API — any future mobile app or CLI client can use the same endpoints.

Key endpoints:

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Sign out |
| GET  | `/api/auth/me` | Current user |
| GET  | `/api/accounts` | List accounts |
| GET  | `/api/transactions` | List transactions (requires `?account_id=`) |
| GET  | `/api/bills` | List bills |
| GET  | `/api/categories` | List categories |
| GET  | `/api/budgets` | Budget for a month (requires `?month=YYYY-MM`) |
| GET  | `/api/networth` | Net worth history |
| GET  | `/api/forecast` | Balance forecast (optional `?months=12`) |
| GET  | `/api/news` | Financial news feed (cached 1h) |
| POST | `/api/import` | Import a file |

---

*This manual is maintained in the repository at `MANUAL.md`. To convert to PDF: `pandoc MANUAL.md -o Tally-Manual.pdf --pdf-engine=wkhtmltopdf`*
