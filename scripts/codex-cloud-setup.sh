#!/usr/bin/env bash
# Codex Cloud setup script for fhir-place.
#
# Configure the Codex cloud environment setup command to run:
#   scripts/codex-cloud-setup.sh
#
# Keep this script deterministic and secret-free. Codex Cloud secrets are
# available to setup, but removed before the agent phase; agent credentials
# must be provided by Codex integrations or explicit environment variables.

set -Eeuo pipefail

cd "${CODEX_WORKTREE_PATH:-$(pwd)}"

corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
