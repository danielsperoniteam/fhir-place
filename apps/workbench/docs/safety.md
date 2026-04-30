# Safety

> Placeholder. Filled out incrementally as Phase A PRs land. Finalised in
> PR 10 (Demo Hardening and Write-Up).

## What this project is, and isn't

This is a **research workbench** for evidence-backed agent answers grounded in
**synthetic FHIR data**. It is not:

- a clinical decision support tool,
- a SMART on FHIR app,
- a HIPAA-compliant system,
- a chatbot for real patients.

Every UI surface must carry the synthetic-only / not-for-clinical-use banner.

## The safety layers (all must hold)

1. **Synthetic-only inputs.** The supported deployment mode is a local FHIR
   server seeded with synthetic data, or the public HAPI sandbox. There is no
   PHI path.
2. **Read-only.** Phase A never writes to the FHIR server. Write-back is icebox.
3. **Typed, patient-scoped tools.** The agent cannot generate arbitrary FHIR
   queries. It can only call the registered tools, each of which:
   - validates input against a typed schema,
   - requires a patient ID,
   - is server-side scoped to the selected patient,
   - is deny-by-default for missing or unauthorized patient IDs,
   - has explicit result limits and timeouts.
4. **Resource text is data, not instruction.** Anything fetched from the FHIR
   server is wrapped before it reaches a system prompt or tool-name position.
5. **Structured answers.** The agent's final output validates against the
   `AgentAnswer` schema. Supported claims must cite source resources;
   missing-data and cannot-determine are first-class fields, not absences.
6. **Audit log everything.** Every run, every tool call, every final answer
   is persisted and can be replay-inspected.
7. **Evals before "done".** Phase A is not done until the eval harness covers
   the named hard cases (no-allergy-data, missing-labs, prompt injection in
   resource text, out-of-scope patient).

## Hard negatives

The following are explicitly **not** Phase A:

SMART on FHIR auth, real PHI, HIPAA claims, write-back, draft / queue /
approval, prior auth, care-gap detection, quality-measure explanation, CQL,
`$evaluate-measure`, DocumentReference text extraction, MCP server,
BigQuery/OMOP/claims/wearable connections, memory, multi-agent planning,
clinician preview mode, arbitrary FHIR query generation by the agent,
arbitrary code execution by the agent.

If a future request seems to require any of these, stop and confirm before
shipping.
