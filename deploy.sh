#!/usr/bin/env bash
# Run this ON THE MUDHAVEN HOST, from inside ~/mud, to pull the latest
# commit from GitHub and restart the running server.
set -euo pipefail
cd "$(dirname "$0")"

echo "== Pulling latest from GitHub =="
git pull

echo "== Restarting mudowski.service =="
systemctl --user restart mudowski.service
sleep 1
systemctl --user status mudowski.service --no-pager
