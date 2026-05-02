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
    // Raw id is intentionally not surfaced — name + DOB are enough to
    // disambiguate, and the id is noise for clinical users.
    const option = screen.getByRole("option", { name: /Ada Lovelace/ });
    expect(option).not.toHaveTextContent("p1");
    await user.click(option);
    expect(onChange).toHaveBeenCalledWith({
      reference: "Patient/p1",
      display: "Ada Lovelace",
    });
  });

  it("does not pick on initial touch so a long dropdown remains scrollable", async () => {
    // Codex review on #202: committing on pointerdown picks the row the
    // user's finger lands on before they can drag to scroll. Selection now
    // happens on `click`, which iOS suppresses when a touch resolves into a
    // scroll gesture.
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

    // pointerdown only — no follow-up click. Mirrors a touch that became a
    // scroll. `pick()` must NOT run.
    await user.pointer({ keys: "[TouchA>]", target: option });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("preserves search-input focus when an option is tapped", async () => {
    // The `mousedown.preventDefault()` keeps focus on the search input so iOS
    // doesn't dismiss the keyboard between mousedown and click — that reflow
    // is what made taps land on the wrong row originally.
    server.use(
      http.get(`${BASE}/Patient`, () =>
        HttpResponse.json({
          resourceType: "Bundle",
          type: "searchset",
          entry: patients.map((r) => ({ resource: r })),
        }),
      ),
    );

    const user = userEvent.setup();
    render(
      <ReferencePicker targets={["Patient"]} value={undefined} onChange={() => {}} debounceMs={0} />,
      { wrapper: wrap() },
    );

    const input = screen.getByRole("searchbox", { name: /search patient/i });
    await user.type(input, "L");
    const option = await screen.findByRole("option", { name: /Ada Lovelace/ });
    expect(input).toHaveFocus();

    // Mousedown on the option should NOT move focus off the input.
    await user.pointer({ keys: "[MouseLeft>]", target: option });
    expect(input).toHaveFocus();
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

});
