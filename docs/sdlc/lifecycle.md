# Ticket lifecycle

The end-to-end journey of one piece of work, from "an issue exists" to
"the change is live on `main`." Read [`loops.md`](./loops.md) first for
the cadence; this doc is the path through the loops.

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
        ┌──────────────┐          ┌────────────────────────┐
        │  Draft PR    │          │ status: needs-human or │
        │  base:staging│          │ status: needs-triage   │
        │  Closes #N   │          │ + structured comment   │
        └──────┬───────┘          └────────────────────────┘
               │
       Human review, marks ready, requests changes…
               │
               ▼
       Human merges PR → staging branch
               │
               ▼
       pages.yml rebuilds /staging/ on Pages
               │
               ▼
       Hourly UAT validation (:15) walks the PR's
       "UAT on live staging" checklist against
       https://danielsperoniteam.github.io/fhir-place/staging/
               │
               ▼
       UAT comment posted on PR (informational, not a review)
               │
               ▼
       Human promotes staging → main (fast-forward / merge)
               │
               ▼
       pages.yml rebuilds /
               │
               ▼
       Live site monitor (06:30 UTC nightly) runs the
       fixed Playwright suite against /; failures become
       new bot-filed issues → next morning's PM triage
```

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
origin/staging`. The PR base is **always `staging`**, never `main`.

Outcomes:

| Outcome | Issue label after | Branch |
| --- | --- | --- |
| Draft PR opened | `status: in-progress` stripped | pushed |
| Acceptance criteria ambiguous | `status: needs-triage` | not pushed |
| Typecheck/tests/e2e/build fail past retry budget | `status: needs-human` | left in place locally |
| Blast-radius cap exceeded | `status: needs-human` | not pushed |
| Secret regex hit on diff | `status: needs-human` | **deleted** before exit |
| Deny-listed path touched | `status: needs-human` | not pushed |
| Loop heuristic / wall-clock cap | `status: needs-human` | left in place locally |
| Subagent crashed / silent | `status: needs-human` (added by orchestrator) | unknown |

The orchestrator strips `status: in-progress` after a draft PR is
opened. The subagent comments the PR link onto the issue.

### 5. PR opened — what's in it

The PR body is mandated to contain, in order:

1. `Closes #<N>`
2. **Summary** — 1–3 bullets, "why" not "what".
3. **Test plan** — checklist of commands run locally.
4. **UAT on live staging** — concrete, copy-pasteable steps a human or
   the QA agent can walk against
   `https://danielsperoniteam.github.io/fhir-place/staging/` once the
   change has merged into `staging` and Pages has redeployed. Each step
   names the route, the action, and the expected observable result.

If the engineer can't articulate UAT steps, that's an exit condition —
it doesn't open the PR.

For any user-visible change, screenshots are committed under
`screenshots/pr-<branch-slug>/` and inlined in the body via the
`raw.githubusercontent.com` URL pattern. Pure infra/CI/docs/private
internal-refactor PRs may write `N/A — no user-visible change` in
that section but must not skip it silently.

### 6. Human review

PRs are **draft** when opened. A human:

- reviews the diff
- reviews the screenshots
- mentally checks the UAT steps for plausibility
- marks the PR ready, requests changes, or closes it

The agent does not mark its own PRs ready, request reviews, approve,
merge, or auto-merge. Branch protection on `main` enforces this even
if a prompt slips.

If the PR has merge conflicts, a maintainer can comment
`/resolve-conflicts` and the conflict-resolver workflow takes a single
attempt at resolving them; otherwise the PR author rebases by hand.

### 7. Merge into `staging`

A human merges. Two things happen:

- `pages.yml` rebuilds the `/staging/` slot of the Pages artifact and
  redeploys.
- The PR's head SHA is now reachable from `origin/staging`, which means
  the next **hourly UAT validation** run will walk it.

Note: the engineer-dispatch loop's PR is still **open** at this point.
"Merge into staging" is not "merge into main" — it's a deploy step that
makes the change visible on the live `/staging/` URL for UAT.

### 8. UAT validation against the live staging build

[`docs/prompts/hourly-uat-validation.md`](../prompts/hourly-uat-validation.md)

- The QA subagent walks each item in the PR's UAT checklist using
  Playwright against the live `/staging/` URL.
- Pass/fail per item is posted as a structured comment that starts with
  `<!-- uat-validation:run sha=<head-sha> at=<ISO> -->` so the next run
  can dedupe.
- Out-of-scope bugs (anything broken outside the PR's changed files)
  are filed as new bot-issues, **not** added to the PR comment.
- The PM subagent runs alongside, walks the live build for up to 15
  minutes, files at most three improvement-idea issues.

The UAT comment is **informational, not a formal review** — it does
not block merge by itself. A human still has to confirm.

### 9. Promotion: `staging` → `main`

A human promotes `staging` to `main` (fast-forward or merge). At that
point:

- `pages.yml` rebuilds `/`.
- The PR is closed by GitHub via its `Closes #<N>` trailer.
- The original issue is closed automatically.

### 10. Post-deploy regression check

Live-site-monitor runs at 06:30 UTC the following morning against `/`,
files any new failures as bot-issues, and the cycle starts over with
PM triage at 07:00.

If a regression is filed, it lands in the "ready" queue once PM triage
labels it, the engineer dispatch picks it up at the next `:05`, and
the lifecycle repeats.

## Where humans are required

The loops are designed so that humans are required at exactly four
points:

1. **Triggering the kill switch** when something is going sideways
   (label the loop's tracking issue `status: agent-paused`).
2. **Reviewing and marking PRs ready, then merging into `staging`.**
   The agent never does this.
3. **Promoting `staging` to `main`.** Always a human action.
4. **Modifying the SDLC itself** — prompts, agent definitions,
   workflows, `CODEOWNERS`. Self-modification is out of scope for every
   agent in the system.

Everything else — triage, branch creation, code, tests, screenshots,
draft PR, UAT walk, bug-filing — is automated.
