# money-app — Claude context

Self-hosted personal finance tracker. Public repo: https://github.com/feedmittens/money-app

## Architecture

- **Frontend**: React 18 + TypeScript + Vite, browser-side SQLite via sql.js (WASM)
- **Database**: User's own `.db` file, opened via File System Access API — never uploaded anywhere
- **API server**: Express on port 3001 — stateless file parser only (QIF/OFX/CSV import). No data stored server-side.
- **Web server**: Nginx — serves static files from `client/dist/` and proxies `/api/` to Express

## Repo layout

```
client/          React frontend (Vite)
  src/
    database.ts  All browser-side SQLite ops (accounts, transactions, budgets, etc.)
    api.ts       Thin wrappers around database.ts
    components/  React components
server/          Express API (import parsing only)
  routes/
    import.js    Parses QIF/OFX/CSV, returns structured data — no DB writes
infra/           Deployment configs (Nginx, Dockerfile, systemd service)
setup.sh         One-command LXC setup
```

## Key design decisions

- Server is stateless — import route parses files and returns data; the client writes to the browser DB via `database.ts:importData()`
- All CRUD (accounts, transactions, bills, budgets) goes through `database.ts` against the user's local `.db` file
- Auto-save every 1.5s via `markDirty()` → `saveNow()`; Ctrl+S for manual save
- `infra/nginx.conf` proxies `/api/` to `http://127.0.0.1:3001` — required in both LXC and Docker deployments

## Dev workflow

```bash
npm run dev          # starts both Vite (5173) and Express (3001) concurrently
npm run build --prefix client   # production build → client/dist/
```

## Deployment

Handled by the companion repo `money-app-infra` (local: `/home/bvogel/money-app-infra`).  
After pushing changes here: `cd ../money-app-infra && bash deploy.sh`

## Rules

- Both repos are **public** — never commit secrets, IPs, credentials, or tokens
- Private config lives in `money-app-infra/config.env` (gitignored)
- Any code change that affects deployment (nginx config, server startup, deps) must also update the infra scripts in `money-app-infra` and vice versa
- Keep READMEs in sync with what the code actually does
