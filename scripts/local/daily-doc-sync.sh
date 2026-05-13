#!/usr/bin/env bash
# Local driver for the daily docs-sync prompt. Replaces the GHA
# `daily-doc-sync.yml` workflow for local execution.
# See scripts/run-prompt-locally.sh for the shared runner.

set -Eeuo pipefail
exec "$(dirname "$0")/../run-agent-prompt-locally.sh" daily-doc-sync \
  --max-turns 100 \
  --allowedTools "Read,Edit,Write,Grep,Glob,mcp__github__*,Bash(git:*),Bash(gh:*),Bash(pnpm:*),Bash(node:*),Bash(tail:*)"
