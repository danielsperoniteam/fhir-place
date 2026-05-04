import "./instrument.js";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  FetchFhirClient,
  FhirClientProvider,
  FhirError,
  setCoreStructureDefinitionFetcher,
} from "@fhir-place/react-fhir";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { App } from "./App.js";
import {
  ACTIVE_SERVER_CONFIG,
  FHIR_BASE_URL,
  ROUTER_BASENAME,
  TERMINOLOGY_BASE_URL,
  USE_HASH_ROUTER,
  USE_MOCK,
  buildRequestHeaders,
} from "./config.js";
import "./index.css";

// 4xx responses (404, 410, 422…) aren't transient — retrying them just pads
// perceived load time before the user sees the real error. Keep a single
// retry for 408 (timeout) and 5xx so flaky network/HAPI hiccups self-heal.
const shouldRetry = (failureCount: number, error: unknown): boolean => {
  if (failureCount >= 1) return false;
  if (
    error instanceof FhirError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408
  ) {
    return false;
  }
  return true;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: shouldRetry },
  },
});

const fhirClient = new FetchFhirClient({
  baseUrl: FHIR_BASE_URL,
  headers: buildRequestHeaders(ACTIVE_SERVER_CONFIG),
});

// Terminology calls (ValueSet/$expand for SNOMED, LOINC, ICD-10, BCP-47…)
// route to a separate client so they hit a SNOMED-capable server independent
// of the data server. Falls through to the data client when the URL matches —
// this is the case under MSW, and lets users opt out of the split by clearing
// the field on the Settings page.
const terminologyClient =
  TERMINOLOGY_BASE_URL && TERMINOLOGY_BASE_URL !== FHIR_BASE_URL
    ? new FetchFhirClient({ baseUrl: TERMINOLOGY_BASE_URL })
    : undefined;

async function bootstrap() {
  if (USE_MOCK) {
    // Mock mode ships trimmed StructureDefinition fixtures (`fixtures.ts`)
    // that the e2e screenshots were captured against. The package's
    // bundled-core fetcher would otherwise win the resolver race and
    // render the full R4 schema, shifting every snapshot. Disable it so
    // resolveStructureDefinition falls through to the MSW handlers.
    setCoreStructureDefinitionFetcher(async () => undefined);
    const { worker } = await import("./mocks/browser.js");
    try {
      await worker.start({
        onUnhandledRequest: "bypass",
        quiet: true,
        serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
      });
    } catch (err) {
      // Playwright contexts opt out of MSW via `serviceWorkers: "block"`,
      // which makes the SW `register()` call throw and MSW surfaces it
      // as `[MSW] Failed to register the Service Worker`. That one case
      // is intentional — the test wants `page.route` to be the sole
      // interceptor — so swallow it and let the SPA render. Anything
      // else (missing `mockServiceWorker.js`, MSW import error, etc.)
      // is a real regression and must fail loudly so we don't ship a
      // silently unmocked dev build with broken `/fhir` calls.
      const message = err instanceof Error ? err.message : String(err);
      if (!/Failed to register the Service Worker/i.test(message)) throw err;
      console.warn(
        "[mocks] Service Worker registration blocked; running without mocks.",
      );
    }
    if (import.meta.env.DEV) {
      // E2E helper: expose the worker + msw exports so Playwright
      // tests can register one-shot handlers via window.__msw at
      // runtime without forking the static handler set.
      const msw = await import("msw");
      (
        window as unknown as {
          __msw?: {
            worker: typeof worker;
            http: typeof msw.http;
            HttpResponse: typeof msw.HttpResponse;
          };
        }
      ).__msw = { worker, http: msw.http, HttpResponse: msw.HttpResponse };
    }
  }
  // On static hosts like GitHub Pages, deep links to BrowserRouter routes return
  // HTTP 404 because the server can't know the route is virtual. HashRouter
  // sidesteps this — `/fhir-place/#/Patient` always loads `index.html`. See #47.
  const Router = USE_HASH_ROUTER ? HashRouter : BrowserRouter;
  const routerProps = USE_HASH_ROUTER ? {} : { basename: ROUTER_BASENAME };

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <FhirClientProvider client={fhirClient} terminologyClient={terminologyClient}>
          <Router {...routerProps}>
            <App />
          </Router>
        </FhirClientProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
