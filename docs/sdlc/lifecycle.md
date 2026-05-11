# Ticket lifecycle

The end-to-end journey of one piece of work, from "an issue exists" to
"the change is live on `main`." Read [`loops.md`](./loops.md) first for
the cadence; this doc is the path through the loops.

## Deploy model: long-lived staging branch + batched promotion

`fhir-place` uses a **long-lived staging branch** that mirrors what's
about to be promoted to production:

- Feature branches PR into **`staging`**, not directly into `main`.
- `pages.yml` builds and deploys two slots from one artifact:
  `/` from `main` and `/staging/` from `staging`. Both branches can
  trigger a deploy (the github-pages environment is configured to
  allow both).
- Once a PR (or a batch of PRs) is on `staging` and `/staging/` has
  refreshed, a human walks the **UAT on live staging** checklist
  against the live URL.
- `promote-staging.yml` opens / updates a single **promotion PR**
  (`staging → main`) that aggregates UAT checklists from every PR
  merged into staging since the last promotion. Approving and merging
  the promotion PR is what ships to `/`.
- `sync-staging.yml` keeps staging caught up to main after direct-to-
  main commits (CI fixes, doc edits, etc. that bypass the staging
  branch). It opens a `chore: sync main into staging` PR and arms
  auto-merge; the queue lands it without human approval because the
  staging ruleset requires 0 approving reviews.

The staging branch is **long-lived**: its history is preserved and
its tip is what `/staging/` serves. There is one shared staging slot,
not a per-PR preview slot.

This shape suits `fhir-place` because (a) batched UAT against the
real staging URL is cheap and fast, (b) one human gates production
via the promotion PR, and (c) the engineer agent always knows what
its PR will be reviewed against (`staging`) without per-PR slot
contention.

## The state machine, in one diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Issue created                                  │
│   - human-filed  OR                                                  │
│   - bot-filed by daily-qa-pass / live-site-monitor /                 │
│     hourly-uat-validation                                            │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                  Daily PM triage (07:00 UTC)
                               │
                               ▼
                ┌──────────────────────────┐
                │  type: + area: + priority:│
                │  labels applied           │
                │  bracket prefix stripped  │
                │  duplicates closed        │
                └──────────────┬───────────┘
                               │
                               ▼
              ┌────────────────────────────────┐
              │   "Ready" queue                │
              │   (no status: blocked /        │
              │    needs-triage / in-progress / │
              │    needs-human; blockers closed)│
              └──────────────┬─────────────────┘
                             │
              Hourly engineer dispatch (:05)
                             │
                             ▼
                ┌─────────────────────────┐
                │  status: in-progress    │  ← lock label
                │  bot/issue-<N>-<slug>   │
                │  branch created off     │
                │  origin/staging         │
                └──────────────┬──────────┘
                               │
                  engineer subagent runs
                  (typecheck / tests / e2e / build /
                   screenshots / changeset / secret scan)
                               │
                ┌──────────────┴─────────────┐
                │                            │
                ▼                            ▼
        ┌─────────────────┐        ┌────────────────────────┐
        │  PR opened      │        │ status: needs-human or │
        │  (draft or      │        │ status: needs-triage   │
        │   ready),       │        │ + structured comment   │
        │  base: staging  │        └────────────────────────┘
        │  Closes #N      │
        └────────┬────────┘
                 │
       Human review (or PR-review workflow). Author addresses
       blockers in a follow-up commit, or resolves with reasoning.
                 │
                 ▼
       PR merges into `staging` via merge queue
       (0 approvals required; test + e2e gate)
                 │
                 ▼
       pages.yml rebuilds /staging/ (and /, both slots
       always rebuilt so the artifact stays complete)
                 │
                 ▼
       promote-staging.yml opens / updates the
       `staging → main` promotion PR with aggregated
       UAT checklists from every included PR
                 │
                 ▼
       Human walks the UAT checklist against
       https://danielsperoniteam.github.io/fhir-place/staging/
                 │
                 ▼
       Human approves + merges the promotion PR → main
                 │
                 ▼
       pages.yml rebuilds / (and /staging/ stays in sync
       because both slots rebuild on every deploy)
                 │
                 ▼
       Live site monitor (06:30 UTC nightly) runs the
       fixed Playwright suite against /; failures become
       new bot-filed issues → next morning's PM triage
