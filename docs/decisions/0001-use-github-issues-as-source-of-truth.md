# 0001 Use GitHub Issues as Source of Truth

## Status
Accepted

## Context
Work tracking spans coding-agent chat, local markdown notes, and repository docs.
Without a single canonical tracker, task state drifts and implementation context
gets stale.

## Decision
GitHub Issues are the canonical source for scoped implementation work and status.
GitHub PRs are the canonical code-change/audit record.

`tasks.md` is temporary execution context for one active branch, not backlog
storage.

## Consequences
- Each implementation task must link to a GitHub issue.
- PRs should close linked issues when merged.
- Long-lived backlog and prioritization happen in GitHub, not chat logs.
