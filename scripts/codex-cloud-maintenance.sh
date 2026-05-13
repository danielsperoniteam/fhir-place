#!/usr/bin/env bash
# Codex Cloud maintenance script for resumed cached containers.
#
# Configure this as the optional maintenance command in the Codex cloud
# environment. It is intentionally narrower than setup: refresh package
# manager activation and install only if the lockfile changed under the
# checked-out branch.

set -Eeuo pipefail

cd "${CODEX_WORKTREE_PATH:-$(pwd)}"

corepack enable
corepack prepare pnpm@10.33.0 --activate
pnpm install --frozen-lockfile
