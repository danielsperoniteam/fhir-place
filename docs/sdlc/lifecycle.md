# Ticket lifecycle

This is the path from an issue to deployed code. See
[ADR 0009](../decisions/0009-main-first-single-pr-preview.md) for the branch
and preview decision, and [`loops.md`](./loops.md) for automation cadence.

## Delivery model

`main` is the only integration branch and source of truth.

```text
issue -> branch from main -> PR to main -> CI + review -> merge -> deploy
                                  |
                                  +-> optional single-PR hosted preview
```

The normal merge gate is:

- required CI checks are green;
- CODEOWNER approval is present;
- no requested-changes review remains;
- user-visible behavior has matching Playwright coverage and screenshots.

Staging is not normally part of the path. It is a disposable hosted preview
for risks that local and CI validation cannot fully cover.

## State machine

```text
Issue created
    |
    v
PM triage adds type, area, priority, and blockers
    |
    v
Engineer claims issue and branches from origin/main
    |
    v
Implement -> typecheck -> tests -> e2e when relevant -> build
    |
    +------> needs-triage / needs-human when a gate cannot be satisfied
    |
    v
Ready-for-review PR, base main
    |
    v
Automated review + human CODEOWNER review + required CI
    |
    +------> reviewer requests hosted preview when deployment risk warrants it
    |                  |
    |                  v
    |          staging = main + this PR only
    |          Pages deploys /staging/
    |          QA records preview evidence on the PR
    |
    v
Human merges PR to main
    |
    v
Pages deploys / and live-site monitor checks production
```

## Stage-by-stage

### 1. Issue creation and triage

Issues can be human-filed or bot-filed by QA and the live-site monitor.
Daily PM triage fills missing labels, deduplicates bot-filed reports, checks
blockers, and maintains the rolling triage report.

The ready predicate is:

- exactly one `type:` label;
- at least one `area:` label;
- exactly one `priority:` label;
- no `status: blocked`, `status: needs-triage`, `status: in-progress`, or
  `status: needs-human`;
- no assignee;
- all declared blockers closed.

### 2. Engineer dispatch

The dispatcher claims the issue with `status: in-progress` and invokes the
engineer with one ticket. The engineer creates an isolated worktree from
`origin/main` on `bot/issue-<N>-<slug>`.

The engineer may push only that branch. It never pushes to main, staging,
release branches, or `gh-pages`.

### 3. Implementation contract

The engineer runs, in order:

1. Typecheck.
2. Unit tests.
3. Demo e2e tests when demo or `react-fhir` behavior changed.
4. Package and demo builds.
5. Test-update, changeset, secret-scan, and blast-radius gates.

User-visible changes include Playwright coverage and PR screenshots. A pure
infra, docs, or internal refactor may state that no user-visible validation
is applicable.

### 4. Pull request

Every PR targets `main`. The PR body includes the linked issue, problem or
bug framing, test results, test coverage, screenshots or an explicit N/A,
risks, and follow-ups.

The automated reviewer may request changes for concrete defects, security or
FHIR conformance regressions, missing behavior tests, or an unversioned
published-package change. Humans provide the approval required by branch
protection.

### 5. Optional hosted preview

A reviewer requests a preview when the open question depends on the deployed
environment. Examples include:

- GitHub Pages routing or base-path behavior;
- hosted-origin, CORS, or authentication redirects;
- live FHIR server interaction;
- a multi-step workflow that needs human browser inspection.

Run `Preview one PR on staging` with the PR number. The workflow verifies the
PR targets main and required checks are green, then builds:

```text
staging = current origin/main + selected PR head
```

The workflow records `.staging-preview.json`, pushes with
`--force-with-lease`, then dispatches the trusted Pages workflow from `main`
pinned to that exact staging SHA. It comments the exact PR SHA, staging SHA,
preview URL, and Pages run on the PR only after deployment succeeds.

Only that comment proves which PR is deployed. A green run that did not push
and deploy the requested staging SHA is a failure.

If the merge conflicts, fix the PR branch against main. Never resolve a
conflict only on staging.

### 6. Merge and deployment

Daniel merges the PR to main after the normal gate is satisfied and any
requested preview risk is resolved. `pages.yml` deploys main to `/`.

When main moves, the preview workflow either rebuilds the still-open active
preview against the new main head or resets staging to main. Closing the
active preview PR also resets staging.

Staging is never merged or promoted into main.

### 7. Post-deploy checks and recovery

The nightly live-site monitor runs deterministic Playwright coverage against
the deployed main site. Failures become bot-filed issues and re-enter triage.

Recovery is a normal revert PR against main:

1. Create a branch from current main.
2. Revert the offending merge commit.
3. Run CI and obtain CODEOWNER approval.
4. Request a hosted preview only if the deployment risk requires it.
5. Merge the revert PR to main.

## Sprint board mapping

| Column | Meaning |
| --- | --- |
| Todo | Triaged and not yet claimed |
| Blocked | Waiting on a named dependency or human decision |
| In progress | Claimed by an engineer or agent |
| Ready for review | PR against main is awaiting CI or review |
| Ready for UAT | Legacy column; do not use for the active process |
| Released | PR merged into main and deployed |

## Human authority

Humans are required to:

1. approve and merge changes to main;
2. request hosted preview validation when its signal is worth the delay;
3. modify workflows, agent definitions, prompts, `CODEOWNERS`, or branch
   protection;
4. make product, clinical-safety, security, or ambiguous conflict decisions.
