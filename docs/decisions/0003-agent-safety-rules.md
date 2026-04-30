# 0003 Agent Safety Rules

## Status
Accepted

## Context
Coding agents can execute commands and edit many files quickly.
Prompt-only constraints are insufficient without explicit repository rules.

## Decision
Agent workflows in this repository must enforce:
- small, issue-scoped changes,
- no destructive or out-of-scope operations,
- PR-based review before merge.

Agents must not:
- delete production data,
- modify secrets/credentials,
- rewrite migration history,
- force-push `main`,
- perform destructive commands without explicit human direction.

## Consequences
- Lower operational risk when delegating implementation.
- Clear boundaries for Codex/Claude behavior.
- Better auditability from issue -> branch -> PR chain.
