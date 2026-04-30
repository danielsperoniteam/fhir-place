import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getSession,
  listTools,
  runTool,
  type ToolEnvelope,
  type ToolMeta,
} from "../api/sessions.js";

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

      <header>
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
        . PR 6 will run an LLM against this same surface; this page is a
        humans-only debug runner.
      </p>

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
