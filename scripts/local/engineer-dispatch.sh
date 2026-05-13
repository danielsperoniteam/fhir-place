#!/usr/bin/env bash
# Local driver for the engineer-dispatch prompt. Replaces the GHA
# `hourly-engineer-dispatch.yml` workflow for local execution.
# See scripts/run-prompt-locally.sh for the shared runner.

set -Eeuo pipefail
exec "$(dirname "$0")/../run-agent-prompt-locally.sh" hourly-engineer-dispatch \
  --max-turns 300 \
  --allowedTools "Read,Edit,Write,Bash,Grep,Glob,Agent,mcp__github__*" \
  --disallowedTools "AskUserQuestion,ExitPlanMode"
