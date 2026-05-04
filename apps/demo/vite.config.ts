import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";

export default defineConfig({
  build: {
    // Hidden source maps: emitted to disk for Sentry upload but no
    // //# sourceMappingURL comment in shipped JS, so the public bundle
    // doesn't expose original source.
    sourcemap: "hidden",
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
