#!/usr/bin/env bash
# Install and register a GitHub Actions self-hosted runner on this Proxmox host.
# Run as root on the Proxmox host (192.168.1.201).
#
# Usage:
#   bash setup-github-runner.sh <REGISTRATION_TOKEN>
#
# Get the token from:
#   https://github.com/feedmittens/money-app/settings/actions/runners/new
#   (select Linux x64, copy the token from the "Configure" step)
set -euo pipefail

TOKEN="${1:?Usage: $0 <GITHUB_RUNNER_TOKEN>}"
RUNNER_VERSION="2.321.0"
RUNNER_DIR="/opt/github-runner"
REPO_URL="https://github.com/feedmittens/money-app"

echo "=== Installing GitHub Actions self-hosted runner ==="
echo "    Repo:    $REPO_URL"
echo "    Dir:     $RUNNER_DIR"
echo "    Version: $RUNNER_VERSION"
echo ""

# Install dependencies
apt-get install -y --quiet libicu-dev libssl-dev > /dev/null

# Download runner
mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

ARCHIVE="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
if [[ ! -f "$ARCHIVE" ]]; then
  curl -sL "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${ARCHIVE}" \
    -o "$ARCHIVE"
fi

tar xzf "$ARCHIVE" --skip-old-files

# Configure the runner
./config.sh \
  --url "$REPO_URL" \
  --token "$TOKEN" \
  --name "proxmox-host" \
  --labels "self-hosted,proxmox,linux,x64" \
  --work "_work" \
  --unattended

# Install as a systemd service
./svc.sh install root
./svc.sh start

echo ""
echo "=== Runner installed and started ==="
echo "    Status: $(./svc.sh status 2>/dev/null | grep -o 'active.*' || echo 'see: systemctl status actions.runner.*')"
echo ""
echo "Check GitHub: https://github.com/feedmittens/money-app/settings/actions/runners"
echo "The runner should appear as 'proxmox-host' with status Idle."