```

## Sprint board column mapping

The [fhir-place sprint board](https://github.com/orgs/danielsperoniteam/projects/1) has six Status columns. Each lines up with stages in this lifecycle:

| Column | Stage(s) | What lands here |
| --- | --- | --- |
| **Todo** | 1–2 | New issues, post-triage and not yet picked up. The "ready queue" lives here. |
| **Blocked** | (sidetrack) | Carries the `status: blocked` label or otherwise stuck on an external dependency. |
| **In progress** | 3–4 | An engineer (subagent or human) has the claim. `status: in-progress` is on the issue. |
| **Ready for review** | 5–6 | Draft PR is open and either marked ready or still draft awaiting human review. |
| **Ready for UAT** | 7–8 | PR has merged into `staging`. `/staging/` has been redeployed. Waiting for human UAT against the live staging URL. |
| **Released** | 9–10 | Promoted from `staging` to `main`. Pages has redeployed the production slot. Post-deploy regression has run (or will, next nightly). |

Transitions are driven by [`project-sync.yml`](../../.github/workflows/project-sync.yml). It listens for issue/PR/label events and moves items between columns. The workflow is the source of truth for column moves; if a state needs to change, change the trigger in the workflow, not the column manually.

## Stage-by-stage

### 1. Issue creation

Issues come from four places:

- **Humans** — usual GitHub UI, typically with at least the right
  `area:` label.
- **Daily QA pass** at 05:00 UTC — exploratory walk of the demo against
  a real FHIR sandbox, files `type: bug, origin: bot-filed`.
- **Live site monitor** at 06:30 UTC — fixed Playwright suite against
  the deployed `/` URL, files `type: bug, area: fhir-explorer,
  priority: high, origin: bot-filed` for each failed test, deduping by
  title.
- **Hourly UAT validation** when it spots out-of-scope bugs while
  walking a PR (cap 5 per run); same `bot-filed` shape.

There is no automation that **closes** issues other than:
(a) bot-filed duplicates being closed by PM triage, and (b) the
standard `Closes #N` trailer in a merged PR.

### 2. PM triage at 07:00 UTC

[`docs/prompts/daily-pm-triage.md`](../prompts/daily-pm-triage.md)

- Fills missing `type: / area: / priority:` labels using the heuristics
  in the prompt; never overrides a human-set priority.
- Strips noise prefixes (`[work]`, `[demo]`, `[bot]`); rewords meaningful
  ones (`[workbench]` → `Workbench: …`).
- Closes duplicates among `origin: bot-filed` issues, oldest is canonical.
- Closes epics whose sub-issues are all closed and that are 30+ days quiet.
- Re-checks `status: blocked` items every 14 days.
- Marks long-open priority-less issues `status: needs-triage`.
- Replaces the body of `PM triage — daily report` with a structured
  rollup. That issue is the audit trail for the loop.

### 3. Engineer dispatch

[`docs/prompts/hourly-engineer-dispatch.md`](../prompts/hourly-engineer-dispatch.md)

The "ready" predicate is precise:

- exactly one `type:` label
- ≥ 1 `area:` label
- exactly one `priority:` label
- no `status: blocked / needs-triage / in-progress / needs-human`
- no assignees
- every "Blocked by:" / sub-issue link is closed

The `status: in-progress` label is the **claim lock**. It's added before
the subagent is dispatched. The "ready" predicate excludes it, so a
second concurrent dispatch run cannot pick the same issue.

### 4. Engineer subagent run

[`.claude/agents/engineer.md`](../../.claude/agents/engineer.md)

Worktree isolation: `git worktree add ../wt-<N> -b bot/issue-<N>-<slug>
origin/staging`. The PR base is **always `staging`** — humans promote
`staging` → `main` after live UAT.

Outcomes:

| Outcome | Issue label after | Branch |
| --- | --- | --- |
| Draft / ready-for-review PR opened | `status: in-progress` stripped | pushed |
| Acceptance criteria ambiguous | `status: needs-triage` | not pushed |
| Typecheck/tests/e2e/build fail past retry budget | `status: needs-human` | left in place locally |
| Blast-radius cap exceeded | `status: needs-human` | not pushed |
| Secret regex hit on diff | `status: needs-human` | **deleted** before exit |
| Deny-listed path touched | `status: needs-human` | not pushed |
| Loop heuristic / wall-clock cap | `status: needs-human` | left in place locally |
| Subagent crashed / silent | `status: needs-human` (added by orchestrator) | unknown |

The orchestrator strips `status: in-progress` after the PR is opened.
The subagent comments the PR link onto the issue.

### 5. PR opened — what's in it

PRs are opened with `base: staging`. They may be draft or ready-for-
review; the engineer subagent opens them as draft by default and the
author marks ready when checks have settled. The body is mandated to
contain, in order:

1. `Closes #<N>`
2. **Summary** — 1–3 bullets, "why" not "what".
3. **Test plan** — checklist of commands run locally.
4. **UAT on live staging** — concrete, copy-pasteable steps a human or
   QA agent can walk against
   `https://danielsperoniteam.github.io/fhir-place/staging/` once the
   PR has merged into staging and Pages has redeployed. Each step
   names the route, the action, and the expected observable result.

If the engineer can't articulate UAT steps, that's an exit condition —
it doesn't open the PR.

For any user-visible change, screenshots are committed under
`screenshots/pr-<branch-slug>/` and inlined in the body via the
`raw.githubusercontent.com` URL pattern. Pure infra/CI/docs/private
internal-refactor PRs may write `N/A — no user-visible change` in
that section but must not skip it silently.

