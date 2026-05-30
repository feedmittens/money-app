# BV Money — Backlog

Items here are ideas and future work, not committed roadmap. Roughly grouped by area.

---

## UI / UX

- [ ] **Responsive / mobile-friendly web design** — current layout assumes a wide desktop screen. Make the sidebar collapsible, stack the register columns on narrow viewports, and generally make it usable on a tablet or phone browser.

## Platform

- [ ] **Companion phone app** — native or cross-platform (React Native / Expo) mobile app that can open and sync with the same `.db` file. Key consideration: the File System Access API is desktop-only, so mobile needs a different sync strategy (iCloud, local Wi-Fi sync to the desktop, or a shared drive).

## Features

- [ ] **Tax-relevant transactions + attachments** — flag transactions as tax-relevant, attach receipts/documents (stored as BLOBs in the `.db` file), and export a ZIP of all tax-relevant entries with their attachments for filing season.
- [ ] **Reports section** — exportable summaries: spending by category, income vs. expenses by month, net worth history, tax-relevant transaction list.

## Infrastructure

- [ ] **CI/CD pipeline** — automated build + deploy on push to main (GitHub Actions triggering a deploy to the Proxmox LXC container).
- [ ] **Automated tests** — unit tests for the QIF/OFX/CSV parsers and the `importData` logic; integration tests for the Express import API.
