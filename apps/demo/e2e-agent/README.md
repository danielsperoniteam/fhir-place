# LLM-agent browser harness (Phase 1)

An exploratory QA harness that gives a Claude model a browser and a goal,
and lets it discover issues by interacting with the deployed demo the way
a user would. Lives **alongside** but separate from the deterministic
Playwright suites in `../e2e/` and `../e2e-live/` — different signal, different
runtime model, intentionally not folded into the same reporter.

This phase is the minimum loop end-to-end:
- Anthropic tool-use agent (Sonnet 4.6) drives Playwright in-process.
- Targets the deployed Pages demo, pinned to the **SMART Health IT R4** server
  via a localStorage init script.
- One hand-written task. No judge, no LLM-generated tasks, no CI.

## Run it

```bash
export ANTHROPIC_API_KEY=...
pnpm --filter @fhir-place/demo agent:run
# or pick a task / change targets:
pnpm --filter @fhir-place/demo agent:run --task=find-allergies
LIVE_SITE_BASE_URL=http://localhost:5173 pnpm --filter @fhir-place/demo agent:run --headed
```

Reports land in `e2e-agent/results/<runId>/report.json` with screenshots in
`screenshots/`. The directory is gitignored.

Exit code: `0` if the agent reported `success`, `1` otherwise (`blocked`,
`bug-suspected`, or any ceiling tripped).

## Ceilings

| | Default | Override |
|---|---|---|
| Steps per task | 25 | `--max-steps=N` |
| Wallclock per task | 90s | `--wallclock-ms=N` |
| Cost per task | $0.25 | `--cost-ceiling=N` |

Pricing is estimated from public Sonnet rates — actual billing comes from the
Anthropic API. Per-run total cost cap (across all tasks) lands in Phase 2.

## Why a standalone runner, not Playwright's runner

Playwright's test runner assumes per-test isolation, fixtures, and timeouts
that fight a 90-second LLM loop, and its reporter shape can't carry the
structured `report_outcome` payload we need for the (Phase-2) judge. We use
Playwright's browser API directly via `chromium.launch`.

## Layout

```
e2e-agent/
  runner.ts            # CLI entrypoint
  agent/
    driver.ts          # Anthropic tool-use loop
    tools.ts           # Playwright-backed tools + Anthropic tool schemas
    cost.ts            # Token accounting + cost ceiling
    types.ts           # TaskDef, RunReport, Outcome
  tasks/
    find-allergies.ts  # Seed task (TS, not YAML — see plan note)
  results/             # gitignored; one dir per run
```

Tasks are TypeScript modules rather than YAML so they're type-checked and
need no parser dependency. When LLM-generated tasks land in Phase 2 the
generator emits the same `TaskDef` shape.

## What's next

- **Phase 2:** task generator (template-slot, not free-form), Sonnet 4.6 judge
  pass over the trace, deterministic post-checks (`postChecks` on the task),
  failure fingerprinting.
- **Phase 3:** GitHub Actions workflow with `workflow_dispatch` + weekly cron,
  artifact upload only (no issue filer until the noise floor is measured).
