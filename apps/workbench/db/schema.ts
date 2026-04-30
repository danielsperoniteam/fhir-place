import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Phase A schema — added incrementally:
 *   PR 1  — `schema_version` placeholder (kept for now as a sanity row)
 *   PR 2  — `data_connection`
 *   PR 4  — `agent_session`
 *   PR 7  — `agent_answer`, `tool_call`, `evidence_claim`
 */
export const schemaVersion = sqliteTable("schema_version", {
  version: integer("version").primaryKey(),
  appliedAt: text("applied_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  note: text("note"),
});

/**
 * A configured FHIR server the workbench can read from.
 *
 * Phase A constraints (enforced at the application layer, not just the DB):
 *   - `kind` is always `"fhir_clinical"`. No OMOP, claims, wearable, etc.
 *   - `auth_type` is `"none"` or `"bearer"`. No SMART on FHIR.
 *
 * The latest CapabilityStatement is denormalised onto this row so the UI can
 * render status without a join. History is out of scope for Phase A.
 */
export const dataConnection = sqliteTable("data_connection", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  baseUrl: text("base_url").notNull(),
  authType: text("auth_type").notNull(),
  authToken: text("auth_token"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  lastCapabilityAt: text("last_capability_at"),
  lastCapabilityStatus: text("last_capability_status"),
  lastCapabilityFhirVersion: text("last_capability_fhir_version"),
  lastCapabilitySoftware: text("last_capability_software"),
  lastCapabilityJson: text("last_capability_json"),
  lastCapabilityError: text("last_capability_error"),
});

export type DataConnection = typeof dataConnection.$inferSelect;
export type NewDataConnection = typeof dataConnection.$inferInsert;

/**
 * A patient-scoped agent session.
 *
 * Phase A's tool registry is patient-scoped and deny-by-default: a session
 * carries exactly one authorized `patient_id` and the typed FHIR tools can
 * only be invoked against that patient. A request whose body specifies a
 * different `patientId` is rejected at the boundary with
 * `reason: "unauthorized_patient"`.
 *
 * The patient-summary agent in PR 6 will run inside one session and can
 * never widen its scope. Audit-log mapping (PR 7) treats this row as the
 * `Provenance.target.subject` for every tool call made under it.
 */
export const agentSession = sqliteTable("agent_session", {
  id: text("id").primaryKey(),
  connectionId: text("connection_id")
    .notNull()
    .references(() => dataConnection.id, { onDelete: "cascade" }),
  patientId: text("patient_id").notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type AgentSession = typeof agentSession.$inferSelect;
export type NewAgentSession = typeof agentSession.$inferInsert;

/**
 * One row per `runPatientSummary` invocation — the persisted final answer
 * (or partial-answer fallback). The `answer_json` column is the validated
 * `AgentAnswer` body; the orchestrator never persists an answer that did
 * not pass schema validation, so a row here is always replay-safe.
 *
 * Maps to FHIR `Provenance` shape (audit-log doc):
 *   - `target.subject` = `agent_session.patient_id`
 *   - `recorded` = `created_at`
 *   - `agent.who` = `provider`/`model`
 *   - `entity` = the cited evidence resources (`evidence_claim` rows)
 */
export const agentAnswer = sqliteTable("agent_answer", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => agentSession.id, { onDelete: "cascade" }),
  prompt: text("prompt").notNull(),
  promptVersion: text("prompt_version").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  fallback: integer("fallback").notNull(),
  turns: integer("turns").notNull(),
  answerJson: text("answer_json").notNull(),
  finalIssuesJson: text("final_issues_json"),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

export type AgentAnswerRow = typeof agentAnswer.$inferSelect;
export type NewAgentAnswerRow = typeof agentAnswer.$inferInsert;

/**
 * One row per tool execution. Both agent-driven calls (made inside
 * `runPatientSummary`) and standalone debug calls (via the
 * `/api/sessions/:sid/tools/:toolName` debug runner) are recorded here.
 *
 * `answer_id` is set when the call happened during an agent run and is
 * `NULL` for debug calls. `ON DELETE SET NULL` is intentional: deleting
 * an answer should not nuke its tool-call history (`agent_session`
 * cascade does that for the whole session); it just unbinds it.
 */
export const toolCall = sqliteTable("tool_call", {
  id: text("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => agentSession.id, { onDelete: "cascade" }),
  answerId: text("answer_id").references(() => agentAnswer.id, {
    onDelete: "set null",
  }),
  connectionId: text("connection_id").notNull(),
  patientId: text("patient_id").notNull(),
  tool: text("tool").notNull(),
  toolVersion: text("tool_version").notNull(),
  inputJson: text("input_json").notNull(),
  envelopeJson: text("envelope_json").notNull(),
  ok: integer("ok").notNull(),
  reason: text("reason"),
  resultCount: integer("result_count"),
  truncated: integer("truncated"),
  durationMs: integer("duration_ms").notNull(),
  resourceIdsJson: text("resource_ids_json"),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at").notNull(),
});

export type ToolCallRow = typeof toolCall.$inferSelect;
export type NewToolCallRow = typeof toolCall.$inferInsert;

/**
 * One row per `EvidenceBackedClaim` in a persisted `AgentAnswer`. This is
 * derived data — the source of truth is `agent_answer.answer_json` — but
 * the row makes the audit query "what claims cite resource X?" cheap and
 * keeps the FHIR-adjacent `Provenance.entity` mapping concrete.
 */
export const evidenceClaim = sqliteTable("evidence_claim", {
  id: text("id").primaryKey(),
  answerId: text("answer_id")
    .notNull()
    .references(() => agentAnswer.id, { onDelete: "cascade" }),
  claimId: text("claim_id").notNull(),
  text: text("text").notNull(),
  evidenceRefsJson: text("evidence_refs_json").notNull(),
});

export type EvidenceClaimRow = typeof evidenceClaim.$inferSelect;
export type NewEvidenceClaimRow = typeof evidenceClaim.$inferInsert;
