import * as Sentry from "@sentry/react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { CCTopbar } from "./components/CCTopbar.js";
import { CCSidebar } from "./components/CCSidebar.js";
import { CCTabs } from "./components/CCTabs.js";
import { ThemeProvider } from "./context/ThemeContext.js";
import { RouteTabSync, TabsProvider } from "./context/TabsContext.js";
import { AskPage } from "./routes/fhir-ui/pages/AskPage.js";
import { ResourceCreatePage } from "./routes/fhir-ui/pages/ResourceCreatePage.js";
import { ResourceDetailPage } from "./routes/fhir-ui/pages/ResourceDetailPage.js";
import { ResourceEditPage } from "./routes/fhir-ui/pages/ResourceEditPage.js";
import { ResourceListPage } from "./routes/fhir-ui/pages/ResourceListPage.js";
import { ResourceTypePickerPage } from "./routes/fhir-ui/pages/ResourceTypePickerPage.js";
import { SettingsPage } from "./routes/fhir-ui/pages/SettingsPage.js";
import { CqlRunnerPage } from "./routes/cql-runner/CqlRunnerPage.js";

const SentryRoutes = Sentry.withSentryReactRouterV7Routing(Routes);

export function App() {
  return (
    <Sentry.ErrorBoundary fallback={ErrorFallback}>
      <ThemeProvider>
        <TabsProvider>
          <Shell />
        </TabsProvider>
      </ThemeProvider>
    </Sentry.ErrorBoundary>
  );
}

function ErrorFallback() {
  return (
    <div
      data-testid="app-error-fallback"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        gap: 12,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        color: "var(--text, #e2e8f0)",
        background: "var(--bg, #0f1117)",
      }}
    >
      <span style={{ fontSize: 32 }}>Something went wrong</span>
      <span style={{ fontSize: 14, opacity: 0.6 }}>
        The error has been reported. Reload the page to try again.
      </span>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 8,
          padding: "8px 20px",
          borderRadius: 6,
          border: "1px solid var(--border, #334155)",
          background: "var(--surface, #1e293b)",
          color: "inherit",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        Reload
      </button>
    </div>
  );
}

function Shell() {
  return (
    <div
      className="cc-shell"
      style={{
        display: "flex",
        height: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
        overflow: "hidden",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Route syncing (no UI) */}
      <RouteTabSync />

      {/* Sidebar */}
      <CCSidebar />

      {/* Main column */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <CCTopbar />
        <CCTabs />

        {/* Page content */}
        <main style={{ flex: 1, overflow: "auto", background: "var(--bg)" }}>
          <SentryRoutes>
            <Route path="/" element={<RedirectWithQuery to="/fhir-ui/Patient" />} />
            <Route path="/cql-runner" element={<CqlRunnerPage />} />
            <Route path="/fhir-ui" element={<RedirectWithQuery to="/fhir-ui/Patient" />} />
            <Route path="/fhir-ui/ask" element={<AskPage />} />
            <Route path="/fhir-ui/settings" element={<SettingsPage />} />
            <Route path="/fhir-ui/types" element={<ResourceTypePickerPage />} />
            <Route path="/fhir-ui/:resourceType/new" element={<ResourceCreatePage />} />
            <Route path="/fhir-ui/:resourceType/:id/edit" element={<ResourceEditPage />} />
            <Route path="/fhir-ui/:resourceType/:id" element={<ResourceDetailPage />} />
            <Route path="/fhir-ui/:resourceType" element={<ResourceListPage />} />
            {/* Backwards-compat redirects */}
            <Route path="/ask" element={<RedirectWithQuery to="/fhir-ui/ask" />} />
            <Route path="/settings" element={<RedirectWithQuery to="/fhir-ui/settings" />} />
            <Route path="/Patient/new" element={<RedirectWithQuery to="/fhir-ui/Patient/new" />} />
            <Route path="/:resourceType/:id/edit" element={<RedirectToFhirUi suffix="/edit" includeId />} />
            <Route path="/:resourceType/:id" element={<RedirectToFhirUi includeId />} />
            <Route path="/:resourceType" element={<RedirectToFhirUi />} />
          </SentryRoutes>
        </main>

        {/* Status bar */}
        <StatusBar />
      </div>
    </div>
  );
}

function StatusBar() {
  return (
    <div
      style={{
        padding: "6px 20px",
        borderTop: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 16,
        fontSize: 11,
        color: "var(--text-muted)",
        background: "var(--surface)",
        flexShrink: 0,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <span
          style={{ width: 6, height: 6, borderRadius: 3, background: "var(--success)" }}
        />
        FHIR R4
      </span>
      <span style={{ color: "var(--border-strong)" }}>·</span>
      <span>← → navigate</span>
      <span>·</span>
      <span>⏎ open</span>
      <div style={{ flex: 1 }} />
      <span style={{ color: "var(--text-subtle)" }}>fhir-place</span>
    </div>
  );
}

function RedirectToFhirUi({
  includeId = false,
  suffix = "",
}: {
  includeId?: boolean;
  suffix?: string;
}) {
  const { resourceType, id } = useParams();
  const path = includeId
    ? `/fhir-ui/${resourceType}/${id}${suffix}`
    : `/fhir-ui/${resourceType}`;
  return <RedirectWithQuery to={path} />;
}

function RedirectWithQuery({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}
