import * as Sentry from "@sentry/react";
import React from "react";
import {
  createRoutesFromChildren,
  matchRoutes,
  useLocation,
  useNavigationType,
} from "react-router-dom";

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION,
    // FHIR demo handles patient data — leave PII off by default. Flipping
    // this on would ship IPs and request headers and needs a privacy review.
    sendDefaultPii: false,
    integrations: [
      Sentry.reactRouterV7BrowserTracingIntegration({
        useEffect: React.useEffect,
        useLocation,
        useNavigationType,
        createRoutesFromChildren,
        matchRoutes,
        // App mounts under ROUTER_BASENAME on GitHub Pages; strip it so
        // transactions group as `/fhir-ui/:resourceType` not `/fhir-place/...`.
        stripBasename: true,
      }),
    ],
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    tracePropagationTargets: parseTraceTargets(
      import.meta.env.VITE_SENTRY_TRACE_TARGETS,
    ),
  });
}

function parseTraceTargets(raw: string | undefined): (string | RegExp)[] {
  if (!raw) return ["localhost"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
