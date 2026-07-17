/**
 * Copy-as-snippet builders for the search request preview (#146).
 *
 * Pure string formatting over a fully-resolved request envelope. These live
 * in the demo (not @fhir-place/react-fhir) because only the demo knows the
 * active server's auth and custom headers.
 */

export interface RequestEnvelope {
  url: string;
  /** Fully-resolved headers, including Accept and any auth/custom headers. */
  headers: Record<string, string>;
}

/**
 * Single-quote a string for POSIX shells. A literal single quote inside the
 * value closes the quote, emits an escaped quote, and reopens: ' → '\''.
 */
const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/** Escape a string for inclusion in a JS single-quoted literal. */
const jsQuote = (s: string): string =>
  `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

export function formatAsCurl({ url, headers }: RequestEnvelope): string {
  const headerFlags = Object.entries(headers).map(
    ([name, value]) => `-H ${shellQuote(`${name}: ${value}`)}`,
  );
  return [`curl ${headerFlags.join(" \\\n  ")}`, `  ${shellQuote(url)}`].join(
    " \\\n",
  );
}

export function formatAsFetch({ url, headers }: RequestEnvelope): string {
  const headerLines = Object.entries(headers)
    .map(([name, value]) => `    ${jsQuote(name)}: ${jsQuote(value)},`)
    .join("\n");
  return [
    `await fetch(${jsQuote(url)}, {`,
    `  headers: {`,
    headerLines,
    `  },`,
    `});`,
  ].join("\n");
}
