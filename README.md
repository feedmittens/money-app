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

The entire database runs in your browser via [sql.js](https://sql.js.org/) — SQLite compiled to WebAssembly. When you load the app, you open (or create) a `.db` file from your local filesystem. All reads and writes happen in-browser. The server only serves the static app files — it never sees your financial data.

```
Your browser
  └── sql.js (SQLite WASM)
        └── your-finances.db  ←  lives on your computer, never uploaded
```

## Features

- **Account register** — checking, savings, credit, and investment accounts with running balances
- **Transactions** — add, edit, delete; mark cleared; track transfers between accounts
- **Bills tracker** — recurring bills (monthly, weekly, biweekly, annual) with overdue/due-soon status and one-click payment recording
- **Budget** — set monthly spending targets per category; bar chart showing budgeted vs. actual with month navigation
- **Net worth** — area chart tracking assets vs. liabilities over 3, 6, or 12 months
- **CSV import** — drag-and-drop import from bank exports with preview before committing
- **Categories** — custom income/expense categories with color coding
- **Auto-save** — changes save automatically to your `.db` file every 1.5 seconds; Ctrl+S to save immediately

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Database | SQLite via sql.js (WASM) — runs entirely in-browser |
| Charts | Recharts |
| Server | Nginx (static file serving only) |
| Deployment | Proxmox LXC container |

## Running locally

```bash
git clone https://github.com/feedmittens/money-app.git
cd money-app
npm ci --prefix client
npm run dev --prefix client
```

Open `http://localhost:5173`. On first load you'll be prompted to open an existing `.db` file or create a new one (pre-loaded with sample data).

## Self-hosted deployment

See [money-app-infra](https://github.com/feedmittens/money-app-infra) for one-command deployment to a Proxmox LXC container, including optional Let's Encrypt SSL.

## Browser compatibility

The app uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) for seamless auto-save. This is supported in Chrome and Edge. Firefox works but falls back to a download prompt on save (your data is never lost — it just downloads the file instead of writing in place).

---

## FAQ

**Is my financial data sent anywhere?**
No. The server only serves static HTML/JS/CSS files. All database operations run inside your browser via WebAssembly. Nothing is transmitted.

**Where is my data stored?**
In a `.db` file on your computer, wherever you chose to save it when you first created the database. You can back it up, copy it, or move it like any other file.

**How do I back up my data?**
Copy the `.db` file somewhere safe — an external drive, Dropbox, a USB stick. Since it's a standard SQLite file, you can also open it with any SQLite client (DB Browser for SQLite, DBeaver, etc.) to inspect or export your data.

**Can I access it from outside my home network?**
Yes — deploy it with a domain and Let's Encrypt SSL via [money-app-infra](https://github.com/feedmittens/money-app-infra). Your `.db` file still stays on your computer; you're just accessing the app interface remotely.

**Can I import from my bank?**
Yes. Most banks let you export transactions as CSV. Use the Import screen (drag and drop your CSV file) for a preview before importing.

**What if I have multiple people using it?**
Each person opens their own `.db` file. There's no multi-user concept — the app is designed for a single person or household sharing one `.db` file.

**Can I run this without Proxmox?**
Yes — any machine that can run Node.js and Nginx works. The Proxmox setup in `money-app-infra` is just a convenient one-command option. For a quick local setup, `npm run dev` is all you need.

**What happens if I close the tab without saving?**
Auto-save runs every 1.5 seconds after any change, so you're unlikely to lose anything. If you're on Firefox (download fallback mode), close the tab only after the browser has offered the download.
