import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FetchFhirClient, FhirClientProvider, FhirError } from "@fhir-place/react-fhir";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { App } from "./App.js";
import { FHIR_BASE_URL, ROUTER_BASENAME, USE_HASH_ROUTER, USE_MOCK } from "./config.js";
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

const fhirClient = new FetchFhirClient({ baseUrl: FHIR_BASE_URL });

async function bootstrap() {
  if (USE_MOCK) {
    const { worker } = await import("./mocks/browser.js");
    await worker.start({
      onUnhandledRequest: "bypass",
      quiet: true,
      serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
    });
  }
  // On static hosts like GitHub Pages, deep links to BrowserRouter routes return
  // HTTP 404 because the server can't know the route is virtual. HashRouter
  // sidesteps this — `/fhir-place/#/Patient` always loads `index.html`. See #47.
  const Router = USE_HASH_ROUTER ? HashRouter : BrowserRouter;
  const routerProps = USE_HASH_ROUTER ? {} : { basename: ROUTER_BASENAME };

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <FhirClientProvider client={fhirClient}>
          <Router {...routerProps}>
            <App />
          </Router>
        </FhirClientProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
