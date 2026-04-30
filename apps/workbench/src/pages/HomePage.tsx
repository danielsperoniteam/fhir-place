import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listConnections } from "../api/connections.js";

export function HomePage() {
  const list = useQuery({ queryKey: ["connections"], queryFn: listConnections });
  const count = list.data?.length ?? 0;
  const ok = list.data?.filter((c) => c.lastCapabilityStatus === "ok").length ?? 0;

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">
          FHIR Agent Workbench
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          A research workbench for evidence-backed agent answers grounded in
          synthetic FHIR data.
        </p>
      </header>

      <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-700">
        <p>
          Phase A — currently shipped: app skeleton (PR 1), FHIR DataConnection
          (PR 2), patient search and resource viewer (PR 3), typed FHIR tool
          registry (PR 4), structured AgentAnswer schema (PR 5), and the
          patient-summary agent loop (PR 6). Audit logging (PR 7), the eval
          harness (PR 8), and the failure gallery (PR 9) are still in flight.
        </p>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">FHIR connections</h2>
            <p className="mt-1 text-sm text-slate-600">
              {list.isLoading
                ? "Loading…"
                : count === 0
                  ? "No connections configured yet."
                  : `${count} connection${count === 1 ? "" : "s"} (${ok} healthy)`}
            </p>
          </div>
          <Link
            to="/connections"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Manage
          </Link>
        </div>
      </div>

      <ul
        data-testid="phase-a-checklist"
        className="space-y-1 text-sm text-slate-600"
      >
        <li>· Read-only against a configured FHIR server</li>
        <li>· Synthetic data only</li>
        <li>· Typed, patient-scoped FHIR tools (deny-by-default)</li>
        <li>· Evidence-backed structured answers</li>
        <li>· Persisted tool calls and final answers</li>
      </ul>
    </section>
  );
}
