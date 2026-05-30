#!/usr/bin/env bash
# Set up the staging LXC (container 201) after cloning from prod (container 200).
# Run as root on the Proxmox host (192.168.1.201).
#
# Prerequisites:
#   pct clone 200 201 --full --storage local-lvm --hostname money-app-staging
#   pct start 201
#
# Usage:
#   bash setup-staging.sh
set -euo pipefail

CT=201

echo "=== Configuring staging container (CT $CT) ==="

# Wait for container to be fully up
sleep 5

# Update hostname
pct exec $CT -- bash -c 'echo money-app-staging > /etc/hostname && hostname money-app-staging'

# Create a fresh staging database (separate from prod)
pct exec $CT -- su postgres -c "psql -c \"
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='bvmoney_staging';
  DROP DATABASE IF EXISTS bvmoney_staging;
  CREATE DATABASE bvmoney_staging;
  GRANT ALL PRIVILEGES ON DATABASE bvmoney_staging TO bvmoney;
\""

# Update the .env to point at staging DB
pct exec $CT -- bash -c "
  sed -i 's|DATABASE_URL=.*bvmoney.*|DATABASE_URL=postgresql://bvmoney:'\$(grep -o 'postgresql://[^@]*@' /opt/money-app/server/.env | sed 's|postgresql://||;s|@||;s|.*:||')'\@localhost/bvmoney_staging|' /opt/money-app/server/.env
"

# Simpler: just set ADMIN_EMAIL and SESSION_SECRET to staging values, keep same DB user/pass
# but point at bvmoney_staging
CURRENT_URL=$(pct exec $CT -- bash -c 'grep DATABASE_URL /opt/money-app/server/.env')
STAGING_URL="${CURRENT_URL/bvmoney/bvmoney_staging}"
pct exec $CT -- bash -c "sed -i 's|^DATABASE_URL=.*|${STAGING_URL}|' /opt/money-app/server/.env"

# Run schema migrations on the staging DB
pct exec $CT -- su -s /bin/bash postgres -c "psql -d bvmoney_staging -f /opt/money-app/server/schema.sql" 2>&1 | grep -v NOTICE || true

# Grant permissions on staging DB
pct exec $CT -- su postgres -c "psql -d bvmoney_staging -c \"
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO bvmoney;
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO bvmoney;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO bvmoney;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO bvmoney;
\""

# Restart the API on staging
pct exec $CT -- systemctl restart money-app-api

sleep 3

STAGING_IP=$(pct exec $CT -- hostname -I | awk '{print $1}')
echo ""
echo "=== Staging ready ==="
echo "    IP: $STAGING_IP"
echo "    App: https://$STAGING_IP"
echo "    DB:  bvmoney_staging (fresh, no prod data)"
echo ""
echo "Run smoke tests:"
echo "    bash test/smoke.sh https://$STAGING_IP"
