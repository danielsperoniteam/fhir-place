import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Reference } from "fhir/r4";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FetchFhirClient } from "../client/FetchFhirClient.js";
import { FhirClientProvider } from "../hooks/FhirClientProvider.js";
import { ReferencePicker } from "./ReferencePicker.js";

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

describe("ReferencePicker", () => {
  const patients = [
    {
      resourceType: "Patient",
      id: "p1",
      name: [{ given: ["Ada"], family: "Lovelace" }],
      birthDate: "1815-12-10",
      gender: "female",
    },
    {
      resourceType: "Patient",
      id: "p2",
      name: [{ given: ["Alan"], family: "Turing" }],
      birthDate: "1912-06-23",
      gender: "male",
    },
  ];

  it("searches when the user types and picks a resource on click", async () => {
    server.use(
      http.get(`${BASE}/Patient`, ({ request }) => {
        const q = new URL(request.url).searchParams.get("name");
        const match = patients.filter((p) =>
          (p.name[0]?.family ?? "").toLowerCase().includes((q ?? "").toLowerCase()),
        );
        return HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          entry: match.map((r) => ({ resource: r })),
        });
      }),
    );

    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ReferencePicker targets={["Patient"]} value={undefined} onChange={onChange} debounceMs={0} />,
      { wrapper: wrap() },
    );

    await user.type(screen.getByRole("searchbox", { name: /search patient/i }), "Lovelace");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Ada Lovelace/ })).toBeInTheDocument(),
    );
    // DOB + gender render as the secondary disambiguator beneath the name.
    expect(screen.getByText(/DOB 1815-12-10 · female/)).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: /Ada Lovelace/ }));
    expect(onChange).toHaveBeenCalledWith({
      reference: "Patient/p1",
      display: "Ada Lovelace",
    });
  });

  it("commits the selection on pointerdown so iOS taps don't get lost to input blur", async () => {
    server.use(
      http.get(`${BASE}/Patient`, () =>
        HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          entry: patients.map((r) => ({ resource: r })),
        }),
      ),
    );

    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ReferencePicker targets={["Patient"]} value={undefined} onChange={onChange} debounceMs={0} />,
      { wrapper: wrap() },
    );

    await user.type(screen.getByRole("searchbox", { name: /search patient/i }), "L");
    const option = await screen.findByRole("option", { name: /Ada Lovelace/ });

    // Simulate the iOS sequence: pointerdown on the option fires first, BEFORE
    // any click — emulating the real-world failure mode where the subsequent
    // tap event was never delivered. pick() must already have run.
    await user.pointer({ keys: "[TouchA>]", target: option });
    expect(onChange).toHaveBeenCalledWith({
      reference: "Patient/p1",
      display: "Ada Lovelace",
    });
  });

  it("shows a clear button for an already-selected reference and resets on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const value: Reference = { reference: "Patient/p1", display: "Ada Lovelace" };
    render(<ReferencePicker targets={["Patient"]} value={value} onChange={onChange} />, {
      wrapper: wrap(),
    });
    await user.click(screen.getByRole("button", { name: /clear reference/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("shows a target type switcher when multiple targets are allowed", () => {
    render(
      <ReferencePicker
        targets={["Patient", "Practitioner"]}
        value={undefined}
        onChange={() => {}}
      />,
      { wrapper: wrap() },
    );
    const typeSelect = screen.getByRole("combobox", { name: "target type" });
    expect(typeSelect).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Patient" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Practitioner" })).toBeInTheDocument();
  });

  it("surfaces empty-state when nothing matches", async () => {
    server.use(
      http.get(`${BASE}/Patient`, () =>
        HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          entry: [],
        }),
      ),
    );
    const user = userEvent.setup();
    render(
      <ReferencePicker targets={["Patient"]} value={undefined} onChange={() => {}} debounceMs={0} />,
      { wrapper: wrap() },
    );
    await user.type(screen.getByRole("searchbox", { name: /search patient/i }), "zzz");
    await waitFor(() =>
      expect(screen.getByText(/no matches/i)).toBeInTheDocument(),
    );
  });

  it("does not render a birth-date input for non-person target types", () => {
    render(
      <ReferencePicker targets={["Organization"]} value={undefined} onChange={() => {}} />,
      { wrapper: wrap() },
    );
    expect(screen.queryByLabelText(/birth date/i)).not.toBeInTheDocument();
  });

  it("searches by birthdate alone (no free-text query) for Patient", async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${BASE}/Patient`, ({ request }) => {
        seen.push(request.url);
        return HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          entry: [{ resource: patients[0] }],
        });
      }),
    );

    const user = userEvent.setup();
    render(
      <ReferencePicker
        targets={["Patient"]}
        value={undefined}
        onChange={() => {}}
        debounceMs={0}
      />,
      { wrapper: wrap() },
    );

    await user.type(screen.getByLabelText(/birth date/i), "1815-12-10");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /Ada Lovelace/ })).toBeInTheDocument(),
    );
    const url = new URL(seen[seen.length - 1]!);
    expect(url.searchParams.get("birthdate")).toBe("1815-12-10");
    expect(url.searchParams.get("name")).toBeNull();
  });

  it("combines name and birthdate when both are set", async () => {
    const seen: string[] = [];
    server.use(
      http.get(`${BASE}/Patient`, ({ request }) => {
        seen.push(request.url);
        return HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          entry: [{ resource: patients[0] }],
        });
      }),
    );

    const user = userEvent.setup();
    render(
      <ReferencePicker
        targets={["Patient"]}
        value={undefined}
        onChange={() => {}}
        debounceMs={0}
      />,
      { wrapper: wrap() },
    );

    await user.type(screen.getByRole("searchbox", { name: /search patient/i }), "Lovelace");
    await user.type(screen.getByLabelText(/birth date/i), "1815-12-10");
    await waitFor(() => {
      const last = seen[seen.length - 1];
      if (!last) throw new Error("no request yet");
      const url = new URL(last);
      expect(url.searchParams.get("name")).toBe("Lovelace");
      expect(url.searchParams.get("birthdate")).toBe("1815-12-10");
    });
  });
});
