# money-app

A self-hosted personal finance tracker. Track accounts, transactions, bills, budgets, and net worth — all data stored in a PostgreSQL database on your own server.

---

> **Built with AI assistance**
>
> This project was built with the help of [Claude Code](https://claude.ai/code). The code has not been independently audited. Use it at your own risk — especially for anything involving real financial data.
>
> AI-generated code can contain bugs, security issues, or incorrect logic that isn't obvious at first glance. Before trusting this app with your actual finances, review the code yourself (or have someone you trust do so). Don't rely on AI-generated software for anything critical without doing your own due diligence.

---

## Why this was built

**Microsoft Money killed its own product and left a 30-year gap.**

Microsoft Money launched in 1991 and spent nearly two decades as one of the best personal finance tools ever made — a proper desktop app with a full account register, transaction tracking, QIF/OFX import, bill tracking, budgeting, investment portfolio management, and detailed reports. No cloud sync, no subscription, no data shared with anyone. Your data lived on your computer.

Microsoft discontinued it in 2009 with no migration path and no open-source release of the codebase. Millions of long-time users — some who had tracked every transaction since the mid-90s — were left with software that still ran but would inevitably break as Windows evolved, and no modern replacement that worked the same way.

The alternatives that emerged (Mint, YNAB, Monarch, Copilot, etc.) all require creating a cloud account and syncing your complete financial picture to a company's servers — indefinitely. That's the opposite of what MS Money users had for two decades.

This app was built to fill that gap: a self-hosted personal finance tracker that works like Money did — account register, bills, budget, reports, QIF/OFX/CSV import — but runs as a modern web app on your own server. Your data stays in your PostgreSQL database, on your hardware, under your control.

## How it works

The app is a standard web application. A React frontend talks to an Express API, which reads and writes to a PostgreSQL database — all running on your own server.

```
Your browser (React + TypeScript)
  └── HTTPS → Nginx
        ├── Static files (HTML, JS, CSS)
        └── /api/* → Express (Node.js)
              └── PostgreSQL
```

When you import a bank file (QIF/OFX/CSV), the file content is sent to the Express server for parsing, then the structured data is written to your database. Nothing is sent to any external service.

## Features

- **Dashboard** — net worth KPIs, 12-month forecast chart, upcoming bills/income, financial news feed
- **Account register** — checking, savings, credit, and investment accounts with running balances
- **Transactions** — add, edit, delete; mark cleared; attach receipts; make any transaction recurring with one click
- **Bills & Income** — recurring entries (monthly, semi-monthly, quarterly, weekly, bi-weekly, annual, or custom days) with overdue/due-soon status and one-click payment recording
- **Budget** — monthly spending targets per category with actual vs. budgeted bar chart
- **Net worth** — area chart tracking assets vs. liabilities over time
- **Balance forecast** — projected balance chart up to 36 months, with transaction-level cash flow list showing every projected bill and scheduled transaction
- **Reports** — spending by category, monthly income/expense summary, tax-relevant transaction export
- **Import** — drag-and-drop QIF, OFX/QFX, and CSV import with preview before committing
- **Multi-user** — account registration with admin approval, optional TOTP 2FA, and Google OAuth

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Database | PostgreSQL |
| Charts | Recharts |
| API server | Node.js + Express |
| Web server | Nginx (static files + reverse proxy) |
| Auth | Session cookies, bcrypt, TOTP, Google OAuth |
| Deployment | Proxmox LXC container |

## Running locally

Requires Node.js 18+, npm, and a local PostgreSQL instance.

```bash
git clone https://github.com/feedmittens/money-app.git
cd money-app

# Create a database and user
createdb bvmoney
psql bvmoney -c "CREATE USER bvmoney WITH PASSWORD 'yourpassword';"
psql bvmoney -c "GRANT ALL PRIVILEGES ON DATABASE bvmoney TO bvmoney;"

# Configure the server
cp server/.env.example server/.env   # then edit DATABASE_URL, SESSION_SECRET, etc.

# Install deps and run
npm run dev   # starts Vite (port 5173) and Express (port 3001) concurrently
```

Open `http://localhost:5173`. Register an account — if your email matches `ADMIN_EMAIL` in `.env`, it's auto-approved as admin. Otherwise an admin must approve it first.

## Self-hosted deployment (Proxmox LXC)

Use the companion infra repo:

```bash
git clone https://github.com/feedmittens/money-app-infra.git
cd money-app-infra
cp config.env.example config.env   # edit with your Proxmox host, container ID, etc.
bash deploy.sh
```

`deploy.sh` pulls the latest code into the LXC container, runs schema migrations, rebuilds the frontend, and restarts the API server.

See `MANUAL.md` for full setup and configuration details, including SSL, environment variables, and database backup.

## Docker deployment (alternative)

```bash
cd infra
docker compose up -d --build
```

Runs Nginx and the Node.js API in a single container. You'll need to supply a PostgreSQL instance (external or as an additional compose service) and configure `DATABASE_URL` in the environment.

---

## FAQ

**Is my financial data sent anywhere?**
No. All data is stored in your PostgreSQL database on your own server. When importing a bank file, the file content is sent to your own Express server for parsing — it never leaves your infrastructure.

**How do I back up my data?**
Use standard PostgreSQL tools:
```bash
pg_dump bvmoney > backup-$(date +%Y%m%d).sql
```
Store the dump somewhere off-server (external drive, NAS, S3-compatible object storage).

**Can I access it from outside my home network?**
Yes — point a domain at your server and configure Let's Encrypt SSL. See the Let's Encrypt item in `TODO.md` for the current state of that work.

**Can I import from my bank?**
Yes. Most banks let you export transactions as CSV, QIF, or OFX. Use the Import screen — it shows a preview before committing anything to the database.

**What if I have multiple people using it?**
Multi-user is supported. Each user gets their own account (with their own data). New registrations require admin approval. Admins can manage users from the Admin panel.

**Can I run this without Proxmox?**
Yes — any machine that can run Node.js 18+, Nginx, and PostgreSQL works.

**Is there an API?**
Yes — the Express server exposes a REST API at `/api/`. The web frontend is itself a client of this API. Future mobile or CLI clients can use the same endpoints. See `MANUAL.md` for the full endpoint list.

---

## Changelog

### 2026-05-30 — v1.8.0
- Added **Print / Save as PDF** button to Reports — opens browser print dialog; sidebar, tabs, and buttons are hidden; only report content prints. Works with Chrome/Firefox/Edge native PDF export.

### 2026-05-30 — v1.7.1
- Fixed account edit button in sidebar — was a nearly-invisible `<span>`; now a proper `<button>` with hover state
- Added **Quarterly** frequency for bills/income (every 3 months, e.g. estimated tax payments)
- Forecast tab simplified: removed monthly summary table; transaction-level cash flow list is now always shown below the chart

### 2026-05-30 — v1.7.0
- Balance Forecast chart now highlights the **peak** (▲, green dot) and **trough** (▼, red dot) balance points
- Added **Detailed Cash Flow** view: every individual bill occurrence and scheduled future transaction in date order with running balances
- Both high/low markers also appear on the Dashboard mini-forecast chart

### 2026-05-30 — v1.6.0
- Added **Semi-monthly** frequency for bills/income (e.g. 1st & 15th paychecks)
- Added **Custom days** frequency — specify any comma-separated days of the month
- Fixed date column in transaction register showing full ISO timestamp instead of just date
- Fixed date input not pre-filling when editing a transaction

### 2026-05-30 — v1.5.0
- Added **Dashboard** home page: KPI cards, forecast chart, upcoming bills, financial news feed (NPR Business + BBC Business)
- App now opens to Dashboard by default
- Made **BV Money** title a link to the GitHub repo
- Added 1-month option and custom end date picker to Balance Forecast

### 2026-05-30 — v1.4.0
- Added **Balance Forecast** tab to Reports
- Added **Make Recurring** (🔁) button on transaction rows

### 2026-05-30 — v1.3.0
- Migrated from browser-side SQLite (sql.js) to server-side PostgreSQL
- Added multi-user support with admin approval, TOTP 2FA, and Google OAuth
- Added async error handling across all server routes
- Fixed session cookies behind nginx SSL proxy
