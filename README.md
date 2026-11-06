# Tally

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

- **Dashboard** — net worth KPIs, 12-month forecast chart, upcoming bills/income (clickable, navigates to Bills), financial news feed with configurable RSS sources and last-refresh timestamp
- **Account register** — checking, savings, credit, and investment accounts with running balances; sortable columns; month filter; CSV export; a **column picker** (Memo and Balance toggleable); click a row to edit via the form, or click individual Date/Payee/Memo/Category cells to edit them in place
- **Transactions** — add, edit, delete; mark cleared; attach receipts (stored in DB); make any transaction recurring with one click; **split across multiple categories** with per-line memos and a live allocation indicator
- **Transfers** — move money between accounts atomically; both legs recorded and linked; deleting either leg removes both
- **Bills & Income** — recurring entries (monthly, semi-monthly, quarterly, weekly, bi-weekly, annual, or custom days) with overdue/due-soon status, one-click payment recording, **auto-post** option, a **column picker** (Account shown by default), and inline editing — click any cell (name, category, account, amount, due day, frequency, auto-post) to edit it in place, no modal required; income entries can optionally break gross pay into payroll deduction line items (401k, insurance, FSA elections, etc.) so the posted/forecasted amount is real net pay
- **FSA accounts** — track Dependent Care and Medical FSA elections; per-paycheck contributions post automatically when a linked payroll deduction is paid, spend-down is derived from transactions in a linked category, with an on-track/off-track projection against the annual election
- **Budget** — monthly spending targets per category with actual vs. budgeted bar chart; **rollover** option carries unspent budget forward month-to-month; income cards show expected vs. received paycheck amounts
- **Net worth** — area chart tracking assets vs. liabilities over time
- **Balance forecast** — projected balance chart up to 36 months, with transaction-level cash flow list showing every projected bill and scheduled transaction
- **AI Assistant** — chat interface grounded in your real account balances, bills, FSA elections, actual last-12-months spending by category, **and up to 400 individual recent transactions** (payee, amount, date, category, memo, account label — never a bank/routing number) so it can help categorize and analyze specific purchases, not just totals. A standing on-page notice discloses that each message sends this data to your configured third-party provider, subject to that provider's own privacy policy. Bring your own provider key (Anthropic, OpenAI, OpenRouter, Gemini, or any OpenAI-compatible custom endpoint) — configured per-user in Settings, encrypted at rest. Read-only: it advises and projects but cannot modify your data.
- **Reports** — spending by category, monthly income/expense summary, tax-relevant transaction export; all exportable to CSV
- **Search** — search all accounts by keyword, date range, amount range, or tax flag; sortable results; CSV export
- **Import** — drag-and-drop QIF, OFX/QFX, and CSV import with preview before committing
- **Plaid bank sync** — connect bank accounts via Plaid Link; transactions sync automatically on a schedule (4x daily, systemd timer) with deduplication, plus manual "Sync All" in Settings. Auto-categorization assigns categories from transaction history (zero API cost) with Claude Haiku fallback for unknown payees. `POST /api/plaid/categorize-all` to batch-categorize existing transactions.
- **API tokens** — generate named Bearer tokens for mobile apps or CLI scripts; managed in-app under 🔑 API Tokens
- **Multi-user** — account registration with admin approval, optional TOTP 2FA, and Google OAuth
- **Mobile-friendly** — collapsible sidebar with hamburger toggle; horizontal table scrolling; responsive layout at ≤768px

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Database | PostgreSQL |
| Charts | Recharts |
| API server | Node.js + Express 5 |
| Web server | Nginx (static files + reverse proxy) |
| Auth | Session cookies, bcrypt, TOTP, Google OAuth |
| Deployment | Proxmox LXC container |

## CI / Security

Every push and pull request runs two automated checks:

- **CodeQL** — static analysis scanning for security vulnerabilities in the JavaScript/TypeScript source
- **npm audit** — checks root, server, and client dependencies for known CVEs at `high` severity or above

Results appear in the **Security** tab of the GitHub repository. Dependabot is also configured to open weekly PRs for outdated npm dependencies and GitHub Actions versions.

## Running locally

Requires Node.js 18+, npm, and a local PostgreSQL instance.

