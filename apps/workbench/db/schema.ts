import { sql } from "drizzle-orm";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

/**
 * Phase A schema — added incrementally:
 *   PR 1  — `schema_version` placeholder (kept for now as a sanity row)
 *   PR 2  — `data_connection`            (this file, this PR)
 *   PR 7  — `agent_session`, `tool_call`, `evidence_claim`
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
