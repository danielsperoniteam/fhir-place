#!/usr/bin/env node
// End-to-end smoke test for the LaunchDarkly SDK pipeline.
// Run: pnpm ld:smoke
// Skips cleanly if LAUNCHDARKLY_SDK_KEY is not set so CI passes either way.
import { init } from "@launchdarkly/node-server-sdk";

const sdkKey = process.env.LAUNCHDARKLY_SDK_KEY;
if (!sdkKey) {
  console.log("LAUNCHDARKLY_SDK_KEY not set — skipping smoke test.");
  console.log(
    "Set the secret locally (export LAUNCHDARKLY_SDK_KEY=...) or in GH Actions to validate the SDK pipeline.",
  );
  process.exit(0);
}

const flagKey = process.env.LD_SMOKE_FLAG_KEY ?? "smoke-test";
const context = { kind: "user", key: "ld-smoke-script", anonymous: true };

const client = init(sdkKey);
let exitCode = 0;
try {
  await client.waitForInitialization({ timeout: 10 });
  console.log("✓ LaunchDarkly client initialized");
  const value = await client.variation(flagKey, context, false);
  console.log(`  flag "${flagKey}" → ${value}`);
  if (value === false) {
    console.log(
      '  (returned fallback "false" — either the flag is off, doesn\'t exist yet, or has no targeting rule for this anonymous context)',
    );
  }
} catch (err) {
  console.error(`✗ LaunchDarkly init failed: ${err.message}`);
  exitCode = 1;
} finally {
  await client.close();
  process.exit(exitCode);
}
