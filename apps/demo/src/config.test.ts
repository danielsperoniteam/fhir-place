import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ServerConfig,
  BUILTIN_SERVERS,
  buildRequestHeaders,
  loadActiveServerId,
  loadServers,
  resolveActiveServer,
  resolveEnvOverrideServer,
  saveActiveServerId,
  saveServers,
} from "./config.js";

const installLocalStorage = (initial: Record<string, string> = {}) => {
  const store: Record<string, string> = { ...initial };
  const localStorage = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
  vi.stubGlobal("window", { localStorage });
  return store;
};

beforeEach(() => {
  installLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildRequestHeaders", () => {
  const base: ServerConfig = {
    id: "x",
    label: "x",
    baseUrl: "https://example.org/fhir",
    authMode: "none",
  };

  it("returns no headers for authMode=none and no custom headers", () => {
    expect(buildRequestHeaders(base)).toEqual({});
  });

  it("attaches Authorization for bearer mode with a token", () => {
    expect(
      buildRequestHeaders({ ...base, authMode: "bearer", bearerToken: "abc" }),
    ).toEqual({ Authorization: "Bearer abc" });
  });

  it("omits Authorization for bearer mode when token is empty", () => {
    expect(
      buildRequestHeaders({ ...base, authMode: "bearer", bearerToken: "" }),
    ).toEqual({});
  });

  it("includes custom headers", () => {
    expect(
      buildRequestHeaders({
        ...base,
        headers: [
          { key: "Epic-Client-ID", value: "abc-123" },
          { key: "X-Tenant", value: "acme" },
        ],
      }),
    ).toEqual({ "Epic-Client-ID": "abc-123", "X-Tenant": "acme" });
  });

  it("skips headers with empty/whitespace keys", () => {
    expect(
      buildRequestHeaders({
        ...base,
        headers: [
          { key: "", value: "ignored" },
          { key: "   ", value: "also-ignored" },
          { key: "X-Real", value: "kept" },
        ],
      }),
    ).toEqual({ "X-Real": "kept" });
  });

  it("custom headers override Authorization on key collision", () => {
    expect(
      buildRequestHeaders({
        ...base,
        authMode: "bearer",
        bearerToken: "from-config",
        headers: [{ key: "Authorization", value: "Custom override" }],
      }),
    ).toEqual({ Authorization: "Custom override" });
  });
});

