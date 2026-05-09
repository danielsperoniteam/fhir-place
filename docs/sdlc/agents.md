# The agents

Eight Claude personas live under [`.claude/agents/`](../../.claude/agents/).
Each is a markdown file with a YAML front-matter block (`name`,
`description`, `tools`, `model`) and a body that gives the persona,
operating principles, and per-task playbooks.

Two distinctions matter:

- **Orchestrator vs. subagent.** The cron prompts in
  [`docs/prompts/`](../prompts/) are orchestrators — they read GitHub
  state and decide who runs next. Personas under `.claude/agents/` are
  subagents — they're invoked by an orchestrator with a tightly-scoped
  task.
- **State-only vs. source-editing.** Most personas have read-only or
  GitHub-state-only tool sets. Only the `engineer` and
  `principal-platform-engineer` personas can `Edit`/`Write` files, and
  only the `engineer` is invoked by a recurring loop.

## Persona summary

| Persona | Allowed tools | Edits source? | Files PRs? | Invoked by |
| --- | --- | --- | --- | --- |
| `engineer` | Read/Edit/Write/Grep/Glob/Bash + GitHub MCP | yes (deny-listed paths excluded) | yes (draft, base `staging`) | hourly engineer-dispatch loop |
| `qa-engineer` | Read/Grep/Glob/Bash/WebFetch | no | no — files bug **issues** | hourly UAT validation, daily QA pass |
| `health-tech-pm` | Read/Grep/Glob/Bash/WebFetch/WebSearch | no | no — files improvement-idea issues | hourly UAT validation (PM time) |
| `senior-fhir-engineer` | Read/Edit/Write/Grep/Glob/Bash/WebFetch/WebSearch | technically yes, in human-driven sessions | when asked | human invocation only |
| `clinical-informaticist` | Read/Grep/Glob/Bash/WebFetch/WebSearch | no | no | human invocation only |
| `principal-platform-engineer` | Read/Edit/Write/Grep/Glob/Bash/WebFetch/WebSearch | yes, in human-driven sessions | when asked | human invocation only |
| `tpm-coordinator` | Read/Grep/Glob/Bash/WebFetch/WebSearch | no | no | human invocation only |

The four "human invocation only" personas (FHIR engineer, informaticist,
principal engineer, TPM) are deep-domain reviewers a human operator
invokes during a Claude Code session — they are not on a cron.

## The engineer subagent (the one that actually writes code)

[`.claude/agents/engineer.md`](../../.claude/agents/engineer.md)

The engineer is handed exactly one ticket per invocation:
`{issue_number, acceptance_criteria, branch_name}`. Its lifecycle:

1. Set up a git worktree off `origin/staging` on the dispatcher-supplied
   `bot/issue-<N>-<slug>` branch and `pnpm install --frozen-lockfile`.
2. Restate acceptance criteria. If it can't, exit `status: needs-triage`
   and post the attempted restatement.
3. Implement the smallest change that satisfies the criteria. Capture
   screenshots for any user-visible change at desktop (1280×800) and
   mobile (375×812) when the layout is responsive.
4. Run the contract — `pnpm -r typecheck` (2 retries), `pnpm -r test:run`
   (3 retries), `pnpm --filter @fhir-place/demo e2e` (2 retries) when
   relevant, then build (1 retry). Each retry must change something.
5. Test-update gate: if a `src/**` file changed but no test file
   changed, exit `needs-human`.
6. Changeset gate: if a published package changed but no
   `.changeset/*.md` was added, run `pnpm changeset` and pick the bump.
7. Pre-push gate: secret-regex scan against `git diff origin/staging...HEAD`,
   then blast-radius check (≤ 400 LOC, ≤ 20 files, ≤ 1 `package.json`,
   ≤ 5 deletions).
8. `git push -u` and open a **draft** PR with `base: staging`, body
   containing `Closes #<N>`, a Summary, a Test plan, and a mandatory
   **UAT on live staging** section with concrete steps a human can
   walk against `https://danielsperoniteam.github.io/fhir-place/staging/`.
9. Comment the PR link back on the issue.

Failure modes — typecheck, tests, e2e, build, ambiguous criteria,
blast-radius hit, secret hit, deny-listed path, visual snapshot
failure, loop heuristic (5+ edits to the same file), 25-minute
wall-clock — all exit `status: needs-human` with a structured comment.
On a secret-regex hit the branch is **deleted** before exit; otherwise
it's left in place for human inspection.

The deny-list (rule 4 of the engineer's hard rules) blocks edits to
`.github/workflows/**`, `scripts/sync-labels.mjs`, `.env*`, secret
files, the lockfile (mass-rewrites), and `packages/react-fhir/**`
without a changeset.

## The QA agent

[`.claude/agents/qa-engineer.md`](../../.claude/agents/qa-engineer.md)

Sam is a former EHR-module QA engineer. Two recurring jobs:

- **Hourly UAT validation** — for each open non-draft PR whose head SHA
  is reachable from `origin/staging` (i.e. its changes are live on the
  `/staging/` URL), walk the PR's "UAT on live staging" checklist with
  Playwright, post a structured `<!-- uat-validation:run sha=... -->`
  comment with pass/fail per item, and file out-of-scope bugs as
  separate issues.
- **Daily exploratory QA pass** — boot the dev server pointed at the
  SMART Health IT R4 sandbox, walk the routes from
  [`docs/qa-agent.md`](../qa-agent.md) at desktop, file each distinct
  bug as a `type: bug, origin: bot-filed` issue.

Sam files but never fixes. P0 categories — wrong-patient/drug/dose/route/
time, broken allergy/problem-list rendering, missing audit trails,
silent data loss — escalate immediately to the principal engineer and
informaticist.

## The PM agent

[`.claude/agents/health-tech-pm.md`](../../.claude/agents/health-tech-pm.md)

Priya runs as a subagent of the hourly UAT-validation loop with a
15-minute walking budget. She uses the live staging build the way a
real provider/payer/patient would for the JTBDs in
[`docs/qa-agent.md`](../qa-agent.md) and files at most three new
`type: feature, priority: low, origin: bot-filed` improvement-idea
issues per run. She does not comment on PRs — that's Sam's lane.

The orchestrator behind the daily backlog hygiene
([`docs/prompts/daily-pm-triage.md`](../prompts/daily-pm-triage.md))
is also "PM work" but it runs the prompt directly, not the persona —
the prompt is a deterministic checklist so a chatty persona would just
get in the way.

## The deep-domain reviewers

These four exist for human-driven sessions. They have no cron loop.

- **`senior-fhir-engineer`** — Marco. FHIR / CQL / IGs / SMART-on-FHIR.
  Invoke when modeling a resource, debugging validation, or polishing
  FHIR-aware UI.
- **`clinical-informaticist`** — Jamie, RN/MSN/BMI. Terminology
  selection, clinical workflow honesty, patient-safety review.
- **`principal-platform-engineer`** — Devon. AWS, IAM/KMS, PHI flow,
  HIPAA / HITRUST / SOC 2 controls, dependency supply chain.
- **`tpm-coordinator`** — Lin. Milestones, blockers, release readiness,
  cross-workstream coordination.

Their main role in the SDLC is to be invoked by a human operator who
wants a deep second opinion before a merge — not by a cron.
