#!/bin/bash
# One-time setup script for Money App
# Run as root on the Proxmox LXC container: bash setup.sh

set -e

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Money App Setup ==="
echo "Install directory: $INSTALL_DIR"

# Install Node.js if missing
if ! command -v node &>/dev/null; then
  echo ""
  echo "Node.js not found. Installing via nvm..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  source "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm use 20
  echo "Node.js installed: $(node --version)"
else
  echo "Node.js found: $(node --version)"
fi

# Install root deps (concurrently, etc.)
echo ""
echo "Installing root dependencies..."
npm install

# Install server deps
echo ""
echo "Installing server dependencies..."
npm install --prefix server

# Install client deps and build
echo ""
echo "Installing client dependencies..."
npm install --prefix client

echo ""
echo "Building client..."
npm run build --prefix client

# ── Nginx ──────────────────────────────────────────────────────────────────
if command -v nginx &>/dev/null; then
  echo ""
  echo "Configuring nginx..."

  NGINX_CONF_DIR=""
  if [ -d /etc/nginx/sites-available ]; then
    # Debian/Ubuntu style
    cp "$INSTALL_DIR/infra/nginx.conf" /etc/nginx/sites-available/money-app
    ln -sf /etc/nginx/sites-available/money-app /etc/nginx/sites-enabled/money-app
    rm -f /etc/nginx/sites-enabled/default
    NGINX_CONF_DIR="sites-available"
  elif [ -d /etc/nginx/conf.d ]; then
    # RHEL/Alpine style
    cp "$INSTALL_DIR/infra/nginx.conf" /etc/nginx/conf.d/money-app.conf
    rm -f /etc/nginx/conf.d/default.conf
    NGINX_CONF_DIR="conf.d"
  fi

  # Point nginx root at the built client
  sed -i "s|root /usr/share/nginx/html|root $INSTALL_DIR/client/dist|" \
    /etc/nginx/sites-available/money-app 2>/dev/null || \
  sed -i "s|root /usr/share/nginx/html|root $INSTALL_DIR/client/dist|" \
    /etc/nginx/conf.d/money-app.conf 2>/dev/null || true

  nginx -t && systemctl reload nginx
  echo "nginx configured (${NGINX_CONF_DIR})"
else
  echo ""
  echo "nginx not found — skipping nginx configuration."
  echo "Install nginx and re-run, or manually copy infra/nginx.conf."
fi

# ── Systemd service ────────────────────────────────────────────────────────
if command -v systemctl &>/dev/null; then
  echo ""
  echo "Installing API service..."

  # Write service file with the actual install path substituted
  sed "s|/opt/money-app|$INSTALL_DIR|g" \
    "$INSTALL_DIR/infra/money-app-api.service" \
    > /etc/systemd/system/money-app-api.service

  systemctl daemon-reload
  systemctl enable money-app-api
  systemctl restart money-app-api
  echo "API service enabled and started (port 3001)"
else
  echo ""
  echo "systemctl not found — skipping service setup."
  echo "Start the API server manually: node $INSTALL_DIR/server/server.js"
fi

echo ""
echo "=== Setup complete! ==="
echo ""
echo "The app should now be accessible on port 80 (nginx)."
echo "API server is running on http://localhost:3001 (proxied via nginx)."
echo ""
echo "To update after a git pull:"
echo "  npm run build --prefix client   # rebuild frontend"
echo "  systemctl restart money-app-api # restart API server"
echo "  systemctl reload nginx           # reload nginx if config changed"
echo ""
echo "For local development:"
echo "  npm run dev   # starts both frontend (port 5173) and API (port 3001)"
