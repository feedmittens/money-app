# money-app

A self-hosted personal finance tracker. Track accounts, transactions, bills, budgets, and net worth — with all data stored in a SQLite file on your own machine.

---

> **Built with AI assistance**
>
> This project was built with the help of [Claude Code](https://claude.ai/code). The code has not been independently audited. Use it at your own risk — especially for anything involving real financial data.
>
> AI-generated code can contain bugs, security issues, or incorrect logic that isn't obvious at first glance. Before trusting this app with your actual finances, review the code yourself (or have someone you trust do so). Don't rely on AI-generated software for anything critical without doing your own due diligence.

---

## Why this was built

Most personal finance tools (Mint, YNAB, Monarch, etc.) require creating an account and syncing your financial data to their servers. That means a company you don't control holds a complete picture of your income, spending, and account balances — indefinitely.

This app was built to avoid that entirely. There is no account to create, no cloud sync, and no subscription. Your data lives in a single `.db` file on your computer. You open the file when you want to use the app and it stays on your machine the rest of the time.

## How it works

The database runs in your browser via [sql.js](https://sql.js.org/) — SQLite compiled to WebAssembly. When you load the app, you open (or create) a `.db` file from your local filesystem. All reads and writes happen in-browser.

The server has two roles:
1. **Nginx** — serves the static app files (HTML, JS, CSS, WASM)
2. **Node.js API** — parses imported files (QIF, OFX, CSV) and returns structured data. The parsed data is then saved into your browser-side database. The server never stores your financial data.

```
Your browser
  └── sql.js (SQLite WASM)
        └── your-finances.db  ←  lives on your computer, never uploaded

Import flow:
  File → Node.js (parse only) → structured data → sql.js (save to your .db)
```

## Features

- **Account register** — checking, savings, credit, and investment accounts with running balances
- **Transactions** — add, edit, delete; mark cleared; track transfers between accounts; make any transaction recurring with one click
- **Bills tracker** — recurring bills (monthly, weekly, biweekly, annual) with overdue/due-soon status and one-click payment recording
- **Budget** — set monthly spending targets per category; bar chart showing budgeted vs. actual with month navigation
- **Net worth** — area chart tracking assets vs. liabilities over 3, 6, or 12 months
- **Balance forecast** — projected balance chart up to 36 months out, accounting for recurring bills and pre-entered future transactions
- **Import** — drag-and-drop QIF, OFX/QFX, and CSV import with preview before committing
- **Categories** — custom income/expense categories with color coding
- **Multi-user** — account registration with admin approval, optional 2FA (TOTP), and Google OAuth

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Database | SQLite via sql.js (WASM) — runs entirely in-browser |
| Charts | Recharts |
| API server | Node.js + Express (import file parsing only — no data stored) |
| Web server | Nginx (static files + proxy to API) |
| Deployment | Proxmox LXC container |

## Running locally

```bash
git clone https://github.com/feedmittens/money-app.git
cd money-app
bash setup.sh        # installs deps and builds client
npm run dev          # starts both frontend (port 5173) and API server (port 3001)
```

Open `http://localhost:5173`. On first load you'll be prompted to open an existing `.db` file or create a new one (pre-loaded with sample data).

> **Note:** `npm run dev` starts both the Vite dev server and the Express API server concurrently. Both must be running for the Import feature to work.

## Self-hosted deployment (Proxmox LXC)

```bash
# On the LXC container (run as root)
apt install -y nginx nodejs npm git
git clone https://github.com/feedmittens/money-app.git /opt/money-app
cd /opt/money-app
bash setup.sh
```

`setup.sh` will:
- Install Node.js dependencies
- Build the frontend (`client/dist/`)
- Configure Nginx to serve the app and proxy `/api/` to the Node.js server
- Install and start the `money-app-api` systemd service on port 3001

### Updating after a code change

```bash
cd /opt/money-app
git pull
npm run build --prefix client        # rebuild frontend
systemctl restart money-app-api      # restart API server
systemctl reload nginx               # reload nginx if config changed
```

## Docker deployment (alternative)

```bash
cd infra
docker compose up -d --build
```

The Docker image runs both Nginx and the Node.js API server in a single container. Nginx serves static files and proxies `/api/` to the Node server internally.

## Browser compatibility

The app uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) for seamless auto-save. This is supported in Chrome and Edge. Firefox works but falls back to a download prompt on save (your data is never lost — it just downloads the file instead of writing in place).

---

## FAQ

**Is my financial data sent anywhere?**
When using the Import feature, the raw file content (QIF/OFX/CSV) is sent to the local API server for parsing. The server returns structured data and discards the file — nothing is stored server-side. The parsed data is then saved into your browser-side `.db` file. All other operations are fully browser-side.

**Where is my data stored?**
In a `.db` file on your computer, wherever you chose to save it when you first created the database. You can back it up, copy it, or move it like any other file.

**How do I back up my data?**
Copy the `.db` file somewhere safe — an external drive, Dropbox, a USB stick. Since it's a standard SQLite file, you can also open it with any SQLite client (DB Browser for SQLite, DBeaver, etc.) to inspect or export your data.

**Can I access it from outside my home network?**
Yes — deploy it with a domain and Let's Encrypt SSL. Your `.db` file still stays on your computer; you're just accessing the app interface remotely.

**Can I import from my bank?**
Yes. Most banks let you export transactions as CSV. Use the Import screen (drag and drop your file) for a preview before importing.

**What if I have multiple people using it?**
Each person opens their own `.db` file. There's no multi-user concept — the app is designed for a single person or household sharing one `.db` file.

**Can I run this without Proxmox?**
Yes — any machine that can run Node.js, Nginx, and PostgreSQL works. For quick local use, `npm run dev` is all you need (requires a local Postgres instance and `DATABASE_URL` set in `server/.env`).

**Why does the Docker setup also exist?**
Both deployment options are supported. The LXC approach runs Nginx and Node directly on the container. The Docker approach (`infra/docker-compose.yml`) packages both into a single image — useful if you prefer container-based deployments or are running on something other than Proxmox.

---

## Changelog

### 2026-05-30 — v1.4.0
- Added **Balance Forecast** tab to Reports: area chart projecting account balance up to 36 months, using scheduled bills and pre-entered future transactions
- Added **Make Recurring** button (🔁) on transaction rows: converts any transaction into a recurring bill with one click
- Updated Features list in README to reflect current app state

### 2026-05-30 — v1.3.0
- Migrated from browser-side SQLite (sql.js) to server-side PostgreSQL
- Added multi-user support with admin approval flow
- Added session-based authentication (bcrypt passwords, TOTP 2FA, Google OAuth)
- Added async error handling (`wrap` helper) across all server routes — DB errors now return JSON instead of crashing the process
- Fixed session cookies behind nginx SSL proxy (`trust proxy` + `X-Forwarded-Proto`)
- Fixed PostgreSQL table permissions for app database user
