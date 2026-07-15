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

  it("offers Show all when more rows exist than the page size", async () => {
    server.use(
      http.get(`${BASE}/Observation`, ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("_summary") === "count") {
          return HttpResponse.json(countBundle(3));
        }
        const count = Number(url.searchParams.get("_count"));
        const all = [
          { resource: { resourceType: "Observation", id: "o1" } },
          { resource: { resourceType: "Observation", id: "o2" } },
          { resource: { resourceType: "Observation", id: "o3" } },
        ];
        return HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          total: 3,
          entry: all.slice(0, count || all.length),
        });
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

    await user.click(screen.getByTestId("revref-show-all-Observation-subject"));
    await screen.findByText("Observation/o3");
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