```bash
git clone https://github.com/feedmittens/money-app.git
cd money-app

# Create a database and user
createdb tally
psql tally -c "CREATE USER tally WITH PASSWORD 'yourpassword';"
psql tally -c "GRANT ALL PRIVILEGES ON DATABASE tally TO tally;"

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
pg_dump tally > backup-$(date +%Y%m%d).sql
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

### 2026-11-06 — v1.26.0
- **Feature**: AI Assistant now sees individual recent transactions — up to 400 from the last 180 days (payee, amount, date, category, memo, account label), not just the prior 12-month category aggregates. Lets it do real analysis/categorization help ("which of these should be tagged Childcare", "what's this recurring $14.99 charge") instead of only answering from totals. No bank account or routing numbers are included — this app never stores those in the first place, so there was nothing to redact there; the account field is just the user's own label (e.g. "B BoA Visa").
- **Feature**: added a standing, non-dismissible privacy notice at the top of the Assistant page disclosing that every message sends this data snapshot to the user's configured third-party provider, subject to that provider's privacy/security policy rather than Tally's.

### 2026-11-06 — v1.25.0
- **Feature**: column picker + inline editing for Bills & Income and the Account Register. Both tables now have a "⚙ Columns" button to show/hide optional columns (persisted per-browser in localStorage). Bills & Income gained an **Account** column (shown by default) and inline edit on every data cell (name, category, account, amount, due day, frequency, auto-post) — no modal needed for quick changes; the full editor (✏️) remains for gross-pay/deduction setup. Account Register gained toggleable Memo/Balance columns and inline edit for Date, Payee, and Memo (Category already supported it).
- **Fix**: the inline category-edit in Account Register sent only the changed field (`{ category_id }`) to `PUT /api/transactions/:id`, but that route does a full-record overwrite, not a partial merge. In practice this meant clicking a transaction's category chip to change it threw a 500 and silently failed — confirmed by reproducing it directly against the API. Fixed by always sending the full current record with just the one field changed (`txnPatchPayload` helper), and used the same pattern for the new Bills inline edits (`billPatchPayload`) so it can't recur there.
- Converted Bills & Income's row rendering from a fixed-width CSS grid (`.bill-row`, hardcoded column count) to a real `<table>` matching the Account Register's pattern — required for a variable column count to work at all; removed the now-dead `.bill-row`/`.bills-grid` CSS.

### 2026-11-06 — v1.24.1
- **Fix**: bill auto-post and Plaid sync are now actually scheduled. Both scripts (`server/scripts/auto-post-bills.js`, new `server/scripts/auto-sync-plaid.js`) previously only ran if someone manually invoked them — there was never a cron job or systemd timer installed anywhere, despite docs describing them as scheduled jobs. Added `money-app-autopost.timer` (daily 06:00) and `money-app-plaid-sync.timer` (4x/day) to `container-init.sh`; installed on the existing prod/staging containers directly since that script only runs on fresh bootstraps. Extracted the Plaid `transactionsSync` loop out of `routes/plaid.js` into `server/lib/plaidSync.js` so the HTTP route and the new cron script share one implementation.

### 2026-11-06 — v1.24.0
- **Fix**: deploy script now grants privileges on newly created tables/sequences to the app role after running `schema.sql`. Migrations run as the `postgres` superuser, so any release that added a table previously left it ungranted and the app failed with "permission denied for schema public" until fixed by hand. Mirrored in `money-app-infra/scripts/container-deploy.sh`.
- **Feature**: FSA accounts (Dependent Care / Medical) — annual elections, per-paycheck contribution tracking via payroll deductions, and spend-down derived from transactions in a linked category. New `fsa_accounts` and `fsa_contributions` tables, `GET/POST/PUT/DELETE /api/fsa`.
- **Feature**: Payroll deductions on income bills — gross pay can be split into deduction line items (401k, insurance, FSA elections, etc.); the net amount posted/forecasted is computed automatically as gross minus deductions. Paying (or auto-posting) a paycheck with an FSA-linked deduction posts a matching `fsa_contributions` row. New `bill_deductions` table, `bills.gross_amount` column.
- **Feature**: AI Assistant — chat interface grounded in real account/bill/FSA/spending data (last-12-months per-category averages, not just the written budget). Per-user provider settings (Anthropic, OpenAI, OpenRouter, Gemini, or custom OpenAI-compatible endpoint) stored AES-256-GCM encrypted at rest. Read-only — advises and projects, does not modify data. New `llm_settings` / `chat_messages` tables, `/api/ai/*` endpoints, Settings → AI Assistant section. Chat endpoint is rate-limited per-user (30 messages/hour) separately from the general API limiter, since each message is a real paid call to a third-party LLM API.

### 2026-11-04 — v1.23.2
- **Fix**: NaN in Budget totals, Reports tax rows, Search total, and Forecast/Dashboard high/low forecast points — Postgres `numeric` columns arrive as strings from node-pg; `s + r.amount` was silently string-concatenating in `reduce()` calls, and `>` / `<` comparisons between two string balances in forecast reduces were doing lexicographic ordering (picking wrong high/low points). Added `Number()` coercion at every arithmetic and reduce-comparison site.

### 2026-11-04 — v1.23.1
- **Fix**: Net Worth `$NaN` on Total Assets and Net Worth cards — same string-coercion bug; `totalLiabilities` was accidentally safe because `Math.min` forced coercion before the `+`.

### 2026-11-04 — v1.23.0
- **Feature**: Auto-categorization of Plaid transactions — two-tier system: (1) history-based SQL lookup assigns the most-used category for a payee from existing transaction history, fires inline on every sync with zero API cost; (2) Claude Haiku fallback for unknown payees, called once per unique payee to minimise cost. New endpoint `POST /api/plaid/categorize-all` runs both tiers against all uncategorized Plaid transactions and returns `{ historyCategorized, aiCategorized, skipped }`. Requires `ANTHROPIC_API_KEY` in `.env` for the AI tier; history tier works without it.
- **UX**: single-click any transaction row to open the edit form (was double-click). Cleared badge, edit, recurring, and delete buttons stop click propagation so they don't simultaneously trigger row edit.
- **Fix**: Plaid sync `ON CONFLICT` clause now correctly targets the partial unique index with the matching `WHERE plaid_transaction_id IS NOT NULL` predicate — the previous bare `ON CONFLICT (plaid_transaction_id)` couldn't bind to a partial index and caused every sync to fail with a constraint error.

### 2026-07-20 — v1.22.0
- **Feature**: Plaid bank integration — connect bank accounts in Settings → Connected Banks. Plaid Link handles the browser-side OAuth/credential flow; access tokens are stored server-side only. Syncing pulls new, modified, and removed transactions using Plaid's cursor-based sync API and writes them to the transaction register with deduplication. Requires `PLAID_CLIENT_ID` and `PLAID_SECRET` in `.env`. OAuth-based bank connections additionally require `PLAID_REDIRECT_URI` pointing to a real HTTPS domain.
- **Fix**: nginx CSP updated to allow `cdn.plaid.com` (Plaid Link script/frame) and `api.github.com` (admin update check).

### 2026-07-20 — v1.21.0
- **Feature**: Admin one-click app update — the Admin panel now has an "Update App" section showing the current version and git commit. Clicking "Update App" streams a live deploy log (git pull → npm ci → schema migrations → client build → static file copy → nginx reload → service restart) directly in the browser via Server-Sent Events. The page auto-refreshes once the service restarts.

### 2026-07-20 — v1.20.0
- **Feature**: Balance Forecast now supports per-account and multi-account filtering. Toggle individual accounts with pill buttons in the controls bar — "All" shows the combined total. Both the chart and cash flow detail table update to reflect the selection. Bills are filtered to those assigned to selected accounts (plus any unassigned bills).

### 2026-07-20 — v1.19.1
- **Fix**: Account edit/delete moved to a proper modal dialog instead of inline sidebar expansion. Delete button now shows errors rather than failing silently; navigates to Dashboard if the currently-viewed account is deleted.

### 2026-07-20 — v1.19.0
- **Feature**: Batch ZIP import — drop a `.zip` file containing any mix of QIF, OFX, and CSV files and all accounts inside are imported in one pass. Useful for bulk MS Money exports where each account is a separate file.

### 2026-07-19 — v1.18.8
- **Dependency**: Express 4→5; no code changes needed — all routes use standard `/:id` params and simple string paths (no regex or wildcard patterns affected by Express 5's stricter path-to-regexp v8). The `wrap` helper becomes redundant (Express 5 auto-catches async errors) but remains harmless.

### 2026-07-19 — v1.18.7
- **Dependency**: otplib 12→13 — migrated from deprecated `authenticator` singleton to the new plugin-based API (`generateSecret`, `generateURI`, `verifySync` with `NobleCryptoPlugin`/`ScureBase32Plugin`). TOTP behavior is identical.

### 2026-07-19 — v1.18.6
- **Dependency**: connect-pg-simple 9→10 (session store); API unchanged, no code modifications needed.

### 2026-07-19 — v1.18.5
- **Dependency**: React 18→19 and matching `@types/react*` packages; no code changes required — app already used `createRoot` and modern hooks throughout.

### 2026-07-19 — v1.18.4
- **Dependency**: recharts 2→3; fixed Tooltip `formatter` prop signatures to match recharts 3's stricter `ValueType` typing (no behavior change).

### 2026-07-19 — v1.18.3
- **Dependency**: Vite 6→8 (client build tool) and `@vitejs/plugin-react` 4→6; fixed orphaned `}` in `App.css` that Vite 8's stricter lightningcss parser rejected.

### 2026-07-19 — v1.18.1
- **Safer account deletion**: the "Delete account & all transactions" button now requires typing the account name to confirm instead of a generic browser dialog.

### 2026-07-19 — v1.18.0
- **Admin panel**: admin users now have a "👥 Users" section in the sidebar that shows all registered users with their status, role, and auth method. Actions: approve pending users, suspend/unsuspend, promote/demote admin role, delete user.
- **Settings page**: all users now have a "⚙️ Settings" page in the sidebar for changing their password and enabling/disabling TOTP 2FA (with QR code setup flow).
- **Tax attachment ZIP export**: the Tax Summary report now has a "Download Attachments ZIP" button that fetches a ZIP archive of all file attachments on tax-relevant transactions for the selected year.
- **TypeScript fix**: `TransactionSplit` and `NewsFeed` were re-exported but not imported in `api.ts`, causing type errors.

### 2026-06-17 — v1.17.0
- **Split transactions**: any transaction can now be split across multiple categories. Click the "⊕ Split" tab in the transaction form to enter split lines (category + amount + memo per line). The form shows a running total with a green ✓ when fully allocated and a red warning when over- or under-allocated. Saving is blocked until splits sum to the transaction total. Split transactions show a purple "Split" chip in the register. Editing a split transaction reloads all split lines. The `transaction_splits` table stores the line items and cascade-deletes with the parent transaction.

### 2026-06-17 — v1.16.0
- **News feed customization**: click "⚙ Sources" in the Dashboard news card to add or remove RSS feeds. Default NPR Business + BBC Business feeds are auto-seeded on first use. Feed sources are stored per-user in the `news_feeds` table. Cache is per-user so different users' custom feeds don't interfere.
- **Schema fix**: moved `ALTER TABLE budgets ADD COLUMN rollover` to after `CREATE TABLE budgets` — it was ordering-unsafe on a fresh install.

### 2026-06-17 — v1.15.0
- **Automated tests**: Jest unit test suite added for all parser functions — `parseQifDate`, `parseAmount`, `parseQif`, `parseOfxDate`, `parseOfx`, `parseCsv`, and `parseFile` dispatcher. 40 tests covering normal paths, edge cases, and format detection. Run with `npm test` in `server/`.
- **Parser refactor**: QIF/OFX/CSV parser functions extracted from `server/routes/import.js` into `server/lib/parsers.js` for testability; import route unchanged from the API perspective.
- **Bug fix**: QIF parser now correctly applies `!Type:` (e.g. `CCard` → credit) when the type directive appears before the first transaction and no `!Account` block precedes it. Previously the account type defaulted to `checking` in that case.

### 2026-06-17 — v1.14.0
- **Manual download**: `GET /api/manual` serves MANUAL.md as a download; `GET /api/manual.pdf` generates a PDF via pandoc (returns 503 if pandoc not installed); "📖 Manual" link added to sidebar footer
- **CSV export per account**: "Export CSV" button in the account register header downloads all transactions for the current account (and active month filter) as a CSV file including date, payee, category, memo, payment, deposit, running balance, cleared, and tax-relevant columns
- **Sortable columns**: transaction register, bills list, and search results all support clickable column headers to sort ascending/descending; active column shows ▲/▼ indicator
- **UI tooltips**: `title` attributes added to all icon-only controls — cleared badge, attachment remove button, bills modal close button, month filter select, and sort column headers
- **Auto-post bills**: per-bill "Auto-post when due" option; when enabled, `server/scripts/auto-post-bills.js` (run daily via cron/systemd) automatically records the transaction — no manual Pay click needed. Requires "Pay From Account" to be set. Auto-posted bills show a ⚡ indicator in the list.
- **News feed last-updated timestamp**: Dashboard now shows the actual time the news cache was last refreshed (e.g. "Updated 10:42 AM") instead of the static "Updated hourly" label.
- **Budget rollover**: per-category ↩ toggle in the budget list carries unspent budget from the previous month into the current month. Rolled-over amounts shown in green below the budgeted amount. Progress bar and Remaining column use the effective (base + rollover) budget.
- **Paycheck income forecasting**: Budget summary cards now include Expected Income (from active income bills), Income Received (actual deposits this month), and Net (income minus spending). Total Budget summary includes rolled-over amounts.
- **Mobile / responsive layout**: sidebar collapses off-screen on ≤768px viewports with a hamburger button (☰) to open it; tap-outside-overlay to close. Tables scroll horizontally. Summary cards go 2-column. Bill/budget grid rows hide lower-priority columns. Modal goes full-width.
- **API token auth**: new "API Tokens" section (🔑 in sidebar) lets users generate named Bearer tokens for mobile apps or CLI scripts. All API routes now accept `Authorization: Bearer <token>` in addition to session cookies.

### 2026-06-16 — v1.13.1
- **Security**: Fixed 6 server-side vulnerabilities — IDOR on attachment upload, IDOR on transfer creation, IDOR on bill payment, stored XSS via MIME allowlist bypass, session fixation on all auth flows (login/TOTP/OAuth), privilege escalation via stale session role
- **Security**: Google OAuth now correctly enforces TOTP second factor when 2FA is enabled on the account
- **Security**: Rate limiting (20 req/15 min) applied to `/login` and `/2fa/verify`
- **Security**: Nginx security headers added: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Content-Security-Policy`; fixed missing `X-Forwarded-Proto` proxy header
- **Security**: `requireAdmin` middleware now re-fetches role from the database on every request instead of trusting the session cache

### 2026-06-16 — v1.13.0
- **Account transfers**: new Transfer mode in the transaction form — records both legs of a transfer atomically, links them, and deletes both when either is removed. Transfers display as ⇄ [Account Name] in the register
- **Performance**: transaction list now uses a single SQL window-function query instead of two separate queries; added composite index `(account_id, user_id, date DESC, id DESC)`; added server-side pagination (200 per page) with Previous/Next controls
- **Logo**: new polished Tally icon (rounded square with tally-mark design); applied to Login page, sidebar, and GitHub Pages
- **CCG**: added Corkscrew Consulting Group attribution (linked, unobtrusive) to Login, sidebar footer, and GitHub Pages landing page

### 2026-06-16 — v1.12.0
- Rebranded app from "BV Money" to **Tally** — all UI text, page titles, server log messages, auth app name, and news User-Agent updated
- Tally tally-mark SVG logo applied to Login page and sidebar header
- Setup instructions and docs now use `tally` as the suggested database/user name
- Created GitHub Pages landing page at `docs/index.html` (enable in repo Settings → Pages → main branch, /docs folder)

### 2026-06-16 — v1.11.0
- Added CodeQL static analysis and npm audit GitHub Actions workflow (runs on push, PRs, and weekly schedule)
- Added Dependabot config for automated weekly dependency update PRs (root, server, client, GitHub Actions)
- Added `server/.env.example` documenting all required and optional environment variables

### 2026-05-30 — v1.10.0
- Added CI/CD pipeline: GitHub Actions workflow (self-hosted runner on Proxmox), staging LXC (CT 201), smoke test suite
- Added GitHub Issues → Claude workflow: label an issue `claude` to auto-implement it and open a PR
- Added `test/smoke.sh`, `scripts/setup-github-runner.sh`, `scripts/setup-staging.sh`
- Updated CLAUDE.md with mandatory documentation and GitHub Issues workflow rules

### 2026-05-30 — v1.9.0
- **Balance Forecast** is now a top-level sidebar item under Planning (🔮)
- Forecast page supports **Area / Line / Bar** chart type toggle; bar chart highlights peak and trough bars in color
- Removed forecast tab from Reports (no longer duplicated)

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
- Made **Tally** title a link to the GitHub repo
- Added 1-month option and custom end date picker to Balance Forecast

### 2026-05-30 — v1.4.0
- Added **Balance Forecast** tab to Reports
- Added **Make Recurring** (🔁) button on transaction rows

### 2026-05-30 — v1.3.0
- Migrated from browser-side SQLite (sql.js) to server-side PostgreSQL
- Added multi-user support with admin approval, TOTP 2FA, and Google OAuth
- Added async error handling across all server routes
- Fixed session cookies behind nginx SSL proxy
