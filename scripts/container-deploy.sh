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
DB_USER=$(grep '^DATABASE_URL=' "$ENV_FILE" | sed -E 's|^DATABASE_URL=[a-z]+://([^:]+):.*|\1|' | tr -d '\r\n')
su -s /bin/bash postgres -c "psql -d '$DB_NAME' -f '$APP_DIR/server/schema.sql'"
echo "   ✓ Schema up to date"

# schema.sql runs as the postgres superuser, so any table/sequence it creates
# is owned by postgres and the app role has no rights to it. Without this the
# app throws "permission denied for schema public" on any release that adds a
# table. ALTER DEFAULT PRIVILEGES only covers FUTURE objects, so the explicit
# GRANTs are still needed for the ones just created.
echo "── Granting privileges to app role ($DB_USER) ───────────────"
su -s /bin/bash postgres -c "psql -d '$DB_NAME' -c \"
  GRANT USAGE, CREATE ON SCHEMA public TO $DB_USER;
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO $DB_USER;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO $DB_USER;
\"" > /dev/null
echo "   ✓ Privileges granted"

echo "── Rebuilding client ────────────────────────────────────────"
npm run build --prefix client

echo "── Updating served files ────────────────────────────────────"
cp -rf client/dist/. /var/www/html/

echo "── Restarting API server ────────────────────────────────────"
systemctl restart money-app-api
nginx -s reload

echo ""
echo "✓ Deploy complete"
