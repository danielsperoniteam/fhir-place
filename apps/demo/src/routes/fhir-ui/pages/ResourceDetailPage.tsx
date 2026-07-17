import {
  ColumnPicker,
  FhirError,
  HintedDetail,
  ResourceView,
  ReverseReferences,
  getLayoutHint,
  useDeleteResource,
  useResource,
  useStructureDefinition,
} from "@fhir-place/react-fhir";
import type { Reference, Resource } from "fhir/r4";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CompartmentSection } from "../../../components/CompartmentSection.js";
import { PatientCompartmentLinks } from "../../../components/PatientCompartmentLinks.js";
import { CC_FONT, CC_MONO, ccBtn } from "../../../components/ccStyles.js";
import { PATIENT_COMPARTMENT } from "../../../compartment.js";
import { USE_HASH_ROUTER } from "../../../config.js";
import { patientFieldOptions } from "../../../patientFields.js";
import { RESOURCE_LIST_CONFIG } from "../../../resourceListConfig.js";
import { resourceCollectionLabel } from "../resourceLabels.js";

const PATIENT_FIELDS_KEY = "fhir-place-demo-patient-detail-fields";

// HTML-escape FHIR-supplied JSON before token-coloring so a malicious
// `text.div` (or any string containing `<`, `>`, `&`) cannot inject
// markup via `dangerouslySetInnerHTML` below. JSON.stringify only
// escapes `"` and `\` (not the angle brackets that XHTML narrative
// requires), so without this step a payload like
// `<img src=x onerror=alert(1)>` lands in the live DOM. See #360.
//
// We deliberately leave `"` and `'` alone so the JSON-token regexes
// below still match — the matched `$1` is rendered as element text
// content, not as an attribute value, so unescaped quotes are inert.
const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};
const escapeHtml = (s: string): string => s.replace(/[&<>]/g, (c) => HTML_ESCAPES[c]!);

// Single-pass JSON line colorizer.
//
// The previous four-pass approach (chain of .replace() calls) had a subtle
// bug (issue #611): the first pass wrapped `"key":` in a span, consuming the
// structural colon. Subsequent passes then scanned the rest of the line for
// `:` patterns and matched colons *inside* string values (e.g. ISO timestamps
// like `"2026-05-09T03:11:26"`) inserting stray spaces after each colon.
//
// Fix: a single regex that matches each JSON "key: value" pair or standalone
// token as a unit, so the entire string value — colons and all — is consumed
// in one match and is never revisited.
//
// Named capture groups:
//   key        — the quoted key string
//   sep        — the `: ` separator (colon + optional whitespace)
//   strVal     — a quoted string value that follows a key+sep
//   primVal    — a number/bool/null value that follows a key+sep
//   standalone — a quoted string that is NOT preceded by a key (array element)
const JSON_LINE_TOKEN_RE =
  /(?<key>"(?:[^"\\]|\\.)*")(?<sep>\s*:\s*)(?:(?<strVal>"(?:[^"\\]|\\.)*")|(?<primVal>true|false|null|-?\d+(?:\.\d+)?))|(?<standalone>"(?:[^"\\]|\\.)*")/g;

export function colorJson(line: string): string {
  return escapeHtml(line).replace(
    JSON_LINE_TOKEN_RE,
    (_match, ...args) => {
      // Named groups are the last element of the args array in modern JS.
      const g = args[args.length - 1] as {
        key?: string;
        sep?: string;
        strVal?: string;
        primVal?: string;
        standalone?: string;
      };
      if (g.key !== undefined && g.strVal !== undefined) {
        // "key": "string value"
        return (
          `<span style="color:var(--accent-text)">${g.key}</span>${g.sep}` +
          `<span style="color:var(--success)">${g.strVal}</span>`
        );
      }
      if (g.key !== undefined && g.primVal !== undefined) {
        // "key": true / false / null / 42
        return (
          `<span style="color:var(--accent-text)">${g.key}</span>${g.sep}` +
          `<span style="color:var(--accent)">${g.primVal}</span>`
        );
      }
      if (g.key !== undefined) {
        // "key": (value not captured — structural line like "key": {)
        return `<span style="color:var(--accent-text)">${g.key}</span>${g.sep ?? ""}`;
      }
      if (g.standalone !== undefined) {
        // Standalone string (array element)
        return `<span style="color:var(--success)">${g.standalone}</span>`;
      }
      return _match;
    },
  );
}

