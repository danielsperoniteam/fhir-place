import { CqlRunner } from "./CqlRunner.js";

export function CqlRunnerPage() {
  return (
    <section className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-slate-900">CQL Runner</h1>
        <p className="text-sm text-slate-600">
          Paste CQL, run it against the active FHIR server, and view rendered
          results. Translation runs in a small Java service; ELM is executed in
          the browser.
        </p>
      </header>
      <CqlRunner />
    </section>
  );
}
