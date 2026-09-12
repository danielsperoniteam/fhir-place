#!/usr/bin/env bash
# Local driver for the PR-mode fixup dispatcher. Sibling of
# scripts/local/engineer-dispatch.sh. Picks one open bot PR with red
# CI or unresolved review threads and dispatches a fix to the existing
# branch.
#
# Cadence: 09:30 + 14:30 ET (see com.fhir-place.pr-fixup-dispatch.plist).
# Staggered 30 min after engineer-dispatch so the issue-mode run has
# time to finish first — both share the same engineer subagent under
# the same Claude Max OAuth session.
#
# See scripts/run-prompt-locally.sh for the shared runner.

set -Eeuo pipefail
export RUN_IN_CLEAN_WORKTREE=true
exec "$(dirname "$0")/../run-prompt-locally.sh" pr-fixup-dispatch \
  --max-turns 250 \
  --allowedTools "Read,Edit,Write,Bash,Grep,Glob,Agent,mcp__github__*" \
  --disallowedTools "AskUserQuestion,ExitPlanMode"
