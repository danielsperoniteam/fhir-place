import type {
  Bundle,
  CapabilityStatement,
  OperationOutcome,
  Reference,
  Resource,
} from "fhir/r4";
import { buildSearchParams } from "./searchParams.js";
import {
  FhirError,
  type FhirClient,
  type FhirVersion,
  type JsonPatchOp,
  type RequestOptions,
  type SearchParams,
} from "./types.js";

const FHIR_JSON = "application/fhir+json";
const JSON_PATCH = "application/json-patch+json";

export interface FetchFhirClientOptions {
  baseUrl: string;
  fhirVersion?: FhirVersion;
  fetch?: typeof fetch;
  /** Static headers applied to every request (e.g. Authorization). */
  headers?: Record<string, string>;
  /** Async header producer, called per request. Overrides `headers` on collision. */
  getHeaders?: () => Promise<Record<string, string>> | Record<string, string>;
  /** Fails requests that stall beyond this duration (ms). Defaults to 15s. */
  requestTimeoutMs?: number;
}

const trimSlash = (s: string): string => s.replace(/\/+$/, "");

export class FetchFhirClient implements FhirClient {
  readonly baseUrl: string;
  readonly fhirVersion: FhirVersion;

  private readonly fetchImpl: typeof fetch;
  private readonly staticHeaders: Record<string, string>;
  private readonly getHeaders: FetchFhirClientOptions["getHeaders"];
  private readonly requestTimeoutMs: number;

  constructor(opts: FetchFhirClientOptions) {
    this.baseUrl = trimSlash(opts.baseUrl);
    this.fhirVersion = opts.fhirVersion ?? "4.0";
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.staticHeaders = opts.headers ?? {};
    this.getHeaders = opts.getHeaders;
    this.requestTimeoutMs = Math.max(1, opts.requestTimeoutMs ?? 15_000);
  }

  capabilities(options?: RequestOptions): Promise<CapabilityStatement> {
    return this.request<CapabilityStatement>({ path: "/metadata", ...options });
  }

  read<T extends Resource = Resource>(
    type: string,
    id: string,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>({ path: `/${type}/${encodeURIComponent(id)}`, ...options });
  }

  vread<T extends Resource = Resource>(
    type: string,
    id: string,
    versionId: string,
    options?: RequestOptions,
  ): Promise<T> {
    return this.request<T>({
      path: `/${type}/${encodeURIComponent(id)}/_history/${encodeURIComponent(versionId)}`,
      ...options,
    });
  }

  history<T extends Resource = Resource>(
    type: string,
    id?: string,
    options?: RequestOptions,
  ): Promise<Bundle<T>> {
    const path = id
      ? `/${type}/${encodeURIComponent(id)}/_history`
      : `/${type}/_history`;
    return this.request<Bundle<T>>({ path, ...options });
  }

  search<T extends Resource = Resource>(
    type: string,
    params?: SearchParams,
    options?: RequestOptions,
  ): Promise<Bundle<T>> {
    const qs = buildSearchParams(params).toString();
    return this.request<Bundle<T>>({
      path: `/${type}${qs ? `?${qs}` : ""}`,
      ...options,
    });
  }

  create<T extends Resource>(resource: T, options?: RequestOptions): Promise<T> {
    const headers: Record<string, string> = { ...options?.headers };
    if (options?.ifNoneExist) headers["If-None-Exist"] = options.ifNoneExist;
    return this.request<T>({
      path: `/${resource.resourceType}`,
      method: "POST",
      body: resource,
      headers,
      signal: options?.signal,
    });
  }

  update<T extends Resource>(
    resource: T & { id: string },
    options?: RequestOptions,
  ): Promise<T> {
    const headers: Record<string, string> = { ...options?.headers };
    if (options?.ifMatch) headers["If-Match"] = options.ifMatch;
    return this.request<T>({
      path: `/${resource.resourceType}/${encodeURIComponent(resource.id)}`,
      method: "PUT",
      body: resource,
      headers,
      signal: options?.signal,
    });
  }

