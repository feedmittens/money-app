# Tally — Backlog

Items here are ideas and future work, not committed roadmap.

---

## 🔴 Do Next (blocked or high value)

- [ ] **Register tallyfin.io** — grab the domain (Cloudflare Registrar or Porkbun recommended). Point an `A` record at home public IP; forward port 443 on router to `192.168.8.126`.
- [ ] **Let's Encrypt SSL on tallyfin.io** — once DNS is live: run Certbot on CT 200, update nginx config to use real cert + domain. Unblocks OAuth and Apple login.
- [ ] **Google OAuth** — Passport strategy already wired; just needs `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` in `config.env` and a Google Cloud Console OAuth app with `https://tallyfin.io` as the authorized redirect URI. Blocked on real SSL cert.

## 🟡 Soon

- [ ] **Apple Sign-In** — requires Apple Developer account ($99/yr), Sign In with Apple capability, and a real domain with valid SSL. Blocked on tallyfin.io + Let's Encrypt being done first.
- [ ] **Forgot password** — "Forgot password?" link on login; sends a time-limited reset token via email. Depends on SMTP being configured (same as scheduled reports).
- [ ] **Email scheduled reports** — weekly/monthly summary email (net worth, spending by category, upcoming bills) via SMTP/sendmail. Cron-triggered server job.
- [ ] **Semi-monthly frequency improvements** — currently uses two fixed due days; consider "1st and 3rd Friday" style recurrence for more natural paycheck schedules.

## 🟢 Nice to Have

- [ ] **Direct bank downloads** — pull transactions automatically from financial institutions without manual export. Two viable approaches: (1) **OFX Direct Connect** — the OFX protocol supports direct server-to-server connections; many banks still support it (Chase, Wells Fargo, Fidelity, etc.) using username/password or MFA. Libraries: `ofx4js` or a custom HTTP client hitting the bank's OFX endpoint URL. (2) **Plaid / Finicity / MX** — aggregation APIs that handle bank auth and return normalized transactions; Plaid has a free dev tier. OFX Direct Connect is the open-source-first choice (no third party, no subscription) but requires per-bank endpoint research. Worth prototyping against one institution first.
- [ ] **Integration tests** — Express route integration tests against a real test DB (can reuse staging Postgres). Parser unit tests are done; route/DB tests are not.

---

## Shipped

- [x] **Batch ZIP import** — shipped v1.19.0: drop a ZIP of QIF/OFX/CSV files and all accounts import in one pass.
- [x] **Split transactions** — shipped v1.17.0: "⊕ Split" tab; split lines per category; allocation indicator; "Split" chip in register.
- [x] **User-configurable news feeds** — shipped v1.16.0: "⚙ Sources" panel; add/remove RSS feeds per user; stored in `news_feeds` table.
- [x] **PDF export of MANUAL.md** — shipped v1.15.0: `GET /api/manual` and `GET /api/manual.pdf`; "📖 Manual" link in sidebar footer.
- [x] **Automated tests** — shipped v1.15.0: Jest unit tests for QIF/OFX/CSV parsers (40 tests).
- [x] **API token auth** — shipped v1.14.0: Bearer token auth via `api_tokens` table.
- [x] **Mobile / responsive design** — shipped v1.14.0.
- [x] **Recurring transaction auto-post** — shipped v1.14.0: cron-triggered `auto-post-bills.js`.
- [x] **Budget rollover** — shipped v1.14.0: per-category rollover with green indicator.
- [x] **CSV export** — shipped v1.14.0: per-account and search results.
- [x] **Sortable columns** — shipped v1.14.0: register, bills, search.
- [x] **Dark mode** — shipped v1.14.0: toggle in sidebar footer, persisted in localStorage.
- [x] **Paycheck income forecasting** — shipped v1.14.0: Expected/Received/Net in Budget view.
- [x] **Transfer between accounts** — shipped v1.13.0: atomic double-entry transfers.
- [x] **CI/CD pipeline with staging** — shipped v1.10.0: GitHub Actions → staging CT 201 → smoke tests → prod CT 200.
- [x] **Database backup automation** — systemd timer for daily `pg_dump` with offsite rsync.
- [x] **GitHub Pages landing page** — live at https://feedmittens.github.io/money-app/
