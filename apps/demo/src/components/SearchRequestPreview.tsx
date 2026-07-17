import { formatSearchRequest, type SearchParams } from "@fhir-place/react-fhir";
import { useState } from "react";
import { loadActiveRequestHeaders } from "../config.js";
import { formatAsCurl, formatAsFetch } from "../requestSnippets.js";

type CopyFormat = "url" | "curl" | "fetch";

const COPY_FORMATS: CopyFormat[] = ["url", "curl", "fetch"];

export interface SearchRequestPreviewProps {
  baseUrl: string;
  resourceType: string;
  params: SearchParams;
  /** Whether the panel starts open. Defaults to false. */
  defaultOpen?: boolean;
}

/**
 * Shows the GET request the FHIR client will send for the given form state:
 * the full URL plus a name/value table of the query parameters. Read-only —
 * round-tripping URL → form is a separate concern.
 */
export function SearchRequestPreview({
  baseUrl,
  resourceType,
  params,
  defaultOpen = false,
}: SearchRequestPreviewProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<CopyFormat>("url");
  const preview = formatSearchRequest(baseUrl, resourceType, params);

  // Snippets carry the active server's real headers (auth + custom) so the
  // copied command runs against the server the demo is pointed at (#146).
  // Resolved at copy time via loadActiveRequestHeaders — the same source the
  // FetchFhirClient reads per request — so Settings edits made in this SPA
  // session are reflected without a reload.
  const snippetFor = (f: CopyFormat): string => {
    if (f === "url") return preview.url;
    const envelope = {
      url: preview.url,
      headers: {
        Accept: "application/fhir+json",
        ...loadActiveRequestHeaders(),
      },
    };
    return f === "curl" ? formatAsCurl(envelope) : formatAsFetch(envelope);
  };

  const copySnippet = async () => {
    try {
      await navigator.clipboard.writeText(snippetFor(format));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context, permission denied) — silently
      // ignore; the URL is still selectable in the displayed code block.
    }
  };

  return (
    <details
      className="rounded border border-[var(--border)] bg-[var(--surface)] text-sm"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      data-testid="request-preview"
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-[var(--text-muted)] hover:bg-[var(--sunken)]">
        <span className="font-medium text-[var(--text)]">HTTP request</span>
        <span className="ml-2 text-xs text-[var(--text-subtle)]">
          GET · {preview.params.length} param
          {preview.params.length === 1 ? "" : "s"}
        </span>
      </summary>
      <div className="space-y-3 border-t border-[var(--border)] px-3 py-3">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              URL
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-flex overflow-hidden rounded border border-[var(--border)]"
                role="group"
                aria-label="Copy format"
                data-testid="copy-format-picker"
              >
                {COPY_FORMATS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    aria-pressed={format === f}
                    data-testid={`copy-format-${f}`}
                    className={
                      "px-2 py-0.5 text-xs " +
                      (format === f
                        ? "bg-[var(--accent-soft)] text-[var(--accent-text)]"
                        : "bg-[var(--sunken)] text-[var(--text-muted)] hover:bg-[var(--surface)]")
                    }
                  >
                    {f === "url" ? "URL" : f}
                  </button>
                ))}
              </span>
              <button
                type="button"
                onClick={copySnippet}
                data-testid="copy-snippet"
                className="rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-0.5 text-xs text-[var(--text-muted)] hover:bg-[var(--surface)]"
              >
                {copied ? "Copied" : `Copy ${format === "url" ? "URL" : format}`}
              </button>
            </span>
          </div>
          <code
            data-testid="request-preview-url"
            className="block break-all rounded bg-[var(--sunken)] px-2 py-1.5 font-mono text-xs text-[var(--text)]"
          >
            <span className="text-[var(--text-muted)]">GET </span>
            {preview.url}
          </code>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
            Query parameters
          </span>
          {preview.params.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              No parameters yet — start typing in the form above.
            </p>
          ) : (
            <table className="w-full table-fixed border-collapse text-xs">
              <thead>
                <tr className="text-left text-[var(--text-muted)]">
                  <th className="w-1/3 border-b border-[var(--border)] py-1 pr-2 font-medium">
                    Name
                  </th>
                  <th className="border-b border-[var(--border)] py-1 font-medium">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {preview.params.map(([name, value], i) => (
                  <tr key={`${name}-${i}`} className="align-top">
                    <td className="border-b border-[var(--border)] py-1 pr-2 text-[var(--text)]">
                      {name}
                    </td>
                    <td className="break-all border-b border-[var(--border)] py-1 text-[var(--text)]">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="text-[11px] text-[var(--text-subtle)]">
          Headers: <span className="font-mono">Accept: application/fhir+json</span>
          {" "}(plus any auth/custom headers configured for the active server)
        </div>
      </div>
    </details>
  );
}
