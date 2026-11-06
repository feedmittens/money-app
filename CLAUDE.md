# money-app — Claude context

Self-hosted personal finance tracker. Public repo: https://github.com/feedmittens/money-app

## Architecture

- **Frontend**: React 18 + TypeScript + Vite, communicates with the API over HTTPS
- **Database**: PostgreSQL (`tally` database, `tally` user) — all financial data stored server-side
- **API server**: Express on port 3001 — handles all CRUD (accounts, transactions, bills, budgets, categories, forecast, import, auth)
- **Auth**: Session-based (connect-pg-simple stores sessions in Postgres), bcrypt passwords, TOTP 2FA, Google OAuth via Passport; also Bearer token auth via `api_tokens` table — `requireAuth` middleware checks session first, then `Authorization: Bearer` header
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
    transactions.js  Transaction CRUD, splits, attachments, search, reports
    bills.js         Bill CRUD, pay, recurring frequencies, payroll deductions (gross/net, FSA-linked)
    categories.js    Category CRUD
    budgets.js       Budget CRUD + rollover + income summary
    networth.js      Net worth history
    forecast.js      Monthly aggregate forecast + transaction-level detail
    fsa.js           FSA account CRUD + computed contributed/spent/remaining/on-track
    ai.js            Per-user LLM provider settings + chat endpoint (grounded in real data)
    news.js          RSS news feed; per-user configurable sources + 1h per-user cache
    import.js        File upload + DB write (uses lib/parsers.js for parsing)
    tokens.js        API token CRUD (Bearer auth tokens)
    admin.js         User management (admin only)
  lib/
    parsers.js       QIF/OFX/CSV parser functions (pure, no DB deps — testable)
    crypto.js        AES-256-GCM encrypt/decrypt for secrets at rest (LLM API keys)
    chatContext.js   Builds the grounded JSON snapshot fed to the AI Assistant's system prompt
  middleware/
    requireAuth.js   Async auth guard — checks session first, then Bearer token
    requireAdmin.js  Admin role guard (re-fetches role from DB on every request)
  scripts/
    auto-post-bills.js  Standalone script for cron; auto-posts due bills as transactions
  tests/
    parsers.test.js  Jest unit tests for all parser functions (40 tests)
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
- `requireAuth` is async — sets `req.userId` (not `req.session.userId`) for both session and Bearer paths; all routes use `const uid = req => req.userId` to avoid creating spurious sessions for Bearer requests
- Parser functions live in `server/lib/parsers.js` (no Express/DB deps) so they can be unit-tested without booting the server
- News cache is a per-user `Map` (userId → {items, fetchedAt}) — avoids one user's custom feeds polluting another's cache
- FSA accounts (`fsa_accounts`) are not real bank accounts — no balance to post transactions against. "Contributed to date" comes from `fsa_contributions` rows (written only when a bill with a linked `bill_deductions` row is paid/auto-posted); "spent to date" is derived live from transactions in the FSA's linked category — never stored, so it's always correct without a sync step
- `bills.gross_amount` + `bill_deductions` only apply when the UI's "break down gross pay" toggle is used; `bills.amount` is always the source of truth for forecast/pay — deductions just compute it, they don't replace it
- Both `routes/bills.js` (`/pay`) and `scripts/auto-post-bills.js` independently post FSA contributions on payment — any future third way of recording a bill payment must do the same or FSA tracking will silently fall out of sync
- AI Assistant is intentionally non-agentic: `lib/chatContext.js` builds one JSON snapshot per message (accounts, bills, FSA, 12-month spending by category) embedded in the system prompt, rather than a tool-calling loop. Simpler and cheaper, at the cost of not being able to drill into arbitrary historical detail beyond what's in the snapshot
- LLM API keys are AES-256-GCM encrypted via `lib/crypto.js` before storage in `llm_settings.api_key_enc`; `GET /api/ai/settings` never returns the plaintext key, only `has_key: boolean`
- Split transactions: parent `transactions.category_id = null` when splits exist; `transaction_splits` stores line items; GET query adds `has_splits` via EXISTS subquery; POST/PUT with splits run in a DB transaction
- Budget rollover computed server-side on each GET: fetches prev month actual + budgeted for rollover-enabled categories, sets `rollover_amount = Math.max(0, prevBudget + prevActual)`

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

Pulls latest code into the LXC container (container 200, IP 192.168.8.126, via Proxmox at 192.168.8.10), runs schema migrations, rebuilds client, restarts `money-app-api` systemd service.

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

5. **Update the GitHub wiki** at https://github.com/feedmittens/money-app/wiki if the change adds or modifies a feature that is covered by a wiki page (Installation, Import Guide, Balance Forecast, Admin Panel, API Reference, Development, Changelog). The wiki is maintained as a git repo — clone `git@github.com:feedmittens/money-app.wiki.git`, edit the relevant `.md` files, and push. Key pages to check: `Changelog.md` (always), `API-Reference.md` (for new endpoints), and the feature-specific page if one exists.

6. **Update CLAUDE.md** (this file) if the change affects the architecture, key design decisions, or development workflow in a way that would affect how future AI-assisted work is done.

Stale documentation is a lie. A README or manual that describes the wrong behavior actively misleads users and wastes debugging time.

## GitHub Issues → Claude Code workflow

When a GitHub Issue is labeled `claude`, the `.github/workflows/claude-issue.yml` workflow runs automatically:
1. Claude Code implements the change on a `claude/issue-N` branch
2. Opens a PR for human review
3. Merging the PR triggers the deploy pipeline

For this to work: `ANTHROPIC_API_KEY` must be set in GitHub Secrets (repo Settings → Secrets → Actions).
