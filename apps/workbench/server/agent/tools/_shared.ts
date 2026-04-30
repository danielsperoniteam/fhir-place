import { z } from "zod";
import type { Bundle, Resource } from "fhir/r4";
import {
  proxyRead,
  proxySearch,
  type ProxyResult,
} from "../../services/fhir-proxy.js";
import type { ResourceType } from "../../schemas.js";
import type { ToolContext, ToolExecuteOutput } from "../registry.js";

export const dateRangeSchema = z
  .object({
    from: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
      .optional(),
    to: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
      .optional(),
  })
  .strict();

export type DateRange = z.infer<typeof dateRangeSchema>;

/** Append `date=geYYYY-MM-DD` and `date=leYYYY-MM-DD` for a date range. */
export function appendDateRange(
  params: URLSearchParams,
  range: DateRange | undefined,
  paramName = "date",
): void {
  if (!range) return;
  if (range.from) params.append(paramName, `ge${range.from}`);
  if (range.to) params.append(paramName, `le${range.to}`);
}

/** Default and clamped result limit. */
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
export const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_LIMIT)
  .optional();

export function clampLimit(input: number | undefined): number {
  if (typeof input !== "number" || !Number.isFinite(input)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.floor(input)), MAX_LIMIT);
}

/** Convert a Bundle into an array of resources, dropping entries without one. */
export function entriesOf<T extends Resource>(bundle: Bundle | undefined): T[] {
  return (
    bundle?.entry
      ?.map((e) => e.resource as T | undefined)
      .filter((r): r is T => Boolean(r)) ?? []
  );
}

/** Run a search via the proxy, return the resources or an upstream-error envelope. */
export async function runPatientSearch<T extends Resource>(
  ctx: ToolContext,
  resourceType: ResourceType,
  patientId: string,
  extra: URLSearchParams,
  limit: number,
): Promise<ToolExecuteOutput<T[]>> {
  const params = new URLSearchParams(extra);
  params.set("patient", `Patient/${patientId}`);
  params.set("_count", String(limit));
  const result = await proxySearch(
    ctx.connection,
    resourceType,
    params,
    ctx.fetch,
    ctx.signal,
  );
  return mapBundleResult<T>(result, limit);
}

export async function runRead<T extends Resource>(
  ctx: ToolContext,
  resourceType: ResourceType,
  resourceId: string,
): Promise<ToolExecuteOutput<T | null>> {
  const result: ProxyResult = await proxyRead(
    ctx.connection,
    resourceType,
    resourceId,
    ctx.fetch,
    ctx.signal,
  );
  if (!result.ok) {
    return {
      kind: "upstream_error",
      message: result.error,
      upstream: result.body,
    };
  }
  return { kind: "ok", data: result.body as T };
}

function mapBundleResult<T extends Resource>(
  result: ProxyResult,
  limit: number,
): ToolExecuteOutput<T[]> {
  if (!result.ok) {
    return {
      kind: "upstream_error",
      message: result.error,
      upstream: result.body,
    };
  }
  const bundle = result.body as Bundle | undefined;
  const items = entriesOf<T>(bundle);
  const truncated = items.length >= limit;
  return {
    kind: "ok",
    data: items,
    count: items.length,
    truncated,
  };
}
