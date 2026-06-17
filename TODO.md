# Tally — Backlog

Items here are ideas and future work, not committed roadmap. Roughly grouped by area.

---

## Features

- [ ] **Email scheduled reports** — send a weekly or monthly summary email (net worth, spending by category, upcoming bills) via SMTP/sendmail. Likely a cron-triggered server job.
- [ ] **Semi-monthly frequency improvements** — currently `semimonthly` uses two fixed due days; consider allowing "1st and 3rd Friday" style recurrence for more natural paycheck schedules.
- [ ] **API token auth** — session cookies work great for the web app, but a future mobile app or CLI client needs a token-based auth option (Bearer token or API key) instead of cookies.
- [ ] **Mobile / responsive design** — current layout assumes a wide desktop screen. Make the sidebar collapsible and stack register columns on narrow viewports.
- [x] **Transfer between accounts** — shipped v1.13.0: Transfer mode in the transaction form creates both legs atomically and cross-links them.
- [ ] **Recurring transaction auto-post** — option to auto-create a transaction when a bill is due, rather than requiring manual "Pay" clicks.
- [ ] **Budget rollover** — option to carry unspent budget from one month to the next.
- [ ] **Split transactions** — single transaction split across multiple categories (e.g., grocery run with a clothing purchase mixed in).
- [ ] **Search result export** — export search results to CSV, same as reports.
- [ ] **Sortable columns** — click any column header in the transaction register, bills list, and search results to sort ascending/descending. Should show a sort indicator (▲▼) on the active column.
- [ ] **CSV export per account** — export a single account's transactions as CSV. If multiple accounts are selected, produce a ZIP of per-account CSV files.
- [ ] **Night / day theme toggle** — dark mode CSS variables are already stubbed; needs a second theme definition and a toggle in the sidebar footer. Persist preference in localStorage.
- [ ] **News feed HTML entities** — RSS titles/descriptions sometimes contain raw HTML entities (e.g. `&amp;` instead of `&`). Decode them server-side in `news.js` before returning JSON.
- [ ] **News feed customization** — allow user to configure which topics/sources appear in the news feed (stored in user preferences). Also show last-updated timestamp next to "Updated hourly" so the user knows how stale the cache is.
- [ ] **Dashboard upcoming bills → clickable** — clicking an upcoming bill on the Dashboard should navigate to that bill in Bills & Income so the user can edit it or record it directly.
- [ ] **UI tooltips** — hover tooltips on buttons and controls that aren't obviously labeled (e.g., the cleared badge, 🔁 recurring button, column headers). Use the `title` attribute for simple cases; a lightweight tooltip library for richer ones.

## Infrastructure

- [x] **CI/CD pipeline with staging** — shipped v1.10.0: GitHub Actions deploy workflow (staging CT 201 → smoke test → prod CT 200), CodeQL + npm audit security scanning, Dependabot.
- [x] **GitHub Pages landing page** — live at https://feedmittens.github.io/money-app/
- [ ] **Automated tests** — unit tests for QIF/OFX/CSV parsers; integration tests for Express API routes against a real test database (can reuse the staging Postgres instance).
- [ ] **Database backup automation** — scheduled `pg_dump` with offsite copy (rsync to NAS, S3-compatible bucket, etc.). Currently requires manual backup.
- [ ] **Let's Encrypt SSL** — replace the self-signed cert with a real cert so browsers don't warn on every visit. Needs a domain name pointed at the container.

## Nice to Have

- [ ] **Paycheck income forecasting** — when income bills are defined, show them as positive bars in the budget view and as net income in the monthly forecast.
- [ ] **PDF export of MANUAL.md** — bundle pandoc in the container so `GET /manual.pdf` generates a fresh PDF from the Markdown source.
