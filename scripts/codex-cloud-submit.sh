#!/usr/bin/env bash
# Submit one repo prompt to Codex Cloud from code.
#
# Usage:
#   CODEX_CLOUD_ENV=<env-id> scripts/codex-cloud-submit.sh <prompt> [--for "PR #123"]
#
# This is a thin wrapper over run-agent-prompt-locally.sh so local and cloud
# runs share prompt resolution, logging, pause/lock behavior, and target
# prologue construction.

set -Eeuo pipefail

export AGENT_PROVIDER=codex-cloud
exec "$(dirname "$0")/run-agent-prompt-locally.sh" "$@"
