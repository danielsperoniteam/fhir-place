# Ticket lifecycle

The end-to-end journey of one piece of work, from "an issue exists" to
"the change is live on `main`." Read [`loops.md`](./loops.md) first for
the cadence; this doc is the path through the loops.

## Deploy model: per-PR preview, direct merge to main

`fhir-place` uses a **single-environment-deploy-per-PR** model:

- Feature branches PR into **`main`**, never an integration branch.
- Each PR can request a preview deploy onto `/staging/` for UAT (a
  shared slot — one PR at a time).
- The PR merges to `main` only after CI is green AND `uat: passed`.
- `main` is what `/` serves. Each PR-merge is one production deploy.

There is **no rolling integration branch**. There is **no batched
release train**. The `staging` branch is just the slot the preview
deploy publishes from — its history is not preserved or promoted.

This shape is right for `fhir-place` because (a) features are mostly
independent, (b) one human gates production, and (c) reverting a single
PR-merge is cheaper than maintaining batched-release infrastructure.

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
                │  origin/main            │
                └──────────────┬──────────┘
                               │
                  engineer subagent runs
                  (typecheck / tests / e2e / build /
                   screenshots / changeset / secret scan)
                               │
                ┌──────────────┴─────────────┐
                │                            │
                ▼                            ▼
        ┌──────────────┐          ┌────────────────────────┐
        │  PR opened   │          │ status: needs-human or │
        │  (ready),    │          │ status: needs-triage   │
        │  base: main  │          │ + structured comment   │
        │  Closes #N   │          └────────────────────────┘
        │  uat:        │
        │  requested   │
        └──────┬───────┘
               │
       Codex review on PR open. Author addresses P1/P2
       in a follow-up commit, or replies + resolves.
               │
               ▼
       Preview-deploy workflow (triggered by `uat: requested`)
       force-publishes the PR's build into the `/staging/` slot
               │
               ▼
       Hourly UAT validation walks the PR's "UAT on live staging"
       checklist against https://danielsperoniteam.github.io/fhir-place/staging/
       and sets `uat: passed` or `uat: failed`
               │
               ▼
       PR is mergeable when: CI green + `uat: passed` + Codex addressed
               │
               ▼
       Daniel (or auto-merge, when configured) merges PR → main
               │
               ▼
       pages.yml rebuilds /
               │
               ▼
       Live site monitor (06:30 UTC nightly) runs the fixed
       Playwright suite against /; failures become new bot-filed
       issues → next morning's PM triage
```

## Sprint board column mapping

The [fhir-place sprint board](https://github.com/orgs/danielsperoniteam/projects/1) has six Status columns. Each lines up with stages in this lifecycle:

| Column | Stage(s) | What lands here |
| --- | --- | --- |
| **Todo** | 1–2 | New issues, post-triage and not yet picked up. The "ready queue" lives here. |
| **Blocked** | (sidetrack) | Carries the `status: blocked` label or otherwise stuck on an external dependency. |
| **In progress** | 3–4 | An engineer (subagent or human) has the claim. `status: in-progress` is on the issue. |
| **Ready for review** | 5–6 | PR is open, ready-for-review, awaiting Codex / CI / preview deploy. |
| **Ready for UAT** | 7 | Preview deploy is live on `/staging/`. UAT validation is walking the checklist (or has, with `uat: failed` to address). |
| **Released** | 8 | PR merged into `main`. `/` has redeployed. Post-deploy regression has run (or will, next nightly). |

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
origin/main`. The PR base is **always `main`**.

Outcomes:

| Outcome | Issue label after | Branch |
| --- | --- | --- |
| Ready-for-review PR opened, `uat: requested` applied | `status: in-progress` stripped | pushed |
| Acceptance criteria ambiguous | `status: needs-triage` | not pushed |
| Typecheck/tests/e2e/build fail past retry budget | `status: needs-human` | left in place locally |
| Blast-radius cap exceeded | `status: needs-human` | not pushed |
| Secret regex hit on diff | `status: needs-human` | **deleted** before exit |
| Deny-listed path touched | `status: needs-human` | not pushed |
| Loop heuristic / wall-clock cap | `status: needs-human` | left in place locally |
| Subagent crashed / silent | `status: needs-human` (added by orchestrator) | unknown |

