/**
 * Frontend client for `/api/sessions` and the patient-scoped tool runner.
 *
 * Tools are typed and patient-scoped server-side; this client just shapes the
 * request and surfaces the normalized envelope back to React.
 */

export interface AgentSession {
  id: string;
  connectionId: string;
  patientId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ToolMeta {
  name: string;
  version: string;
  description: string;
  resourceAllowlist: string[];
  resultLimit: number;
  timeoutMs: number;
}

export type ToolEnvelope =
  | {
      ok: true;
      tool: string;
      toolVersion: string;
      data: unknown;
      count?: number;
      truncated?: boolean;
      durationMs: number;
    }
  | {
      ok: false;
      tool: string;
      toolVersion: string;
      error: string;
      reason: string;
      issues?: unknown;
      upstream?: unknown;
      durationMs: number;
    };

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // ignore
  }
  if (!res.ok) {
    const detail =
      body && typeof body === "object"
        ? JSON.stringify(body)
        : String(body ?? res.statusText);
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }
  return body as T;
}

export async function createSession(
  connectionId: string,
  patientId: string,
): Promise<AgentSession> {
  const body = await http<{ session: AgentSession }>("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ connectionId, patientId }),
  });
  return body.session;
}

export async function getSession(id: string): Promise<AgentSession> {
  const body = await http<{ session: AgentSession }>(
    `/api/sessions/${encodeURIComponent(id)}`,
  );
  return body.session;
}

export async function listTools(): Promise<ToolMeta[]> {
  const body = await http<{ tools: ToolMeta[] }>("/api/sessions/tools");
  return body.tools;
}

/**
 * Run a tool. Returns the envelope regardless of HTTP status (the envelope's
 * `ok` and `reason` fields are the source of truth) — only network-level
 * failures throw.
 */
export async function runTool(
  sessionId: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<ToolEnvelope> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/tools/${encodeURIComponent(toolName)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  return (await res.json()) as ToolEnvelope;
}

export interface AgentStatus {
  ready: boolean;
  provider: string | null;
  model: string | null;
  promptVersion: string;
  suggestedPrompts: ReadonlyArray<{ id: string; text: string }>;
  hint: string | null;
}

export async function getAgentStatus(): Promise<AgentStatus> {
  const res = await fetch("/api/agent/status");
  if (!res.ok) {
    throw new Error(`agent status: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as AgentStatus;
}

export interface RunAnswerResponse {
  answer: unknown; // validated by parseAgentAnswer on the client
  turns: number;
  fallback: boolean;
  finalIssues?: unknown;
}

export async function runPatientSummary(
  sessionId: string,
  options: { prompt?: string } = {},
): Promise<RunAnswerResponse> {
  const res = await fetch(
    `/api/sessions/${encodeURIComponent(sessionId)}/answer`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    },
  );
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // ignore
  }
  if (!res.ok) {
    const detail =
      body && typeof body === "object" ? JSON.stringify(body) : res.statusText;
    throw new Error(`${res.status}: ${detail}`);
  }
  return body as RunAnswerResponse;
}
