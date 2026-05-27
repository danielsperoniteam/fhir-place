# lint-workflow-permissions

A small Node script that asserts every `.github/workflows/*.yml` declares
the `permissions:` and `env:` keys its shell content actually needs. It
catches the silent-failure shape that hit PR #545 (`gh pr edit` without
`pull-requests: write` → 403, stderr swallowed) and PR #517 (`gh pr view`
without `GH_TOKEN` in the step env → same pattern).

Run locally:

```
pnpm lint:workflows
pnpm test:lint-workflows    # self-tests
```

In CI it runs from `.github/workflows/lint-workflows.yml` on every PR
that touches `.github/workflows/**`, paired with `actionlint`.

## Rules

| Rule              | Level   | Trigger                                                                                  | Required declaration                               |
| ----------------- | ------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `GH-PR-WRITE`     | error   | `gh pr edit/create/close/reopen/review/merge/ready` in any `run:`                        | `permissions.pull-requests: write` (workflow/job)  |
| `GH-ISSUE-WRITE`  | error   | `gh issue edit/create/close/reopen/comment` or `gh label create/edit/delete` in any `run:` | `permissions.issues: write` (workflow/job)         |
| `GIT-PUSH-WRITE`  | error   | `git push` (with or without `--force`, `--force-with-lease`)                             | `permissions.contents: write` (workflow/job)       |
| `GH-TOKEN-ENV`    | error   | any `gh` invocation                                                                      | `GH_TOKEN` (or `GITHUB_TOKEN`) in step/job/workflow `env` |
| `SILENT-ERROR`    | warning | a line with both `2>/dev/null` and `\|\| true`                                           | refactor to surface stderr OR exit code            |

Effective scope:

- `permissions:` — job-level declaration **replaces** workflow-level (per
  GitHub docs), so the script uses the job's permissions block if set,
  otherwise the workflow's.
- `env:` — union of workflow, job, and step env keys. We only care about
  presence; values can be anything (the typical right value is
  `${{ secrets.GITHUB_TOKEN }}`).
- The `GH-TOKEN-ENV` rule accepts either `GH_TOKEN` or `GITHUB_TOKEN`
  because `gh` reads both.

## Adding a new rule

The script is a single file: `scripts/lint-workflow-permissions.mjs`. Each
rule is a short regex + permission/env check inside `checkStep`. To add
one:

1. Pick an id of the form `<DOMAIN>-<NOUN>-<WRITE|READ|ENV>` and add it to
   `printRules()` near the top so `--list-rules` documents it.
2. Add the regex + check inside `checkStep`. Push a finding shaped
   `{ line, level, ruleId, message }`. Use `level: 'error'` for hard
   violations and `level: 'warning'` for nudges (warnings don't fail CI).
3. Add 1-2 cases to `scripts/lint-workflow-permissions.test.mjs`. The
   test harness writes a synthetic workflow to a temp dir and runs the
   script as a subprocess, so cases are self-contained.

Keep the rules mechanical and grep-friendly. Anything that requires
understanding shell semantics belongs in `actionlint` / `shellcheck`,
not here.
