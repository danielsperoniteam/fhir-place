# Architecture

> Placeholder. Filled out incrementally as Phase A PRs land. Locked down in
> PR 10 (Demo Hardening and Write-Up).

## Components (planned)

| Component | Where it lives | Status |
| --- | --- | --- |
| Workbench UI shell | `apps/workbench/src/` | PR 1 ✅ |
| SQLite + Drizzle local DB | `apps/workbench/db/` | PR 1 ✅ (skeleton) |
| FHIR DataConnection | `apps/workbench/db/`, `apps/workbench/src/` | PR 2 |
| Patient search + resource viewer | `apps/workbench/src/` | PR 3 |
| Typed FHIR tool registry | TBD (`apps/workbench/src/agent/tools/`) | PR 4 |
| `AgentAnswer` schema + renderer | TBD | PR 5 |
| Patient-summary agent loop | TBD | PR 6 |
| Audit logging | `apps/workbench/db/` | PR 7 |
| Eval harness | TBD | PR 8 |
| Failure gallery | `apps/workbench/src/pages/` | PR 9 |

## Boundary between frontend and node-only code

The workbench is one package but two TypeScript projects:

- `tsconfig.json` covers `src/` (browser, `vite/client` types).
- `tsconfig.node.json` covers `db/`, `scripts/`, and `*.config.ts` (node).

`db/` and `scripts/` must never be imported from `src/`. Server-side
enforcement of patient scope (PR 4) lives behind a future API surface; the
frontend never opens SQLite directly.

## FHIR-native choices (carried into later PRs)

- Evidence references in `EvidenceBackedClaim` use FHIR relative URLs
  (`Condition/abc`) so they can be resolved by the resource viewer.
- Audit log shape mirrors `AuditEvent` + `Provenance` so write-back is a
  no-op flip later, even though Phase A never writes back.
- Eval fixtures are stored as FHIR `Bundle` resources, not bespoke JSON.
- Tool envelopes return `Bundle` `searchset` on success and
  `OperationOutcome` on error, not a parallel error shape.
