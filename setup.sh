#!/bin/bash
# One-time setup script for Money App
# Run: bash setup.sh

set -e

echo "=== Money App Setup ==="

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

# Install root deps (concurrently)
echo ""
echo "Installing root dependencies..."
npm install

# Install server deps
echo ""
echo "Installing server dependencies..."
npm install --prefix server

# Install client deps
echo ""
echo "Installing client dependencies..."
npm install --prefix client

echo ""
echo "=== Setup complete! ==="
echo ""
echo "To start the app:"
echo "  cd /home/bvogel/money-app"
echo "  npm run dev"
echo ""
echo "Then open http://localhost:5173"
