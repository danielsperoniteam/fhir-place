# Limitations

> Placeholder. Filled out incrementally as Phase A PRs land. Finalised in
> PR 10 (Demo Hardening and Write-Up).

## What the workbench cannot do

- **Cannot be used clinically.** Synthetic data only. Not a clinical decision
  support tool. No PHI path.
- **Cannot write to the FHIR server.** Read-only by design. Write-back is
  Phase A icebox.
- **Cannot generate arbitrary FHIR queries.** The agent can only call the
  registered, typed, patient-scoped tools.
- **Cannot answer questions outside the selected patient's scope.** Tools
  reject missing or unauthorized patient IDs.
- **Cannot follow instructions embedded in resource text.** Resource content
  is data, not instruction.
- **Cannot be relied on for completeness.** When evidence is insufficient,
  the agent emits a cannot-determine claim, not a guess.

## Phase A icebox (intentionally excluded)

- SMART on FHIR auth
- Real PHI handling
- HIPAA compliance claims
- Write-back / mutation
- Draft / queue / approval workflows
- Prior authorization
- Care-gap detection
- Quality-measure explanation
- CQL execution, `$evaluate-measure`
- DocumentReference text extraction
- MCP server
- BigQuery / OMOP / claims-style FHIR / wearable connection types
- Memory, multi-agent planning
- Clinician preview mode
- Arbitrary FHIR query generation
- Arbitrary code execution by the agent

## Known incompletenesses (Phase A)

- The eval suite is small (PR 8 ships ≥ 2 cases). It is not a benchmark.
- The audit log mirrors `AuditEvent` / `Provenance` shape but is not written
  back to the FHIR server.
- One LLM provider is wired up (PR 6); no automatic provider failover.
- No multi-user authentication. The workbench is a local-first single-user
  research tool.
