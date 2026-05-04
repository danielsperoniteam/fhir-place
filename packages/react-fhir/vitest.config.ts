import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/index.ts",
        // Per-type bundled SDs are JSON literals emitted by `sync:sds`
        // (one file per R4 resource, ~145 files). They are data, not
        // logic, and only the types a test renders get loaded — counting
        // them tanks coverage without signalling anything about the
        // source we actually maintain.
        "src/structure/core/sd/*.generated.ts",
      ],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 75,
        branches: 80,
      },
    },
  },
});
