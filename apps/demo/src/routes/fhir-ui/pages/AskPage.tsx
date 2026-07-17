import type { Bundle, Resource } from "fhir/r4";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CC_MONO, ccBtn } from "../../../components/ccStyles.js";
import { naturalLanguageToFhirQuery } from "../../../ask/anthropicQuery.js";
import { buildSearchUrl, sameOrigin, type FhirQueryPlan } from "../../../ask/url.js";
import {
  ACTIVE_SERVER_CONFIG,
  FHIR_BASE_URL,
  buildRequestHeaders,
  loadAnthropicApiKey,
} from "../../../config.js";

const EXAMPLES = [
  "patients with diabetes over 65",
  "blood pressure observations from the last 30 days",
  "active medication requests for patient 123",
  "female patients in London",
];

const summarizeResource = (r: Resource): string => {
  const id = r.id ? ` ${r.id}` : "";
  const anyR = r as unknown as Record<string, unknown>;
  if (r.resourceType === "Patient") {
    const name = (anyR.name as Array<{ text?: string; given?: string[]; family?: string }> | undefined)?.[0];
    const display =
      name?.text ?? [name?.given?.join(" "), name?.family].filter(Boolean).join(" ");
    return `Patient${id} — ${display || "(no name)"} · ${(anyR.gender as string) ?? "?"} · ${(anyR.birthDate as string) ?? "?"}`;
  }
  const codeField = anyR.code as
    | { text?: string; coding?: Array<{ display?: string }> }
    | undefined;
  const code = codeField?.text ?? codeField?.coding?.[0]?.display;
  const status = anyR.status as string | undefined;
  return `${r.resourceType}${id}${code ? ` — ${code}` : ""}${status ? ` · ${status}` : ""}`;
};