describe("loadServers", () => {
  it("returns built-ins when storage is empty", () => {
    const servers = loadServers();
    expect(servers.map((s) => s.id)).toEqual(BUILTIN_SERVERS.map((s) => s.id));
    expect(servers.every((s) => s.builtin)).toBe(true);
  });

  it("returns built-ins when storage has invalid JSON", () => {
    installLocalStorage({ "fhir-place:servers": "{not json" });
    expect(loadServers().map((s) => s.id)).toEqual(
      BUILTIN_SERVERS.map((s) => s.id),
    );
  });

  it("returns built-ins when storage holds a non-array value", () => {
    installLocalStorage({ "fhir-place:servers": JSON.stringify({ foo: 1 }) });
    expect(loadServers().map((s) => s.id)).toEqual(
      BUILTIN_SERVERS.map((s) => s.id),
    );
  });

  it("preserves stored auth overrides on built-ins but keeps canonical label/baseUrl", () => {
    // A built-in's `label` and `baseUrl` are part of the BUILT-IN badge's
    // trust identity. Anything in storage that disagrees must be ignored —
    // the merged row reverts to canonical so the badge can't lie.
    installLocalStorage({
      "fhir-place:servers": JSON.stringify([
        {
          id: "builtin-hapi",
          label: "Renamed Built-In",
          baseUrl: "https://evil.example.org/fhir",
          authMode: "bearer",
          bearerToken: "tok",
          headers: [{ key: "X-Tenant", value: "acme" }],
        },
      ]),
    });
    const servers = loadServers();
    const hapi = servers.find((s) => s.id === "builtin-hapi");
    expect(hapi).toMatchObject({
      // Canonical label + URL win — the storage override is dropped.
      label: "HAPI Public Test Server",
      baseUrl: "https://hapi.fhir.org/baseR4",
      // Auth + headers are still honored.
      authMode: "bearer",
      bearerToken: "tok",
      headers: [{ key: "X-Tenant", value: "acme" }],
      builtin: true,
    });
    // Other built-ins still present.
    expect(servers.find((s) => s.id === "builtin-smart")).toBeDefined();
  });

  it("a saved built-in row round-trips with canonical label/baseUrl on reload", () => {
    // Simulates the bug scenario: user edits a built-in's label/baseUrl in
    // an older build (or anything that wrote to localStorage directly),
    // then reloads. The merge must serve the canonical values back.
    installLocalStorage({
      "fhir-place:servers": JSON.stringify([
        {
          id: "builtin-hapi",
          label: "Renamed Built-In",
          baseUrl: "https://hapi.fhir.org/baseR4",
          authMode: "none",
        },
      ]),
    });
    const first = loadServers().find((s) => s.id === "builtin-hapi");
    expect(first?.label).toBe("HAPI Public Test Server");
    // Re-save what the UI now sees (label + baseUrl untouched) and confirm
    // the second load still reads canonical.
    saveServers(loadServers());
    const second = loadServers().find((s) => s.id === "builtin-hapi");
    expect(second?.label).toBe("HAPI Public Test Server");
    expect(second?.baseUrl).toBe("https://hapi.fhir.org/baseR4");
    expect(second?.builtin).toBe(true);
  });

  it("includes user-added custom servers, marking them non-builtin", () => {
    installLocalStorage({
      "fhir-place:servers": JSON.stringify([
        {
          id: "custom-1",
          label: "My Server",
          baseUrl: "https://example.org/fhir",
          authMode: "none",
        },
      ]),
    });
    const servers = loadServers();
    const custom = servers.find((s) => s.id === "custom-1");
    expect(custom).toMatchObject({
      label: "My Server",
      baseUrl: "https://example.org/fhir",
      builtin: false,
    });
    // Built-ins are still merged in.
    expect(servers.find((s) => s.id === "builtin-hapi")).toBeDefined();
  });

  it("silently drops malformed entries", () => {
    installLocalStorage({
      "fhir-place:servers": JSON.stringify([
        { id: "ok", label: "Ok", baseUrl: "https://example", authMode: "none" },
        { id: 42, label: "bad-id" },
        { id: "no-url", label: "x" },
        { id: "bad-auth", label: "y", baseUrl: "https://x", authMode: "weird" },
        null,
        "not-an-object",
      ]),
    });
    const ids = loadServers().map((s) => s.id);
    expect(ids).toContain("ok");
    expect(ids).not.toContain("bad-id");
    expect(ids).not.toContain("no-url");
    expect(ids).not.toContain("bad-auth");
  });
});

describe("saveServers", () => {
  it("round-trips through localStorage", () => {
    const next: ServerConfig[] = [
      {
        id: "custom-1",
        label: "Custom",
        baseUrl: "https://example.org/fhir",
        authMode: "bearer",
        bearerToken: "tok",
        headers: [{ key: "X", value: "Y" }],
      },
    ];
    saveServers(next);
    const reloaded = loadServers();
    expect(reloaded.find((s) => s.id === "custom-1")).toMatchObject({
      label: "Custom",
      authMode: "bearer",
      bearerToken: "tok",
      headers: [{ key: "X", value: "Y" }],
    });
  });
});

describe("active server id", () => {
  it("returns null when no id is stored", () => {
    expect(loadActiveServerId()).toBeNull();
  });

  it("round-trips via saveActiveServerId", () => {
    saveActiveServerId("builtin-smart");
    expect(loadActiveServerId()).toBe("builtin-smart");
  });
});

