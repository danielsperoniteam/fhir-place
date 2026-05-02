import DOMPurify from "dompurify";
import { useMemo } from "react";
import type { Narrative as FhirNarrative } from "fhir/r4";

export interface NarrativeProps {
  narrative: FhirNarrative | undefined;
  className?: string;
}

/**
 * Renders the human-readable narrative (`Resource.text.div`) after sanitising
 * with DOMPurify. This is the **only** place `dangerouslySetInnerHTML` is
 * allowed in the library. All callers that want to show FHIR narrative MUST
 * route through this component.
 */
export function Narrative({ narrative, className }: NarrativeProps) {
  const html = useMemo(() => {
    if (!narrative?.div) return null;
    return DOMPurify.sanitize(narrative.div, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
      FORBID_ATTR: ["style", "on*"],
    });
  }, [narrative?.div]);

  if (!html) return null;
  return (
    <div
      className={className ?? "prose prose-sm max-w-none"}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
