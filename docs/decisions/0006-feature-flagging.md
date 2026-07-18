# 0006 Feature flagging policy

## Status
Accepted

## Context
LaunchDarkly is now wired up (see [`LAUNCHDARKLY.md`](../../LAUNCHDARKLY.md)). The strategic goal is to make deploys safer over time by gating risky changes behind flags so they can be turned off without a revert. Not every change needs a flag — wrapping trivial work would be ceremony without payoff and would slow the agent-driven backlog drain. We need a default-off rule that the engineer subagent can apply mechanically and the PM agent can label at triage.

## Decision

### Default
Changes ship **without** a flag.

### Trigger list (wrap in a flag)

Wrap a change behind a default-off feature flag if **any** of these is true:

| Trigger | Why |
|---|---|
| New user-visible surface in `apps/demo` (new route, new tab, replacing a component, redesign) | UI regressions are visible immediately to anyone evaluating the demo; killswitch beats revert. |
| New autonomous behavior in the dispatch loop (new auto-merge rule, new path the engineer can edit, new tool it can call, new label it can manage) | The engineer subagent runs unattended; flag-gating new powers means a bad rollout doesn't cascade across an overnight queue. |
| Change to data fetch/write behavior that affects what the user sees | Wrong-data bugs are healthcare-safety-adjacent; treat as if user-visible. |
| Change to security model (auth flow, permission scope, secret handling) — additive only, **not** security *fixes* | Security fixes ship immediately; security model changes need rollback surface. |

### Don't-wrap list

Always ship without a flag:

- Pure bug fixes for already-shipped behavior (revert is the killswitch)
- Documentation, comments, ADRs
- Internal refactors with no behavior change
- Test additions / e2e snapshot refreshes
- CI / build / lockfile / dependency-bump changes
- Single-line copy edits, accessibility attribute fixes, type-only fixes

If you can't decide, default to **no flag** and note the call in the PR body.

### Who applies the rule

| Role | Action |
|---|---|
| **PM agent** at issue triage | Adds one of three labels: `flag: required`, `flag: optional`, or none (= default no). Reasoning: one line in the issue body if `optional`, two lines if `required` (which trigger fired + suggested flag key). |
| **Engineer agent** at PR time | Reads the `flag:` label. If `required`, wraps the change behind a default-off flag, picks a key per naming convention below, and writes the rollout plan into the PR body. If `optional`, exits `status: needs-human` so a person can decide. If absent, ships unwrapped. |
| **Human reviewer** at merge | Confirms the wrap is correct. After merge, owns the rollout: targets self → cohort → percentage → 100%. |

### Naming
`<area>-<short-name>`, kebab-case, no version suffixes (use targeting/percentage rollouts to evolve).

Examples:
- `demo-longitudinal-timeline` — new tab on the patient detail page
- `dispatch-auto-merge-trivial` — auto-merge bot PRs that touch only docs
- `react-fhir-zod-validation` — runtime Zod validation in the published library

### Defaults at flag creation
- Off for everyone
- Targeting rule: serve `true` to Daniel's email
- Description: link the GitHub issue + the PR
- Tags: the area label (`area: fhir-explorer`, etc.)

### Cleanup
After a flag has served `true` to 100% of contexts for **2 weeks** with no rollback, delete the flag and remove the conditional. The `launchdarkly-flag-cleanup` skill (when published) will help; until then, file an issue tagged `type: tech-debt`.

## Consequences

- Most PRs ship with no extra ceremony.
- Risky PRs ship with a killswitch and explicit rollout plan.
- The engineer agent has a mechanical rule it can apply without judgment calls; ambiguous cases bail to `needs-human`.
- The PM agent has one new labeling decision per issue. Adds ~30 seconds per triage pass.
- Flags that linger become tech debt; cleanup is on a 2-week clock.

## References
- [`LAUNCHDARKLY.md`](../../LAUNCHDARKLY.md) — SDK setup, env vars, MCP config
- [`.claude/agents/engineer.md`](../../.claude/agents/engineer.md) — engineer subagent reads the `flag:` label per this ADR
- [`docs/prompts/hourly-engineer-dispatch.md`](../prompts/hourly-engineer-dispatch.md) — dispatcher checks the label before claiming
- [`docs/prompts/daily-pm-triage.md`](../prompts/daily-pm-triage.md) — PM agent applies the label
