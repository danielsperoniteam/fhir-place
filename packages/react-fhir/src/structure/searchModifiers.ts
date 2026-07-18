/**
 * FHIR R4 search modifiers, keyed by search-parameter type (#254 PR B).
 *
 * Per https://hl7.org/fhir/R4/search.html#modifiers each type admits a
 * specific modifier set; offering `:exact` on a token or `:not` on a string
 * would build queries servers reject. `:missing` is valid on every type.
 * Reference `:type` modifiers (`subject:Patient`) are chained-search
 * territory (PR C) and deliberately absent here.
 */
export const SEARCH_MODIFIERS_BY_TYPE: Record<string, readonly string[]> = {
  string: ["exact", "contains", "missing"],
  token: ["text", "not", "above", "below", "in", "not-in", "of-type", "missing"],
  // R4 also allows `:above`/`:below` on reference params (hierarchical
  // canonical chains) — omitted as a conservative product call since they're
  // rare and easy to mis-apply; add them here if a use case appears.
  reference: ["identifier", "missing"],
  uri: ["above", "below", "missing"],
  date: ["missing"],
  number: ["missing"],
  quantity: ["missing"],
  composite: [],
  special: [],
};

export const modifiersForType = (
  type: string | undefined,
): readonly string[] => SEARCH_MODIFIERS_BY_TYPE[type ?? ""] ?? [];

/**
 * Split a search key into base name and modifier: `given:exact` →
 * `{ name: "given", modifier: "exact" }`. Chained keys (`subject:Patient.name`)
 * are NOT modifier keys — the part after `:` names a type — so anything
 * containing a `.` or starting with an uppercase letter passes through whole.
 */
export function splitModifierKey(key: string): { name: string; modifier?: string } {
  const idx = key.indexOf(":");
  if (idx === -1) return { name: key };
  const suffix = key.slice(idx + 1);
  if (suffix.includes(".") || /^[A-Z]/.test(suffix)) return { name: key };
  return { name: key.slice(0, idx), modifier: suffix };
}

/** Join back: (`given`, `exact`) → `given:exact`; no modifier → bare name. */
export const joinModifierKey = (name: string, modifier?: string): string =>
  modifier ? `${name}:${modifier}` : name;
