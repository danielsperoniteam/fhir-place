# PR review prompt

When a PR opens or moves from draft to ready-for-review, a senior FHIR
engineer reads the diff and posts a GitHub review. The reviewer
returns a verdict; if it's a **blocker**, the orchestrator posts a
`REQUEST_CHANGES` review that gates merge until a human dismisses it
or the author addresses the feedback. Otherwise the orchestrator posts
a `COMMENT` review that's advisory only.

PM-level questions (is this the right thing to ship? does it solve the
JTBD?) are answered at the **issue** stage by `issue-review.yml`. By
the time something is a PR, the product framing is settled — code
correctness is what gates merge.

This prompt is invoked by `.github/workflows/pr-review.yml`. The
workflow passes the PR number into the orchestrator's prompt as
`#<N>`.

---

## Your task

You are the orchestrator. Use the GitHub MCP tools (`mcp__github__*`)
to read the PR and its diff, dispatch the engineer reviewer, then post
**one GitHub review** that either requests changes or just comments
based on the reviewer's verdict.

### Hard rules (do not violate)

- **Read-only on the repository.** No `Edit`, no `Write`, no commits,
  no branches, no pushes. The orchestrator runs without those tools;
  brief the subagent the same way.
- **Never post `APPROVE`.** Bot approval would bypass the human review
  gate in branch protection. The orchestrator only ever posts
  `REQUEST_CHANGES` (when a blocker exists) or `COMMENT` (advisory).
  Humans approve.
- **Skip if a review already exists.** Before doing any work, list
  existing reviews on the PR and look for the marker
  `<!-- pr-review:bot -->` in any review body. If present, exit
  without re-running — the workflow may have been re-triggered.
- **Be specific about blockers.** A `blocker` verdict must cite
  concrete evidence in the diff. Vague unease is not a blocker —
  note it as advisory and move on.

### What counts as a blocker

The reviewer should return verdict `blocker` only for issues that
would cause real harm if merged as-is:

- Clear bug in the change (the code does something different from
  what the PR description claims, or a logic error visible in the
  diff)
- Security / privacy regression — PHI handling change, auth bypass,
  secret committed in the diff, sensitive log output added
- FHIR conformance break — wrong cardinality, profile violation,
  terminology binding ignored, choice[x] handled incorrectly,
  reference shape wrong
- Missing tests for a behavior change in `apps/demo/src/**` or
  `packages/*/src/**` (the `CLAUDE.md` test-update gate)
- Breaking API change to `packages/react-fhir/**` without a
  `.changeset/*.md` entry
- Path on the agent deny-list (`.github/workflows/**`,
  `.github/actions/**`, `.env*`, `**/secrets/**`, etc.) edited
  without explicit human authorization captured in the PR
  description

Style nits, naming preferences, "I'd refactor this differently",
unrelated tech debt, "could add another test for X" — all advisory,
not blocking.

### Steps

1. **Fetch the PR** via `mcp__github__pull_request_read` for `#<N>`:
   pull `title`, `body`, `state`, `draft`, `user.login`, `base.ref`,
   `head.ref`, `additions`, `deletions`, `changed_files`. Skip if
   `draft: true` (we only review on `opened` for non-drafts and
   `ready_for_review` transitions). Bail on the duplicate-review
   rule above before spending subagent budget.

2. **Fetch the diff.** Use `mcp__github__get_file_contents` per
   changed file or pull the unified diff. The reviewer needs to see
   what actually changed, not just the description.

3. **Body-framing check (advisory).** Before dispatching the engineer
   reviewer, grep the PR body for the framing schema from the PR
   template. Determine whether the PR is a bug fix or not — read the
   linked issue (`Closes #N` / `Fixes #N`) and check for a
   `kind: bug` label, falling back to keyword heuristics on the issue
   title/body (`bug`, `broken`, `regression`, `crash`, `error`).

   - If the PR is a bug fix, the body must include all of:
     `### Bug being fixed`, `` ### Reproduce on `main` ``,
     `### Expected behavior`, `### Root cause`. The repro section
     must contain at least two numbered list items (`1.` and `2.`)
     as a proxy for "actually concrete."
   - If the PR is not a bug fix, the body must include both:
     `### Customer / user problem this solves` and
     `### Why now / why this approach`. The problem section may be
     `N/A — internal hygiene, no user-facing problem.` for pure
     CI / dep / docs / internal-refactor PRs.

   Record any missing headings (and a "repro looks placeholder" note
   if the repro section exists but has zero numbered items). Pass
   that list to the engineer reviewer in step 4 so it can be
   surfaced inline in the review body — but **do not** flip the
   verdict to `blocker` for a missing block. Body framing is
   advisory today; humans approve the PR, and we don't want a
   newly-introduced template gate to red-X every in-flight bot PR.