describe("resolveActiveServer", () => {
  it("returns the active server when its id is stored", () => {
    saveActiveServerId("builtin-smart");
    expect(resolveActiveServer().id).toBe("builtin-smart");
  });

  it("falls back to the first server when no active id is stored", () => {
    expect(resolveActiveServer().id).toBe(BUILTIN_SERVERS[0]!.id);
  });

  it("falls back to the first server when active id matches nothing", () => {
    saveActiveServerId("never-existed");
    expect(resolveActiveServer().id).toBe(BUILTIN_SERVERS[0]!.id);
  });
});

describe("resolveEnvOverrideServer", () => {
  it("reuses the built-in label/id when the env URL matches a known server", () => {
    const server = resolveEnvOverrideServer("https://hapi.fhir.org/baseR4");
    expect(server.id).toBe("builtin-hapi");
    expect(server.label).toBe("HAPI Public Test Server");
    expect(server.baseUrl).toBe("https://hapi.fhir.org/baseR4");
  });

  it("matches built-ins regardless of trailing slash and case", () => {
    const server = resolveEnvOverrideServer("HTTPS://Server.Fire.ly/");
    expect(server.id).toBe("builtin-firely");
    expect(server.label).toBe("Firely Server (R4)");
  });

  it("preserves the env-supplied URL verbatim even when it matches a built-in", () => {
    const server = resolveEnvOverrideServer("https://hapi.fhir.org/baseR4/");
    expect(server.id).toBe("builtin-hapi");
    expect(server.baseUrl).toBe("https://hapi.fhir.org/baseR4/");
  });

  it("falls back to the URL host when no built-in matches", () => {
    const server = resolveEnvOverrideServer("https://fhir.example.org/r4");
    expect(server.id).toBe("env-override");
    expect(server.label).toBe("fhir.example.org");
    expect(server.baseUrl).toBe("https://fhir.example.org/r4");
  });

  it("falls back to the raw value when the URL is unparseable", () => {
    const server = resolveEnvOverrideServer("not a url");
    expect(server.id).toBe("env-override");
    expect(server.label).toBe("not a url");
  });
});

describe("terminology base URL persistence", () => {
  it("returns the default tx.fhir.org URL when storage is empty", async () => {
    const { DEFAULT_TERMINOLOGY_BASE_URL, loadStoredTerminologyBaseUrl } =
      await import("./config.js");
    expect(DEFAULT_TERMINOLOGY_BASE_URL).toBe("https://tx.fhir.org/r4");
    expect(loadStoredTerminologyBaseUrl()).toBeNull();
  });

  it("round-trips through localStorage via save/load", async () => {
    const { loadStoredTerminologyBaseUrl, saveTerminologyBaseUrl } = await import(
      "./config.js"
    );
    saveTerminologyBaseUrl("https://ontoserver.example/fhir");
    expect(loadStoredTerminologyBaseUrl()).toBe("https://ontoserver.example/fhir");
  });

  it("clears storage when an empty value is saved (revert to default)", async () => {
    const { loadStoredTerminologyBaseUrl, saveTerminologyBaseUrl } = await import(
      "./config.js"
    );
    saveTerminologyBaseUrl("https://ontoserver.example/fhir");
    saveTerminologyBaseUrl("");
    expect(loadStoredTerminologyBaseUrl()).toBeNull();
  });

  it("trims whitespace before storing, treats whitespace-only as clear", async () => {
    const { loadStoredTerminologyBaseUrl, saveTerminologyBaseUrl } = await import(
      "./config.js"
    );
    saveTerminologyBaseUrl("  https://x.example/fhir  ");
    expect(loadStoredTerminologyBaseUrl()).toBe("https://x.example/fhir");
    saveTerminologyBaseUrl("   ");
    expect(loadStoredTerminologyBaseUrl()).toBeNull();
  });
});
