# Daily doc sync prompt

This prompt is designed to run on a daily cron schedule. It checks whether
the documentation in this repo has drifted from the code and makes targeted
corrections. Only change things that are verifiably stale — do not rewrite
sections for style.

---

## Your task

You are running a daily documentation freshness check on the `samsuffolksperoni/fhir-place`
repository. Work on the `main` branch. If you make any changes, commit them
with the message `docs(auto-sync): <brief description of what changed>` and
push. If nothing has drifted, make no commit and exit cleanly.

Keep edits surgical — one stale fact at a time. Do not rewrite sections that
are still accurate.

---

## Checks to run (in order)

### 1. Unit test count in root README

Run the unit test suite and count the passing tests:

```bash
pnpm --filter @fhir-place/react-fhir test:run 2>&1 | tail -5
```

The root `README.md` currently states a specific number of unit tests (e.g.
"94 unit tests"). If the actual count differs, update that line. Match the
exact phrasing — only the number changes.

---

### 2. CI readme gate

The repo has a script that gates CI:

```bash
node scripts/check-readme-goal-task.mjs
```

Run it. If it exits non-zero, the root `README.md` is missing required
content. Identify exactly which snippets are missing (the script prints them)
and restore only those snippets. Do not restructure the section — find the
nearest logical place and insert the missing text.

---

### 3. Exported library components vs. documented components

Read `packages/react-fhir/src/components/index.ts`. List every symbol
exported from it.

Read the `### components/` section of `packages/react-fhir/README.md`.

For each exported component or type that has no mention in that section, add
a one-line bullet. Use the same format as existing bullets:
`**\`<ComponentName>\`**` — short description of what it does.

Do not remove bullets for things that are already there — only add missing
ones.

Apply the same check to:
- `packages/react-fhir/src/hooks/index.ts` → `### hooks/` section
- `packages/react-fhir/src/client/index.ts` → `### client/` section
- `packages/react-fhir/src/structure/index.ts` → `### structure/` section

---

### 4. Roadmap table — closed issues

Read the roadmap table in `packages/react-fhir/README.md` (the table under
`## Roadmap / known gaps`). For each issue number listed, use the GitHub MCP
tools to check whether the issue is still open.

For any issue that is **closed**, remove its row from the table and add a
brief note at the bottom of the section: `<!-- #NNN closed YYYY-MM-DD -->`.
Do not delete the note about checking the full issue list — leave that
paragraph intact.

---

### 5. Top resource types list

Read `apps/demo/src/resourceListConfig.ts`. Find the `TOP_RESOURCE_TYPES`
array and note every type in it.

Read the "Configured resource types" paragraph in `apps/demo/README.md`.

If the list in the README does not match the array exactly (types added,
renamed, or removed), update the paragraph to match. Keep the same sentence
structure — just update the type names.

---

### 6. Packages table in root README

List the contents of `apps/` and `packages/` directories. For each directory
that contains a `package.json`, check whether it appears in the packages table
in `README.md`.

If any package or app is present in the filesystem but missing from the table,
add a row. Use the same format as existing rows. If a row references a path
that no longer exists, remove it.

---

### 7. Node version requirement

Read the `engines.node` field from the root `package.json`.

Check `README.md` and `CONTRIBUTING.md` for the documented Node version
requirement (e.g. "Node.js ≥ 20"). If the `engines` field has changed and the
docs still reference the old version, update both files.

---

### 8. New apps missing a README

For each directory under `apps/`, check whether a `README.md` exists. If any
app directory lacks one, create a minimal stub:

```markdown
# <app-name>

> README not yet written. See [apps/<app-name>/src/](src/) to explore the code.
```

Do not fabricate content about the app — only create the stub.

---

## Rules

- **Only change what you can verify from the code.** Don't guess intent or
  fill in descriptions you're not sure about.
- **One commit per meaningful change group.** If you fix three separate things
  (test count + one new export + one closed issue), that's one commit listing
  all three.
- **Never reformat or rewrite sections that are still accurate.** The goal is
  freshness, not perfection.
- **If a check is ambiguous**, leave it alone and note it in the commit message
  with a `NOTE:` line so a human can review.
- **Do not open a pull request.** Commit directly to `main`.
