import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  type AuthMode,
  type CustomHeader,
  type ServerConfig,
  loadActiveServerId,
  loadAnthropicApiKey,
  loadServers,
  saveActiveServerId,
  saveAnthropicApiKey,
  saveServers,
} from "../config.js";
import { probeFhirServer } from "../serverProbe.js";

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

export function SettingsPage() {
  const [servers, setServers] = useState<ServerConfig[]>(() => loadServers());
  const [activeId, setActiveId] = useState<string | null>(() => loadActiveServerId());
  const [testState, setTestState] = useState<Record<string, TestState>>({});
  const [anthropicKey, setAnthropicKey] = useState<string>(() => loadAnthropicApiKey());

  const updateAnthropicKey = (next: string) => {
    setAnthropicKey(next);
    saveAnthropicApiKey(next.trim());
  };

  const persist = (next: ServerConfig[]) => {
    setServers(next);
    saveServers(next);
  };

  const updateServer = (id: string, patch: Partial<ServerConfig>) => {
    persist(servers.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const removeServer = (id: string) => {
    persist(servers.filter((s) => s.id !== id));
    if (activeId === id) {
      saveActiveServerId(servers[0]?.id ?? "");
      setActiveId(servers[0]?.id ?? null);
    }
  };

  const addServer = () => {
    persist([...servers, blankServer()]);
  };

  const setActive = (id: string) => {
    saveActiveServerId(id);
    setActiveId(id);
  };

  const applyAndReload = (id: string) => {
    setActive(id);
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
    <div className="space-y-6" data-testid="settings-page">
      <nav className="text-sm text-slate-500">
        <Link to="/" className="underline">
          ← Back
        </Link>
      </nav>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">FHIR server settings</h1>
        <p className="text-sm text-slate-600">
          Point the demo at any FHIR R4 server. Settings are stored in your browser
          (localStorage) — nothing leaves your device. Bearer tokens are saved in
          plaintext, so use a personal access token, not a privileged credential.
        </p>
      </header>

      <ul className="space-y-4">
        {servers.map((server) => (
          <li key={server.id}>
            <ServerForm
              server={server}
              isActive={activeId === server.id}
              testState={testState[server.id] ?? { status: "idle" }}
              onChange={(patch) => updateServer(server.id, patch)}
              onTest={() => testConnection(server)}
              onUse={() => applyAndReload(server.id)}
              onDelete={server.builtin ? null : () => removeServer(server.id)}
            />
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={addServer}
        className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
        data-testid="add-server"
      >
        + Add server
      </button>

      <section
        className="space-y-3 rounded border border-slate-200 bg-white p-4 shadow-sm"
        data-testid="anthropic-section"
      >
        <header className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">
            Natural language queries
          </h2>
          <p className="text-xs text-slate-600">
            Paste an Anthropic API key to enable the{" "}
            <Link to="/ask" className="underline">
              Ask
            </Link>{" "}
            page, which converts plain-English questions into FHIR search URLs.
            The key is stored in your browser only and is sent directly from the
            browser to api.anthropic.com.
          </p>
        </header>
        <label className="block space-y-1">
          <span className="block text-xs font-medium text-slate-700">
            Anthropic API key
          </span>
          <input
            type="password"
            value={anthropicKey}
            onChange={(e) => updateAnthropicKey(e.target.value)}
            placeholder="sk-ant-…"
            className={inputClass}
            autoComplete="off"
            data-testid="anthropic-api-key"
          />
        </label>
      </section>
    </div>
  );
}

interface ServerFormProps {
  server: ServerConfig;
  isActive: boolean;
  testState: TestState;
  onChange: (patch: Partial<ServerConfig>) => void;
  onTest: () => void;
  onUse: () => void;
  onDelete: (() => void) | null;
}

function ServerForm({
  server,
  isActive,
  testState,
  onChange,
  onTest,
  onUse,
  onDelete,
}: ServerFormProps) {
  const headers = useMemo<CustomHeader[]>(() => server.headers ?? [], [server.headers]);

  const updateHeaders = (next: CustomHeader[]) => {
    onChange({ headers: next.length > 0 ? next : undefined });
  };

  return (
    <section
      className="space-y-3 rounded border border-slate-200 bg-white p-4 shadow-sm"
      data-testid="server-form"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">
            {server.label || "(unnamed)"}
          </h2>
          {server.builtin && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500">
              built-in
            </span>
          )}
          {isActive && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] uppercase text-emerald-700">
              active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTest}
            className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
            data-testid="test-connection"
          >
            Test connection
          </button>
          {!isActive && (
            <button
              type="button"
              onClick={onUse}
              className="rounded bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-700"
              data-testid="use-server"
            >
              Use this server
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded border border-red-200 bg-white px-3 py-1 text-xs text-red-700 hover:bg-red-50"
              data-testid="delete-server"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Label">
          <input
            type="text"
            value={server.label}
            onChange={(e) => onChange({ label: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="Base URL">
          <input
            type="url"
            value={server.baseUrl}
            onChange={(e) => onChange({ baseUrl: e.target.value })}
            placeholder="https://example.org/fhir"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Auth">
        <select
          value={server.authMode}
          onChange={(e) => onChange({ authMode: e.target.value as AuthMode })}
          className={inputClass}
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
            className={inputClass}
            autoComplete="off"
          />
        </Field>
      )}

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-slate-700">
          Custom headers
        </legend>
        {headers.length === 0 && (
          <p className="text-xs text-slate-500">
            None. Add e.g. <code>Epic-Client-ID</code> or a tenant header.
          </p>
        )}
        {headers.map((h, i) => (
          <div key={i} className="flex gap-2">
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
              className={`${inputClass} flex-1`}
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
              className={`${inputClass} flex-1`}
            />
            <button
              type="button"
              onClick={() => updateHeaders(headers.filter((_, j) => j !== i))}
              className="rounded border border-slate-300 bg-white px-2 text-xs text-slate-600 hover:bg-slate-50"
              aria-label="Remove header"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => updateHeaders([...headers, { key: "", value: "" }])}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
        >
          + Add header
        </button>
      </fieldset>

      <TestResult state={testState} />
    </section>
  );
}

function TestResult({ state }: { state: TestState }) {
  if (state.status === "idle") return null;
  if (state.status === "pending") {
    return <p className="text-xs text-slate-500">Testing…</p>;
  }
  if (state.status === "ok") {
    const parts = [state.software, state.fhirVersion && `FHIR ${state.fhirVersion}`]
      .filter(Boolean)
      .join(" · ");
    return (
      <p
        className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800"
        data-testid="test-ok"
      >
        ✓ Connected{parts ? ` — ${parts}` : ""}
      </p>
    );
  }
  return (
    <p
      className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700"
      data-testid="test-error"
    >
      ✗ {state.message}
    </p>
  );
}

const inputClass =
  "w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 focus:border-slate-500 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="block text-xs font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}
