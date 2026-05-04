import type { ElementDefinition, ValueSet } from "fhir/r4";

export type BindingStrength =
  | "required"
  | "extensible"
  | "preferred"
  | "example";

export interface ElementBinding {
  strength: BindingStrength | undefined;
  valueSet: string | undefined;
  description: string | undefined;
}

export function bindingFor(element: ElementDefinition | undefined): ElementBinding {
  const b = element?.binding;
  return {
    strength: b?.strength as BindingStrength | undefined,
    valueSet: b?.valueSet,
    description: b?.description,
  };
}

/**
 * Returns true when the binding strength is "open" — i.e. the FHIR spec
 * allows implementers to use codes outside the bound ValueSet.
 *
 * - "required" and "extensible" are closed: the dropdown is normative and no
 *   free-text escape is offered.
 * - "preferred" and "example" are open: the dropdown is a convenience but the
 *   user MUST be able to enter any (system, code, display) they choose.
 */
export function isOpenBinding(strength: BindingStrength | undefined): boolean {
  return strength === "preferred" || strength === "example";
}

export interface ResolvedCode {
  system?: string;
  code: string;
  display?: string;
}

/**
 * Synchronous lookup function for resolving `compose.include.valueSet`
 * references during local expansion. Should return the ValueSet identified by
 * `canonical` (typically pre-fetched via `useValueSet`) or `undefined` when
 * not yet available.
 */
export type ValueSetResolver = (canonical: string) => ValueSet | undefined;

export interface CodesFromValueSetOptions {
  /**
   * Optional lookup for `compose.include.valueSet[]` references. When
   * provided, codes from any referenced ValueSets are merged into the
   * result. Cycles (A → B → A) are short-circuited by tracking seen URLs.
   */
  resolve?: ValueSetResolver;
}

/**
 * Flatten a ValueSet to a list of codes.
 *
 * Prefers `expansion.contains` when the server pre-expanded the ValueSet (via
 * `$expand`). Falls back to `compose.include[].concept[]` when only the
 * definition is available — a minimal local expansion that covers the common
 * case of "enumerated codes inline".
 *
 * Pass `options.resolve` to recursively follow `compose.include.valueSet`
 * references (e.g. by hydrating each canonical via `useValueSet` first and
 * passing a synchronous lookup map). Without it, `include.valueSet` entries
 * are skipped — callers needing full server semantics should call `$expand`
 * on the server.
 */
export function codesFromValueSet(
  vs: ValueSet | undefined,
  options?: CodesFromValueSetOptions,
): ResolvedCode[] {
  if (!vs) return [];
  return collectCodes(vs, options?.resolve, new Set<string>());
}

const collectCodes = (
  vs: ValueSet,
  resolve: ValueSetResolver | undefined,
  seen: Set<string>,
): ResolvedCode[] => {
  if (vs.url) {
    if (seen.has(vs.url)) return []; // cycle guard
    seen.add(vs.url);
  }

  const expanded = vs.expansion?.contains;
  if (expanded && expanded.length > 0) {
    return flattenExpansion(expanded);
  }
  const includes = vs.compose?.include ?? [];
  const out: ResolvedCode[] = [];
  for (const inc of includes) {
    const system = inc.system;
    if (inc.concept) {
      for (const c of inc.concept) {
        if (!c.code) continue;
        out.push({ system, code: c.code, display: c.display });
      }
    }
    if (resolve && inc.valueSet) {
      for (const ref of inc.valueSet) {
        // strip optional `|version` suffix from canonical refs
        const url = ref.split("|")[0]!;
        if (seen.has(url)) continue;
        const target = resolve(url);
        if (!target) continue;
        out.push(...collectCodes(target, resolve, seen));
      }
    }
  }
  return out;
};

interface ExpansionContains {
  system?: string;
  code?: string;
  display?: string;
  contains?: ExpansionContains[];
}

function flattenExpansion(nodes: ExpansionContains[]): ResolvedCode[] {
  const out: ResolvedCode[] = [];
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.shift()!;
    if (node.code) {
      out.push({
        ...(node.system !== undefined ? { system: node.system } : {}),
        code: node.code,
        ...(node.display !== undefined ? { display: node.display } : {}),
      });
    }
    if (node.contains) stack.push(...node.contains);
  }
  return out;
}