### 6. Human review

A human (or the PR-review workflow at
[`.github/workflows/pr-review.yml`](../../.github/workflows/pr-review.yml))
reviews the diff. The staging ruleset has
`required_approving_review_count: 0` — review is optional for the merge
gate but recommended for substantive changes. The PR-review workflow's
engineer subagent can return `verdict: blocker` to gate merge via
`REQUEST_CHANGES`; the author addresses the blocker and re-requests.

When the PR is marked ready and CI is green (`test` and `e2e`
required by the staging ruleset), the merge queue picks it up and
squash-merges into staging.

### 7. Merge into `staging`

The merge queue rebuilds the merge commit, re-runs `test` and `e2e`
against it, and squashes into staging when both pass. The `staging`
branch is the source of truth for the next deployment of `/staging/`.

`pages.yml` triggers on the push to staging and rebuilds both `/` and
`/staging/` slots from the latest of each branch, then deploys the
combined artifact. `/staging/` refreshes within ~3 minutes.

### 7b. Promotion PR

`promote-staging.yml` triggers on every push to staging and
opens / updates a single open `staging → main` promotion PR. Its body
aggregates the **UAT on live staging** sections from every PR merged
into staging since the last promotion, giving a reviewer one
consolidated checklist.

The PR is assigned to `@danielsperoni`. Items flagged with
`status: needs-human` are called out at the top of the body. Conflict
resolution against main is attempted automatically by Claude; if it
can't resolve cleanly, the workflow escalates.

### 8. UAT validation against the live staging build

A human (Daniel, typically) walks the UAT checklist on the promotion
PR against
`https://danielsperoniteam.github.io/fhir-place/staging/`. The
hourly UAT-validation workflow can also walk PRs that include a
`UAT on live staging` block, setting `uat: passed` / `uat: failed`
labels and filing out-of-scope bugs as new issues.

If UAT fails, the human (or engineer subagent in a follow-up) fixes
the regression in a new PR against staging, and the next promotion PR
batch includes the fix.

### 9. Promotion: `staging` → `main`

Approving and merging the promotion PR fast-forwards `main` to the
current staging tip. `pages.yml` triggers on the push to main and
rebuilds both slots; `/` is now serving the promoted code, and
`/staging/` stays in sync because both slots rebuild on every deploy.

The main ruleset requires `test` and `e2e` to pass on the merge commit,
plus one approving CODEOWNER review. Daniel is the codeowner; the
review is also the human's verification that UAT passed.

### 10. Post-deploy regression check

Live-site-monitor runs at 06:30 UTC the next morning against `/`,
files any new failures as bot-issues, and the cycle starts over with
PM triage at 07:00.

If a regression is filed, it lands in the "ready" queue once PM triage
labels it, the engineer dispatch picks it up at the next `:05`, and
the lifecycle repeats.

## Direct-to-main commits and back-sync

Some commits bypass the staging branch — CI/workflow fixes, doc
edits, or anything that needs to land on main immediately. After such
a commit:

- `sync-staging.yml` triggers on the push to main.
- It creates / reuses `chore/sync-main-into-staging`, merges
  `origin/main` into it locally, force-with-lease pushes the branch,
  opens (or reuses) a PR to staging, and arms `gh pr merge --auto`.
- Because staging requires 0 approving reviews, the queue squash-
  merges the sync PR once test + e2e are green.
- If the trivial merge hits conflicts, the workflow invokes Claude
  to resolve them on the sync branch. Only if Claude can't resolve
  does it escalate to a human (dedup'd into one open issue).

## Reverting from main

Sometimes a PR merges to main and a regression surfaces in the next
nightly check (or sooner). Recovery:

1. Open a revert PR against `staging` (`git revert <merge-commit>`),
   walk through the same staging → promotion → main flow. For urgent
   reverts that can't wait, open against `main` directly and let
   `sync-staging.yml` back-sync.
2. CI runs. Walk the UAT for the revert if it's non-trivial.
3. Merge the revert. `/` redeploys without the bad change.
4. The original PR's bot-issue branch can be retried with a fix.

For most regressions caught the next morning by `live-site-monitor`,
the cycle is: bot files an issue → PM triage labels it → engineer
dispatch picks it up → fix PR → ships through the same flow. The
revert path is for the louder, faster cases.

## Where humans are required

The loops are designed so that humans are required at exactly three
points:

1. **Triggering the kill switch** when something is going sideways
   (label the loop's tracking issue `status: agent-paused`).
2. **Approving + merging the promotion PR** `staging → main` once UAT
   has been walked. This is the production-deploy gate; it's where the
   human verifies what they validated on `/staging/` is what's about
   to ship to `/`.
3. **Modifying the SDLC itself** — prompts, agent definitions,
   workflows, `CODEOWNERS`. Self-modification is out of scope for every
   agent in the system.

Everything else — triage, branch creation, code, tests, screenshots,
PR open, code review, merge to staging, label management, bug-filing,
back-sync — is automated.
