#!/usr/bin/env bash
# Local driver for the daily PM triage prompt. Replaces the GHA
# `daily-pm-triage.yml` workflow for local execution.
# See scripts/run-prompt-locally.sh for the shared runner.

set -Eeuo pipefail
exec "$(dirname "$0")/../run-agent-prompt-locally.sh" daily-pm-triage \
  --max-turns 80 \
  --allowedTools "Read,Grep,Glob,mcp__github__*,Bash(gh:*)"
