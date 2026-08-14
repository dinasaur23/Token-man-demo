#!/usr/bin/env bash
# Idempotent dependency setup for the Token Manager prototype.
# Installs MongoDB (only when missing) and the client/server npm dependencies.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# MongoDB Community Server is a stable system dependency. Install it only when
# it is not already present (e.g. when running on the plain default image
# instead of a snapshot that already contains it).
if ! command -v mongod >/dev/null 2>&1; then
  echo "==> Installing MongoDB Community Server 8.0"
  curl -fsSL https://pgp.mongodb.com/server-8.0.asc \
    | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor --yes
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" \
    | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
  sudo apt-get update -y
  sudo apt-get install -y mongodb-org
else
  echo "==> MongoDB already installed: $(mongod --version | head -1)"
fi

echo "==> Installing server dependencies"
( cd "$ROOT/server" && npm ci )

echo "==> Installing client dependencies"
( cd "$ROOT/client" && npm ci )

echo "==> Install complete"
