# Daily QA pass prompt

This prompt runs daily on a cron via `.github/workflows/daily-qa-pass.yml`.
It drives a desktop browser through the demo app — pointed at a real FHIR
server, not the MSW mocks — looking for bugs that the existing e2e suites
can't see (real network shapes, paging quirks, search edge cases). It files
each new bug as a GitHub issue.

It is the agentic counterpart to `live-site-monitor.yml`, which runs the
fixed Playwright suite against the deployed Pages build. This pass is
exploratory: routes and interactions are walked dynamically, with the bug
signals from `docs/qa-agent.md` as the rubric.

## Environment guarantees from the workflow

- Repo is checked out and `pnpm install --frozen-lockfile` has run.
- Playwright `chromium` is installed with deps.
- The dev server is **already running** in the background on
  `http://localhost:5173`, started with:
  ```
  VITE_USE_MOCK=false VITE_FHIR_BASE_URL=https://r4.smarthealthit.org
  ```
  i.e. it talks to the SMART Health IT public sandbox, not MSW. Treat it as
  shared infrastructure: do not write data unless the docs/qa-agent.md
  playbook explicitly calls for a CRUD assertion on a fresh patient.
- The GitHub MCP tools (`mcp__github__*`) are configured. Use them to
  search and file issues. Do **not** use `gh` or open a branch/PR — this
  prompt is run-state-only.

## Your task

You are the QA engineer for `danielsperoniteam/fhir-place`. Walk the demo
app desktop-only at 1280×800 against the real FHIR server. File each
distinct bug as a GitHub issue.

Run the steps below in order. Log what you do as you go.

### Hard rules

- **Desktop only.** Do not test mobile viewport in this pass — that's
  scope for a separate workflow.
- **One issue per distinct bug.** Do not batch.
- **Dedupe before filing.** Search open issues with `mcp__github__search_issues`
  using `repo:danielsperoniteam/fhir-place is:issue is:open in:title "<keyword>" label:"origin: bot-filed"`.
  If a clear match exists, add a comment instead of filing a new issue.
- **Do not fix bugs.** Filing only. Fixes happen in a separate PR.
- **Do not modify any files.** This prompt is GitHub-state-only.
- **Do not write data to the FHIR server** unless a CRUD test is in
  scope (Patient/new, edit). If you do, use a clearly-fake name like
  `QA Bot <ISO timestamp>` so the data is identifiable for cleanup.
- **Do not use `[bracket]` prefixes in issue titles.** The PM triage
  agent strips them. Use a plain descriptive title.

### Step 1 — Confirm the dev server is alive

```
curl -fsS http://localhost:5173 | head -c 200
```

If this fails, write a one-line note to stderr and stop. The workflow
will surface the failure in its run log; do not file an issue for the
QA pass infrastructure itself.

### Step 2 — Scope the existing failures

Read `apps/demo/e2e/README.md` and skim the spec filenames in
`apps/demo/e2e/`. You don't need to run the suite (the workflow doesn't
run it for this pass). Use this to recognise behaviour the team
already considers known-broken when you bump into it during exploration —
do not re-file those.

### Step 3 — Drive the app with Playwright

Write a temporary Node script in `/tmp/qa-pass.mjs` that uses the
Playwright API. Do not commit it. Capture:

- console errors (`page.on("console", ...)`)
- page errors (`page.on("pageerror", ...)`)
- network failures (`page.on("response", ...)` filtering 4xx/5xx, but
  ignore expected 404s like `/Patient/NONEXISTENT`)

Walk the routes from `docs/qa-agent.md` "Pages to visit" — desktop only.
For each route:

1. Navigate, wait for `networkidle` (timeout 15s).
2. Assert the page has rendered something (no blank body, no infinite
   spinner, no "Something went wrong" boundary).
3. Try the primary interaction documented for that route (search,
   field picker, pagination, etc.).
4. Record any captured errors with the route and a one-line repro.

Use the bug-signal table in `docs/qa-agent.md` as your detection rubric.

### Step 4 — File issues

For each distinct bug:

1. Search for an existing open issue (see "Hard rules" above).
2. If a match exists: add a comment with today's run URL, the captured
   error, and the affected route. Do **not** re-open closed issues.
3. If no match: file a new issue with:
   - **Title:** plain descriptive sentence, no bracket prefix.
     E.g. `Patient detail crashes on patient with no name.given`
   - **Labels:** `type: bug`, `area: fhir-explorer`, `origin: bot-filed`,
     and a priority — `priority: high` for crashes, broken navigation,
     or data loss; `priority: medium` for everything else.
   - **Body:** use the structure below. The `agent-work-item` issue
     template's fields are good guidance, but file via `mcp__github__issue_write`
     with a free-form body — that's what `live-site-monitor.yml` does too.

   ```
   **Route:** <hash route>
   **Run:** <workflow run URL — read GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID env>
   **FHIR server:** https://r4.smarthealthit.org
   **Viewport:** 1280×800

   **Steps to reproduce:**
   1. ...
   2. ...

   **Expected:** ...
   **Actual:** ...

   **Console errors:**
   ```
   <paste, trimmed to ~2 KB>
   ```

   **Network failures:**
   - <method> <url> → <status>

   **Likely files:** apps/demo/src/...

   _Filed automatically by `.github/workflows/daily-qa-pass.yml`. The
   PM-triage workflow will assign final priority and `area:` next._
   ```

### Step 5 — Report a summary

At the end of the run, print (to stdout — Claude's normal output, no
issue filing) a short summary:

- Routes visited
- Bugs filed (issue numbers + URLs)
- Existing issues commented on (numbers + URLs)
- Any infrastructure problems hit (FHIR server slow, dev server crashed,
  etc.) — these are surfaced in the run log only, not filed as issues.

## Scope and limits

- Demo app (`apps/demo/`) only. Do not file issues against
  `packages/react-fhir` unless a unit-test failure confirms the bug is
  in the library.
- Do not touch issues that don't have `origin: bot-filed`. Comment-only
  on bot-filed dedupes.
- Stay under ~10 issues filed per run. If you hit 10, stop filing,
  finish the walk, and surface the remainder in the summary so a human
  can decide whether to file them by hand.
