#!/usr/bin/env sh
set -eu

# Usage: ./start-all.sh [--configure] [--yes]
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install Node.js 22 or newer, then run this script again." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required. Install Node.js with npm, then run this script again." >&2
  exit 1
fi

exec node scripts/start-all.mjs "$@"