The orchestrator strips `status: in-progress` after the PR is opened
and the `uat: requested` label is applied. The subagent comments the
PR link onto the issue.

### 5. PR opened — what's in it

PRs are opened **ready-for-review (not draft)** with `base: main`. The
body is mandated to contain, in order:

1. `Closes #<N>`
2. **Summary** — 1–3 bullets, "why" not "what".
3. **Test plan** — checklist of commands run locally.
4. **UAT on live staging** — concrete, copy-pasteable steps the QA
   agent can walk against
   `https://danielsperoniteam.github.io/fhir-place/staging/` once the
   preview-deploy workflow has published the PR's build there. Each
   step names the route, the action, and the expected observable
   result.

If the engineer can't articulate UAT steps, that's an exit condition —
it doesn't open the PR.

For any user-visible change, screenshots are committed under
`screenshots/pr-<branch-slug>/` and inlined in the body via the
`raw.githubusercontent.com` URL pattern. Pure infra/CI/docs/private
internal-refactor PRs may write `N/A — no user-visible change` in
that section but must not skip it silently.

### 6. Code review (Codex)

Codex reviews on PR open and on `ready_for_review`. It posts inline
comments tagged with severity (P1, P2, suggestion). The author (engineer
agent or human) addresses comments in one of two ways:

- **Code change** — push a fix commit to the PR branch. Codex re-reviews
  on the next push.
- **Reply + resolve** — when the comment doesn't need a code change
  (false positive, intentional choice), reply with the reasoning and
  mark the thread resolved.

There is **no human approval gate** at this stage. The staging branch
ruleset has `required_approving_review_count: 0` — Codex review is
informational, not a merge gate. CI is the mechanical gate.

### 7. Preview deploy + UAT validation

The `uat: requested` label triggers a preview-deploy workflow that
force-publishes the PR's build into the `/staging/` slot. Only one PR
at a time can hold the slot — the workflow serializes requests.

Once `/staging/` is updated, the next hourly UAT validation walks the
PR's "UAT on live staging" checklist against the live URL. It:

- Sets `uat: passed` if every checklist item passes
- Sets `uat: failed` if any item fails (and lists the failing items in
  a comment)
- Sets `uat: pending` if the run hasn't reached this PR yet
- Files out-of-scope bugs (anything broken outside the PR's changed
  files) as new bot-issues — not added to the PR comment

[`docs/prompts/hourly-uat-validation.md`](../prompts/hourly-uat-validation.md) is the prompt; the
`qa-engineer` subagent does the per-PR walk.

If `uat: failed`: the author (engineer agent or human) addresses the
failing items, pushes a fix, re-applies `uat: requested` (or the label
sticks), and the next UAT run re-evaluates.

### 8. Merge to main

A PR is mergeable when **all** are true:

- CI green (`test` and `e2e` required by the main ruleset)
- `uat: passed` label is set
- No outstanding "request changes" review
- No unresolved P1 Codex thread

Daniel does the merge for v1. Once observation confirms the gates are
trustworthy, an auto-merge workflow can be added that enqueues PRs
matching the criteria. Until then, Daniel is the human in the loop —
but the work he does is mechanical (click merge), not interpretive
(read the diff, decide).

### 9. Post-deploy regression check

Live-site-monitor runs at 06:30 UTC the following morning against `/`,
files any new failures as bot-issues, and the cycle starts over with
PM triage at 07:00.

If a regression is filed, it lands in the "ready" queue once PM triage
labels it, the engineer dispatch picks it up at the next `:05`, and
the lifecycle repeats.

## Reverting from main

Sometimes a PR merges to main and a regression surfaces in the next
nightly check (or sooner). Recovery:

1. Open a revert PR against `main` (`git revert <merge-commit>`).
2. CI runs. UAT can be requested if the revert is non-trivial.
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
2. **Merging the PR to `main`** once CI is green and `uat: passed`.
   For v1, Daniel does this manually — the work is mechanical, not
   interpretive. An auto-merge workflow can replace this once the
   gates are observably trustworthy.
3. **Modifying the SDLC itself** — prompts, agent definitions,
   workflows, `CODEOWNERS`. Self-modification is out of scope for every
   agent in the system.

Everything else — triage, branch creation, code, tests, screenshots,
PR open, code review (Codex), preview deploy, UAT walk, label
management, bug-filing — is automated.
