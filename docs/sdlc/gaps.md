# Gaps and future improvements

The companion to the rest of `docs/sdlc/`. The other four files describe
what is wired up; this one is the honest list of what isn't yet, and a
sketch of how each piece would slot in.

This is a **working document**. The intent is for issues to be spun out
of it: each "Gap" section below is sized to be one (or sometimes two)
GitHub issues. Where a gap is bigger than that — agentic users and
feature flags — it's broken out as a "Theme" with sub-pieces.

## How to use this doc

1. Open an issue per Gap heading using the existing label conventions
   in [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — `type: feature` or
   `type: tech-debt`, an `area:`, a `priority:`.
2. Add the proposed `human-review-needed: <level>` label (see below).
3. Link the issue from the gap heading in this file (in a follow-up
   PR — humans only, since prompts/docs that drive agents shouldn't
   churn under an agent's hand).

## Proposed label: `human-review-needed: low | medium | high`

A new label vocabulary axis. Lives alongside `type: / area: / priority: /
status: / origin:`.

**Universality rule: every agent-filed issue must set this label
explicitly at filing time.** Not "default to no label and let PM-triage
backfill" — every filer decides the level themselves, because they have
the most context about what they just observed. PM-triage backfills
only as a safety net for issues that arrive missing the label (human-
filed issues that didn't think about it).

| Level | Meaning | Effect on engineer dispatch | Effect on assignment |
| --- | --- | --- | --- |
| `low` | Agent can take it end-to-end. Human reviewer just merges. | Picked normally by the "ready" queue. | None. |
| `medium` | Agent can draft a PR; human must review the **approach** (architecture, abstraction choice), not just the diff. | Picked normally; reviewer expected to push back harder. | None. |
| `high` | A human needs to think about this **before** the agent goes near it. Often: persona design, patient-safety review, architectural choice with downstream cost. | **Excluded** from the ready queue (`-label:"human-review-needed: high"`). Becomes ready only when the human has thought it through and either downgrades the label or writes acceptance criteria specific enough that the agent can execute mechanically. | **Auto-assign the maintainer** (`assignees: ["danielsperoniteam"]`) at filing time so the issue lands directly in their tray instead of in the backlog. |

### How each filer chooses the level

The filer (the agent that creates the issue) applies a small decision
table before filing:

- **Default `low`** for deterministic test failures, single-route bugs
  with a clear repro, dedupe-of-existing close calls, and any bug whose
  fix is one file in a non-deny-listed path.
- **Escalate to `medium`** when: reproduction is ambiguous; multiple
  files likely affected; the fix involves a choice of abstraction or a
  visible API change; the bug crosses package boundaries
  (`packages/react-fhir/**` ↔ `apps/demo/**`).
- **Escalate to `high`** when **any** of:
  - Patient-safety pattern: wrong-patient/drug/dose/route/time, broken
    allergy/problem-list rendering, missing audit trail, silent data
    loss.
  - Credential / secret pattern: anything that smells like a leaked
    token, key, or PHI fragment.
  - Architecture-significant: auth, encryption, data flow between
    components, schema migration, FHIR profile choice.
  - Touches a deny-listed path the engineer agent can't edit
    (`.github/workflows/**`, `.claude/`, `docs/prompts/`,
    `scripts/sync-labels.mjs`, `pnpm-lock.yaml` mass-rewrites,
    `packages/react-fhir/**` without a changeset).
  - Theme-level work — the bigger pieces in the "Themes" section
    below (agentic users, feature flags) are `high` by definition.

### Assignment ≠ claim

The hourly engineer-dispatch prompt currently says: *"Never assign
issues — the bot has no GitHub user identity. Use the
`status: in-progress` label as the atomic claim."*

That rule is about the bot using assignment as a **claim lock**.
Assigning the **maintainer** (a human, for routing) is a different
action and not in conflict. The doc-update for this label should
explicitly call out the distinction so a future prompt-author doesn't
accidentally remove the auto-assign rule when reading the existing one.

### Filing surfaces that need updating

To make the label universal at filing time, these two places change:

| File | Today | Change |
| --- | --- | --- |
| `.github/workflows/live-site-monitor.yml` line 154 | `labels: ['type: bug', 'area: fhir-explorer', 'priority: P0', 'origin: bot-filed']` | Add `'human-review-needed: low'` for normal Playwright failures; the existing `github-script` adds `'human-review-needed: high'` and `assignees: ['danielsperoniteam']` if the failed test's title matches the patient-safety regex (med/dose/allergy/problem). |
| `docs/prompts/daily-qa-pass.md` Step 4 — Labels | `type: bug, area: fhir-explorer, origin: bot-filed, priority: …` | Append `human-review-needed: <level>`, applying the decision table above. For `high`, also pass `assignees: ['danielsperoniteam']` to `mcp__github__issue_write`. |

PM triage gets the safety-net rule:

| File | Change |
| --- | --- |
| `docs/prompts/daily-pm-triage.md` Check 1 | If an issue is missing `human-review-needed:`, infer it: bot-filed default `low`, signature-match (the same patient-safety / credential / schema-migration regex used by the filers) sets `high` and adds the maintainer as assignee. Human-filed issues without the label stay unset and surface in the report. |

### Adoption order

This is multiple PRs, all human-authored (agents can't edit their own
prompts or the label sync script). Suggested order:

1. **PR A** — `scripts/sync-labels.mjs` + `CONTRIBUTING.md` add the
   three label values. No behaviour change yet; just makes the labels
   exist.
2. **PR B** — update the two filing surfaces above so every new
   bot-filed issue carries a level. Existing issues stay unlabelled.
3. **PR C** — update `hourly-engineer-dispatch.md` Step 3 to exclude
   `human-review-needed: high` from the ready queue. This is the gate
   that gives the label teeth.
4. **PR D** — update `daily-pm-triage.md` Check 1 to backfill missing
   levels.
5. (Optional, later) Bulk-label the existing backlog. PM-triage's
   backfill rule will catch most of it; the rest can be hand-set.

PR A through D are all small. Doing them in order means the system
doesn't get into a half-state where the label exists but isn't gating
anything, or is gating without filers populating it.

---

## Gaps — single-issue items

### Gap 1 — No clinical-safety review in the loop

**`human-review-needed: high`**

The `clinical-informaticist` persona ([`Jamie`](../../.claude/agents/clinical-informaticist.md))
is defined but never invoked by a workflow. For a product that renders
medications, allergies, problems, and orders, every PR touching those
resources should get an automatic clinical-correctness pass.

Sketch of the fix: a workflow that, on PRs whose changed-files list
includes `apps/demo/src/**` paths flagged "clinical" (medications,
allergies, problems, orders, vitals, observations), spawns the
`clinical-informaticist` subagent with the diff and posts a comment
covering: terminology choice (system + display + version), value-set
binding strength, workflow honesty (does this match how a clinician
actually works), and any patient-safety red flag.

Why `high`: the persona's voice and red-flag rubric matter. A human
should pair-design the prompt and the trigger predicate before the
loop runs untended.

---

### Gap 2 — No FHIR-conformance validation in CI

**`human-review-needed: medium`**

The `senior-fhir-engineer` persona ([`Marco`](../../.claude/agents/senior-fhir-engineer.md))
exists, but resource validation against profiles (US Core, IPS,
QI-Core) is a vibes-check at human review. Validation should be a CI
gate.

Sketch of the fix: a `pnpm` script that walks every example fixture
under `packages/react-fhir/**/fixtures/` and `apps/demo/src/**/fixtures/`,
runs each through `fhir-validator-cli` (or the JS HL7 validator) against
its declared `meta.profile`, and fails the job on validation errors.
Wire into `.github/workflows/ci.yml` as a required check.

Why `medium`: mechanically straightforward, but a human should pick
the validator and decide the profile floor (US Core 6.1.0? IPS 1.1.0?).
That choice has downstream cost.

---

### Gap 3 — No multi-server FHIR test matrix

**`human-review-needed: medium`**

`docs/qa-agent.md` says "demo behaving differently against HAPI vs.
Medplum vs. Aidbox is a real bug, not configuration." The daily QA
pass only runs against SMART Health IT. The exact bug class the prompt
warns about is the one we don't automate against.

Sketch of the fix: extend `daily-qa-pass.yml` to a matrix
(`smart-health-it`, `hapi-public`, `medplum-public`) using the existing
agent prompt; the agent dedupes within a server, and a final aggregate
step files a "differs across servers" issue when the same JTBD passes
on one and fails on another.

Why `medium`: each server has a different behaviour, an auth model, and
a rate-limit posture. A human should pick the matrix carefully so the
job stays under an hour and isn't flaky on third-party outages.

---

### Gap 4 — Engineer dispatch is still manual

**`human-review-needed: low`**

`hourly-engineer-dispatch.yml` was merged with `cron:` commented out, on
the rule that 5–10 successful manual runs should be observed first. The
old hourly staging UAT loop is retired by ADR 0009.

Sketch of the fix: uncomment the `schedule:` block after the `Engineer
dispatch — hourly report` tracking issue shows several clean manual runs.

Why `low`: purely a flag flip; the prompts are the source of truth.

---

### Gap 5 — No automated rollback

**`human-review-needed: high`**

`live-site-monitor.yml` files an issue when `/` breaks, but nothing
reverts the offending merge. The only kill switch today is
`status: agent-paused` on a tracking issue (which stops the loop, not
the deploy).

Sketch of the fix: a `revert-on-failure.yml` workflow that, when
live-site-monitor reports a P0 regression on `main`, opens a
`revert/<sha>` PR with `git revert <sha>` and labels it
`priority: P0, status: needs-human`. **Do not auto-merge.** A human
still pulls the trigger.

A bigger version of this fix needs feature flags as substrate — flag
flip is faster than a revert PR. See Theme 2 below.

Why `high`: revert semantics on a merge commit aren't always clean.
A human should design which failures qualify, what the PR contains,
and whether to also touch `staging`.

---

### Gap 6 — No perf / a11y / bundle-size gates

**`human-review-needed: low`**

A 3-second slower Patient list, a contrast-failed `<CodedValue />`
chip, or a 40 KB bundle bloat ships today without a CI signal.

Sketch of the fix: add three gates to `ci.yml`:

- **Lighthouse CI** with a perf/a11y/best-practices floor on
  `apps/demo` desktop and mobile builds.
- **`@axe-core/playwright`** in the e2e suite running an axe scan on
  every page in `docs/qa-agent.md`'s "Pages to visit" table.
- **Bundle-size budget** via `size-limit` or `bundlesize` on
  `apps/demo/dist/**` and `packages/react-fhir/dist/**`.

Why `low`: each is an off-the-shelf gate; the only judgement call is
the floor numbers, which can start permissive and tighten over time.

---

### Gap 7 — Self-modification ban is prompt-trust, not GitHub-enforced

**`human-review-needed: low`**

The engineer's deny-list blocks edits to `.github/workflows/**`,
`.claude/`, `docs/prompts/`, but only inside its own check. A future
prompt bug or a path-pattern miss could let an agent slip through.

Sketch of the fix: a `.github/CODEOWNERS` entry that requires a
specific human reviewer for any of those paths. Branch protection's
"require code owner review" turns it into a structural gate.

```
.github/workflows/  @<maintainer>
.claude/            @<maintainer>
docs/prompts/       @<maintainer>
docs/sdlc/          @<maintainer>
scripts/sync-labels.mjs @<maintainer>
```

Why `low`: purely a config change; deny-list and CODEOWNERS are
defense in depth.

---

### Gap 8 — No outcome metrics

**`human-review-needed: medium`**

Tracking issues capture activity ("3 PRs picked up, 1 needs-human")
but not outcomes. We can't tell if the system is getting better or
worse over time.

Sketch of the fix: a weekly `agentic-sdlc-metrics.yml` that posts to a
single rolling issue (`SDLC metrics — weekly report`) with:

- Bot-PR merge rate (merged / opened) by week.
- Mean time issue → draft-PR (engineer dispatch latency).
- Mean time draft-PR → merge (human review latency).
- % of PRs that pass UAT validation first try.
- `needs-human` exit rate by reason.
- Live-site-monitor failure rate.

Why `medium`: a human should decide the metric set and whether to
publish it as a static dashboard (e.g. a markdown table in the issue,
or a tiny `apps/sdlc-metrics/` page) rather than design that as we go.

---

### Gap 9 — No global API / cost budget

**`human-review-needed: low`**

Each loop has per-run API call caps but no overall ceiling on Anthropic
or GitHub spend. A pathological loop or a regex-matched flood of
issues could burn far more than expected.

Sketch of the fix:

- A monthly Anthropic spend budget in CloudWatch (or whatever observability
  Anthropic's billing webhook can push to) with an alarm.
- A repo-level `concurrency:` cap across all Claude-driven workflows
  (one global `claude-anthropic-api` concurrency group, `cancel-in-progress: false`).
  This serializes them and removes the worst-case "everything fires at
  once" scenario.

Why `low`: both are config, not design.

---

### Gap 10 — No PHI / synthetic-data discipline check

**`human-review-needed: medium`**

Prompts say "use clearly-fake names like `UAT Bot <ISO>`" when writing
to sandbox FHIR servers, but there's no CI scan ensuring no real-looking
PHI lands in a fixture, snapshot, or screenshot.

Sketch of the fix: a `pnpm` script that walks
`packages/**/fixtures/**`, `apps/**/fixtures/**`, and
`apps/demo/e2e/__screenshots__/**` looking for:

- Names not in a synthetic-data allow-list (Synthea-generated patterns,
  the `UAT Bot` / `QA Bot` prefixes).
- US SSN / NPI / MRN regex hits.
- Phone / email / address that don't match Synthea's patterns.

Run as a CI gate. Failure is "block the PR until a human confirms it's
synthetic."

Why `medium`: the regex set and the allow-list need designing carefully
so the gate isn't false-positive-noisy on legitimate Synthea fixtures.

---

### Gap 11 — No incident path

**`human-review-needed: medium`**

Live-site-monitor failures become issues, not pages. A breakage at
03:00 UTC sits in a queue until 07:00 UTC PM triage.

Sketch of the fix: when `live-site-monitor.yml` files a P0 issue,
also POST to an incoming-webhook (PagerDuty, Slack, or just an email
distribution list). The webhook URL goes in `secrets.INCIDENT_WEBHOOK`.

Why `medium`: the routing destination and the on-call rotation are
human decisions, not technical ones. Don't wire the webhook until
there's an actual on-call.

---

## Themes — bigger than one issue each

### Theme 1 — Agentic users for post-deploy JTBD walkthroughs

**`human-review-needed: high`** (overall)

The motivation: today, post-deploy validation on `/` is the
`live-site-monitor.yml` Playwright suite — deterministic regressions
only. There's no signal for "a real provider trying to do their job
would walk away frustrated." `health-tech-pm` already gets 15 minutes
of "PM time on the live app" inside hourly UAT validation; this theme
generalises that pattern to multiple personas, on production, on a
schedule, with feedback as GitHub issues.

The personas already exist as `.claude/agents/*.md` files. What's
missing:

1. **Per-persona JTBDs.** New folder `docs/personas/` with one file
   per persona. Each file lists 3–5 jobs the persona is trying to do
   on the live product, with success criteria. Example:
   `Marco wants to copy a Patient's full Bundle into a Postman collection in under 90 seconds.`
2. **Per-persona memory.** A persistent `~/.persona/<name>/known-issues.md`
   the agent reads at start and appends to at end, so Marco doesn't
   re-file "the connection drop-down is confusing" every Tuesday. The
   memory file lives in the repo under `data/personas/<name>/` and is
   editable only by humans (so the agent can read but not gaslight
   itself).
3. **Daily walkthrough workflow.** `daily-user-walkthrough.yml`,
   scheduled after `live-site-monitor.yml` (so deterministic regressions
   are filed first). Fans out one Claude run per persona on the
   deployed `/` URL. Each persona files at most 1–2 issues per run with
   `origin: agentic-user`, `persona: <name>`, the JTBD they were doing,
   the friction, and what they expected.
4. **Cross-persona dedupe in PM triage.** Existing dedupe is
   title-match within `origin: bot-filed`. Agentic users will describe
   the same bug differently (Marco: "the connection drop-down is hard
   to find"; Jamie: "I can't tell which server I'm pointed at"). Need
   a fuzzier dedupe: same route + same affected component → comment on
   the canonical issue rather than file a new one.

Why `high`: the persona prompts, the JTBD definitions, and the dedupe
heuristic are design work. Volume control matters — 5 personas × 2
issues/day = 70 issues/week, which floods PM triage if dedupe is
weak. A human should design the first iteration end-to-end before any
cron is enabled.

Sub-issues this theme would produce:

- **(high)** Define JTBDs per persona (`docs/personas/<name>.md`).
- **(high)** Persistent persona memory model (file format, where it
  lives, agent read/write protocol).
- **(medium)** `daily-user-walkthrough.yml` workflow + the prompt at
  `docs/prompts/daily-user-walkthrough.md`.
- **(medium)** Cross-persona dedupe heuristic in
  `docs/prompts/daily-pm-triage.md`.
- **(low)** Add `origin: agentic-user` and `persona:<name>` labels to
  `scripts/sync-labels.mjs`.

---

### Theme 2 — Runtime feature flags

**`human-review-needed: high`** (overall)

The motivation: flags solve three problems at once.

- **Rollback without revert.** Flip a flag instead of opening a revert
  PR + waiting for a redeploy. Pairs with Gap 5.
- **Cohort experimentation.** Half the agentic users see flag-on, half
  see flag-off. Compare their feedback. Closes the loop on whether a
  change actually solved the JTBD, not just whether it shipped.
- **Pre-merge guarded rollouts.** Engineer agent ships a feature behind
  `flag: experiment-x` defaulted off. Human flips it for staging,
  walks UAT, flips it back. No revert pressure on `main`.

Today the only "flags" are build-time env vars (`VITE_USE_MOCK`,
`VITE_FHIR_BASE_URL`). Real runtime flags are new infrastructure.

Sketch:

1. Pick a provider. Options: GrowthBook (open source, self-hostable,
   GitHub-backed config), ConfigCat (hosted, generous free tier),
   Unleash (open source). For a no-PHI demo product, hosted is fine.
2. Wire a tiny client into `packages/react-fhir/src/flags/` so the
   demo app can read flags. Provide a `<FlagBoundary />` wrapper and a
   `useFlag(name)` hook.
3. Update the engineer agent's hard rules:
   - Agent **may** add a flag (with a default of `off`).
   - Agent **may not** remove a flag (the cohort might still depend on
     it).
   - Agent **may not** change a flag's default without a changeset
     entry explaining why.
   - The deny-list adds the flag-config file.
4. Update agentic-user workflow (Theme 1) to pass a flag-cohort hint
   via URL param or cookie. Each persona's known-issues memory
   includes the cohort it's in.

Why `high`: vendor choice has long-term cost. The engineer agent's
rules need a human-authored extension. The interaction with agentic
users is part of the design, not an afterthought.

Sub-issues this theme would produce:

- **(high)** Spike: pick a feature-flag provider (`docs/spikes/feature-flags.md`).
- **(high)** Wire the chosen provider into `packages/react-fhir`.
- **(medium)** Update `.claude/agents/engineer.md` with the flag rules
  (human-authored PR — agents can't edit their own rules).
- **(medium)** Document the flag conventions in `CONTRIBUTING.md`.
- **(low)** Add a flag-debug panel to the demo's dev-only routes.

---

## What this doc deliberately does **not** call gaps

- **No CI parallelism work.** Existing CI is fast enough for a demo.
  Optimising it would be premature.
- **No "agent reviews other agent's PR" loop.** Two agents arguing in
  comments doesn't add signal a human reviewer doesn't already have.
  We have specialised review personas for human use; that's enough.
- **No SAST tool selection beyond CodeQL.** CodeQL already runs on the
  repo and is fine for a demo product. Once there's PHI handling, the
  conversation changes — but that's a product-shape change, not an
  SDLC gap.
- **No multi-tenancy / org-aware features.** fhir-place is a single
  demo deployment today. Multi-tenancy would be a product decision,
  not an SDLC one.
