import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FetchFhirClient } from "../client/FetchFhirClient.js";
import { FhirClientProvider } from "../hooks/FhirClientProvider.js";
import { defaultRevIncludes } from "../registries/revIncludes.js";
import { ReverseReferences } from "./ReverseReferences.js";

const BASE = "https://fhir.example.test/fhir";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const wrap = () => {
  const client = new FetchFhirClient({ baseUrl: BASE });
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>
      <FhirClientProvider client={client}>{children}</FhirClientProvider>
    </QueryClientProvider>
  );
};

const countBundle = (total: number) => ({
  resourceType: "Bundle",
  type: "searchset",
  total,
});

describe("defaultRevIncludes", () => {
  it("returns the Direction A ten-plus for Patient and empty for unknown types", () => {
    const patient = defaultRevIncludes("Patient");
    expect(patient).toContainEqual(["Encounter", "subject"]);
    expect(patient).toContainEqual(["Provenance", "target"]);
    expect(defaultRevIncludes("Basic")).toEqual([]);
  });
});

describe("ReverseReferences", () => {
  it("renders an empty state when no includes are configured", () => {
    render(<ReverseReferences resourceType="Basic" id="b1" />, {
      wrapper: wrap(),
    });
    expect(screen.getByTestId("reverse-references-empty")).toBeInTheDocument();
  });

  it("loads count badges upfront and section contents on expand only", async () => {
    const listCalls: string[] = [];
    server.use(
      http.get(`${BASE}/Encounter`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("_summary") === "count") {
          return HttpResponse.json(countBundle(2));
        }
        listCalls.push(url.toString());
        return HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          total: 2,
          entry: [
            { resource: { resourceType: "Encounter", id: "e1" } },
            { resource: { resourceType: "Encounter", id: "e2" } },
          ],
        });
      }),
    );

    const user = userEvent.setup();
    render(
      <ReverseReferences
        resourceType="Patient"
        id="ada"
        includes={[["Encounter", "subject"]]}
        hrefFor={(t, id) => `/fhir-ui/${t}/${id}`}
      />,
      { wrapper: wrap() },
    );

    // Count badge resolves without any list fetch.
    await waitFor(() =>
      expect(screen.getByTestId("revref-count-Encounter-subject")).toHaveTextContent("2"),
    );
    expect(listCalls).toHaveLength(0);

    // Expanding fetches the section list and renders clickable chips.
    await user.click(screen.getByText("Encounter — subject"));
    const chip = await screen.findByRole("link", { name: "Encounter/e1" });
    expect(chip).toHaveAttribute("href", "/fhir-ui/Encounter/e1");
    expect(listCalls.length).toBeGreaterThan(0);
    expect(listCalls[0]).toContain("subject=Patient%2Fada");
  });

  it("routes chip clicks through onNavigate with preventDefault when provided", async () => {
    server.use(
      http.get(`${BASE}/Encounter`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("_summary") === "count") {
          return HttpResponse.json(countBundle(1));
        }
        return HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          total: 1,
          entry: [{ resource: { resourceType: "Encounter", id: "e1" } }],
        });
      }),
    );

    const onNavigate = vi.fn();
    const user = userEvent.setup();
    render(
      <ReverseReferences
        resourceType="Patient"
        id="ada"
        includes={[["Encounter", "subject"]]}
        hrefFor={(t, id) => `/fhir-ui/${t}/${id}`}
        onNavigate={onNavigate}
      />,
      { wrapper: wrap() },
    );

    await user.click(screen.getByText("Encounter — subject"));
    await user.click(await screen.findByRole("link", { name: "Encounter/e1" }));
    expect(onNavigate).toHaveBeenCalledWith("Encounter", "e1");
    // jsdom would throw on an actual navigation; reaching here means the
    // click was intercepted (preventDefault) rather than followed.
  });

  it("re-surfaces the Show-all control when the drain pauses at maxAutoPages", async () => {
    const all = ["o1", "o2", "o3", "o4", "o5"].map((id) => ({
      resource: { resourceType: "Observation", id },
    }));
    const page = (offset: number) => ({
      resourceType: "Bundle",
      type: "searchset",
      total: all.length,
      entry: all.slice(offset, offset + 1),
      link:
        offset + 1 < all.length
          ? [{ relation: "next", url: `${BASE}/Observation?_page=${offset + 1}` }]
          : [],
    });
    server.use(
      http.get(`${BASE}/Observation`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("_summary") === "count") {
          return HttpResponse.json(countBundle(all.length));
        }
        return HttpResponse.json(page(Number(url.searchParams.get("_page") ?? 0)));
      }),
    );

    const user = userEvent.setup();
    render(
      <ReverseReferences
        resourceType="Patient"
        id="ada"
        includes={[["Observation", "subject"]]}
        pageSize={1}
        maxAutoPages={2}
      />,
      { wrapper: wrap() },
    );

    await user.click(await screen.findByText("Observation — subject"));
    await screen.findByText("Observation/o1");

    // First click drains 2 more pages (the cap), then pauses: no stuck
    // "Loading all…" line, and the control returns to continue (Codex
    // review on #729).
    await user.click(screen.getByTestId("revref-show-all-Observation-subject"));
    await screen.findByText("Observation/o3", {}, { timeout: 5000 });
    await waitFor(() =>
      expect(
        screen.queryByTestId("revref-loading-more-Observation-subject"),
      ).toBeNull(),
    );
    expect(screen.queryByText("Observation/o4")).toBeNull();
    const again = screen.getByTestId("revref-show-all-Observation-subject");

    // Second click finishes the drain.
    await user.click(again);
    await screen.findByText("Observation/o5", {}, { timeout: 5000 });
  });

  it("follows next links after Show all, even when the server caps _count", async () => {
    // Server behaves like a capped real-world server: every page holds at
    // most 2 rows regardless of the requested _count, with a Bundle
    // link[next] to the following page (Codex review on #728 — a single
    // `_count=total` request is not guaranteed to return everything).
    const all = ["o1", "o2", "o3", "o4", "o5"].map((id) => ({
      resource: { resourceType: "Observation", id },
    }));
    const page = (offset: number) => ({
      resourceType: "Bundle",
      type: "searchset",
      total: all.length,
      entry: all.slice(offset, offset + 2),
      link:
        offset + 2 < all.length
          ? [{ relation: "next", url: `${BASE}/Observation?_page=${offset + 2}` }]
          : [],
    });
    server.use(
      http.get(`${BASE}/Observation`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("_summary") === "count") {
          return HttpResponse.json(countBundle(all.length));
        }
        return HttpResponse.json(page(Number(url.searchParams.get("_page") ?? 0)));
      }),
    );

    const user = userEvent.setup();
    render(
      <ReverseReferences
        resourceType="Patient"
        id="ada"
        includes={[["Observation", "subject"]]}
        pageSize={2}
      />,
      { wrapper: wrap() },
    );

    await user.click(await screen.findByText("Observation — subject"));
    await screen.findByText("Observation/o2");
    expect(screen.queryByText("Observation/o3")).toBeNull();

    // One click drains every page via link[next], not one capped request.
    // Each page is a separate round-trip, so allow a longer wait.
    await user.click(screen.getByTestId("revref-show-all-Observation-subject"));
    await screen.findByText("Observation/o5", {}, { timeout: 5000 });
    expect(screen.getByText("Observation/o3")).toBeInTheDocument();
    expect(screen.getByText("Observation/o4")).toBeInTheDocument();
    // The drain indicator disappears once everything is loaded.
    await waitFor(() =>
      expect(
        screen.queryByTestId("revref-loading-more-Observation-subject"),
      ).toBeNull(),
    );
  });

  it("renders a per-section empty message when the count is zero", async () => {
    server.use(
      http.get(`${BASE}/CarePlan`, ({ request }) => {
        const url = new URL(request.url);
        return HttpResponse.json(
          url.searchParams.get("_summary") === "count"
            ? countBundle(0)
            : { resourceType: "Bundle", type: "searchset", total: 0 },
        );
      }),
    );

    const user = userEvent.setup();
    render(
      <ReverseReferences
        resourceType="Patient"
        id="ada"
        includes={[["CarePlan", "subject"]]}
      />,
      { wrapper: wrap() },
    );

    await user.click(await screen.findByText("CarePlan — subject"));
    await screen.findByText(/nothing points at this resource/i);
  });
});
