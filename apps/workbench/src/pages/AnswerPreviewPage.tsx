import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AgentAnswerRenderer } from "../agent/AgentAnswerRenderer.js";
import {
  parseAgentAnswer,
  type AgentAnswerValidation,
} from "../agent/answer-schema.js";
import { SAMPLE_AGENT_ANSWER } from "../agent/fixtures.js";

export function AnswerPreviewPage() {
  const { sid } = useParams<{ sid?: string }>();
  const [text, setText] = useState<string>(() =>
    JSON.stringify(SAMPLE_AGENT_ANSWER, null, 2),
  );

  const validation = useMemo<
    AgentAnswerValidation | { ok: false; error: string; issues: never[] }
  >(() => {
    if (!text.trim())
      return { ok: false, error: "empty input", issues: [] as never[] };
    try {
      return parseAgentAnswer(JSON.parse(text));
    } catch (e) {
      return {
        ok: false,
        error: `JSON parse error: ${(e as Error).message}`,
        issues: [] as never[],
      };
    }
  }, [text]);

  return (
    <section className="space-y-4">
      {sid && (
        <Link
          to={`/sessions/${sid}`}
          className="text-sm text-slate-600 hover:underline"
        >
          ← Back to session
        </Link>
      )}

      <header>
        <h1 className="text-2xl font-semibold text-slate-900">
          AgentAnswer preview
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Paste a structured answer below to validate it against the
          schema and render it. Phase A's hard rule is that supported
          claims MUST cite at least one resource — invalid answers fail
          validation here, before render.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="answer-json"
              className="text-sm font-medium text-slate-700"
            >
              AgentAnswer JSON
            </label>
            <button
              type="button"
              onClick={() => setText(JSON.stringify(SAMPLE_AGENT_ANSWER, null, 2))}
              className="text-xs text-slate-600 underline hover:text-slate-900"
              data-testid="reset-sample"
            >
              load sample
            </button>
          </div>
          <textarea
            id="answer-json"
            data-testid="answer-json"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            className="h-[60vh] w-full rounded-md border border-slate-300 bg-white p-3 font-mono text-xs"
          />
          {!validation.ok && (
            <div
              data-testid="validation-error"
              className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
            >
              <p className="font-semibold">{validation.error}</p>
              {validation.issues.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 font-mono text-xs">
                  {validation.issues.map((iss, i) => (
                    <li key={i}>
                      <code>{iss.path.join(".") || "(root)"}</code>: {iss.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {validation.ok && (
            <p
              data-testid="validation-ok"
              className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800"
            >
              Valid AgentAnswer · {validation.answer.claims.length} claims ·{" "}
              {validation.answer.missingData.length} missing-data ·{" "}
              {validation.answer.cannotDetermine.length} cannot-determine
            </p>
          )}
        </div>

        <div>
          {validation.ok ? (
            <AgentAnswerRenderer answer={validation.answer} />
          ) : (
            <div className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              Render appears here once the JSON validates.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
