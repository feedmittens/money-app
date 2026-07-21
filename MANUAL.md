# Tally — User Manual

**Version:** 1.17.0  
**Last updated:** 2026-06-17  
**Source:** https://github.com/feedmittens/money-app

> Download this manual from within the app: click **📖 Manual** in the sidebar footer.
> Convert to PDF: `pandoc MANUAL.md -o Tally-Manual.pdf` (requires pandoc)

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
9. [Balance Forecast](#balance-forecast)
10. [Reports](#reports)
11. [Search](#search)
12. [Import](#import)
13. [API Tokens](#api-tokens)
14. [Account Settings & Security](#account-settings--security)
15. [Admin Panel](#admin-panel)
16. [Technical Reference](#technical-reference)

---

## Overview

Tally is a self-hosted personal finance tracker. All financial data is stored in a PostgreSQL database on your own server — no third-party cloud sync, no subscription, no data sharing.

**Key capabilities:**
- Track checking, savings, credit card, and investment accounts
- Record and categorize transactions; split a single transaction across multiple categories
- Transfer money between accounts with both legs recorded atomically
- Track recurring bills and income with auto-post option
- Monthly budget tracking by category with optional rollover
- Income forecasting (expected vs. received paychecks in the budget view)
- Net worth history chart
- Balance forecast up to 36 months
- Import transactions from QIF, OFX/QFX, and CSV files; batch import via ZIP
- Tax-relevant transaction tagging with file attachments
- Financial news feed with configurable RSS sources
- API token auth for mobile apps and CLI scripts
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
- **12-Month Forecast** — Area chart projecting your total balance over the next year based on scheduled bills and pre-entered future transactions. Peak (▲) and trough (▼) balance points are marked.
- **Upcoming Bills & Income** — All bills/income due within the next 30 days, sorted by due date. Items due within 3 days are highlighted in red. Click any row to navigate directly to Bills & Income.
- **Financial News** — Recent articles from your configured RSS feeds, refreshed hourly from the server. The header shows the actual last-refresh time (e.g. "Updated 10:42 AM").

### Customizing News Sources

Click **⚙ Sources** in the news card header to open the feed management panel:

- **Existing feeds** — shown with label and URL; click ✕ to remove
- **Add a feed** — enter a valid RSS/Atom URL and a short label, then click **Add**

Default feeds (NPR Business, BBC Business) are added automatically the first time you use the Dashboard. Each user's feed list is independent.

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

The form at the top of the register is always visible. Three mode tabs control what the form does:

| Tab | Description |
|---|---|
| **Transaction** | Standard income or expense entry |
| **⊕ Split** | Split the total across multiple categories |
| **⇄ Transfer** | Move money between two accounts |

#### Standard Transaction

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

#### Split Transaction

Use Split mode when one transaction involves multiple categories — for example, a grocery store purchase where part of it was clothing.

1. Select the **⊕ Split** tab
2. Enter the total **Payment** or **Deposit** amount and **Date**
3. Add split lines — each has a **Category**, **Amount**, and optional **Memo**
4. The footer shows `$X fully allocated` (green ✓) or how much is over/under (red)
5. Clicking **+ Add line** pre-fills the remaining unallocated amount
6. **Add Transaction** is blocked until split lines sum to the total amount (within 0.5¢)

Split transactions display a purple **Split** chip in the register instead of a category name. When editing a split transaction, all split lines are reloaded from the database.

#### Transfer

To move money between accounts:

1. Select the **⇄ Transfer** tab
2. Choose the destination or source account
3. Enter the amount in **Payment** (money leaving this account) or **Deposit** (money arriving)
4. Click **Record Transfer**

Both sides are recorded simultaneously. Transfer rows show ⇄ [Account Name] in the register and cannot be individually edited — delete one side and both are removed.

### Editing a Transaction

Double-click any row to load it into the edit form. Make changes and click **Save Changes**. Click **Cancel** to discard.

> Transfers cannot be edited — delete and re-enter them.

### Sorting

Click any column header to sort by that column. Click again to reverse. A ▲/▼ indicator shows the active sort column and direction.

### Filtering by Month

Use the month selector in the top-right of the register to filter to a specific month. Select **All time** to see every transaction (paginated at 200 per page for large accounts).

### CSV Export

To delete an account, click ✏ to edit it, then type the account name exactly into the confirmation field at the bottom. The delete button only activates once the name matches — this prevents accidental deletion of all your transaction history.

Click **Export CSV** (visible when transactions are loaded) to download all transactions for the current account and active month filter. The CSV includes Date, Payee, Category, Memo, Payment, Deposit, Balance, Cleared, and Tax Relevant columns.

### Clearing Transactions

Click the circle indicator (●) in the far-left column to toggle a transaction between uncleared and cleared. Cleared transactions have been verified against a bank statement.

### Attachments

When editing an existing transaction, an **Attachments** section appears. Click **+ Attach file** to upload a receipt, statement, or any document (max 10 MB per file). Attachments are stored in the database.

To download an attachment, click its filename link. To delete it, click ✕ next to it.

### Make Recurring

Click the 🔁 button on any transaction row to convert it into a recurring bill. A dialog lets you choose the frequency (monthly, weekly, biweekly, annual, etc.). The transaction remains in the register as historical data; the new bill tracks future occurrences.

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
| Frequency | Monthly, semi-monthly, quarterly, weekly, bi-weekly, annual, or custom days |
| Category | Optional |
| Account | Optional — required for Auto-post |
| Auto-post when due | Only shown when Account is set; see below |

### Paying a Bill

Click **Pay** on a bill to record a payment. A dialog lets you confirm the date and account. This creates a transaction in the register and updates the bill's **Last Paid** date.

### Auto-Post

When **Auto-post when due** is enabled on a bill (requires an Account to be set), the server script `server/scripts/auto-post-bills.js` automatically records the transaction on the due date without requiring a manual Pay click.

The script must be scheduled on the server (e.g., via a daily cron job or systemd timer):

```bash
cd /opt/money-app && node server/scripts/auto-post-bills.js
```

Bills with auto-post enabled display a ⚡ indicator in the list.

### Status Indicators

- **Paid** — paid within the expected recurrence window
- **Due soon** — due within the next 7 days
- **Overdue** — past the expected due date

### Frequencies

| Frequency | Behavior |
|---|---|
| Monthly | Due on the specified day each month |
| Semi-monthly | Due on two days per month (e.g., 1st and 15th) |
| Quarterly | Due every 3 months from the last paid date |
| Weekly | Due every 7 days from the last paid date |
| Bi-weekly | Due every 14 days from the last paid date |
| Annual | Due once per year on the specified day |
| Custom days | Specify comma-separated days of the month (e.g., `1, 8, 15, 22`) |

### Sorting

Click any column header (Name, Due, Amount, Status) to sort the bill list.

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

### Budget Rollover

Click the ↩ button on any budget row to enable rollover for that category. When enabled:

- The unspent amount from the **previous month** carries forward into the current month
- The effective budget = Base amount + Rollover amount
- Rolled-over amounts appear in green below the budgeted amount (e.g., `+$42.00 ↩`)
- Progress bars and Remaining calculations use the effective budget

A full ↩ opacity means rollover is active; faded means inactive.

### Income Summary Cards

Three summary cards at the top of the Budget page track income for the current month:

- **Expected Income** — sum of all active income bills (positive-amount bills)
- **Income Received** — sum of all positive-amount transactions in the month
- **Net** — Expected Income minus total budgeted spending

---

## Net Worth

The Net Worth chart shows assets, liabilities, and net worth over time.

- **Assets** — sum of all non-credit account balances (positive values only)
- **Liabilities** — sum of all credit card balances owed (negative values, shown as positive)
- **Net Worth** — Assets minus Liabilities

Use the **3 / 6 / 12 month** selector to adjust the time window. Hover over any point to see exact values.

---

## Balance Forecast

Projects your total balance over time using:

- **Current balance** — sum of all account balances as of today
- **Already-entered future transactions** — any transaction with a future date
- **Active bills** — applied at their configured frequency

**Forecast controls:**
- **Look ahead selector** — 1, 3, 6, 12, 24, or 36 months
- **Custom date** — select "Custom date…" to pick any future date
- **Chart type** — Area, Line, or Bar chart; bar chart highlights peak and trough

**High/low markers** — Peak (▲, green) and trough (▼, red) balance points are marked on both the forecast page and the Dashboard mini-chart.

The detailed **Cash Flow** list below the chart shows every individual bill occurrence and future transaction in date order with running balances.

---

## Reports

### Spending by Category

Shows total spending per category for a date range. Default range is January 1 through today. Use the From / To date pickers to adjust. Click **Export CSV** to download.

### Monthly Summary

Income, expenses, and net for each of the last 24 months. Click **Export CSV** for spreadsheet analysis.

### Tax Summary

Lists all transactions marked **Tax relevant** for a selected year. Shows attached document counts (📎).

- **Export CSV** — downloads a spreadsheet of all tax-relevant transactions for the year (date, payee, amount, category, account, memo, whether an attachment exists).
- **Download Attachments ZIP** — packages all file attachments from tax-relevant transactions for the selected year into a single ZIP file. Each file is named `{date}_{payee}_txn{id}_att{attId}.{ext}` for easy filing. If no attachments exist for that year, the button returns an error message instead of a download.

---

## Search

Search all transactions across all accounts.

**Filters:**

| Filter | Description |
|---|---|
| Keyword | Searches payee and memo fields (case-insensitive) |
| Account | Limit to one account |
| Date range | From / To dates |
| Amount range | Min / Max amounts |
| Tax relevant only | Show only tax-tagged transactions |

Results are **sortable** — click any column header (Date, Account, Payee, Amount) to sort.

Click **Export CSV** to download the current search results.

---

## Import

Import transactions from a financial export file.

### Supported Formats

| Format | Extension | Notes |
|---|---|---|
| Quicken Interchange Format | `.qif` | Most bank and Quicken exports |
| Open Financial Exchange | `.ofx`, `.qfx` | Bank and brokerage exports |
| Comma-Separated Values | `.csv` | Generic spreadsheet export |
| ZIP archive | `.zip` | Multiple files of any supported format in one upload |

### Import Process

1. Navigate to **Import** in the sidebar
2. Drag a file onto the drop zone, or click to browse
3. Review the **Preview** — shows how many transactions were found per account, with sample rows
4. If the preview looks correct, click **Import**
5. The import skips duplicate transactions (matched by date + payee + amount)

### Batch Import (ZIP)

If you have many accounts to import (e.g., a full MS Money export where each account was saved as a separate QIF file), zip them all into a single `.zip` file and drop it onto the importer. Tally will extract each file, parse them all, and import every account in one pass. The preview shows all accounts found across all files before you commit.

### After Importing

Categories from QIF files are automatically created if they don't exist. New accounts are created if an account name in the file doesn't match an existing one. You can rename or merge accounts afterward.

---

## API Tokens

API tokens let you authenticate with the Tally API using a Bearer token instead of a session cookie. This is useful for mobile apps, CLI scripts, or any automation that can't use browser cookies.

### Generating a Token

1. Navigate to **🔑 API Tokens** in the sidebar (under the Data section)
2. Enter a name for the token (e.g., "My Phone", "Backup Script")
3. Click **Generate Token**
4. **Copy the token immediately** — the full token is only shown once. After you leave the page, only a partial preview is visible.

### Using a Token

Include the token in the `Authorization` header of any API request:

```
Authorization: Bearer <your-token>
```

All API endpoints that normally require a session cookie accept Bearer token auth as well.

### Revoking a Token

Click **Revoke** next to any token in the list. The token is immediately invalidated.

---

## Account Settings & Security

Navigate to **⚙️ Settings** in the sidebar (under the Data section).

### Changing Your Password

Enter your current password, your new password (minimum 8 characters), and the confirmation. Click **Update Password**.

> Google OAuth users who have never set a local password can leave "current password" blank.

### Two-Factor Authentication (2FA)

2FA uses a time-based one-time password (TOTP) compatible with any standard authenticator app (Google Authenticator, Authy, 1Password, etc.).

**To enable:**
1. Click **Set up 2FA** in the Settings page
2. Scan the QR code with your authenticator app (or enter the manual key)
3. Enter the 6-digit code from your app to confirm
4. 2FA is now active — you'll be prompted for a code at every sign-in

**To disable:**
1. Click **Disable 2FA** in the Settings page
2. Enter your current authenticator code to confirm

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
| `session` | Active login sessions (managed by connect-pg-simple) |
| `accounts` | Financial accounts |
| `transactions` | Individual transactions with amounts, dates, categories |
| `transaction_splits` | Split-transaction line items (category, amount, memo per line) |
| `categories` | Income/expense categories with colors |
| `bills` | Recurring bills/income configuration |
| `budgets` | Monthly budget targets per category |
| `attachments` | Binary file attachments linked to transactions |
| `api_tokens` | Bearer auth tokens for mobile/CLI clients |
| `news_feeds` | Per-user configured RSS news sources |

### Backup

Back up the PostgreSQL database using standard tools:

```bash
# Dump the database
pg_dump tally > tally-backup-$(date +%Y%m%d).sql

# Restore
psql tally < tally-backup-20260617.sql
```

Automate with a cron job or systemd timer. Store backups off-server (external drive, S3-compatible object storage, etc.).

### Running Tests

Parser unit tests live in `server/tests/`:

```bash
cd server && npm test
```

40 tests covering QIF, OFX, and CSV parsing including date formats, amount parsing, encoding edge cases, and the format dispatcher.

### Environment Variables

The server reads from `server/.env`:

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
cd ~/money-app-infra && bash deploy.sh
```

The deploy script pulls the latest code into the LXC container, runs schema migrations, rebuilds the frontend, and restarts the API server.

### API

The Express server exposes a REST API at `/api/`. All endpoints require either an authenticated session cookie or `Authorization: Bearer <token>`.

Key endpoints:

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Sign out |
| GET  | `/api/auth/me` | Current user |
| GET  | `/api/accounts` | List accounts |
| GET  | `/api/transactions` | List transactions (requires `?account_id=`) |
| GET  | `/api/transactions/:id/splits` | Get split lines for a transaction |
| GET  | `/api/transactions/search` | Search transactions |
| GET  | `/api/bills` | List bills |
| GET  | `/api/categories` | List categories |
| GET  | `/api/budgets` | Budget for a month (requires `?month=YYYY-MM`) |
| GET  | `/api/budgets/income` | Expected vs. actual income for a month |
| GET  | `/api/networth` | Net worth history |
| GET  | `/api/forecast` | Balance forecast (optional `?months=12`) |
| GET  | `/api/forecast/detail` | Detailed cash flow list |
| GET  | `/api/news` | Financial news items (user's configured feeds, cached 1h per user) |
| GET  | `/api/news/feeds` | List user's configured feed sources |
| POST | `/api/news/feeds` | Add a feed source |
| DELETE | `/api/news/feeds/:id` | Remove a feed source |
| GET  | `/api/tokens` | List API tokens |
| POST | `/api/tokens` | Generate a new token (returns full token once) |
| DELETE | `/api/tokens/:id` | Revoke a token |
| POST | `/api/import` | Import a QIF/OFX/CSV file |
| GET  | `/api/manual` | Download MANUAL.md |
| GET  | `/api/manual.pdf` | Download PDF (requires pandoc on server) |

---

*This manual is maintained in the repository at `MANUAL.md`. Download it from within the app via the 📖 Manual link in the sidebar footer.*
