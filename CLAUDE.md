# money-app — Claude context

Self-hosted personal finance tracker. Public repo: https://github.com/feedmittens/money-app

## Architecture

- **Frontend**: React 18 + TypeScript + Vite, communicates with the API over HTTPS
- **Database**: PostgreSQL (`bvmoney` database, `bvmoney` user) — all financial data stored server-side
- **API server**: Express on port 3001 — handles all CRUD (accounts, transactions, bills, budgets, categories, forecast, import, auth)
- **Auth**: Session-based (connect-pg-simple stores sessions in Postgres), bcrypt passwords, TOTP 2FA, Google OAuth via Passport
- **Web server**: Nginx — serves static files from `/var/www/html` (built client), proxies `/api/` to Express; SSL on port 443, redirects HTTP → HTTPS
- **Trust proxy**: `app.set('trust proxy', 1)` is set so Express correctly sees HTTPS behind nginx; nginx must pass `X-Forwarded-Proto: $scheme`

## Repo layout

```
client/              React frontend (Vite)
  src/
    api.ts           All API calls to Express (fetch wrappers)
    types.ts         Shared TypeScript interfaces
    components/      React components (Dashboard, AccountRegister, Bills, Reports, etc.)
server/              Express API
  server.js          App entry point — session, auth, route registration
  pg.js              PostgreSQL pool (reads DATABASE_URL from env)
  schema.sql         All table definitions + idempotent migrations
  routes/
    auth.js          Register, login, logout, 2FA, Google OAuth
    accounts.js      Account CRUD
    transactions.js  Transaction CRUD, attachments, search, reports
    bills.js         Bill CRUD, pay, recurring frequencies
    categories.js    Category CRUD
    budgets.js       Budget CRUD
    networth.js      Net worth history
    forecast.js      Monthly aggregate forecast + transaction-level detail
    news.js          RSS news feed (NPR Business, BBC Business) with 1h cache
    import.js        QIF/OFX/CSV parser — writes parsed data to DB
    admin.js         User management (admin only)
  middleware/
    requireAuth.js   Session auth guard
    requireAdmin.js  Admin role guard
infra/               Nginx config template, Dockerfile
MANUAL.md            Full user manual (update when features change)
TODO.md              Backlog of future work
```

## Key design decisions

- Every async route handler is wrapped with `const wrap = fn => (req,res,next) => fn(req,res,next).catch(next)` — never omit this or DB errors will crash the process
- All routes are scoped by `user_id` — data is strictly per-user, never cross-user
- PostgreSQL returns NUMERIC columns as JS strings; always pass through `Number()` before arithmetic or `fmt()` display calls
- Bills support: monthly, semimonthly (due_day + due_day_2), quarterly, weekly, biweekly, annual, custom (custom_days TEXT)
- Session cookies use `secure: NODE_ENV === 'production'` — requires `trust proxy` + `X-Forwarded-Proto` from nginx to work correctly
- The deploy script does NOT update the nginx config on the container — edit `/etc/nginx/sites-enabled/money-app` via `pct exec` when nginx changes are needed

## Dev workflow

```bash
npm run dev          # starts both Vite (5173) and Express (3001) concurrently
npm run build --prefix client   # production build → client/dist/
```

Server requires `server/.env` with at minimum `DATABASE_URL` and `SESSION_SECRET`.

## Deployment

```bash
cd ~/money-app-infra && bash deploy.sh
```

Pulls latest code into the LXC container (container 200, IP 192.168.1.126, via Proxmox at 192.168.1.201), runs schema migrations, rebuilds client, restarts `money-app-api` systemd service.

## Rules

- Both repos are **public** — never commit secrets, IPs, credentials, or tokens
- Private config lives in `~/money-app-infra/config.env` (gitignored)
- Any code change that affects deployment (nginx config, server startup, deps) must also update the infra scripts in `money-app-infra` and vice versa

## Documentation — mandatory on every change

**Before committing any meaningful change, you MUST:**

1. **Check README.md for accuracy** — if the change affects architecture, features, setup steps, or how the app works, update the relevant section. The README must always describe the current state of the app, not a past state.

2. **Add a changelog entry** — every commit that changes user-visible behavior, fixes a bug, or alters the data model gets a dated entry under `## Changelog` in README.md. Format:
   ```
   ### YYYY-MM-DD — vX.Y.Z
   - Short description of what changed and why
   ```

3. **Bump the version** in `client/package.json`:
   - Patch (x.x.Z): bug fix or minor UI tweak
   - Minor (x.Y.0): new user-visible feature
   - Major (X.0.0): breaking change or major architecture shift

4. **Update MANUAL.md** if the change affects how a feature works from the user's perspective. MANUAL.md is the canonical user-facing documentation — it must stay accurate. Sections to check: feature list, the relevant feature section, FAQ, Technical Reference.

5. **Update CLAUDE.md** (this file) if the change affects the architecture, key design decisions, or development workflow in a way that would affect how future AI-assisted work is done.

Stale documentation is a lie. A README or manual that describes the wrong behavior actively misleads users and wastes debugging time.

## GitHub Issues → Claude Code workflow

When a GitHub Issue is labeled `claude`, the `.github/workflows/claude-issue.yml` workflow runs automatically:
1. Claude Code implements the change on a `claude/issue-N` branch
2. Opens a PR for human review
3. Merging the PR triggers the deploy pipeline

For this to work: `ANTHROPIC_API_KEY` must be set in GitHub Secrets (repo Settings → Secrets → Actions).
