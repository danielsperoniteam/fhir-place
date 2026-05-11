import {
  searchBuilder,
  useTypedSearch,
  useFhirClient,
} from "@fhir-place/react-fhir";
import type { Patient } from "fhir/r4";
import { CC_FONT, CC_MONO } from "../../components/ccStyles.js";

const AFTER_SNIPPET = `const { data } = useTypedSearch(
  searchBuilder("Patient")
    .where("name", "Smith")   // only valid Patient params
    .where("gender", "female") // value typed as string
    .include("Patient:general-practitioner"), // only valid _includes
);`;

const BEFORE_SNIPPET = `// No autocomplete — typos compile silently:
const { data } = useSearch<Patient>("Patient", {
  nmae: "Smith",           // typo: no error
  gender: "FEMALE",        // wrong case: no error
  _incluud: "Patient:general-practitioner",  // typo: no error
});`;

export function TypedSearchPage() {
  const client = useFhirClient();
  const builder = searchBuilder("Patient")
    .where("name", "Smith")
    .include("Patient:general-practitioner");

  const { data, isLoading, isError, error } = useTypedSearch<"Patient", Patient>(builder);
  const patients = data?.entry?.flatMap((e) => (e.resource ? [e.resource] : [])) ?? [];

  return (
    <div
      data-testid="typed-search-page"
      style={{ padding: "28px 32px", maxWidth: 860, fontFamily: CC_FONT, color: "var(--text)" }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 4px", letterSpacing: -0.4 }}>
        Typed Search Builder
      </h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "0 0 24px" }}>
        <code style={{ fontFamily: CC_MONO }}>useTypedSearch</code> wraps{" "}
        <code style={{ fontFamily: CC_MONO }}>searchBuilder</code> in a TanStack Query hook.
        Parameter names, value types, and <code style={{ fontFamily: CC_MONO }}>_include</code> paths
        are TypeScript-narrowed at the call site — typos are compile errors, not silent bugs.
      </p>

      {/* Before / After */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 24 }}>
        <CodeCard label="Before — useSearch" labelColor="var(--danger)" code={BEFORE_SNIPPET} testId="snippet-before" />
        <CodeCard label="After — useTypedSearch" labelColor="var(--success)" code={AFTER_SNIPPET} testId="snippet-after" />
      </div>

      {/* Live result */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Live result</span>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {isLoading ? "loading…" : data?.total !== undefined ? `${data.total} total` : `${patients.length} loaded`}
          </span>
          <span style={{ fontSize: 11, color: "var(--text-subtle)", fontFamily: CC_MONO, marginLeft: "auto" }}>
            {client.baseUrl}
          </span>
        </div>

        <div
          data-testid="query-preview"
          style={{
            fontFamily: CC_MONO, fontSize: 12, color: "var(--text-muted)",
            padding: "5px 10px", background: "var(--sunken)", borderRadius: 6,
            marginBottom: 12, wordBreak: "break-all",
          }}
        >
          {builder.build()}
        </div>

        {isError && (
          <p style={{ color: "var(--danger)", fontSize: 13 }} data-testid="typed-search-error">
            {(error as Error)?.message ?? "Search failed"}
          </p>
        )}
        {isLoading && (
          <p style={{ color: "var(--text-muted)", fontSize: 13 }} data-testid="typed-search-loading">
            Loading…
          </p>
        )}
        {!isLoading && !isError && (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}
            data-testid="typed-search-results"
          >
            {patients.length === 0 ? (
              <li style={{ fontSize: 13, color: "var(--text-muted)", padding: "4px 0" }}>
                No matching patients on this server.
              </li>
            ) : (
              patients.map((p) => (
                <li
                  key={p.id}
                  data-testid="typed-search-patient-row"
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "7px 12px", borderRadius: 7,
                    border: "1px solid var(--border)", background: "var(--bg)", fontSize: 13,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>
                    {p.name?.[0]?.given?.join(" ")} {p.name?.[0]?.family ?? "—"}
                  </span>
                  <span style={{ fontFamily: CC_MONO, fontSize: 11, color: "var(--text-subtle)", marginLeft: "auto" }}>
                    {p.id}
                  </span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

interface CodeCardProps { label: string; labelColor: string; code: string; testId: string }

function CodeCard({ label, labelColor, code, testId }: CodeCardProps) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ padding: "7px 14px", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 600, color: labelColor, letterSpacing: 0.3, textTransform: "uppercase" }}>
        {label}
      </div>
      <pre
        data-testid={testId}
        style={{ margin: 0, padding: 14, fontSize: 12, lineHeight: 1.65, fontFamily: CC_MONO, color: "var(--text)", overflowX: "auto", whiteSpace: "pre-wrap" }}
      >
        {code}
      </pre>
    </div>
  );
}
