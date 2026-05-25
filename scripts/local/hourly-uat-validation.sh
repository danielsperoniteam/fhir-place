#!/usr/bin/env bash
# Local driver for the hourly UAT validation prompt. Replaces the GHA
# `hourly-uat-validation.yml` workflow for local execution.
#
# Walks each open PR's "UAT on live staging" checklist against the
# deployed staging URL, sets `uat: passed` / `uat: failed` labels,
# files out-of-scope bugs.
#
# See scripts/run-prompt-locally.sh for the shared runner.

set -Eeuo pipefail
exec "$(dirname "$0")/../run-prompt-locally.sh" hourly-uat-validation \
  --skip-dirty-check \
  --max-turns 200 \
  --allowedTools "Read,Edit,Write,Bash,Grep,Glob,Agent,mcp__github__*"
