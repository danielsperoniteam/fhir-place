#!/bin/bash
set -euo pipefail

# Only run in remote Claude Code (web) sessions
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Ensure pnpm is available
if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm@10.33.0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# Install all workspace dependencies (fast when node_modules is cached)
pnpm install

# Build the react-fhir package so the demo app can import it
pnpm --filter @fhir-place/react-fhir build

# Install Playwright's Chromium browser if not already present
npx playwright install chromium --with-deps 2>/dev/null || true
