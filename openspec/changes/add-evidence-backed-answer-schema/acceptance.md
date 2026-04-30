# Acceptance — `add-evidence-backed-answer-schema`

This change is accepted when **all** of the following hold:

- [ ] `parseAgentAnswer(SAMPLE_AGENT_ANSWER)` returns
      `{ ok: true, answer }`.
- [ ] `parseAgentAnswer(badAnswer)` returns `ok: false` with an
      `issues` array for at least:
      - `schemaVersion !== "1"`,
      - a supported claim with `evidence: []`,
      - a claim citing `Procedure/x` (out-of-allow-list),
      - missing top-level `missingData` field,
      - empty `prompt`.
- [ ] `RESOURCE_REFERENCE_REGEX` accepts the six allow-listed types
      with valid FHIR ids and rejects out-of-list types, missing ids,
      and ids over 64 chars.
- [ ] `parseResourceReference` returns
      `{ resourceType, id }` on valid input and `null` otherwise.
- [ ] Visiting `/answer-preview` with the loaded sample renders a full
      `AgentAnswer`: prompt, summary, three claims, one missing-data
      entry, one cannot-determine entry, six tool-call rows.
- [ ] Tweaking the JSON to drop `evidence` from a claim shows a
      structured validation error in the left panel and the right panel
      reverts to the empty placeholder.
- [ ] Every evidence chip is a `<Link>` whose `href` is
      `/connections/:cid/patients/:pid/<Type>/<id>`.
- [ ] Missing-data and cannot-determine sections each render their own
      `data-testid` block with their own entries — they are not
      collapsed into the claims list.
- [ ] An answer with all four sections empty renders four
      `*-empty` hint blocks; the renderer does not collapse the
      sections.
- [ ] The renderer emits no Markdown markers in its output.
- [ ] `pnpm -r typecheck` exits 0.
- [ ] `pnpm -r test:run` exits 0; the suite includes at least 17
      schema tests, 10 extractor tests, and 7 renderer tests.
- [ ] `pnpm --filter @fhir-place/workbench build` produces a Vite
      bundle.
- [ ] `docs/agent-answer.md` describes the shape, hard rules, file
      layout, downstream PR impact, and Phase A icebox.
- [ ] No Phase A icebox item is introduced. Specifically: no LLM, no
      DB persistence, no streaming, no confidence weights, no cross-
      patient claims, no free-text Markdown rendering of model output.
