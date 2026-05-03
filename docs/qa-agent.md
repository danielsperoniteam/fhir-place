# QA Agent Playbook

A guide for an AI agent (Claude Code) to conduct an exploratory QA pass on
the fhir-place demo app and file bugs as GitHub issues.

## Prerequisites

1. Dev server running on port 5173:
   ```bash
   pnpm --filter @fhir-place/demo dev
   ```
2. Run the existing e2e suite first. Any failures there are already known
   bugs — skip re-filing them:
   ```bash
   pnpm --filter @fhir-place/demo e2e
   ```
3. Note which tests passed/failed before starting the exploratory pass.

## What to look for

### Signals that indicate a bug

| Signal | How to detect |
|--------|--------------|
| Console error or uncaught exception | Monitor browser console; assert `consoleErrors` is empty |
| Network request fails (4xx/5xx) | Intercept with `page.on("response", ...)` |
| Page shows an error boundary / "Something went wrong" | `getByText(/something went wrong/i)` |
| Missing `data-testid` on a component the suite expects | Run existing tests; check which selectors fail |
| Broken layout at narrow viewport (375 px) | Resize viewport and screenshot |
| Blank / empty content where data is expected | Assert the relevant element is non-empty |
| Infinite spinner (loading state that never resolves) | Assert content visible within a reasonable timeout |
| Text overflows its container | Visual inspection / screenshot comparison |
| Tab / keyboard navigation broken | Use `page.keyboard.press("Tab")` to walk the UI |
| Duplicate or stale data after CRUD | Create, read, update, delete and assert after each step |

### Pages to visit

Work through each route systematically. The app uses a hash router
(`#/ResourceType`).

| Route | What to verify |
|-------|---------------|
| `/` | Redirects to `#/Patient`; patient list loads |
| `#/Patient` | Table renders, search form visible, field picker works, pagination works |
| `#/Patient/<id>` | Detail view renders; compartment chips visible; no error banners |
| `#/Patient/<id>/edit` | Edit form pre-populates; save does not 500 |
| `#/Patient/new` | Create form empty; submit creates and redirects to detail |
| `#/AllergyIntolerance` | List renders; patient filter chip appears |
| `#/AllergyIntolerance?patient=<id>` | Filtered to a single patient |
| `#/Patient/NONEXISTENT` | Not-found state renders cleanly (no exception) |
| Settings page | Server URL editable; theme toggle works; change persists on reload |
| CQL Runner | Page loads; editor visible |
| Ask / AI feature | Input renders; chat state initialises |

### Mobile viewport check

After the desktop pass, repeat the Patient list and detail routes at 375×812
(iPhone SE). Look for:

- Horizontal overflow (scrollbar on `<body>`)
- Touch targets smaller than 44×44 px
- Text truncated in a way that hides key information

## Running a Playwright-based exploratory session

You can use Playwright's `page` API programmatically to walk the app without
writing a permanent test:

```ts
// Temporary exploratory script (do NOT commit)
import { chromium } from "playwright";

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

const errors: string[] = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto("http://localhost:5173/#/Patient");
await page.waitForLoadState("networkidle");
// ... drive the UI, then inspect `errors`

await browser.close();
```

Alternatively, run the existing suite with `--headed` and observe:
```bash
pnpm --filter @fhir-place/demo exec playwright test --headed --slow-mo=500
```

## Filing a bug

Use the `agent-work-item` issue template
(`.github/ISSUE_TEMPLATE/agent-work-item.yml`) with:

- **Title:** `[bug] <short description>` — e.g. `[bug] Delete error banner not visible on mobile`
- **Problem:** one paragraph describing the defect
- **User impact:** who is affected and how severely
- **Desired behavior:** what should happen
- **Acceptance criteria:** checkboxes, each one testable
- **Relevant files:** list the likely source files (route, component, hook)
- **Test plan:** include a Playwright assertion that would catch a regression
- **Constraints:** note if the fix should not touch unrelated areas

### Minimal bug report template

```
**Route:** #/Patient/<id>
**Steps to reproduce:**
1. Navigate to a patient detail page
2. Click Delete
3. Confirm deletion in the dialog

**Expected:** Confirmation dialog closes, list reloads, patient row gone
**Actual:** Dialog stays open; spinner never resolves
**Console errors:** [paste any errors]
**Viewport:** 1280×800 desktop / 375×812 mobile
```

## Scope and limits

- File bugs only for the demo app (`apps/demo/`). Do not file issues for the
  react-fhir package unless a component bug is confirmed by a unit test failure.
- One issue per distinct bug. Do not batch multiple bugs into one issue.
- Do not fix bugs during the QA pass. Fix in a separate, issue-scoped PR.
- Do not file issues that duplicate an existing open GitHub issue. Search first.
- Mark the issue with label `bug` and, if agent-actionable, `agent-ready`.

## After the QA pass

Report a summary:
- Routes visited
- Bugs filed (links)
- Tests that were already catching issues (so credit is given)
- Any areas with thin coverage that need new specs
