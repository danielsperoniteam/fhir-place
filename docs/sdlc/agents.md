# The agents

Agent definitions live under [`.claude/agents/`](../../.claude/agents/).
Orchestrator prompts live under [`docs/prompts/`](../prompts/).

## Shared delivery rules

All source-changing agents follow the same branch contract:

- start from `origin/main`;
- push only the assigned work or PR branch;
- open PRs against main;
- scan and measure `origin/main...HEAD` before pushing;
- never push to main, staging, release branches, or `gh-pages`;
- never merge or approve a PR;
- treat CI plus CODEOWNER approval as the normal merge gate;
- leave hosted preview deployment to the designated deterministic workflow.

## Persona summary

| Persona | Source edits | GitHub output | Invocation |
| --- | --- | --- | --- |
| `engineer` | yes, within deny-list and size caps | ready-for-review PR to main | engineer dispatch |
| `qa-engineer` | no | distinct bug issues and QA reports | daily QA or requested preview check |
| `health-tech-pm` | no | product findings and improvement issues | human or supervised QA invocation |
| `senior-fhir-engineer` | human-driven only | review or requested PR | human invocation |
| `clinical-informaticist` | no | clinical review | human invocation |
| `principal-platform-engineer` | human-driven only | platform/security review | human invocation |
| `tpm-coordinator` | no product code | status, risk, and readiness reports | human invocation |

## Engineer

The engineer receives one ticket and an assigned
`bot/issue-<N>-<slug>` branch.

1. Create an isolated worktree from `origin/main`.
2. Restate the acceptance criteria or exit `status: needs-triage`.
3. Implement the smallest issue-scoped change.
4. Capture screenshots for user-visible changes.
5. Run typecheck, unit tests, relevant e2e, and builds.
6. Enforce test-update and published-package changeset gates.
7. Scan `origin/main...HEAD` for secrets and enforce blast-radius caps.
8. Push only the bot branch and open a ready-for-review PR to main.
9. Do not request or deploy a staging preview. A reviewer owns that choice.

Failure exits are structured and leave the branch for inspection, except a
secret hit is never pushed.

## QA engineer

The QA engineer has two active modes:

- Daily exploratory QA runs locally against a configured public FHIR sandbox
  and files separate issues for reproducible defects.
- A requested hosted-preview check validates one explicitly deployed PR. It
  first verifies the PR head SHA in the preview comment and the successful
  Pages run, then records the tested risk on the PR.

QA never treats staging as a promotion source and never fixes a bug during
the same pass that discovers it.

## TPM coordinator

Release-readiness checks confirm:

- the PR targets main and links the issue;
- required CI is green;
- CODEOWNER approval and review state are clear;
- Playwright coverage and screenshots match user-visible behavior;
- changesets, docs, security, and clinical review are handled where needed;
- when a reviewer requested a hosted preview, the deployed PR SHA matches the
  current head and the requested risk was checked.

The TPM never asks for staging-to-main promotion because that path does not
exist.

## Domain reviewers

FHIR, clinical, platform, and product reviewers are human-invoked specialists.
They provide evidence and recommendations but do not bypass branch rules.

## Self-modification

Recurring agents may not edit agent definitions, prompts, workflows,
`CODEOWNERS`, label vocabulary, or branch protection. Those changes require a
human-requested, reviewed PR such as the one that introduced ADR 0009.
