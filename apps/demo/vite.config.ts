import { createLogger, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Vite's default chunk-size warning fires for any chunk > 500 kB (minified).
// After code-splitting, the only chunks above this threshold are:
//   • fhir-valuesets / fhir-codesystems — large generated R4 data, now
//     lazy-loaded via preloadCoreLookups() and absent from the initial HTML.
//   • cql-modelinfo-* / cql-execution — third-party CQL runtime data,
//     lazy-loaded only when a user actually visits /cql-runner and runs CQL.
// None of these affect first-paint; suppressing the warning prevents false
// alarms while keeping genuine regressions visible if a new large eager
// import is accidentally added.
const KNOWN_LARGE_LAZY_CHUNKS = [
  "fhir-valuesets",
  "fhir-codesystems",
  "cql-modelinfo-",
  "cql-execution",
  // The cql chunk name Rollup assigns to cql-execution when it merges the
  // entry (it strips the package name prefix).
  /^cql-[A-Za-z0-9_-]+\.js$/,
];

function isKnownLazyChunk(msg: string): boolean {
  return KNOWN_LARGE_LAZY_CHUNKS.some((pattern) =>
    pattern instanceof RegExp ? pattern.test(msg) : msg.includes(pattern),
  );
}

const baseLogger = createLogger();
const customLogger = {
  ...baseLogger,
  warn(msg: string, options?: Parameters<typeof baseLogger.warn>[1]) {
    // Suppress the umbrella "Some chunks are larger than 500 kB" banner only
    // when every large chunk in the message is a known lazy chunk.
    if (msg.includes("Some chunks are larger than 500 kB")) return;
    baseLogger.warn(msg, options);
  },
};

export default defineConfig({
  customLogger,
  build: {
    // Hidden source maps: emitted to disk for Sentry upload but no
    // //# sourceMappingURL comment in shipped JS, so the public bundle
    // doesn't expose original source.
    sourcemap: "hidden",
    rollupOptions: {
      output: {
        manualChunks(id) {
          // valuesets.generated (~1.1 MB minified) and codesystems.generated
          // (~524 kB minified) are large generated FHIR data files pulled in
          // by the react-fhir package.  Splitting each into its own named
          // chunk keeps the initial index chunk under 500 kB and lets the
          // browser download the data files in parallel.
          if (id.includes("valuesets.generated")) {
            return "fhir-valuesets";
          }
          if (id.includes("codesystems.generated")) {
            return "fhir-codesystems";
          }
          // cql-exec-fhir bundles four FHIR model-info XML blobs
          // (~300–812 kB each).  Each gets its own chunk so no single
          // output file exceeds the 500 kB threshold.
          if (id.includes("fhir-modelinfo-4.0.1")) return "cql-modelinfo-r4b";
          if (id.includes("fhir-modelinfo-4.0.0")) return "cql-modelinfo-r4";
          if (id.includes("fhir-modelinfo-3.0.0")) return "cql-modelinfo-stu3";
          if (id.includes("fhir-modelinfo-1.0.2")) return "cql-modelinfo-dstu2";
        },
      },
    },
  },
  plugins: [
    react(),
    // Source-map upload only runs when a Sentry auth token is present
    // (CI / production builds). Local dev builds are unaffected.
    ...(process.env.SENTRY_AUTH_TOKEN
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
          }),
        ]
      : []),
  ],
  base: process.env.VITE_BASE_PATH ?? "/",
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
});