export function ResourceDetailPage() {
  const { resourceType = "", id = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useResource<Resource>(resourceType, id);
  const notFound =
    error instanceof FhirError && (error.status === 404 || error.status === 410);
  const del = useDeleteResource();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [rightPane, setRightPane] = useState<"json" | "refs">("json");

  const isPatient = resourceType === "Patient";
  // Tier 1 reference implementation: AllergyIntolerance renders via
  // <HintedDetail>. Other Tier 1 resources keep the generic walker until #250
  // / #259 wire the rest of the renderer; this PR only ships the schema +
  // reference renderer so it doesn't regress existing detail screenshots.
  const hintedDetailHint =
    resourceType === "AllergyIntolerance" ? getLayoutHint(resourceType) : undefined;
  const patientSdQuery = useStructureDefinition("Patient", { enabled: isPatient });
  const patientFields = useMemo(
    () => (patientSdQuery.data ? patientFieldOptions(patientSdQuery.data) : []),
    [patientSdQuery.data],
  );
  // Curated default-visible Patient fields from `resourceListConfig` so the
  // Fields picker opens on a small clinician-relevant subset. Falls back to
  // every walked field if Patient ever drops out of `RESOURCE_LIST_CONFIG`
  // — the existing behaviour and what the picker did pre-curation.
  const patientDefaultFields = useMemo(() => {
    const cfg = RESOURCE_LIST_CONFIG.Patient;
    if (!cfg?.defaultDetailFields) return patientFields.map((f) => f.path);
    const allPaths = new Set(patientFields.map((f) => f.path));
    return cfg.defaultDetailFields.filter((p) => allPaths.has(p));
  }, [patientFields]);
  const [visibleFields, setVisibleFields] = useState<string[] | null>(null);

  const onReferenceClick = (ref: Reference) => {
    const r = ref.reference;
    if (!r) return;
    const match = r.match(/([A-Za-z]+)\/([^/]+)$/);
    if (match) navigate(`/fhir-ui/${match[1]}/${match[2]}`);
  };

  const handleDelete = async () => {
    try {
      await del.mutateAsync({ type: resourceType, id });
      navigate(`/fhir-ui/${resourceType}`);
    } catch {
      // del.error is populated; the confirm panel renders it inline.
    }
  };

  const jsonLines = data ? JSON.stringify(data, null, 2).split("\n") : [];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: CC_FONT,
      }}
    >
      {/* Nav row */}
      <div
        style={{
          padding: "12px 24px 0",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <Link
          to={`/fhir-ui/${resourceType}`}
          data-testid="resource-detail-back-link"
          style={{ fontSize: 12, color: "var(--text-muted)", textDecoration: "none" }}
        >
          ← All {resourceCollectionLabel(resourceType)}
        </Link>
        {/* Action buttons gate on resource presence: a 404/410 means there
            is nothing to view fields on, edit, or delete. Rendering them
            anyway invites the Edit-route-to-a-ghost failure (#482) and a
            Delete confirm that can only ever surface a 404. Capability-
            based gating is a separate concern (#159). */}
        {!notFound && (
          <div
            data-testid="resource-actions"
            style={{ display: "flex", gap: 6, alignItems: "center" }}
          >
            {isPatient && patientFields.length > 0 && (
              <ColumnPicker
                options={patientFields}
                defaultSelected={patientDefaultFields}
                onChange={setVisibleFields}
                storageKey={PATIENT_FIELDS_KEY}
                buttonLabel="Fields"
                searchPlaceholder="Filter fields…"
              />
            )}
            <Link
              to={`/fhir-ui/${resourceType}/${id}/edit`}
              style={ccBtn("secondary")}
              data-testid="edit-resource"
            >
              Edit
            </Link>
            <button
              onClick={() => setConfirmingDelete(true)}
              style={ccBtn("danger")}
              data-testid="delete-resource"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Delete confirm */}
      {confirmingDelete && (
        <div
          data-testid="delete-confirm"
          style={{
            margin: "12px 24px 0",
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid var(--danger)",
            background: "var(--danger-soft)",
            fontSize: 13,
          }}
        >
          <p style={{ margin: "0 0 8px", color: "var(--danger)" }}>
            Delete {resourceType}/{id}? This cannot be undone.
          </p>
          {del.isError && (
            <p
              role="alert"
              data-testid="delete-error"
              style={{
                margin: "0 0 8px",
                padding: "6px 10px",
                borderRadius: 5,
                border: "1px solid var(--danger)",
                background: "var(--surface)",
                fontSize: 12,
                color: "var(--danger)",
              }}
            >
              {(del.error as Error)?.message ?? "Delete failed"}
            </p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setConfirmingDelete(false)}
              style={ccBtn("secondary")}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={del.isPending}
              data-testid="delete-confirm-button"
              style={{ ...ccBtn("danger"), opacity: del.isPending ? 0.6 : 1 }}
            >
              {del.isPending ? "Deleting…" : "Yes, delete"}
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <p
          style={{ padding: "16px 24px 0", fontSize: 13, color: "var(--text-muted)" }}
          data-testid="resource-loading"
        >
          Loading {resourceType}/{id}…
        </p>
      )}

      {/* Not found */}
      {isError && notFound && (
        <div
          data-testid="resource-not-found"
          style={{
            margin: "16px 24px 0",
            padding: "14px 16px",
            borderRadius: 8,
            border: "1px solid var(--warn)",
            background: "var(--warn-soft)",
            fontSize: 13,
            color: "var(--text)",
          }}
        >
          <p style={{ margin: "0 0 4px", fontWeight: 500 }}>{resourceType} not found</p>
          <p style={{ margin: "0 0 10px", color: "var(--text-muted)" }}>
            {resourceType}/{id} doesn't exist on this server, or it was deleted.
          </p>
          <Link
            to={`/fhir-ui/${resourceType}`}
            data-testid="resource-not-found-back-link"
            style={{ fontSize: 12, color: "var(--text-muted)" }}
          >
            ← Back to all {resourceCollectionLabel(resourceType)}
          </Link>
        </div>
      )}

      {/* Generic error */}
      {isError && !notFound && (
        <div
          data-testid="resource-error"
          style={{
            margin: "16px 24px 0",
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid var(--danger)",
            background: "var(--danger-soft)",
            fontSize: 13,
            color: "var(--danger)",
          }}
        >
          <p style={{ margin: "0 0 8px" }}>
            {(error as Error)?.message ?? `Failed to load ${resourceType}/${id}.`}
          </p>
          <button onClick={() => refetch()} style={ccBtn("secondary")}>
            Retry
          </button>
        </div>
      )}

      {/* Main content: split left/right.
          Layout (flex / overflow / columns) lives in .cc-detail-grid so the
          <800px media query can collapse it to a single stacked column —
          inline styles would override the media query. */}
      {data && (
        <div className="cc-detail-grid" style={{ padding: "16px 24px", gap: 16 }}>
          {/* Left: structured view */}
          <div
            className="cc-detail-pane"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            {/* Resource title + badges */}
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-subtle)",
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  marginBottom: 4,
                  fontFamily: CC_MONO,
                }}
              >
                {resourceType}
              </div>
              <h1
                style={{
                  fontSize: 22,
                  fontWeight: 600,
                  margin: "0 0 8px",
                  letterSpacing: -0.3,
                  color: "var(--text)",
                }}
              >
                {id}
              </h1>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  fontFamily: CC_MONO,
                }}
              >
                {(data as Resource & { meta?: { versionId?: string; lastUpdated?: string } })
                  .meta?.lastUpdated
                  ? `Updated ${(data as Resource & { meta?: { lastUpdated?: string } }).meta?.lastUpdated}`
                  : null}
              </div>
            </div>

            {/* Structured view: HintedDetail when a Tier 1 hint is registered
                AND we want the reference implementation (AllergyIntolerance);
                generic ResourceView otherwise. */}
            <div
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                overflow: "hidden",
                padding: hintedDetailHint ? 16 : 0,
              }}
            >
              {hintedDetailHint ? (
                <HintedDetail
                  resource={data}
                  hint={hintedDetailHint}
                  onReferenceClick={onReferenceClick}
                />
              ) : (
                <ResourceView
                  resource={data}
                  onReferenceClick={onReferenceClick}
                  visibleFields={isPatient && visibleFields ? visibleFields : undefined}
                />
              )}
            </div>

            {/* Patient compartment */}
            {isPatient && (
              <section
                data-testid="patient-compartment"
                aria-label="Patient compartment"
                style={{ display: "flex", flexDirection: "column", gap: 16 }}
              >
                <div
                  style={{
                    borderTop: "1px solid var(--border)",
                    paddingTop: 16,
                  }}
                >
                  <h2
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      margin: "0 0 12px",
                      color: "var(--text)",
                    }}
                  >
                    Clinical data
                  </h2>
                  <PatientCompartmentLinks patientId={id} />
                </div>
                {PATIENT_COMPARTMENT.map((section) => (
                  <CompartmentSection key={section.resourceType} patientId={id} {...section} />
                ))}
              </section>
            )}
          </div>

          {/* Right: JSON viewer */}
          <div
            data-testid="resource-json-pane"
            className="cc-detail-pane"
            style={{
              display: "flex",
              flexDirection: "column",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
            }}
          >
            {/* Toolbar */}
            <div
              style={{
                padding: "10px 14px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  display: "flex",
                  background: "var(--sunken)",
                  borderRadius: 6,
                  padding: 2,
                  border: "1px solid var(--border)",
                }}
              >
                {(["json", "refs"] as const).map((v) => {
                  const labels = { json: "JSON", refs: "References" };
                  const active = rightPane === v;
                  return (
                    <button
                      key={v}
                      onClick={() => setRightPane(v)}
                      style={{
                        ...ccBtn("ghost"),
                        padding: "4px 10px",
                        fontSize: 12,
                        background: active ? "var(--surface)" : "transparent",
                        color: active ? "var(--text)" : "var(--text-muted)",
                        boxShadow: active ? "0 1px 2px rgba(0,0,0,.04)" : "none",
                      }}
                    >
                      {labels[v]}
                    </button>
                  );
                })}
              </div>
              <div style={{ flex: 1 }} />
              <button
                onClick={() => navigator.clipboard?.writeText(JSON.stringify(data, null, 2))}
                style={{ ...ccBtn("ghost"), fontSize: 12 }}
              >
                Copy
              </button>
            </div>

            {/* JSON content */}
            {rightPane === "json" && (
              <div
                data-testid="resource-json"
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: 14,
                  background: "var(--surface)",
                  fontFamily: CC_MONO,
                  fontSize: 12,
                  lineHeight: 1.6,
                  color: "var(--text)",
                }}
              >
                <pre style={{ margin: 0, whiteSpace: "pre" }}>
                  {jsonLines.map((line, i) => (
                    <div key={i} style={{ display: "flex" }}>
                      <span
                        style={{
                          width: 30,
                          color: "var(--text-subtle)",
                          textAlign: "right",
                          paddingRight: 12,
                          userSelect: "none",
                          flexShrink: 0,
                        }}
                      >
                        {i + 1}
                      </span>
                      <span dangerouslySetInnerHTML={{ __html: colorJson(line) }} />
                    </div>
                  ))}
                </pre>
              </div>
            )}

            {/* References pane */}
            {rightPane === "refs" && <ReferencesPane resource={data} onNavigate={(path) => navigate(path)} />}
          </div>
        </div>
      )}
    </div>
  );
}

