import { FhirError } from "@fhir-place/react-fhir";
import type { TranslationError } from "../translator.js";

export interface ErrorPanelProps {
  translation?: TranslationError[];
  execution?: Error | null;
  fhir?: unknown;
}

const isFhirError = (e: unknown): e is FhirError => e instanceof FhirError;

export function ErrorPanel({ translation, execution, fhir }: ErrorPanelProps) {
  const hasTranslation = translation && translation.length > 0;
  const hasExecution = !!execution;
  const hasFhir = !!fhir;

  if (!hasTranslation && !hasExecution && !hasFhir) return null;

  return (
    <div className="space-y-3" data-testid="cql-error-panel">
      {hasTranslation && (
        <Bucket title="Translator errors" tone="amber">
          <ul className="space-y-1 text-sm">
            {translation!.map((err, i) => (
              <li key={i}>
                {err.line != null && err.col != null && (
                  <span className="mr-2 font-mono text-xs text-amber-700">
                    {err.line}:{err.col}
                  </span>
                )}
                {err.message}
              </li>
            ))}
          </ul>
        </Bucket>
      )}
      {hasExecution && (
        <Bucket title="Execution error" tone="red">
          <p className="font-mono text-xs">{execution!.message}</p>
        </Bucket>
      )}
      {hasFhir && (
        <Bucket title="FHIR fetch error" tone="red">
          {isFhirError(fhir) ? (
            <p className="text-sm">
              <span className="font-mono text-xs">HTTP {fhir.status}</span>{" "}
              {fhir.message}
              <br />
              <span className="font-mono text-[11px] text-slate-500">{fhir.url}</span>
            </p>
          ) : (
            <p className="font-mono text-xs">
              {fhir instanceof Error ? fhir.message : String(fhir)}
            </p>
          )}
        </Bucket>
      )}
    </div>
  );
}

const TONE: Record<"amber" | "red", string> = {
  amber: "border-amber-300 bg-amber-50 text-amber-900",
  red: "border-red-300 bg-red-50 text-red-900",
};

function Bucket({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "amber" | "red";
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded border px-3 py-2 ${TONE[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">{title}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
