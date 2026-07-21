#!/usr/bin/env bash
# Runs INSIDE an LXC container to deploy the latest code.
# Works for both prod (bvmoney) and staging (bvmoney_staging) — reads DB name from .env.
set -euo pipefail

APP_DIR="/opt/money-app"
ENV_FILE="$APP_DIR/server/.env"

echo "── Pulling latest code ──────────────────────────────────────"
cd "$APP_DIR"
git pull --ff-only

echo "── Updating dependencies ────────────────────────────────────"
npm ci --prefix client --silent
npm ci --prefix server --silent

echo "── Applying schema migrations ───────────────────────────────"
DB_NAME=$(grep '^DATABASE_URL=' "$ENV_FILE" | sed 's|.*/||' | tr -d '\r\n')
su -s /bin/bash postgres -c "psql -d '$DB_NAME' -f '$APP_DIR/server/schema.sql'"
echo "   ✓ Schema up to date"

echo "── Rebuilding client ────────────────────────────────────────"
npm run build --prefix client

echo "── Updating served files ────────────────────────────────────"
cp -rf client/dist/. /var/www/html/

echo "── Restarting API server ────────────────────────────────────"
systemctl restart money-app-api
nginx -s reload

echo ""
echo "✓ Deploy complete"
