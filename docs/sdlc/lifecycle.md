# Ticket lifecycle

The end-to-end journey of one piece of work, from "an issue exists" to
"the change is live on `main`." Read [`loops.md`](./loops.md) first for
the cadence; this doc is the path through the loops.

## Deploy model: stack of approved PRs on top of main

`fhir-place` ships features through PRs that target `main`. The
`staging` branch is a continuously-rebuilt deploy target:

```
staging = origin/main + every open PR with reviewDecision == APPROVED
```

How it flows:

- Feature branches PR into **`main`**, never an integration branch.
- When a PR receives an approving CODEOWNER review,
  [`stack-approved-prs.yml`](../../.github/workflows/stack-approved-prs.yml)
  rebuilds the staging branch (reset to `main` HEAD, merge in every
  approved-and-open PR's head in order, force-push). `pages.yml`
  redeploys `/staging/` with the new tip.
- UAT happens against the live `/staging/` URL with this PR's content
  stacked alongside any other approved-in-flight PRs.
- After UAT passes (and CI is green), the PR is merged to `main`. The
  next staging rebuild excludes it (it's on main now).
- If a PR is closed without merging, the next rebuild excludes it.
- Direct-to-main commits trigger a staging rebuild from the new main
  HEAD automatically — no separate sync workflow needed because every
  rebuild already starts from main.

There is **no rolling promotion PR**. Each PR ships independently when
its UAT passes. Staging has no protected history; its tip is a
deterministic function of `main` HEAD + open-approved PRs at any
moment.

This shape suits `fhir-place` because (a) features are mostly
independent, so multiple in-flight PRs can be validated together
without coordinating, (b) one human gates production via the
per-PR main merge, and (c) staging always reflects the current
"about to ship" state — never accumulates abandoned work.

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
        ┌─────────────────┐        ┌────────────────────────┐
        │  Ready-for-     │        │ status: needs-human or │
        │  review PR,     │        │ status: needs-triage   │
        │  base: main     │        │ + structured comment   │
        │  Closes #N      │        └────────────────────────┘
        └────────┬────────┘
                 │
       Human review. On APPROVED:
                 │
                 ▼
       stack-approved-prs.yml rebuilds `staging`:
         git reset --hard origin/main
         for each open approved PR: git merge
         git push --force staging
                 │
                 ▼
       pages.yml redeploys /staging/ with this PR
       stacked alongside other approved-in-flight PRs
                 │
                 ▼
       Human walks the PR's "UAT on live staging" checklist
       against https://danielsperoniteam.github.io/fhir-place/staging/
                 │
                 ▼
       PR is mergeable to main when:
         - CI green (test, e2e)
         - CODEOWNER review
         - UAT walked (manual or uat: passed label)
                 │
                 ▼
       Human merges PR → main
                 │
                 ▼
       pages.yml redeploys /
       stack-approved-prs.yml rebuilds staging
       (this PR is excluded — it's on main now)
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
| **Ready for review** | 5–6 | PR is open against main, awaiting CODEOWNER review. |
| **Ready for UAT** | 7 | PR is approved. `stack-approved-prs.yml` stacked it onto staging; `/staging/` has redeployed; UAT can be walked. |
| **Released** | 8 | PR merged into main. `/` has redeployed. Post-deploy regression has run (or will, next nightly). |

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
  priority: P0, origin: bot-filed` for each failed test, deduping by
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

#### Target model: sprint-scoped ready queue

The canonical work source is the
[fhir-place project board](https://github.com/orgs/danielsperoniteam/projects/1),
scoped to the current sprint iteration. Bots and humans both pull from
the board sorted by Priority (`P0` → `P1` → `P2` → `P3`). Issues outside
the current sprint are not eligible for dispatch even if they otherwise
look ready.

> **PENDING — requires `read:project` token scope.** Implementation is
> blocked on configuring a `PROJECTS_PAT` secret with project read
> access. Until then, the dispatcher uses the label-only fallback below.
> Tracking issue:
> [Sprint-aware dispatch + priority label rename + SDLC sync](https://github.com/danielsperoniteam/fhir-place/issues/436).

#### Bridge: label-only ready predicate

The "ready" predicate is precise:

- exactly one `type:` label
- ≥ 1 `area:` label
- exactly one `priority:` label
- no `status: blocked / needs-triage / in-progress / needs-human`
- no assignees
- every "Blocked by:" / sub-issue link is closed

Sort: `priority: P0` → `priority: P1` → `priority: P2` → `priority: P3`,
then `created_at` ascending. Take the top 3.

The `status: in-progress` label is the **claim lock**. It's added before
the subagent is dispatched. The "ready" predicate excludes it, so a
second concurrent dispatch run cannot pick the same issue.

### 4. Engineer subagent run

[`.claude/agents/engineer.md`](../../.claude/agents/engineer.md)

Worktree isolation: `git worktree add ../wt-<N> -b bot/issue-<N>-<slug>
origin/main`. The PR base is **always `main`**. The engineer subagent
does **not** push to staging or to any branch other than its own
`bot/*` branch — staging is rebuilt downstream from main + approved
PRs by the stack workflow, not by the engineer.

Outcomes:

| Outcome | Issue label after | Branch |
| --- | --- | --- |
| Ready-for-review PR opened against main | `status: in-progress` stripped | pushed |
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

PRs are opened ready-for-review with `base: main`. The body is
mandated to contain, in order:

1. `Closes #<N>`
2. **Summary** — 1–3 bullets, "why" not "what".
3. **Test plan** — checklist of commands run locally.
4. **UAT on live staging** — concrete, copy-pasteable steps a human or
   QA agent can walk against
   `https://danielsperoniteam.github.io/fhir-place/staging/` once the
   PR has been approved and `stack-approved-prs.yml` has rebuilt
   staging. Each step names the route, the action, and the expected
   observable result.

If the engineer can't articulate UAT steps, that's an exit condition —
it doesn't open the PR.

For any user-visible change, screenshots are committed under
`screenshots/pr-<branch-slug>/` and inlined in the body via the
`raw.githubusercontent.com` URL pattern. Pure infra/CI/docs/private
internal-refactor PRs may write `N/A — no user-visible change` in
that section but must not skip it silently.

### 6. Human review

A human (or the [PR-review workflow](../../.github/workflows/pr-review.yml))
reviews the diff. main's ruleset requires `required_approving_review_count: 1`
plus `require_code_owner_review: true` — Daniel is the CODEOWNER.

The PR-review workflow's engineer subagent can return
`verdict: blocker` to gate merge via `REQUEST_CHANGES`; the author
addresses the blocker and re-requests.

### 7. Approval → staging stack

Once `reviewDecision: APPROVED` lands on the PR,
[`stack-approved-prs.yml`](../../.github/workflows/stack-approved-prs.yml)
fires:

```
git checkout -B staging origin/main
for each open APPROVED PR (ordered by PR number):
  git merge --no-ff origin/<head>
  if conflict:
    dispatch staging-stack-agent.yml
git push --force-with-lease origin staging
```

`pages.yml` triggers on the push to staging and rebuilds the combined
artifact (`/` from main + `/staging/` from staging), then deploys.
`/staging/` refreshes within ~3 minutes with this PR's content
stacked alongside any other approved-in-flight PRs.

If two approved PRs conflict with each other on staging, the clean-merge
stacker stops and dispatches [`staging-stack-agent.yml`](../../.github/workflows/staging-stack-agent.yml).
That resolver rebuilds the staging artifact with agent judgment, resolves
hand-authored conflicts when it can preserve both sides' intent, and pushes
`staging` for UAT. It escalates to `@danielsperoni` only when the conflict is
binary, generated, semantically ambiguous, or needs a product decision.

### 8. UAT validation against the live staging build

A human walks the PR's **UAT on live staging** checklist against
`https://danielsperoniteam.github.io/fhir-place/staging/`. The
hourly UAT-validation workflow can also walk PRs that include a
`UAT on live staging` block, setting `uat: passed` / `uat: failed`
labels and filing out-of-scope bugs as new issues.

If `uat: failed`: the author addresses the regression in a new
commit. The PR's approval doesn't auto-dismiss on push by default —
re-review is at the reviewer's discretion. The staging rebuild fires
on the new commits (via `synchronize` event) and `/staging/` re-runs
with the fix.

### 9. Merge to main

A PR is mergeable when **all** are true:

- CI green (`test`, `e2e` required by the main ruleset)
- `reviewDecision: APPROVED` (CODEOWNER review)
- UAT walked (manually, or `uat: passed` label set)
- No outstanding "request changes" review

Daniel merges manually. Once observation confirms the gates are
trustworthy, an auto-merge workflow can be added that enqueues PRs
matching the criteria.

### 10. Post-deploy regression check

Live-site-monitor runs at 06:30 UTC the next morning against `/`,
files any new failures as bot-issues, and the cycle starts over with
PM triage at 07:00.

If a regression is filed, it lands in the "ready" queue once PM triage
labels it, the engineer dispatch picks it up at the next `:05`, and
the lifecycle repeats.

## Direct-to-main commits

Some commits land on main without going through a PR — most often
this means a human pushed a hotfix or merged a PR using the admin
bypass. In Model B this is fine and doesn't require a separate sync
workflow:

- The push to main triggers `stack-approved-prs.yml`.
- The workflow rebuilds staging from the new main HEAD plus current
  approved-open PRs.
- `/staging/` redeploys.

There is no separate main→staging sync workflow because every
rebuild already starts from main HEAD. Drift is impossible by
construction.

## Reverting from main

Sometimes a PR merges to main and a regression surfaces in the next
nightly check (or sooner). Recovery:

1. Open a revert PR against `main` (`git revert <merge-commit>`).
2. CI runs. Approve, walk UAT against staging if non-trivial.
3. Merge the revert. `/` redeploys without the bad change. Staging
   rebuilds too.
4. The original PR's bot-issue branch can be retried with a fix.

For most regressions caught the next morning by `live-site-monitor`,
the cycle is: bot files an issue → PM triage labels it → engineer
dispatch picks it up → fix PR → ships through the same flow.

## Where humans are required

The loops are designed so that humans are required at exactly three
points:

1. **Triggering the kill switch** when something is going sideways
   (label the loop's tracking issue `status: agent-paused`).
2. **Approving + merging the PR to main** once CI is green and UAT
   has been walked. This is the production-deploy gate.
3. **Modifying the SDLC itself** — prompts, agent definitions,
   workflows, `CODEOWNERS`. Self-modification is out of scope for every
   agent in the system.

Everything else — triage, branch creation, code, tests, screenshots,
PR open, code review (Codex), staging stack rebuild, UAT walk,
label management, bug-filing — is automated.
