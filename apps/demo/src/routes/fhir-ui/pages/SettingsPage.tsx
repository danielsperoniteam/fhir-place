import * as Sentry from "@sentry/react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ACTIVE_SERVER_CONFIG,
  DEFAULT_FHIR_SERVER,
  DEFAULT_TERMINOLOGY_BASE_URL,
  type AuthMode,
  type CustomHeader,
  type ServerConfig,
  loadActiveServerId,
  loadAnthropicApiKey,
  loadServers,
  loadStoredTerminologyBaseUrl,
  saveActiveServerId,
  saveAnthropicApiKey,
  saveServers,
  saveTerminologyBaseUrl,
} from "../../../config.js";
import { CC_FONT, CC_MONO, ccBtn } from "../../../components/ccStyles.js";
import { probeFhirServer } from "../../../serverProbe.js";

type TestState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ok"; software?: string; fhirVersion?: string }
  | { status: "error"; message: string };

const newServerId = (): string =>
  `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const blankServer = (): ServerConfig => ({
  id: newServerId(),
  label: "My FHIR Server",
  baseUrl: "",
  authMode: "none",
});

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  border: "1px solid var(--border)",
  borderRadius: 6,
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: CC_FONT,
  outline: "none",
};

const inputMonoStyle: React.CSSProperties = {
  ...inputStyle,
  fontFamily: CC_MONO,
  fontSize: 12,
};

const readonlyInputStyle: React.CSSProperties = {
  ...inputStyle,
  background: "var(--surface-muted, var(--surface))",
  color: "var(--text-muted)",
  cursor: "not-allowed",
};

const readonlyMonoInputStyle: React.CSSProperties = {
  ...inputMonoStyle,
  background: "var(--surface-muted, var(--surface))",
  color: "var(--text-muted)",
  cursor: "not-allowed",
};

export function SettingsPage() {
  const [servers, setServers] = useState<ServerConfig[]>(() => loadServers());
  const [activeId, setActiveId] = useState<string>(
    () => loadActiveServerId() ?? ACTIVE_SERVER_CONFIG.id,
  );
  const [testState, setTestState] = useState<Record<string, TestState>>({});
  const [anthropicKey, setAnthropicKey] = useState<string>(() => loadAnthropicApiKey());
  const [terminologyUrl, setTerminologyUrl] = useState<string>(
    () => loadStoredTerminologyBaseUrl() ?? "",
  );

  const updateTerminologyUrl = (next: string) => {
    setTerminologyUrl(next);
    saveTerminologyBaseUrl(next);
  };

  const updateAnthropicKey = (next: string) => {
    setAnthropicKey(next);
    saveAnthropicApiKey(next.trim());
  };

  const persist = (next: ServerConfig[]) => {
    setServers(next);
    saveServers(next);
  };

  const updateServer = (id: string, patch: Partial<ServerConfig>) => {
    persist(
      servers.map((s) => {
        if (s.id !== id) return s;
        // Built-in label and baseUrl are part of the BUILT-IN badge's trust
        // identity. Even if the UI fails to disable the inputs (a future
        // refactor, a bypass via dev tools), the state layer drops these
        // fields on the floor so the canonical row can't be retargeted.
        const safePatch = s.builtin
          ? (() => {
              const { label: _label, baseUrl: _baseUrl, ...rest } = patch;
              return rest;
            })()
          : patch;
        return { ...s, ...safePatch };
      }),
    );
  };

  const removeServer = (id: string) => {
    const next = servers.filter((s) => s.id !== id);
    persist(next);
    if (activeId === id) {
      const fallback = next[0]?.id ?? "";
      saveActiveServerId(fallback);
      setActiveId(fallback);
    }
  };

  const addServer = () => {
    persist([...servers, blankServer()]);
  };

  const applyAndReload = (id: string) => {
    saveActiveServerId(id);
    setActiveId(id);
    window.location.reload();
  };

  const testConnection = async (server: ServerConfig) => {
    setTestState((prev) => ({ ...prev, [server.id]: { status: "pending" } }));
    const result = await probeFhirServer(server);
    setTestState((prev) => ({
      ...prev,
      [server.id]: result.ok
        ? {
            status: "ok",
            ...(result.software ? { software: result.software } : {}),
            ...(result.fhirVersion ? { fhirVersion: result.fhirVersion } : {}),
          }
        : { status: "error", message: result.message },
    }));
  };

  return (
    <div
      style={{
        padding: "24px 32px",
        maxWidth: 960,
        margin: "0 auto",
        fontFamily: CC_FONT,
      }}
      data-testid="settings-page"
    >
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, letterSpacing: -0.3, color: "var(--text)" }}>
            FHIR Servers
          </h1>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {servers.length} configured
          </span>
        </div>
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          Connect to any FHIR-spec compliant endpoint. Blank settings use{" "}
          <code style={{ fontFamily: CC_MONO, fontSize: 12 }}>
            {DEFAULT_FHIR_SERVER.baseUrl}
          </code>
          . Settings stored in your browser — nothing leaves your device.
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button
          onClick={addServer}
          style={ccBtn("primary")}
          data-testid="add-server"
        >
          + Add server
        </button>
      </div>

      {/* Server cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 32 }}>
        {servers.map((server) => (
          <ServerCard
            key={server.id}
            server={server}
            isActive={activeId === server.id}
            testState={testState[server.id] ?? { status: "idle" }}
            onChange={(patch) => updateServer(server.id, patch)}
            onTest={() => testConnection(server)}
            onUse={() => applyAndReload(server.id)}
            onDelete={server.builtin ? null : () => removeServer(server.id)}
          />
        ))}
      </div>

      {/* Terminology server */}
      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 20,
          marginBottom: 16,
        }}
        data-testid="terminology-section"
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px", color: "var(--text)" }}>
          Terminology server
        </h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 14px", lineHeight: 1.5 }}>
          Routes <code style={{ fontFamily: CC_MONO, fontSize: 11 }}>ValueSet/$expand</code> to a separate server so SNOMED, LOINC, ICD-10 dropdowns populate.
          Defaults to <code style={{ fontFamily: CC_MONO, fontSize: 11 }}>{DEFAULT_TERMINOLOGY_BASE_URL}</code> when blank. Reload after changing.
        </p>
        <label style={{ display: "block" }}>
          <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Terminology base URL
          </span>
          <input
            type="url"
            value={terminologyUrl}
            onChange={(e) => updateTerminologyUrl(e.target.value)}
            placeholder={DEFAULT_TERMINOLOGY_BASE_URL}
            style={inputMonoStyle}
            autoComplete="off"
            data-testid="terminology-base-url-input"
          />
        </label>
      </section>

      {/* Anthropic API key */}
      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 20,
        }}
        data-testid="anthropic-section"
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px", color: "var(--text)" }}>
          Natural language queries
        </h2>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 14px", lineHeight: 1.5 }}>
          Paste an Anthropic API key to enable the{" "}
          <Link to="/fhir-ui/ask" style={{ color: "var(--accent-text)" }}>
            Ask
          </Link>{" "}
          page. The key is stored in your browser only.
        </p>
        <label style={{ display: "block" }}>
          <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Anthropic API key
          </span>
          <input
            type="password"
            value={anthropicKey}
            onChange={(e) => updateAnthropicKey(e.target.value)}
            placeholder="sk-ant-…"
            style={inputMonoStyle}
            autoComplete="off"
            data-testid="anthropic-api-key"
          />
        </label>
      </section>

      {/* Sentry diagnostics — only shown when a DSN is configured at build time. */}
      {import.meta.env.VITE_SENTRY_DSN && <SentryDiagnostics />}
    </div>
  );
}

function SentryDiagnostics() {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: 20,
        marginTop: 16,
      }}
      data-testid="sentry-diagnostics-section"
    >
      <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 4px", color: "var(--text)" }}>
        Sentry diagnostics
      </h2>
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 14px", lineHeight: 1.5 }}>
        Send a test event to verify the dashboard is wired up. Visible only when{" "}
        <code style={{ fontFamily: CC_MONO, fontSize: 11 }}>VITE_SENTRY_DSN</code> is set at build time.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() =>
            Sentry.captureMessage("Sentry diagnostics: test message", "info")
          }
          style={ccBtn("ghost")}
          data-testid="sentry-test-message"
        >
          Send test message
        </button>
        <button
          onClick={() => {
            Sentry.logger.info("User triggered test error", {
              action: "settings_test_error_button",
            });
            // Thrown from an event handler — bypasses ErrorBoundary by design
            // (React 16+ doesn't catch event-handler errors), reaches Sentry
            // via window.onerror so the page stays usable.
            throw new Error("Sentry diagnostics: this is your first error!");
          }}
          style={ccBtn("danger")}
          data-testid="sentry-test-error"
        >
          Break the world
        </button>
      </div>
    </section>
  );
}

// ─── Server card ──────────────────────────────────────────────────────────────

interface ServerCardProps {
  server: ServerConfig;
  isActive: boolean;
  testState: TestState;
  onChange: (patch: Partial<ServerConfig>) => void;
  onTest: () => void;
  onUse: () => void;
  onDelete: (() => void) | null;
}

function ServerCard({
  server,
  isActive,
  testState,
  onChange,
  onTest,
  onUse,
  onDelete,
}: ServerCardProps) {
  const [expanded, setExpanded] = useState(isActive);
  const headers = useMemo<CustomHeader[]>(() => server.headers ?? [], [server.headers]);

  const updateHeaders = (next: CustomHeader[]) => {
    onChange({ headers: next.length > 0 ? next : undefined });
  };

  const statusColor =
    testState.status === "ok"
      ? "var(--success)"
      : testState.status === "error"
        ? "var(--danger)"
        : isActive
          ? "var(--success)"
          : "var(--text-subtle)";

  return (
    <div
      style={{
        background: "var(--surface)",
        border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 10,
        padding: 16,
        boxShadow: isActive ? "0 0 0 3px var(--accent-soft)" : "none",
        transition: "box-shadow 200ms ease, border-color 200ms ease",
      }}
      data-testid="server-form"
      data-server-id={server.id}
      data-builtin={server.builtin ? "true" : "false"}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: expanded ? 16 : 0 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            background: statusColor,
            flexShrink: 0,
          }}
        />
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "var(--text)", flex: 1 }}>
          {server.label || "(unnamed)"}
        </h3>
        {server.builtin && (
          <span
            style={{
              fontSize: 10,
              padding: "2px 6px",
              background: "var(--chip)",
              color: "var(--chip-text)",
              borderRadius: 3,
              fontWeight: 500,
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            Built-in
          </span>
        )}
        {isActive && (
          <span
            style={{
              fontSize: 10,
              padding: "2px 6px",
              background: "var(--accent)",
              color: "#fff",
              borderRadius: 3,
              fontWeight: 500,
              letterSpacing: 0.3,
              textTransform: "uppercase",
            }}
          >
            Active
          </span>
        )}
        <span
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontFamily: CC_MONO,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 200,
          }}
        >
          {server.baseUrl}
        </span>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={onTest} style={{ ...ccBtn("ghost"), fontSize: 12 }} data-testid="test-connection">
            Test
          </button>
          {!isActive && (
            <button onClick={onUse} style={{ ...ccBtn("secondary"), fontSize: 12 }} data-testid="use-server">
              Use
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} style={{ ...ccBtn("danger"), fontSize: 12 }} data-testid="delete-server">
              Delete
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{ ...ccBtn("ghost"), fontSize: 12, padding: "6px 8px" }}
            aria-label={expanded ? "Collapse" : "Expand"}
            data-testid="server-card-toggle"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 120ms" }}
            >
              <path d="M3 5l3-3 3 3M3 7l3 3 3-3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Test result */}
      {testState.status !== "idle" && (
        <div style={{ marginBottom: expanded ? 12 : 0 }}>
          <TestResult state={testState} />
        </div>
      )}

      {/* Expanded form */}
      {expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Label">
              <input
                type="text"
                value={server.label}
                onChange={(e) => onChange({ label: e.target.value })}
                style={server.builtin ? readonlyInputStyle : inputStyle}
                readOnly={server.builtin}
                aria-readonly={server.builtin || undefined}
                data-testid="server-label-input"
              />
            </Field>
            <Field label="Base URL">
              <input
                type="url"
                value={server.baseUrl}
                onChange={(e) => onChange({ baseUrl: e.target.value })}
                placeholder="https://example.org/fhir"
                style={server.builtin ? readonlyMonoInputStyle : inputMonoStyle}
                readOnly={server.builtin}
                aria-readonly={server.builtin || undefined}
                data-testid="server-base-url-input"
              />
            </Field>
          </div>
          {server.builtin && (
            <p
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                margin: "-4px 0 0",
                lineHeight: 1.5,
              }}
              data-testid="builtin-readonly-hint"
            >
              Label and base URL are fixed for built-in servers so the BUILT-IN
              badge stays a reliable trust signal. Auth and custom headers are
              still editable.
            </p>
          )}

          <Field label="Auth">
            <select
              value={server.authMode}
              onChange={(e) => onChange({ authMode: e.target.value as AuthMode })}
              style={inputStyle}
              data-testid="server-auth-mode"
            >
              <option value="none">None</option>
              <option value="bearer">Bearer token</option>
            </select>
          </Field>

          {server.authMode === "bearer" && (
            <Field label="Bearer token">
              <input
                type="password"
                value={server.bearerToken ?? ""}
                onChange={(e) => onChange({ bearerToken: e.target.value })}
                placeholder="paste token"
                style={inputMonoStyle}
                autoComplete="off"
                data-testid="server-bearer-token-input"
              />
            </Field>
          )}

          {/* Custom headers */}
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                marginBottom: 8,
              }}
            >
              Custom headers
            </div>
            {headers.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--text-subtle)", margin: "0 0 8px" }}>
                None. Add e.g.{" "}
                <code style={{ fontFamily: CC_MONO, fontSize: 11 }}>Epic-Client-ID</code> or a tenant header.
              </p>
            )}
            {headers.map((h, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <input
                  type="text"
                  value={h.key}
                  onChange={(e) =>
                    updateHeaders(
                      headers.map((existing, j) =>
                        j === i ? { ...existing, key: e.target.value } : existing,
                      ),
                    )
                  }
                  placeholder="Header name"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <input
                  type="text"
                  value={h.value}
                  onChange={(e) =>
                    updateHeaders(
                      headers.map((existing, j) =>
                        j === i ? { ...existing, value: e.target.value } : existing,
                      ),
                    )
                  }
                  placeholder="Value"
                  style={{ ...inputStyle, flex: 2 }}
                />
                <button
                  onClick={() => updateHeaders(headers.filter((_, j) => j !== i))}
                  style={{ ...ccBtn("ghost"), padding: "6px 8px", fontSize: 14 }}
                  aria-label="Remove header"
                >
                  ×
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                onClick={() => updateHeaders([...headers, { key: "", value: "" }])}
                style={{ ...ccBtn("ghost"), fontSize: 12 }}
              >
                + Add header
              </button>
              <button
                onClick={() => updateHeaders([...headers, { key: "Authorization", value: "Bearer " }])}
                style={{ ...ccBtn("ghost"), fontSize: 12 }}
                data-testid="add-bearer-header"
              >
                + Add bearer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TestResult({ state }: { state: TestState }) {
  if (state.status === "idle") return null;
  if (state.status === "pending") {
    return (
      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
        Testing connection…
      </p>
    );
  }
  if (state.status === "ok") {
    const parts = [state.software, state.fhirVersion && `FHIR ${state.fhirVersion}`]
      .filter(Boolean)
      .join(" · ");
    return (
      <p
        style={{
          fontSize: 12,
          color: "var(--success)",
          margin: 0,
          padding: "6px 10px",
          borderRadius: 6,
          background: "var(--success-soft)",
          border: "1px solid var(--border)",
        }}
        data-testid="test-ok"
      >
        ✓ Connected{parts ? ` — ${parts}` : ""}
      </p>
    );
  }
  return (
    <p
      style={{
        fontSize: 12,
        color: "var(--danger)",
        margin: 0,
        padding: "6px 10px",
        borderRadius: 6,
        background: "var(--danger-soft)",
        border: "1px solid var(--border)",
      }}
      data-testid="test-error"
    >
      ✗ {state.message}
    </p>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "block",
          fontSize: 11,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 5,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