export function AskPage() {
  const [question, setQuestion] = useState("");
  const [plan, setPlan] = useState<FhirQueryPlan | null>(null);
  const [url, setUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);

  const apiKey = loadAnthropicApiKey();
  const hasKey = Boolean(apiKey);

  const generate = async () => {
    setError(null);
    setBundle(null);
    setPlan(null);
    if (!apiKey) {
      setError("Add an Anthropic API key on the Settings page first.");
      return;
    }
    if (!question.trim()) return;
    setGenerating(true);
    try {
      const next = await naturalLanguageToFhirQuery(question, apiKey);
      setPlan(next);
      setUrl(buildSearchUrl(FHIR_BASE_URL, next));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  const run = async () => {
    if (!url) return;
    setError(null);
    setBundle(null);
    setRunning(true);
    try {
      // The URL is user-editable; only attach the active server's auth headers
      // when the request still targets the configured FHIR origin. Otherwise a
      // user who edits the host could leak bearer tokens to a third party.
      const referenceHref =
        typeof window !== "undefined" ? window.location.href : "http://localhost/";
      const isSameOrigin = sameOrigin(url, FHIR_BASE_URL, referenceHref);
      const headers: Record<string, string> = {
        Accept: "application/fhir+json",
        ...(isSameOrigin ? buildRequestHeaders(ACTIVE_SERVER_CONFIG) : {}),
      };
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const next = (await response.json()) as Bundle;
      setBundle(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  const resources =
    bundle?.entry?.flatMap((e) => (e.resource ? [e.resource] : [])) ?? [];

  const referenceHref =
    typeof window !== "undefined" ? window.location.href : "http://localhost/";
  const urlOffOrigin = Boolean(url) && !sameOrigin(url, FHIR_BASE_URL, referenceHref);

  return (
    <div className="space-y-5" data-testid="ask-page">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold" style={{ color: "var(--text)" }}>
          Ask in plain English
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Type a clinical question; Claude turns it into a FHIR R4 search URL
          you can review and run against{" "}
          <code
            className="rounded px-1 py-0.5 text-xs"
            style={{
              background: "var(--chip)",
              color: "var(--chip-text)",
              fontFamily: CC_MONO,
            }}
          >
            {FHIR_BASE_URL}
          </code>
          .
        </p>
        {!hasKey && (
          <p className="rounded border p-2 text-xs" style={warnBannerStyle}>
            No Anthropic API key set —{" "}
            <Link to="/fhir-ui/settings" className="underline">
              add one in Settings
            </Link>{" "}
            to enable query generation.
          </p>
        )}
      </header>

      <section className="space-y-2">
        <label className="block space-y-1">
          <span
            className="block text-xs font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            Question
          </span>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            placeholder="e.g. patients with diabetes over 65"
            className="w-full rounded border px-2 py-1 text-sm focus:outline-none"
            style={inputStyle}
            data-testid="ask-question"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={generating || !question.trim()}
            style={{
              ...ccBtn("primary"),
              opacity: generating || !question.trim() ? 0.6 : 1,
            }}
            data-testid="ask-generate"
          >
            {generating ? "Generating…" : "Generate query"}
          </button>
          <span className="text-xs" style={{ color: "var(--text-subtle)" }}>
            Try:
          </span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setQuestion(ex)}
              className="rounded border px-2 py-0.5 text-xs"
              style={{
                borderColor: "var(--border)",
                background: "var(--surface)",
                color: "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      </section>

      {plan && (
        <section className="space-y-2 rounded border p-4" style={cardStyle}>
          <p className="text-xs italic" style={{ color: "var(--text-muted)" }}>
            {plan.explanation}
          </p>
          <label className="block space-y-1">
            <span
              className="block text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              Request URL (editable)
            </span>
            <textarea
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              rows={3}
              spellCheck={false}
              className="w-full rounded border px-2 py-1 text-xs focus:outline-none"
              style={{ ...inputStyle, fontFamily: CC_MONO }}
              data-testid="ask-url"
            />
          </label>
          {urlOffOrigin && (
            <p
              className="rounded border p-2 text-xs"
              style={warnBannerStyle}
              data-testid="ask-off-origin"
            >
              URL targets a different origin than the configured FHIR server —
              auth headers will not be sent to avoid leaking credentials.
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={run}
              disabled={running || !url}
              style={{ ...ccBtn("primary"), opacity: running || !url ? 0.6 : 1 }}
              data-testid="ask-run"
            >
              {running ? "Running…" : "Run"}
            </button>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs underline"
              style={{ color: "var(--text-subtle)" }}
            >
              Open in new tab
            </a>
          </div>
        </section>
      )}

      {error && (
        <p
          className="rounded border p-3 text-sm"
          style={{
            borderColor: "var(--danger)",
            background: "var(--danger-soft)",
            color: "var(--danger)",
          }}
          data-testid="ask-error"
        >
          {error}
        </p>
      )}

      {bundle && (
        <section className="space-y-2" data-testid="ask-results">
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {bundle.total !== undefined
              ? `${resources.length} of ${bundle.total} returned`
              : `${resources.length} returned`}
          </p>
          {resources.length === 0 ? (
            <p
              className="rounded border p-3 text-sm"
              style={{ ...cardStyle, color: "var(--text-muted)" }}
            >
              No matching resources.
            </p>
          ) : (
            <ul className="rounded border" style={cardStyle}>
              {resources.map((r, i) => {
                // Detail pages live under /fhir-ui/ (#365 — the bare
                // /Type/id form relied on a legacy redirect).
                const href = r.id ? `/fhir-ui/${r.resourceType}/${r.id}` : null;
                const body = (
                  <span
                    className="block px-4 py-2 text-sm"
                    style={{ color: "var(--text)" }}
                  >
                    {summarizeResource(r)}
                  </span>
                );
                return (
                  <li
                    key={`${r.resourceType}-${r.id ?? i}`}
                    style={i > 0 ? { borderTop: "1px solid var(--border)" } : undefined}
                  >
                    {href ? (
                      <Link to={href} className="block">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <details className="text-xs" style={{ color: "var(--text-subtle)" }}>
            <summary className="cursor-pointer">Raw bundle</summary>
            <pre
              className="mt-2 max-h-96 overflow-auto rounded border p-2"
              style={{
                fontFamily: CC_MONO,
                borderColor: "var(--border)",
                background: "var(--sunken)",
                color: "var(--text-muted)",
              }}
            >
              {JSON.stringify(bundle, null, 2)}
            </pre>
          </details>
        </section>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  borderColor: "var(--border)",
  background: "var(--surface)",
};

const inputStyle: React.CSSProperties = {
  borderColor: "var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text)",
};

const warnBannerStyle: React.CSSProperties = {
  borderColor: "var(--warn)",
  background: "var(--warn-soft)",
  color: "var(--warn)",
};
