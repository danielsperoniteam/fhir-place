import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ServerConfig,
  BUILTIN_SERVERS,
  buildRequestHeaders,
  loadActiveServerId,
  loadServers,
  resolveActiveServer,
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

  it("preserves stored overrides on built-ins (e.g. user-added bearer token)", () => {
    installLocalStorage({
      "fhir-place:servers": JSON.stringify([
        {
          id: "builtin-hapi",
          label: "HAPI (mine)",
          baseUrl: "https://hapi.fhir.org/baseR4",
          authMode: "bearer",
          bearerToken: "tok",
        },
      ]),
    });
    const servers = loadServers();
    const hapi = servers.find((s) => s.id === "builtin-hapi");
    expect(hapi).toMatchObject({
      label: "HAPI (mine)",
      authMode: "bearer",
      bearerToken: "tok",
      builtin: true,
    });
    // Other built-ins still present.
    expect(servers.find((s) => s.id === "builtin-smart")).toBeDefined();
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
