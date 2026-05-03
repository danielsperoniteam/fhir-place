/**
 * Token accounting for the agent loop. Rates are estimates from public
 * pricing as of 2026-Q1 — adjust if pricing changes. Per-task and per-run
 * ceilings are checked between model calls; we abort cleanly if exceeded.
 */

const SONNET_INPUT_USD_PER_MTOK = 3;
const SONNET_OUTPUT_USD_PER_MTOK = 15;
const SONNET_CACHE_READ_USD_PER_MTOK = 0.3;

export interface UsageDelta {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
}

export class CostMeter {
  private inputTokens = 0;
  private outputTokens = 0;
  private cacheReadTokens = 0;

  record(usage: UsageDelta): void {
    this.inputTokens += usage.inputTokens;
    this.outputTokens += usage.outputTokens;
    this.cacheReadTokens += usage.cacheReadTokens ?? 0;
  }

  estimatedUsd(): number {
    const input = (this.inputTokens / 1_000_000) * SONNET_INPUT_USD_PER_MTOK;
    const output = (this.outputTokens / 1_000_000) * SONNET_OUTPUT_USD_PER_MTOK;
    const cache =
      (this.cacheReadTokens / 1_000_000) * SONNET_CACHE_READ_USD_PER_MTOK;
    return input + output + cache;
  }

  snapshot() {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      estimatedUsd: this.estimatedUsd(),
    };
  }
}
