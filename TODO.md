# Tally — Backlog

Items here are ideas and future work, not committed roadmap. Roughly grouped by area.

---

## Features

- [ ] **Forgot password** — "Forgot password?" link on the login page; sends a time-limited reset token via email; requires SMTP to be configured. Depends on the same email infrastructure as scheduled reports.
- [ ] **Email scheduled reports** — send a weekly or monthly summary email (net worth, spending by category, upcoming bills) via SMTP/sendmail. Likely a cron-triggered server job.
- [ ] **Semi-monthly frequency improvements** — currently `semimonthly` uses two fixed due days; consider allowing "1st and 3rd Friday" style recurrence for more natural paycheck schedules.
- [ ] **Let's Encrypt SSL** — replace the self-signed cert with a real cert so browsers don't warn on every visit. Needs a domain name pointed at the container.
- [x] **API token auth** — shipped v1.14.0: Bearer token auth via `api_tokens` table; all API routes accept `Authorization: Bearer <token>`; managed via the 🔑 API Tokens sidebar section.
- [x] **Mobile / responsive design** — shipped v1.14.0: sidebar collapses with ☰ hamburger button; tables scroll horizontally; summary cards go 2-column; modals go full-width.
- [x] **Transfer between accounts** — shipped v1.13.0: Transfer mode in the transaction form creates both legs atomically and cross-links them.
- [x] **Recurring transaction auto-post** — shipped v1.14.0: per-bill "Auto-post when due" checkbox; `server/scripts/auto-post-bills.js` runs via cron.
- [x] **Budget rollover** — shipped v1.14.0: per-category ↩ toggle carries unspent budget forward; rolled-over amount shown in green.
- [x] **Split transactions** — shipped v1.17.0: "⊕ Split" tab on the transaction form; split lines per category; allocation indicator; "Split" chip in register.
- [x] **Search result export** — shipped v1.14.0: "Export CSV" button on the Search page.
- [x] **Sortable columns** — shipped v1.14.0: clickable column headers in transaction register, bills list, and search results with ▲/▼ indicator.
- [x] **CSV export per account** — shipped v1.14.0: "Export CSV" button in account register header.
- [x] **Night / day theme toggle** — shipped v1.14.0: dark mode toggle (🌙/☀️) in sidebar footer; preference persisted in localStorage.
- [x] **News feed HTML entities** — shipped v1.14.0: `decodeEntities()` in `news.js` handles `&amp;`, `&lt;`, numeric references, etc.
- [x] **News feed customization** — shipped v1.16.0: "⚙ Sources" panel in Dashboard news card; add/remove RSS feeds per user; stored in `news_feeds` table; auto-seeds NPR + BBC defaults.
- [x] **News feed last-updated timestamp** — shipped v1.14.0: shows actual refresh time instead of static "Updated hourly".
- [x] **Dashboard upcoming bills → clickable** — shipped v1.14.0: upcoming bill rows navigate to Bills & Income.
- [x] **UI tooltips** — shipped v1.14.0: `title` attributes on cleared badge, attachment ✕, bills modal close, sort column headers, month filter.
- [x] **Paycheck income forecasting** — shipped v1.14.0: Budget page shows Expected Income, Income Received, and Net summary cards.
- [x] **PDF export of MANUAL.md** — shipped v1.15.0: `GET /api/manual` serves raw Markdown; `GET /api/manual.pdf` generates PDF via pandoc (requires pandoc in container); "📖 Manual" link in sidebar footer.

## Infrastructure

- [x] **CI/CD pipeline with staging** — shipped v1.10.0: GitHub Actions deploy workflow (staging CT 201 → smoke test → prod CT 200), CodeQL + npm audit security scanning, Dependabot.
- [x] **GitHub Pages landing page** — live at https://feedmittens.github.io/money-app/
- [x] **Automated tests** — shipped v1.15.0: Jest unit tests for QIF/OFX/CSV parsers (`server/tests/parsers.test.js`, 40 tests). Run with `npm test` in `server/`. Integration tests against a real DB still not written.
- [x] **Database backup automation** — shipped: systemd timer for daily `pg_dump` with offsite rsync.
- [ ] **Let's Encrypt SSL** — needs a domain name pointed at the container.

## Nice to Have

- [ ] **Integration tests** — Express route integration tests against a real test DB (can reuse staging Postgres instance). Parser unit tests are done; route/DB tests are not.