function ReferencesPane({
  resource,
  onNavigate,
}: {
  resource: Resource;
  onNavigate: (path: string) => void;
}) {
  const refs = extractReferences(resource);

  // Incoming references ("Referenced by", #253) render below the outgoing
  // list — additive, so the pane is useful even when either half is empty.
  const referencedBy = resource.id ? (
    <div style={{ marginTop: refs.length === 0 ? 0 : 14 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.6,
          textTransform: "uppercase",
          color: "var(--text-subtle)",
          margin: "0 0 6px",
        }}
      >
        Referenced by
      </div>
      <ReverseReferences
        resourceType={resource.resourceType}
        id={resource.id}
        // Router-aware: clicks go through the SPA router (works under
        // BrowserRouter and the hosted build's HashRouter alike); the href
        // stays correct for middle-click / copy in both modes.
        hrefFor={(type, id) =>
          USE_HASH_ROUTER ? `#/fhir-ui/${type}/${id}` : `/fhir-ui/${type}/${id}`
        }
        onNavigate={(type, id) => onNavigate(`/fhir-ui/${type}/${id}`)}
      />
    </div>
  ) : null;

  if (refs.length === 0) {
    return (
      <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            padding: "8px 0 4px",
          }}
        >
          No outgoing references found
        </div>
        {referencedBy}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflow: "auto", padding: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {refs.map((ref, i) => {
          const [type, refId] = ref.reference?.split("/") ?? [];
          const clickable = type && refId && !/^https?:\/\//i.test(ref.reference ?? "");
          return (
            <div
              key={i}
              onClick={() => clickable && onNavigate(`/fhir-ui/${type}/${refId}`)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--surface)",
                cursor: clickable ? "pointer" : "default",
                transition: "background 80ms ease",
              }}
              onMouseEnter={(e) => {
                if (clickable)
                  (e.currentTarget as HTMLDivElement).style.background = "var(--sunken)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.background = "var(--surface)";
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
                  {ref.display ?? ref.reference ?? "—"}
                </div>
                <div
                  style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: CC_MONO }}
                >
                  {ref.reference}
                </div>
              </div>
              {clickable && (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="var(--text-subtle)"
                  strokeWidth="1.5"
                >
                  <path d="M4 2l4 4-4 4" />
                </svg>
              )}
            </div>
          );
        })}
      </div>
      {referencedBy}
    </div>
  );
}

function extractReferences(
  obj: unknown,
  out: Array<{ reference?: string; display?: string }> = [],
): Array<{ reference?: string; display?: string }> {
  if (!obj || typeof obj !== "object") return out;
  if (Array.isArray(obj)) {
    obj.forEach((item) => extractReferences(item, out));
    return out;
  }
  const record = obj as Record<string, unknown>;
  if (typeof record.reference === "string") {
    out.push({ reference: record.reference, display: record.display as string | undefined });
    return out;
  }
  Object.values(record).forEach((v) => extractReferences(v, out));
  return out;
}
