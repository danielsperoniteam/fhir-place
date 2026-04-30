import {
  evidenceCountsByType,
  resourceViewerHref,
} from "./answer-extractors.js";
import {
  AGENT_ANSWER_SCHEMA_VERSION,
  type AgentAnswer,
} from "./answer-schema.js";
import { EvidenceChip } from "./EvidenceChip.js";

/**
 * Render a *validated* `AgentAnswer`. Callers must run the input through
 * `parseAgentAnswer` first; this component never sees raw / unparsed
 * model output. Supported claims, missing-data, and cannot-determine
 * are first-class top-level sections.
 */
export function AgentAnswerRenderer({ answer }: { answer: AgentAnswer }) {
  const counts = evidenceCountsByType(answer);
  const totalEvidence = Object.values(counts).reduce((s, n) => s + n, 0);
  const supportedClaimsCount = answer.claims.length;

  return (
    <article
      data-testid="agent-answer"
      data-schema-version={answer.schemaVersion}
      className="space-y-4"
    >
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          AgentAnswer · v{AGENT_ANSWER_SCHEMA_VERSION}
        </p>
        <h1 className="text-2xl font-semibold text-slate-900">
          {answer.prompt}
        </h1>
        {answer.summary && (
          <p
            data-testid="answer-summary"
            className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800"
          >
            {answer.summary}
          </p>
        )}
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          <div>
            <dt className="inline">session</dt>{" "}
            <dd className="inline font-mono">{answer.sessionId}</dd>
          </div>
          <div>
            <dt className="inline">patient</dt>{" "}
            <dd className="inline font-mono">{answer.patientId}</dd>
          </div>
          {answer.model && (
            <div>
              <dt className="inline">model</dt>{" "}
              <dd className="inline font-mono">{answer.model}</dd>
            </div>
          )}
          {answer.promptVersion && (
            <div>
              <dt className="inline">prompt</dt>{" "}
              <dd className="inline font-mono">{answer.promptVersion}</dd>
            </div>
          )}
          <div>
            <dt className="inline">supported claims</dt>{" "}
            <dd className="inline font-mono">{supportedClaimsCount}</dd>
          </div>
          <div>
            <dt className="inline">distinct evidence</dt>{" "}
            <dd className="inline font-mono">{totalEvidence}</dd>
          </div>
        </dl>
      </header>

      <Section
        title="Supported claims"
        emptyHint="The agent did not assert any supported claims for this prompt."
        count={answer.claims.length}
        testId="claims-section"
      >
        <ul className="space-y-3">
          {answer.claims.map((claim) => (
            <li
              key={claim.id}
              data-testid="claim"
              data-claim-id={claim.id}
              className="rounded-md border border-slate-200 bg-white p-3"
            >
              <p className="text-sm text-slate-800">{claim.text}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {claim.evidence.map((ref, i) => (
                  <li key={`${ref.reference}-${i}`}>
                    <EvidenceChip
                      reference={ref}
                      href={resourceViewerHref(answer, ref) ?? undefined}
                    />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Missing data"
        emptyHint="No missing data was flagged for this prompt."
        count={answer.missingData.length}
        testId="missing-data-section"
      >
        <ul className="space-y-2">
          {answer.missingData.map((entry, i) => (
            <li
              key={i}
              data-testid="missing-data-entry"
              className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800"
            >
              {entry.description}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Cannot determine"
        emptyHint="No questions were marked cannot-determine for this prompt."
        count={answer.cannotDetermine.length}
        testId="cannot-determine-section"
      >
        <ul className="space-y-2">
          {answer.cannotDetermine.map((entry, i) => (
            <li
              key={i}
              data-testid="cannot-determine-entry"
              className="rounded-md border border-slate-200 bg-white p-3 text-sm"
            >
              <p className="font-medium text-slate-900">{entry.question}</p>
              <p className="mt-1 text-slate-700">{entry.why}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Tool calls"
        emptyHint="No tool calls were recorded."
        count={answer.toolCalls.length}
        testId="tool-calls-section"
      >
        <ol className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white">
          {answer.toolCalls.map((call, i) => (
            <li
              key={i}
              data-testid="tool-call"
              className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
            >
              <span className="min-w-0 truncate">
                <span className="font-mono text-slate-900">
                  {call.tool}@{call.toolVersion}
                </span>
                {typeof call.count === "number" && (
                  <span className="ml-2 text-slate-500">
                    {call.count}
                    {call.truncated ? "+" : ""} resources
                  </span>
                )}
              </span>
              <span className="shrink-0">
                {call.ok ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                    ok · {call.durationMs}ms
                  </span>
                ) : (
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
                    {call.reason ?? "error"} · {call.durationMs}ms
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </Section>
    </article>
  );
}

function Section({
  title,
  count,
  emptyHint,
  testId,
  children,
}: {
  title: string;
  count: number;
  emptyHint: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section data-testid={testId} className="space-y-2">
      <header className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <span className="text-xs text-slate-500">{count}</span>
      </header>
      {count === 0 ? (
        <p
          data-testid={`${testId}-empty`}
          className="rounded-md border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-600"
        >
          {emptyHint}
        </p>
      ) : (
        children
      )}
    </section>
  );
}
