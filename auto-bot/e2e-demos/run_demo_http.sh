#!/usr/bin/env bash
# Serves the DOM fixture on http://127.0.0.1:8765 for Puppeteer demos.
set -euo pipefail
cd "$(dirname "$0")/fixtures"
exec python3 -m http.server 8765 --bind 127.0.0.1
