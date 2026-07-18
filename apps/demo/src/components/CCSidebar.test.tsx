// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

/**
 * Regression for issue #557 — the event-driven half of the fix.
 *
 * The e2e spec can only observe the post-reload label (mock mode pins the
 * sidebar to `ACTIVE_SERVER_CONFIG`, and a successful reload re-resolves the
 * snapshot in both the buggy and fixed code). The actual bug surfaced only
 * when `window.location.reload()` is suppressed: the sidebar must still track
 * the newly chosen server purely from the `fhir-place:active-server-changed`
 * event, without a reload. That path is exercised here with
 * `SETTINGS_ENABLED` forced true (real-server mode).
 *
 * Pre-fix the trigger rendered the static `ACTIVE_SERVER_CONFIG.label` and had
 * no event listener, so the label would stay on "Server One" after the event —
 * which this test asserts it does NOT.
 */
const { SERVERS, state } = vi.hoisted(() => {
  const SERVERS = [
    { id: "s1", label: "Server One", baseUrl: "https://one.example/fhir", authMode: "none" },
    { id: "s2", label: "Server Two", baseUrl: "https://two.example/fhir", authMode: "none" },
  ];
  return { SERVERS, state: { activeId: "s1" } };
});

vi.mock("../config.js", async (importActual) => {
  const actual = await importActual<typeof import("../config.js")>();
  return {
    ...actual,
    SETTINGS_ENABLED: true,
    ACTIVE_SERVER_CONFIG: SERVERS[0],
    loadServers: () => SERVERS,
    loadActiveServerId: () => state.activeId,
    saveActiveServerId: () => {},
  };
});

vi.mock("@fhir-place/react-fhir", () => ({
  useFhirClient: () => ({
    baseUrl: "https://one.example/fhir",
    search: () => Promise.resolve({ resourceType: "Bundle" }),
  }),
  fhirQueryKeys: { search: (...args: unknown[]) => ["search", ...args] },
}));

vi.mock("@tanstack/react-query", async (importActual) => ({
  ...(await importActual<typeof import("@tanstack/react-query")>()),
  useQueries: () => [],
}));

vi.mock("../state/pinned.js", () => ({
  usePinned: () => ({ pins: [], removePin: () => {}, renamePin: () => {} }),
}));

vi.mock("./JumpDialog.js", () => ({ JumpDialog: () => null }));

import { CCSidebar } from "./CCSidebar.js";

describe("CCSidebar active-server label", () => {
  it("tracks the active server via the change event without a reload", () => {
    state.activeId = "s1";
    render(
      <MemoryRouter>
        <CCSidebar />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("active-server-label").textContent).toBe("Server One");

    // Simulate another surface (the Settings page) switching the active server
    // and dispatching the event while the reload is suppressed.
    act(() => {
      state.activeId = "s2";
      window.dispatchEvent(new CustomEvent("fhir-place:active-server-changed"));
    });

    expect(screen.getByTestId("active-server-label").textContent).toBe("Server Two");
  });
});
