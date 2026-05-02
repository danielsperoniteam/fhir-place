import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH ?? "/",
  server: {
    port: 5173,
    host: "127.0.0.1",
  },
  build: {
    // Default is 500 kB. The entry bundle sits at ~295 kB, but a handful of
    // vendor chunks behind the CQL Runner's dynamic-import boundary
    // (cql-execution, cql-modelinfo-4.0.x) are unavoidably 500–800 kB
    // single-file blobs. Bumping to 1000 silences the noise on those
    // known-large lazy chunks while still flagging any real regression in
    // the entry chunk (which has 3x headroom).
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Vendor splits for the heavy CQL ecosystem. These all sit behind a
        // dynamic-import boundary in `routes/cql-runner/runCql.ts`, so the
        // entry user never pays for them — but Rollup defaults bundle them
        // all into a single 2 MB+ blob, which trips the chunk-size warning
        // and produces a misleading "main bundle" name in the build output.
        manualChunks: (id) => {
          if (id.includes("/cql-execution/")) return "cql-execution";
          // cql-exec-fhir ships four FHIR ModelInfos (DSTU2 / STU3 / R4 /
          // R4.0.1) totalling ~2.5 MB. Splitting each into its own chunk
          // keeps every individual file well under the 500 kB warning bar
          // and means an R4-only run never downloads the older versions.
          if (id.includes("/cql-exec-fhir/lib/modelInfos/")) {
            const m = id.match(/fhir-modelinfo-([\d.]+)\.xml/);
            if (m) return `cql-modelinfo-${m[1]}`;
          }
          if (id.includes("/cql-exec-fhir/")) return "cql-exec-fhir";
          if (id.includes("/xml2js/") || id.includes("/sax/")) return "xml-vendor";
          return undefined;
        },
      },
    },
  },
});