  patch<T extends Resource = Resource>(
    type: string,
    id: string,
    operations: JsonPatchOp[],
    options?: RequestOptions,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": JSON_PATCH,
      ...options?.headers,
    };
    if (options?.ifMatch) headers["If-Match"] = options.ifMatch;
    return this.request<T>({
      path: `/${type}/${encodeURIComponent(id)}`,
      method: "PATCH",
      body: operations,
      headers,
      signal: options?.signal,
      rawBody: true,
    });
  }

  async delete(
    type: string,
    id: string,
    options?: RequestOptions,
  ): Promise<void> {
    const headers: Record<string, string> = { ...options?.headers };
    if (options?.ifMatch) headers["If-Match"] = options.ifMatch;
    await this.request<void>({
      path: `/${type}/${encodeURIComponent(id)}`,
      method: "DELETE",
      headers,
      signal: options?.signal,
      expectEmptyBody: true,
    });
  }

  readReference<T extends Resource = Resource>(
    reference: Reference,
    options?: RequestOptions,
  ): Promise<T> {
    const ref = reference.reference;
    if (!ref) {
      throw new Error("Reference.reference is empty; cannot resolve.");
    }
    if (/^https?:\/\//i.test(ref)) {
      return this.request<T>({ path: ref, ...options });
    }
    const [type, id] = ref.split("/");
    if (!type || !id) {
      throw new Error(`Unsupported reference form: ${ref}`);
    }
    return this.read<T>(type, id, options);
  }

  async request<T = unknown>(init: {
    path: string;
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
    signal?: AbortSignal;
    rawBody?: boolean;
    expectEmptyBody?: boolean;
    ifMatch?: string;
    ifNoneMatch?: string;
    cache?: RequestCache;
  }): Promise<T> {
    const url = /^https?:\/\//i.test(init.path)
      ? init.path
      : `${this.baseUrl}${init.path.startsWith("/") ? init.path : `/${init.path}`}`;

    const dynamicHeaders = this.getHeaders ? await this.getHeaders() : {};
    const headers: Record<string, string> = {
      Accept: FHIR_JSON,
      ...this.staticHeaders,
      ...dynamicHeaders,
      ...init.headers,
    };
    if (init.ifMatch) headers["If-Match"] = init.ifMatch;
    if (init.ifNoneMatch) headers["If-None-Match"] = init.ifNoneMatch;

    let body: BodyInit | undefined;
    if (init.body !== undefined) {
      headers["Content-Type"] ??= FHIR_JSON;
      body = JSON.stringify(init.body);
    }

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => timeoutController.abort(), this.requestTimeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeoutController.signal])
      : timeoutController.signal;

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: init.method ?? "GET",
        headers,
        body,
        signal,
        cache: init.cache,
      });
    } catch (err) {
      const timedOut = timeoutController.signal.aborted && !init.signal?.aborted;
      if (timedOut) {
        throw new FhirError(
          `FHIR ${init.method ?? "GET"} ${url} timed out after ${this.requestTimeoutMs}ms`,
          { status: 408, url },
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      let outcome: OperationOutcome | undefined;
      const text = await response.text();
      if (text) {
        try {
          const parsed = JSON.parse(text);
          if (
            parsed &&
            typeof parsed === "object" &&
            parsed.resourceType === "OperationOutcome"
          ) {
            outcome = parsed as OperationOutcome;
          }
        } catch {
          // non-JSON body; leave undefined
        }
      }
      const message =
        outcome?.issue?.[0]?.diagnostics ??
        outcome?.issue?.[0]?.details?.text ??
        `FHIR ${init.method ?? "GET"} ${url} failed with ${response.status}`;
      throw new FhirError(message, {
        status: response.status,
        url,
        operationOutcome: outcome,
      });
    }

    if (init.expectEmptyBody || response.status === 204) {
      return undefined as T;
    }
    const text = await response.text();
    if (!text) return undefined as T;
    return JSON.parse(text) as T;
  }
}
