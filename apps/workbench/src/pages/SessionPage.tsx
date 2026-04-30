import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getAgentStatus,
  getSession,
  getSessionAnswer,
  listSessionAnswers,
  listTools,
  runPatientSummary,
  runTool,
  sessionAuditExportUrl,
  type AnswerDetail,
  type AnswerSummary,
  type ToolEnvelope,
  type ToolMeta,
} from "../api/sessions.js";
import { AgentAnswerRenderer } from "../agent/AgentAnswerRenderer.js";
import { parseAgentAnswer } from "../agent/answer-schema.js";

export function SessionPage() {
  const { sid } = useParams<{ sid: string }>();
  const session = useQuery({
    queryKey: ["session", sid],
    queryFn: () => getSession(sid!),
    enabled: Boolean(sid),
  });
  const tools = useQuery({ queryKey: ["session-tools"], queryFn: listTools });

  const [selected, setSelected] = useState<string>("getPatient");
  const [extra, setExtra] = useState<string>("{}");
  const [history, setHistory] = useState<
    Array<{ tool: string; input: unknown; envelope: ToolEnvelope }>
  >([]);

  const selectedMeta = useMemo<ToolMeta | undefined>(
    () => tools.data?.find((t) => t.name === selected),
    [tools.data, selected],
  );

  const agentStatus = useQuery({
    queryKey: ["agent-status"],
    queryFn: getAgentStatus,
    staleTime: 30_000,
  });

  const summaryPrompt =
    agentStatus.data?.suggestedPrompts[0]?.text ?? "Summarise this patient.";

  const queryClient = useQueryClient();
  const runAgent = useMutation({
    mutationFn: () => runPatientSummary(sid!, { prompt: summaryPrompt }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["session-answers", sid] });
    },
  });

  const pastAnswers = useQuery({
    queryKey: ["session-answers", sid],
    queryFn: () => listSessionAnswers(sid!),
    enabled: Boolean(sid),
  });

  const run = useMutation({
    mutationFn: async () => {
      if (!sid || !session.data) throw new Error("session not loaded");
      let parsedExtra: Record<string, unknown> = {};
      if (extra.trim()) {
        try {
          parsedExtra = JSON.parse(extra) as Record<string, unknown>;
        } catch (e) {
          throw new Error(`invalid extra JSON: ${(e as Error).message}`);
        }
      }
      const input = {
        patientId: session.data.patientId,
        ...parsedExtra,
      };
      const envelope = await runTool(sid, selected, input);
      setHistory((h) => [{ tool: selected, input, envelope }, ...h].slice(0, 20));
      return envelope;
    },
  });

  if (!sid) return null;

  return (
    <section className="space-y-4">
      {session.data && (
        <Link
          to={`/connections/${session.data.connectionId}/patients/${session.data.patientId}`}
          className="text-sm text-slate-600 hover:underline"
        >
          ← Back to patient
        </Link>
      )}

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Agent session</h1>
          {session.data && (
            <p className="mt-1 text-sm text-slate-600">
              session{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
                {session.data.id}
              </code>{" "}
              · patient{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
                {session.data.patientId}
              </code>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={sessionAuditExportUrl(sid)}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            data-testid="export-audit"
            download
          >
            Export audit JSON
          </a>
          <Link
            to={`/sessions/${sid}/answer-preview`}
            className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            data-testid="answer-preview-link"
          >
            AgentAnswer preview
          </Link>
        </div>
      </header>

      <p className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
        Tools are deny-by-default and patient-scoped. The session's authorized
        patient ID is injected automatically; supplying a different{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
          patientId
        </code>{" "}
        in the extra JSON will be rejected at the boundary with{" "}
        <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
          unauthorized_patient
        </code>
        . The patient-summary agent (below) runs an LLM against this same
        surface — never against the FHIR server directly.
      </p>

      <AgentPanel
        ready={agentStatus.data?.ready ?? false}
        provider={agentStatus.data?.provider ?? null}
        model={agentStatus.data?.model ?? null}
        promptVersion={agentStatus.data?.promptVersion ?? null}
        suggestedPrompt={summaryPrompt}
        hint={agentStatus.data?.hint ?? null}
        isRunning={runAgent.isPending}
        onRun={() => runAgent.mutate()}
        result={runAgent.data}
        error={runAgent.error}
      />

      <PastAnswersPanel
        sessionId={sid}
        answers={pastAnswers.data ?? []}
        isLoading={pastAnswers.isLoading}
      />

      <section className="rounded-md border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <label className="text-sm font-medium text-slate-700">
            Tool
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              data-testid="tool-select"
            >
              {tools.data?.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}@{t.version}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">
            Extra input (JSON, merged with patientId)
            <textarea
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              rows={4}
              className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs"
              placeholder='{ "limit": 5 }'
              data-testid="tool-extra"
            />
          </label>
        </div>
        {selectedMeta && (
          <p className="mt-2 text-xs text-slate-500">{selectedMeta.description}</p>
        )}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => run.mutate()}
            disabled={run.isPending || !session.data}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            data-testid="run-tool"
          >
            {run.isPending ? "Running…" : "Run"}
          </button>
        </div>
        {run.isError && (
          <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">
            {(run.error as Error).message}
          </p>
        )}
      </section>

      {history.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Tool calls</h2>
          {history.map((h, i) => (
            <article
              key={i}
              data-testid="tool-call-entry"
              className="rounded-md border border-slate-200 bg-white p-3 text-sm"
            >
              <header className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium text-slate-900">
                  {h.tool}@{h.envelope.toolVersion}
                </span>
                {h.envelope.ok ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    ok
                    {typeof h.envelope.count === "number"
                      ? ` · ${h.envelope.count}${h.envelope.truncated ? "+" : ""}`
                      : ""}{" "}
                    · {h.envelope.durationMs}ms
                  </span>
                ) : (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
                    {h.envelope.reason} · {h.envelope.durationMs}ms
                  </span>
                )}
              </header>
              <pre className="max-h-72 overflow-auto rounded bg-slate-50 p-2 text-xs text-slate-700">
                {JSON.stringify(h.envelope, null, 2)}
              </pre>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}

interface AgentPanelProps {
  ready: boolean;
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  suggestedPrompt: string;
  hint: string | null;
  isRunning: boolean;
  onRun: () => void;
  result?: { answer: unknown; turns: number; fallback: boolean; finalIssues?: unknown };
  error: unknown;
}

function AgentPanel(props: AgentPanelProps) {
  const validation = props.result
    ? parseAgentAnswer(props.result.answer)
    : null;

  return (
    <section
      data-testid="agent-panel"
      className="space-y-3 rounded-md border border-slate-200 bg-white p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Patient-summary agent
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {props.ready ? (
              <>
                Ready · provider <code>{props.provider}</code> · model{" "}
                <code>{props.model}</code> · prompt{" "}
                <code>{props.promptVersion}</code>
              </>
            ) : (
              "Unavailable — set ANTHROPIC_API_KEY on the server."
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={props.onRun}
          disabled={!props.ready || props.isRunning}
          data-testid="run-agent"
          className="shrink-0 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {props.isRunning ? "Running…" : `Run "${props.suggestedPrompt}"`}
        </button>
      </header>

      {props.hint && !props.ready && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          {props.hint}
        </p>
      )}

      {props.error != null && (
        <p className="rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">
          {(props.error as Error).message}
        </p>
      )}

      {props.result && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            Run completed in {props.result.turns} turn
            {props.result.turns === 1 ? "" : "s"}
            {props.result.fallback ? (
              <>
                ·{" "}
                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-900">
                  partial answer
                </span>
              </>
            ) : (
              <>
                ·{" "}
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-900">
                  ok
                </span>
              </>
            )}
          </p>
          {validation?.ok ? (
            <AgentAnswerRenderer answer={validation.answer} />
          ) : (
            <p className="rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800">
              The server returned an answer the schema rejected. This should
              not happen at the route layer; report the request id from the
              server log.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

interface PastAnswersPanelProps {
  sessionId: string;
  answers: AnswerSummary[];
  isLoading: boolean;
}

function PastAnswersPanel(props: PastAnswersPanelProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ["session-answer-detail", props.sessionId, openId],
    queryFn: () => getSessionAnswer(props.sessionId, openId!),
    enabled: Boolean(openId),
  });

  if (props.isLoading) return null;
  if (props.answers.length === 0) return null;

  return (
    <section
      data-testid="past-answers-panel"
      className="space-y-2 rounded-md border border-slate-200 bg-white p-4"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Past runs</h2>
        <p className="text-xs text-slate-500">
          {props.answers.length} run{props.answers.length === 1 ? "" : "s"}{" "}
          persisted in the audit log
        </p>
      </header>
      <ul className="divide-y divide-slate-100">
        {props.answers.map((a) => (
          <li key={a.id} className="py-2">
            <button
              type="button"
              onClick={() => setOpenId(openId === a.id ? null : a.id)}
              data-testid={`past-answer-${a.id}`}
              className="flex w-full items-start justify-between gap-2 text-left"
            >
              <span>
                <span className="block text-sm font-medium text-slate-900">
                  {a.prompt}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {a.createdAt} · {a.turns} turn
                  {a.turns === 1 ? "" : "s"} · {a.provider}/{a.model}
                </span>
              </span>
              <span
                className={
                  a.fallback
                    ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
                    : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-900"
                }
              >
                {a.fallback ? "partial" : "ok"}
              </span>
            </button>
            {openId === a.id && detail.data && (
              <ToolCallTimeline detail={detail.data} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface ToolCallTimelineProps {
  detail: AnswerDetail;
}

function ToolCallTimeline(props: ToolCallTimelineProps) {
  return (
    <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-3 text-xs text-slate-700">
      <p className="font-medium text-slate-900">
        Tool-call timeline ({props.detail.toolCalls.length})
      </p>
      {props.detail.toolCalls.length === 0 ? (
        <p className="text-slate-500">
          No tool calls were captured for this run.
        </p>
      ) : (
        <ol className="space-y-1">
          {props.detail.toolCalls.map((tc) => (
            <li
              key={tc.id}
              data-testid="timeline-entry"
              className="flex items-start justify-between gap-3 rounded border border-slate-200 bg-white px-2 py-1"
            >
              <span className="font-mono">
                {tc.tool}@{tc.toolVersion}
              </span>
              <span className="text-slate-500">
                {tc.ok ? (
                  <>
                    ok
                    {typeof tc.count === "number" ? ` · ${tc.count}` : ""}
                    {tc.truncated ? "+" : ""} · {tc.durationMs}ms
                  </>
                ) : (
                  <span className="text-rose-700">
                    {tc.reason} · {tc.durationMs}ms
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
      {props.detail.claims.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer font-medium text-slate-900">
            Cited evidence ({props.detail.claims.length} claim
            {props.detail.claims.length === 1 ? "" : "s"})
          </summary>
          <ul className="mt-1 space-y-1 text-slate-600">
            {props.detail.claims.map((c) => (
              <li key={c.id}>
                <span className="font-medium text-slate-800">{c.text}</span>{" "}
                — {c.evidenceRefs.join(", ")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

