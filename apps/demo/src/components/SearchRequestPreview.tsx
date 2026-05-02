import { formatSearchRequest, type SearchParams } from "@fhir-place/react-fhir";
import { useState } from "react";

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
  const preview = formatSearchRequest(baseUrl, resourceType, params);

  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(preview.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context, permission denied) — silently
      // ignore; the URL is still selectable in the displayed code block.
    }
  };

  return (
    <details
      className="rounded border border-slate-200 bg-white text-sm"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      data-testid="request-preview"
    >
      <summary className="cursor-pointer select-none px-3 py-2 text-slate-600 hover:bg-slate-50">
        <span className="font-medium text-slate-700">HTTP request</span>
        <span className="ml-2 text-xs text-slate-400">
          GET · {preview.params.length} param
          {preview.params.length === 1 ? "" : "s"}
        </span>
      </summary>
      <div className="space-y-3 border-t border-slate-200 px-3 py-3">
        <div>
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
              URL
            </span>
            <button
              type="button"
              onClick={copyUrl}
              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <code
            data-testid="request-preview-url"
            className="block break-all rounded bg-slate-50 px-2 py-1.5 font-mono text-xs text-slate-800"
          >
            <span className="text-slate-500">GET </span>
            {preview.url}
          </code>
        </div>

        <div>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
            Query parameters
          </span>
          {preview.params.length === 0 ? (
            <p className="text-xs text-slate-500">
              No parameters yet — start typing in the form above.
            </p>
          ) : (
            <table className="w-full table-fixed border-collapse text-xs">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="w-1/3 border-b border-slate-200 py-1 pr-2 font-medium">
                    Name
                  </th>
                  <th className="border-b border-slate-200 py-1 font-medium">
                    Value
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {preview.params.map(([name, value], i) => (
                  <tr key={`${name}-${i}`} className="align-top">
                    <td className="border-b border-slate-100 py-1 pr-2 text-slate-700">
                      {name}
                    </td>
                    <td className="break-all border-b border-slate-100 py-1 text-slate-800">
                      {value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="text-[11px] text-slate-400">
          Headers: <span className="font-mono">Accept: application/fhir+json</span>
          {" "}(plus any auth/custom headers configured for the active server)
        </div>
      </div>
    </details>
  );
}
