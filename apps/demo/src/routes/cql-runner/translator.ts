/**
 * Thin client for `services/cql-translator`. Single endpoint: POST /translate.
 *
 * License note: the underlying cqframework translator is Apache-2.0; the
 * `cql-execution` package consuming the ELM output is Apache-2.0.
 */

export interface TranslationError {
  message: string;
  severity?: string;
  line?: number;
  col?: number;
}

export interface TranslationFailure {
  ok: false;
  errors: TranslationError[];
}

export interface TranslationSuccess {
  ok: true;
  /** ELM library JSON, ready to feed into `new Library(json)` from cql-execution. */
  elm: unknown;
}

export type TranslationResult = TranslationSuccess | TranslationFailure;

const DEFAULT_URL = "http://localhost:8081";

const resolveTranslatorUrl = (override?: string): string => {
  if (override) return override.replace(/\/$/, "");
  // import.meta.env is the Vite-provided env shim; tests can pass an override.
  const env = (import.meta as { env?: Record<string, string | undefined> }).env;
  return (env?.VITE_CQL_TRANSLATOR_URL ?? DEFAULT_URL).replace(/\/$/, "");
};

export async function translateCql(
  cql: string,
  options: { url?: string; signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<TranslationResult> {
  const url = `${resolveTranslatorUrl(options.url)}/translate`;
  const fetchFn = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cql }),
      signal: options.signal,
    });
  } catch (err) {
    return {
      ok: false,
      errors: [
        {
          message:
            err instanceof Error
              ? `Translator unreachable: ${err.message}`
              : "Translator unreachable",
          severity: "Error",
        },
      ],
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (err) {
    return {
      ok: false,
      errors: [
        {
          message: `Translator returned non-JSON (${response.status}): ${
            err instanceof Error ? err.message : String(err)
          }`,
          severity: "Error",
        },
      ],
    };
  }

  if (!response.ok) {
    const errors = extractErrors(payload);
    return {
      ok: false,
      errors:
        errors.length > 0
          ? errors
          : [{ message: `Translator HTTP ${response.status}`, severity: "Error" }],
    };
  }

  return { ok: true, elm: payload };
}

const extractErrors = (payload: unknown): TranslationError[] => {
  if (
    payload &&
    typeof payload === "object" &&
    "errors" in payload &&
    Array.isArray((payload as { errors: unknown[] }).errors)
  ) {
    return (payload as { errors: unknown[] }).errors
      .map(coerceError)
      .filter((e): e is TranslationError => e !== null);
  }
  return [];
};

const coerceError = (raw: unknown): TranslationError | null => {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const message = typeof o.message === "string" ? o.message : null;
  if (!message) return null;
  return {
    message,
    severity: typeof o.severity === "string" ? o.severity : undefined,
    line: typeof o.line === "number" ? o.line : undefined,
    col: typeof o.col === "number" ? o.col : undefined,
  };
};
