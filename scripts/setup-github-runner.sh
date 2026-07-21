#!/usr/bin/env bash
# Install and register a GitHub Actions self-hosted runner on this Proxmox host.
# Must be run as root (uses sudo internally where needed).
#
# Usage:
#   bash setup-github-runner.sh <REGISTRATION_TOKEN>
#
# Get the token from:
#   https://github.com/feedmittens/money-app/settings/actions/runners/new
set -euo pipefail

TOKEN="${1:?Usage: $0 <GITHUB_RUNNER_TOKEN>}"
RUNNER_VERSION="2.321.0"
RUNNER_DIR="/opt/github-runner"
RUNNER_USER="github-runner"
REPO_URL="https://github.com/feedmittens/money-app"

echo "=== Installing GitHub Actions self-hosted runner ==="

# Install dependencies
apt-get install -y --quiet libicu-dev libssl-dev curl > /dev/null

# Create a dedicated non-root user for the runner
if ! id "$RUNNER_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$RUNNER_USER"
  echo "Created user: $RUNNER_USER"
fi

# The runner user needs to run pct commands — add to group that can sudo pct
# (simplest: give passwordless sudo for pct specifically)
echo "$RUNNER_USER ALL=(ALL) NOPASSWD: /usr/sbin/pct" > /etc/sudoers.d/github-runner
chmod 440 /etc/sudoers.d/github-runner

# Download runner archive
mkdir -p "$RUNNER_DIR"
chown "$RUNNER_USER:$RUNNER_USER" "$RUNNER_DIR"

ARCHIVE="actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
if [[ ! -f "/tmp/$ARCHIVE" ]]; then
  echo "Downloading runner v${RUNNER_VERSION}..."
  curl -sL "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${ARCHIVE}" \
    -o "/tmp/$ARCHIVE"
fi
cp "/tmp/$ARCHIVE" "$RUNNER_DIR/"

# Extract and configure as the runner user (config.sh rejects root)
su -s /bin/bash "$RUNNER_USER" -c "
  cd '$RUNNER_DIR'
  tar xzf '$ARCHIVE' --skip-old-files
  ./config.sh \
    --url '$REPO_URL' \
    --token '$TOKEN' \
    --name 'proxmox-host' \
    --labels 'self-hosted,proxmox,linux,x64' \
    --work '_work' \
    --unattended
"

# Install and start the systemd service (requires root)
cd "$RUNNER_DIR"
./svc.sh install "$RUNNER_USER"
./svc.sh start

echo ""
echo "=== Runner installed and started ==="
echo "Check: https://github.com/feedmittens/money-app/settings/actions/runners"
echo "The runner 'proxmox-host' should appear as Idle within a few seconds."
