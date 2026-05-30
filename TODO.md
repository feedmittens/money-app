# BV Money — Backlog

Items here are ideas and future work, not committed roadmap. Roughly grouped by area.

---

## Features

- [ ] **Email scheduled reports** — send a weekly or monthly summary email (net worth, spending by category, upcoming bills) via SMTP/sendmail. Likely a cron-triggered server job.
- [ ] **Semi-monthly frequency improvements** — currently `semimonthly` uses two fixed due days; consider allowing "1st and 3rd Friday" style recurrence for more natural paycheck schedules.
- [ ] **API token auth** — session cookies work great for the web app, but a future mobile app or CLI client needs a token-based auth option (Bearer token or API key) instead of cookies.
- [ ] **Mobile / responsive design** — current layout assumes a wide desktop screen. Make the sidebar collapsible and stack register columns on narrow viewports.
- [ ] **Transfer between accounts** — entering a transfer currently requires two manual transactions. A "Transfer" mode that creates both sides atomically would prevent balance errors.
- [ ] **Recurring transaction auto-post** — option to auto-create a transaction when a bill is due, rather than requiring manual "Pay" clicks.
- [ ] **Budget rollover** — option to carry unspent budget from one month to the next.
- [ ] **Split transactions** — single transaction split across multiple categories (e.g., grocery run with a clothing purchase mixed in).
- [ ] **Search result export** — export search results to CSV, same as reports.
- [ ] **Sortable columns** — click any column header in the transaction register, bills list, and search results to sort ascending/descending. Should show a sort indicator (▲▼) on the active column.
- [ ] **CSV export per account** — export a single account's transactions as CSV. If multiple accounts are selected, produce a ZIP of per-account CSV files.
- [ ] **PDF export of reports** — browser print-to-PDF for any report tab (spending, monthly, tax, forecast). Could use `window.print()` with a print-specific stylesheet, or a server-side PDF generation library.
- [ ] **Night / day theme toggle** — dark mode CSS variable set already stubbed; needs a second theme definition and a toggle in the sidebar footer. Persist preference in localStorage.

## Infrastructure

- [ ] **CI/CD pipeline** — automated build + deploy on push to main (GitHub Actions triggering a deploy to the Proxmox LXC container via SSH).
- [ ] **Automated tests** — unit tests for QIF/OFX/CSV parsers; integration tests for Express API routes against a real test database.
- [ ] **Database backup automation** — scheduled `pg_dump` with offsite copy (rsync to NAS, S3-compatible bucket, etc.). Currently requires manual backup.
- [ ] **Let's Encrypt SSL** — replace the self-signed cert with a real cert so browsers don't warn on every visit. Needs a domain name pointed at the container.

## Nice to Have

- [ ] **Dark mode toggle** — CSS variables are already structured for it; just need a second theme definition and a toggle in the sidebar footer.
- [ ] **Paycheck income forecasting** — when income bills are defined, show them as positive bars in the budget view and as net income in the monthly forecast.
- [ ] **PDF export of MANUAL.md** — bundle pandoc in the container so `GET /manual.pdf` generates a fresh PDF from the Markdown source.
