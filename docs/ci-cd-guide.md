# BV Money — CI/CD & Automation Guide

**Last updated:** 2026-05-31  
This guide covers the deployment pipeline, self-hosted runner, GitHub Issues automation, and how to troubleshoot them.

---

## Overview

Every push to `main` on GitHub triggers an automated pipeline:

```
Push to main
  └─► GitHub Actions (self-hosted runner on Proxmox)
        ├─► Deploy → Staging (CT 201, 192.168.1.175)
        │     └─► Smoke tests (9 checks)
        │           ├─ PASS → Deploy → Prod (CT 200, 192.168.1.126)
        │           │           └─► Smoke tests
        │           └─ FAIL → Stop. Prod untouched.
        └─► (GitHub Issues → Claude → PR, on demand)
```

**No more running `bash deploy.sh` by hand.** Push to main and walk away.

---

## Infrastructure

| Component | Where | What |
|---|---|---|
| Proxmox host | 192.168.1.201 | Hypervisor — runs both containers and the GitHub runner |
| Prod container | CT 200 · 192.168.1.126 | Live app (`bvmoney` database) |
| Staging container | CT 201 · 192.168.1.175 | Pre-prod gate (`bvmoney_staging` database, fresh — no real data) |
| GitHub runner | Proxmox host · `/opt/github-runner` | Self-hosted because Proxmox is on a private IP |
| Runner service | `actions.runner.feedmittens-money-app.proxmox-host.service` | Runs as root so it can use `pct` commands |

---

## How the Pipeline Works

### Why self-hosted?

GitHub's cloud runners can't reach `192.168.1.201` — it's a private home network IP. A **self-hosted runner** is a small agent you install on Proxmox. It connects outbound to GitHub over HTTPS, receives jobs, and runs them locally with full access to `pct` commands.

### The deploy job (staging and prod share the same script)

`scripts/container-deploy.sh` runs inside each LXC container:

1. `git pull --ff-only` — pull latest code from GitHub
2. `npm ci` — install any new dependencies
3. `psql -f schema.sql` — run schema migrations (idempotent — safe to run every time)
4. `npm run build` — rebuild the React frontend
5. Copy built files to `/var/www/html/`
6. `systemctl restart money-app-api` + `nginx -s reload`

The DB name is read from `server/.env` dynamically, so the same script works for both `bvmoney` (prod) and `bvmoney_staging` (staging).

### Smoke tests

`test/smoke.sh` runs 9 `curl` checks against the deployed container:

- Nginx is serving static files (HTTP 200 on `/`)
- All authenticated API endpoints correctly return 401 when no session cookie
- Bad request bodies return 400 (not 500 — confirms the server didn't crash)

If any check fails, the staging job fails and the prod job is skipped entirely.

### Concurrency

The workflow has `concurrency: group: deploy, cancel-in-progress: true`. If you push twice in quick succession, the first run is cancelled and only the latest runs. This prevents race conditions.

---

## GitHub Issues → Claude Code

Label any GitHub Issue with the **`claude`** label and `.github/workflows/claude-issue.yml` fires:

1. Claude Code reads the issue title and body
2. Creates a branch `claude/issue-N`
3. Implements the change following the rules in `CLAUDE.md`
4. Commits, pushes, opens a PR
5. Comments on the issue: "🤖 Implementation complete. PR opened for your review."

You review the PR. If it looks good, merge it. Merging triggers the deploy pipeline automatically.

**Requirements:**
- `ANTHROPIC_API_KEY` must be set in GitHub Secrets (repo Settings → Secrets → Actions)
- The self-hosted runner must be running

**When to use it:**
- Small, well-described features or bug fixes
- The issue should clearly describe the desired behavior, not just "make it better"
- Always review the PR before merging — Claude's implementation is a starting point, not a guarantee

---

## Managing the Runner

**Check runner status:**
```bash
ssh root@192.168.1.201
systemctl status 'actions.runner.*'
```

**View live logs:**
```bash
journalctl -u 'actions.runner.*' -f
```

**Restart the runner:**
```bash
systemctl restart 'actions.runner.*'
```

**Runner registration expires?** If you need to re-register (e.g. after a full reinstall):
1. Go to https://github.com/feedmittens/money-app/settings/actions/runners/new
2. Copy the token
3. `bash /tmp/setup-github-runner.sh <TOKEN>` (re-upload from `scripts/` if needed)

---

## Managing the Staging Container

**Start/stop:**
```bash
ssh root@192.168.1.201
pct start 201   # start staging
pct stop 201    # stop staging (saves resources when not needed)
```

**Shell into staging:**
```bash
pct exec 201 -- bash
```

**Staging DB is isolated.** It uses `bvmoney_staging` — a fresh database with no real financial data. You can trash it, reset it, or run experiments without touching prod.

**Reset staging DB:**
```bash
pct exec 201 -- su postgres -c "psql -c 'DROP DATABASE bvmoney_staging; CREATE DATABASE bvmoney_staging;'"
pct exec 201 -- su -s /bin/bash postgres -c "psql -d bvmoney_staging -f /opt/money-app/server/schema.sql"
```

---

## Troubleshooting

**Pipeline fails on staging deploy:**
1. Check the Actions tab on GitHub for the exact error
2. SSH to Proxmox: `pct exec 201 -- journalctl -u money-app-api -n 30`
3. Manually test: `bash test/smoke.sh https://192.168.1.175`

**Runner not picking up jobs:**
1. Check it's connected: `journalctl -u 'actions.runner.*' | grep -i connected`
2. Check GitHub: https://github.com/feedmittens/money-app/settings/actions/runners
3. Restart it: `systemctl restart 'actions.runner.*'`

**Runner token expired:** GitHub runner registration tokens expire after 1 hour. If you're re-registering: get a new token from the runners settings page.

**Smoke test check failing with unexpected HTTP code:**
- 502 = nginx is up but the Node process isn't running (`systemctl status money-app-api`)
- 404 on `/` = nginx misconfiguration or static files missing
- 500 on API = DB connection failed (check `server/.env` DATABASE_URL)

---

## Key Files

| File | Purpose |
|---|---|
| `.github/workflows/deploy.yml` | Main CI/CD pipeline |
| `.github/workflows/claude-issue.yml` | GitHub Issues → Claude automation |
| `test/smoke.sh` | Smoke test suite |
| `scripts/container-deploy.sh` | Deploy script that runs inside each LXC |
| `scripts/setup-github-runner.sh` | One-command runner install |
| `scripts/setup-staging.sh` | Configure a freshly-cloned staging container |

---

## Reusing This Pattern for Other Projects

The same architecture works for any self-hosted app on Proxmox:

1. **Clone the container** for staging: `pct clone <PROD_ID> <STAGING_ID> --full --storage local-lvm`
2. **Install the runner** on Proxmox once (it can serve multiple repos — add more runners or use labels)
3. **Write a `container-deploy.sh`** for your app's build/restart sequence
4. **Copy `.github/workflows/deploy.yml`** and update the container IDs and smoke test URLs
5. **Add `test/smoke.sh`** with checks appropriate for your app's endpoints

The Claude Issues workflow is also fully reusable — just copy `.github/workflows/claude-issue.yml` and set `ANTHROPIC_API_KEY` in the new repo's secrets.
