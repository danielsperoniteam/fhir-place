/**
 * Normalized envelope for every tool call. The runner produces this; tools
 * never construct it themselves. Anything the agent or a frontend consumes
 * comes through here so error reasons are machine-readable.
 */

export type ToolEnvelope<T = unknown> = ToolEnvelopeOk<T> | ToolEnvelopeErr;

export interface ToolEnvelopeOk<T = unknown> {
  ok: true;
  tool: string;
  toolVersion: string;
  data: T;
  /** For searches: how many resources were returned in `data`. */
  count?: number;
  /** True when the upstream returned more than `resultLimit` and we sliced. */
  truncated?: boolean;
  durationMs: number;
}

export type ToolErrorReason =
  | "unknown_tool"
  | "invalid_input"
  | "session_not_found"
  | "connection_not_found"
  | "unauthorized_patient"
  | "upstream_error"
  | "timeout"
  | "internal_error";

export interface ToolEnvelopeErr {
  ok: false;
  tool: string;
  toolVersion: string;
  error: string;
  reason: ToolErrorReason;
  /** For invalid_input: the structured Zod issue list. */
  issues?: unknown;
  /** For upstream_error: the upstream FHIR body, when present. */
  upstream?: unknown;
  durationMs: number;
}

export function ok<T>(
  meta: { tool: string; toolVersion: string; durationMs: number },
  data: T,
  extra: Pick<ToolEnvelopeOk<T>, "count" | "truncated"> = {},
): ToolEnvelopeOk<T> {
  return { ok: true, ...meta, data, ...extra };
}

export function err(
  meta: { tool: string; toolVersion: string; durationMs: number },
  reason: ToolErrorReason,
  error: string,
  extra: Pick<ToolEnvelopeErr, "issues" | "upstream"> = {},
): ToolEnvelopeErr {
  return { ok: false, ...meta, reason, error, ...extra };
}