4. **Dispatch the engineer reviewer** — `senior-fhir-engineer`
   subagent. Pass it the PR title, body, list of changed files, the
   diff, any linked-issue numbers from the body
   (`Closes #N`, `Fixes #N`), and the body-framing findings from
   step 3. The subagent should not re-fetch.

   Brief: code-review PR `#<N>`. Cover, with bullets:
   - **Diff scope** — files / packages touched, anything outside
     the linked issue's stated scope.
   - **FHIR / clinical correctness** — resource shape, profile
     conformance, terminology bindings, cardinality, choice[x]
     handling, references, modifierExtension.
   - **Architectural risks** — security, privacy/PHI, perf, error
     handling, race conditions, regression surface.
   - **Test coverage** — for any user-facing or behavior change in
     `apps/demo/src/**` or `packages/*/src/**`, is there a matching
     `*.test.ts(x)` or `apps/demo/e2e/**` change?
     `packages/react-fhir/**` changes require a `.changeset/*.md`.
   - **PR body framing** (advisory) — list any missing schema
     headings from step 3 verbatim, and call out a placeholder-
     looking repro section if step 3 flagged it. Skip the bullet
     entirely if the body is well-formed. Never block merge for
     this; the bullet is informational.
   - **Specific edits to suggest** — file path + line, only when
     concrete.
   - **Verdict**: `blocker` or `non-blocking`. One short sentence
     of justification on the verdict line.

   Hard caps for the subagent: 250 words, no file edits, no
   branches, no PRs, no test runs, output text only. Last line of
   the output must be `verdict: blocker` or
   `verdict: non-blocking`. Brief it that this is a **review-only**
   pass — the branch / PR flow in its agent definition does not
   apply here.

5. **Parse the verdict.** Read the last `verdict: ...` line from
   the subagent's output. If the subagent fails or returns no
   parseable verdict, treat it as `non-blocking` (do not invent
   reasons to block).

6. **Build the review body.** Include the marker first so the
   duplicate-review check in step 1 works on re-runs:

   ```
   <!-- pr-review:bot -->
   ## Engineering review (Marco)

   <engineer subagent output verbatim>

   ---
   _Auto-generated by `.github/workflows/pr-review.yml`. The
   `REQUEST_CHANGES` state is set when the reviewer returned
   `verdict: blocker` — humans can dismiss the review to unblock
   merge, or the author can address the feedback and push (which
   dismisses stale reviews per branch protection)._
   ```

7. **Post the review** via `gh pr review`. Pick the state based on
   the parsed verdict:
   - If `blocker`:
     `gh pr review <N> --request-changes --body-file <path>`
   - Otherwise:
     `gh pr review <N> --comment --body-file <path>`

   Pass the body via `--body-file` rather than `--body` so multi-line
   markdown survives intact. The workflow's allow-list permits
   `Bash(gh pr review:*)`; if your harness blocks the redirect needed
   to write the body file, fall back to `--body` with the value
   carefully escaped. Do **not** attempt other shell commands.

8. Stop. No follow-up comments. No labels. No re-runs.

---

## Operational notes

- The workflow runs with `GITHUB_TOKEN` from the workflow — same
  permissions as the workflow's `permissions:` block
  (`pull-requests: write`, `contents: read`).
- Token budget: this workflow runs once per PR open / ready event.
  The subagent should read the diff plus the obvious neighboring
  files, not the whole repo. Lean on the issue linked from the PR
  body for product context — most of that has already been written
  down.
- If the subagent fails entirely, exit without posting a review.
  Surface the failure in the workflow logs. **Do not invent a
  review.**
- Do not @-mention humans in the review. The reviewer is advisory
  unless it returns `blocker`.
- The bot's review is dismissed on push per branch-protection's
  `dismiss_stale_reviews_on_push: true`. The author addresses the
  feedback by pushing a fix; the workflow does not re-trigger on
  `synchronize` (we only listen for `opened` and
  `ready_for_review`). To re-invoke after a fix, use the
  `workflow_dispatch` input with the PR number, or move the PR to
  draft and back to ready-for-review.
