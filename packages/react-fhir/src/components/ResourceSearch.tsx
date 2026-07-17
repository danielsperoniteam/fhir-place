import type {
  CapabilityStatementRestResourceSearchParam,
  CapabilityStatement,
  ElementDefinition,
} from "fhir/r4";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  useCapabilities,
  useSearchParameter,
  useStructureDefinition,
  useValueSet,
} from "../hooks/queries.js";
import type { SearchParams } from "../client/types.js";
import { bindingFor, codesFromValueSet } from "../structure/binding.js";
import {
  joinModifierKey,
  modifiersForType,
  splitModifierKey,
} from "../structure/searchModifiers.js";
import { elementPathForSearchParam } from "../structure/searchBinding.js";
import { clipSearchParamDoc } from "../structure/searchDoc.js";
import { findElement } from "../structure/walker.js";
import { ReferencePicker } from "./ReferencePicker.js";

export interface ResourceSearchProps {
  resourceType: string;
  /** Overrides the server's CapabilityStatement (useful for tests / offline mode). */
  capabilityStatement?: CapabilityStatement;
  initialParams?: Record<string, string>;
  /** Fires on every param change. */
  onChange?: (params: SearchParams) => void;
  /** Fires when the user presses Search (also on Enter in any input). */
  onSubmit?: (params: SearchParams) => void;
  /** Max number of params to show before the "Show all" toggle (default: 6). */
  initialVisible?: number;
  /** Reorders the searchParams list. Params not listed keep their original order after these. */
  priorityParams?: string[];
  className?: string;
  profile?: string;
  /**
   * When provided, an "Ask AI" button appears in the form header. The callback
   * receives the user's natural-language question and should return a map of
   * FHIR search params to fill into the form, or null to handle navigation
   * externally (e.g. when the AI suggests a different resource type).
   */
  onAskAI?: (question: string) => Promise<Record<string, string> | null>;
}

type SpecType = CapabilityStatementRestResourceSearchParam["type"];

/**
 * Value-shape "class" of a modifier. Switching between modifiers of the same
 * class keeps the entered value (`:in` ↔ `:not-in` both take a ValueSet
 * canonical URL); switching classes wipes it so a stale value never rides
 * along with the wrong semantics.
 */
const modifierGrammar = (modifier: string | undefined): string => {
  switch (modifier) {
    case "missing":
      return "boolean";
    case "in":
    case "not-in":
      return "valueset-url";
    case "of-type":
      return "system-code-value";
    case "identifier":
      return "system-value";
    case "text":
      // `:text` matches the display text of a token, not its code.
      return "free-text";
    default:
      // bare param plus code-preserving modifiers (:exact, :contains, :not,
      // :text, :above, :below) all use the param's normal value grammar.
      return "default";
  }
};

const inputPlaceholder = (type: SpecType): string => {
  switch (type) {
    case "token":
      return "code or system|code";
    case "reference":
      return "Type/id";
    case "date":
      return "YYYY-MM-DD  (prefix eq/ne/lt/gt/ge/le/ap)";
    case "number":
      return "123  (prefix eq/ne/lt/gt/ge/le)";
    case "quantity":
      return "123|system|code";
    case "uri":
      return "https://…";
    case "composite":
      return "value$value";
    case "special":
      return "";
    default:
      return "";
  }
};

const inputType = (type: SpecType): string => {
  switch (type) {
    case "uri":
      return "url";
    default:
      return "text";
  }
};

/**
 * Token-field placeholder narrowed by the resolved element. Defaults to the
 * generic `code or system|code` hint, but drops the system half when the
 * element is a primitive that has no system component (e.g. `code`,
 * `boolean`, `uri`) — for those, `system|...` is never valid syntax.
 */
export const tokenPlaceholder = (element: ElementDefinition | undefined): string => {
  const code = element?.type?.[0]?.code;
  switch (code) {
    case "code":
      return "code";
    case "boolean":
      return "true | false";
    case "uri":
    case "url":
    case "canonical":
      return "https://…";
    default:
      return "code or system|code";
  }
};

export function ResourceSearch(props: ResourceSearchProps) {
  const {
    resourceType,
    capabilityStatement,
    initialParams,
    onChange,
    onSubmit,
    initialVisible = 6,
    priorityParams = ["_id", "identifier", "name", "family", "given", "status", "code", "subject", "patient", "date"],
    className,
    profile,
    onAskAI,
  } = props;

  const capQuery = useCapabilities({ enabled: !capabilityStatement });
  const cap = capabilityStatement ?? capQuery.data;

  const params = useMemo(
    () => findSearchParamsForResource(cap, resourceType, priorityParams),
    [cap, resourceType, priorityParams.join("|")], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // `values` is keyed by the BARE param name; active modifiers live in a
  // sibling map and re-join into `name:modifier` keys on submit (#254 PR B).
  // Incoming params (URL hydration, AI fill) may carry modifier'd keys —
  // split them apart here.
  const [values, setValues] = useState<Record<string, string>>(
    () => splitIncomingParams(initialParams ?? {}).values,
  );
  const [modifiers, setModifiers] = useState<Record<string, string>>(
    () => splitIncomingParams(initialParams ?? {}).modifiers,
  );
  // Synchronous mirror of `modifiers` for authoritative reads in event
  // handlers (see setModifier).
  const modifiersRef = useRef(modifiers);
  modifiersRef.current = modifiers;
  const [showAll, setShowAll] = useState(false);
  // Bumped on bulk resets (Clear, AI fill) to remount the field subtree so
  // fields drop local state a `value` transition can't reach — e.g. a prefix
  // parked before any value was entered (review on #732).
  const [resetNonce, setResetNonce] = useState(0);

  const [askQuestion, setAskQuestion] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!askQuestion.trim() || !onAskAI || askLoading) return;
    setAskLoading(true);
    setAskError(null);
    try {
      const result = await onAskAI(askQuestion);
      if (result) {
        const split = splitIncomingParams(result);
        setValues(split.values);
        setModifiers(split.modifiers);
        setResetNonce((n) => n + 1);
        onSubmit?.(buildSearchParams(split.values, split.modifiers));
        setShowAll(true);
        setAskQuestion("");
      }
    } catch (err) {
      setAskError(err instanceof Error ? err.message : String(err));
    } finally {
      setAskLoading(false);
    }
  };

  useEffect(() => {
    onChange?.(buildSearchParams(values, modifiers));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(values), JSON.stringify(modifiers)]);

  const visible = showAll ? params : params.slice(0, initialVisible);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.(buildSearchParams(values, modifiers));
  };

  const setParam = (name: string, val: string) => {
    setValues((prev) => {
      const next = { ...prev };
      if (val === "") delete next[name];
      else next[name] = val;
      return next;
    });
  };

  const setModifier = (name: string, modifier: string) => {
    // Read the previous modifier from a ref mirror rather than the render
    // closure — always current, so rapid changes act on the authoritative
    // state, and without nesting setValues inside the setModifiers updater
    // (review on #732). Wipe the value only when the grammar class actually
    // changes; switching `:in` ↔ `:not-in` (same ValueSet-URL grammar) keeps
    // the URL the user typed.
    const grammarChanged =
      modifierGrammar(modifiersRef.current[name]) !== modifierGrammar(modifier);
    setModifiers((prev) => {
      const next = { ...prev };
      if (modifier === "") delete next[name];
      else next[name] = modifier;
      return next;
    });
    if (grammarChanged) setParam(name, "");
  };

  if (!cap && capQuery.isLoading) {
    return <p className="text-sm text-[var(--text-muted)]">Loading server capabilities…</p>;
  }
  if (params.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No searchable parameters advertised for {resourceType}.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="resource-search"
      className={className ?? "space-y-3 rounded border border-[var(--border)] bg-[var(--surface)] p-3"}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--text)]">
          Search {resourceType}
        </h3>
        <span className="text-xs text-[var(--text-subtle)]">
          {params.length} parameters available
        </span>
      </div>

      {/* Always-visible Ask AI input */}
      {onAskAI && (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input
              type="text"
              value={askQuestion}
              onChange={(e) => setAskQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleAsk(e); } }}
              placeholder={`Ask in plain English… e.g. patients with diabetes over 65`}
              disabled={askLoading}
              className="flex-1 rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent,#3b82f6)] focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={(e) => { void handleAsk(e); }}
              disabled={askLoading || !askQuestion.trim()}
              className="rounded bg-[var(--accent,#2563eb)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {askLoading ? "Generating…" : "Generate filters"}
            </button>
          </div>
          {askError && (
            <p className="text-xs text-[var(--danger,#dc2626)]">{askError}</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((p) => (
          <SearchField
            profile={profile}
            // resetNonce remounts fields on bulk reset so parked local state
            // (e.g. a prefix picked before any value) is dropped.
            key={`${p.name}-${resetNonce}`}
            base={resourceType}
            param={p}
            value={values[p.name!] ?? ""}
            onChange={(v) => setParam(p.name!, v)}
            modifier={modifiers[p.name!] ?? ""}
            onModifier={(m) => setModifier(p.name!, m)}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        {params.length > initialVisible ? (
          <button
            type="button"
            className="text-xs text-[var(--text-muted)] underline"
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll
              ? `Hide ${params.length - initialVisible} extras`
              : `Show ${params.length - initialVisible} more parameters`}
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            data-testid="search-clear"
            onClick={() => {
              setValues({});
              setModifiers({});
              setResetNonce((n) => n + 1);
              // Clear is a "wipe and reload" affordance: also fire onSubmit so
              // the parent's active query resets without requiring a second
              // click on Search.
              onSubmit?.({});
            }}
            className="rounded border border-[var(--border)] bg-[var(--sunken)] px-3 py-1 text-sm text-[var(--text)] hover:bg-[var(--surface)]"
          >
            Clear
          </button>
          <button
            type="submit"
            data-testid="search-submit"
            className="rounded bg-[var(--accent,#2563eb)] px-3 py-1 text-sm font-medium text-white shadow-sm hover:opacity-90"
          >
            Search
          </button>
        </div>
      </div>
    </form>
  );
}

interface SearchFieldProps {
  profile?: string;
  base: string;
  param: CapabilityStatementRestResourceSearchParam;
  value: string;
  onChange: (v: string) => void;
  /** Active modifier for this param ("" = none). Optional for sub-fields. */
  modifier?: string;
  onModifier?: (m: string) => void;
}

/**
 * Shared label/doc shell. When the param's type admits modifiers and the
 * caller wired `onModifier`, a compact modifier select renders next to the
 * type pill (#254 PR B) — options narrowed per FHIR type so invalid
 * combinations (e.g. `string:not`) can't be built.
 */
const fieldWrapper = (
  children: ReactNode,
  param: CapabilityStatementRestResourceSearchParam,
  base: string,
  modifier?: string,
  onModifier?: (m: string) => void,
  /** Overrides the per-type modifier list (token fields narrow it by the
   *  resolved element type — e.g. `:of-type` only on Identifier-backed). */
  availableModifiers?: readonly string[],
): ReactNode => {
  const doc = clipSearchParamDoc(param.documentation, base);
  const available = onModifier ? availableModifiers ?? modifiersForType(param.type) : [];
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-[var(--text-muted)]">{param.name}</span>
        <span className="flex items-baseline gap-1.5">
          {available.length > 0 && (
            <select
              aria-label={`${param.name} modifier`}
              data-testid={`search-modifier-${param.name}`}
              value={modifier ?? ""}
              // Inside a <label>, a click would toggle focus back to the
              // first input — stop it from bubbling into label behavior.
              onClick={(e) => e.preventDefault()}
              onChange={(e) => onModifier?.(e.target.value)}
              className="rounded border border-[var(--border)] bg-[var(--sunken)] px-1 py-0 text-[10px] text-[var(--text-muted)] focus:border-[var(--accent,#3b82f6)] focus:outline-none"
            >
              <option value="">modifier…</option>
              {available.map((m) => (
                <option key={m} value={m}>
                  :{m}
                </option>
              ))}
            </select>
          )}
          <span className="text-[10px] uppercase text-[var(--text-subtle)]">{param.type}</span>
        </span>
      </span>
      {children}
      {doc && (
        <span className="mt-0.5 block text-[11px] text-[var(--text-subtle)]">{doc}</span>
      )}
    </label>
  );
};

function SearchField({
  base,
  param,
  value,
  onChange,
  profile,
  modifier,
  onModifier,
}: SearchFieldProps): ReactNode {
  // `:missing` takes true/false regardless of the param's type — swap the
  // type-specific input for a uniform boolean select while it's active.
  if (modifier === "missing") {
    return fieldWrapper(
      <select
        aria-label={param.name}
        data-testid={`search-value-${param.name}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-sm text-[var(--text)] shadow-sm focus:border-[var(--accent,#3b82f6)] focus:outline-none"
      >
        <option value="">—</option>
        <option value="true">missing (element absent)</option>
        <option value="false">present (element populated)</option>
      </select>,
      param,
      base,
      modifier,
      onModifier,
    );
  }
  if (param.type === "token") {
    return (
      <TokenSearchField base={base} param={param} value={value} onChange={onChange} profile={profile} modifier={modifier} onModifier={onModifier} />
    );
  }
  if (param.type === "date") {
    return <DateSearchField base={base} param={param} value={value} onChange={onChange} profile={profile} modifier={modifier} onModifier={onModifier} />;
  }
  if (param.type === "number" || param.type === "quantity") {
    return <PrefixedValueField base={base} param={param} value={value} onChange={onChange} profile={profile} modifier={modifier} onModifier={onModifier} />;
  }
  if (param.type === "reference") {
    return (
      <ReferenceSearchField base={base} param={param} value={value} onChange={onChange} modifier={modifier} onModifier={onModifier} />
    );
  }
  return fieldWrapper(
    <input
      type={inputType(param.type)}
      aria-label={param.name}
      data-testid={`search-value-${param.name}`}
      placeholder={inputPlaceholder(param.type)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-sm text-[var(--text)] shadow-sm focus:border-[var(--accent,#3b82f6)] focus:outline-none"
    />,
    param,
    base,
    modifier,
    onModifier,
  );
}

/**
 * Token search field: look up the bound ValueSet via the spec (convention
 * mapping name → element → binding) and render a <select> when available.
 * Falls back to a plain text input when the binding can't be resolved or when
 * the ValueSet is too large to enumerate in a dropdown.
 */
/**
 * Token modifiers whose value is NOT a plain code, so the bounded code
 * <select> can't express them — swap to free text. `:in`/`:not-in` take a
 * ValueSet canonical URL, `:of-type` takes `system|code|value`, `:text`
 * matches the token's display text.
 */
const TOKEN_FREE_GRAMMAR_MODIFIERS = new Set(["in", "not-in", "of-type", "text"]);

/** Token target `type.code`s that carry a code system, so subsumption and
 *  ValueSet-membership modifiers apply. Everything else (Identifier,
 *  ContactPoint, boolean, id, …) is a non-coded token. */
const CODED_TOKEN_TYPES = new Set(["code", "Coding", "CodeableConcept"]);

/** Modifiers FHIR R4 restricts to coded token targets: `:above`/`:below`
 *  (subsumption) and `:in`/`:not-in` (ValueSet membership). */
const CODED_ONLY_TOKEN_MODIFIERS = new Set(["above", "below", "in", "not-in"]);

const tokenModifierPlaceholder = (modifier: string): string => {
  if (modifier === "of-type") return "system|code|value";
  if (modifier === "text") return "display text";
  return "ValueSet canonical URL";
};

function TokenSearchField({ base, param, value, onChange, profile, modifier, onModifier }: SearchFieldProps): ReactNode {
  // Try the canonical SearchParameter first (covers custom IG params and the
  // few core params whose `expression` doesn't match the kebab→camel rule).
  // Falls through silently when the server doesn't expose SearchParameter.
  const { data: spec } = useSearchParameter(base, param.name ?? "");
  const elementPath = elementPathForSearchParam(param, base, spec ?? undefined);
  const { data: sd } = useStructureDefinition({ type: base, profile }, { enabled: Boolean(elementPath) });
  const element = elementPath && sd ? findElement(sd, elementPath) : undefined;
  const { valueSet: valueSetUrl } = bindingFor(element);
  const { data: vs, isLoading } = useValueSet(valueSetUrl);
  const codes = codesFromValueSet(vs);

  // FHIR R4 limits `:of-type` to token params backed by an Identifier — drop
  // it for code/CodeableConcept tokens (gender, status, _id, …). When the
  // element can't be resolved we can't confirm Identifier backing, so we
  // stay conservative and hide it (Codex review on #732).
  const isIdentifierBacked = element?.type?.some((t) => t.code === "Identifier") ?? false;
  // Subsumption (`:above`/`:below`) and ValueSet membership (`:in`/`:not-in`)
  // only apply to *coded* token targets. A token that resolves to a non-coded
  // type (Identifier, ContactPoint, boolean, …) — or the opaque-id `_id` param
  // — can't use them, and a server would reject the query. Narrow those out
  // when we can positively tell the target isn't coded; stay permissive when
  // the element can't be resolved, so a coded param with no published SD keeps
  // its full menu (Codex review on #732).
  const isCodedToken =
    element?.type?.some((t) => CODED_TOKEN_TYPES.has(t.code)) ?? false;
  const isNonCodedToken =
    param.name === "_id" || (element !== undefined && !isCodedToken);
  let tokenModifiers = modifiersForType("token");
  if (!isIdentifierBacked) {
    tokenModifiers = tokenModifiers.filter((m) => m !== "of-type");
  }
  if (isNonCodedToken) {
    tokenModifiers = tokenModifiers.filter((m) => !CODED_ONLY_TOKEN_MODIFIERS.has(m));
  }

  // Narrowing the *menu* stops a user picking an invalid modifier, but one can
  // still be active from URL hydration (`_id:in=…`) or because the element
  // metadata resolved *after* selection and narrowed the set. Left in place the
  // select shows blank while `buildSearchParams` still submits the hidden
  // criterion — the exact invalid query the narrowing exists to prevent. Clear
  // it; `onModifier("")` → `setModifier` also drops the incompatible value on
  // the grammar change (Codex review on #732).
  const modifierUnavailable =
    Boolean(modifier) && !tokenModifiers.includes(modifier as string);
  useEffect(() => {
    if (modifierUnavailable) onModifier?.("");
  }, [modifierUnavailable, onModifier]);

  const wrap = (children: ReactNode): ReactNode =>
    fieldWrapper(children, param, base, modifier, onModifier, tokenModifiers);

  // `:in`/`:not-in`/`:of-type` change the value grammar entirely — the
  // bounded code select would submit a bare code where a canonical URL or
  // triple is required (Codex review on #732).
  if (modifier && TOKEN_FREE_GRAMMAR_MODIFIERS.has(modifier)) {
    return wrap(
      <input
        type="text"
        aria-label={param.name}
        data-testid={`search-value-${param.name}`}
        placeholder={tokenModifierPlaceholder(modifier)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-sm text-[var(--text)] shadow-sm focus:border-[var(--accent,#3b82f6)] focus:outline-none"
      />,
    );
  }

  const fallbackInput = (
    <input
      type="text"
      aria-label={param.name}
      data-testid={`search-value-${param.name}`}
      placeholder={tokenPlaceholder(element)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-sm text-[var(--text)] shadow-sm focus:border-[var(--accent,#3b82f6)] focus:outline-none"
    />
  );

  if (valueSetUrl && isLoading) {
    return wrap(
      <input
        type="text"
        aria-label={param.name}
        data-testid={`search-value-${param.name}`}
        value={value}
        readOnly
        placeholder="Loading value set…"
        className="w-full rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-sm text-[var(--text)] shadow-sm"
      />,
    );
  }

  if (codes.length === 0 || codes.length > 100) {
    return wrap(fallbackInput);
  }

  return wrap(
    <select
      aria-label={param.name}
      data-testid={`search-value-${param.name}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-sm text-[var(--text)] shadow-sm focus:border-[var(--accent,#3b82f6)] focus:outline-none"
    >
      <option value="">—</option>
      {codes.map((c) => (
        <option key={c.code} value={c.code}>
          {c.display ? `${c.display} (${c.code})` : c.code}
        </option>
      ))}
    </select>,
  );
}

/* ---------- reference ---------- */

/**
 * Reference search field. Renders the raw `Type/id` text input — always
 * editable so users who already know the id can paste it directly — and
 * pairs it with a {@link ReferencePicker} for name-based lookup. Picking a
 * result populates the text input; the input value is what gets submitted
 * with the search.
 *
 * Targets come from `SearchParameter.target` when the server exposes them;
 * for the common single-target params used in clinical apps (`patient`,
 * `practitioner`, etc.) we fall back to a baked-in mapping so the picker
 * still works against servers that don't surface SearchParameter. When no
 * targets can be derived we drop the picker and keep just the text input.
 */
function ReferenceSearchField({ base, param, value, onChange, modifier, onModifier }: SearchFieldProps): ReactNode {
  const { data: spec } = useSearchParameter(base, param.name ?? "");

  const targets = useMemo(() => {
    const fromSpec = (spec?.target ?? []).filter(Boolean);
    if (fromSpec.length > 0) return fromSpec;
    return defaultReferenceTargets(param.name ?? "");
  }, [spec, param.name]);

  const textInput = (
    <input
      type="text"
      aria-label={param.name}
      data-testid={`search-value-${param.name}`}
      placeholder={modifier === "identifier" ? "system|value" : inputPlaceholder(param.type)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-sm text-[var(--text)] shadow-sm focus:border-[var(--accent,#3b82f6)] focus:outline-none"
    />
  );

  // `:identifier` matches on Identifier token syntax (`system|value`), not a
  // `Type/id` reference — the lookup picker would store the wrong shape
  // (Codex review on #732), so drop it while that modifier is active.
  if (targets.length === 0 || modifier === "identifier") {
    return fieldWrapper(textInput, param, base, modifier, onModifier);
  }

  return fieldWrapper(
    <div className="space-y-1.5">
      {textInput}
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-[var(--text-subtle)]">
        <span className="h-px flex-1 bg-[var(--border)]" />
        <span>or look up</span>
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>
      <ReferencePicker
        targets={targets}
        // Always undefined so the picker stays in search mode; the raw text
        // input above is the authoritative value the form submits.
        value={undefined}
        onChange={(r) => {
          if (r?.reference) onChange(r.reference);
        }}
        className="relative space-y-2"
      />
    </div>,
    param,
    base,
    modifier,
    onModifier,
  );
}

/**
 * Fallback targets for reference search params whose name is conventionally
 * tied to a single resource type. Keeps the picker useful when the server
 * doesn't expose `SearchParameter.target`. Conservative on purpose: only
 * params with one near-universal target are listed.
 */
function defaultReferenceTargets(name: string): string[] {
  switch (name) {
    case "patient":
      return ["Patient"];
    case "practitioner":
      return ["Practitioner"];
    case "organization":
      return ["Organization"];
    case "location":
      return ["Location"];
    case "encounter":
      return ["Encounter"];
    default:
      return [];
  }
}

/* ---------- date ---------- */

type DatePrefix = "eq" | "ne" | "lt" | "le" | "gt" | "ge" | "ap" | "sa" | "eb";

interface DatePrefixOption {
  value: DatePrefix | "";
  label: string;
  title: string;
}

const DATE_PREFIXES: DatePrefixOption[] = [
  { value: "", label: "=", title: "equals (default)" },
  { value: "eq", label: "=", title: "equals" },
  { value: "ne", label: "≠", title: "not equal" },
  { value: "lt", label: "<", title: "less than" },
  { value: "le", label: "≤", title: "less than or equal" },
  { value: "gt", label: ">", title: "greater than" },
  { value: "ge", label: "≥", title: "greater than or equal" },
  { value: "ap", label: "~", title: "approximately" },
  { value: "sa", label: "sa", title: "starts after (period param)" },
  { value: "eb", label: "eb", title: "ends before (period param)" },
];

/**
 * The comparator set without the range boundaries `sa`/`eb`. Used for numeric
 * params (matches `NumberPrefix` in client/searchBuilder) and for scalar
 * date/dateTime targets, which — unlike Period/Timing targets — can't use the
 * boundary comparators either.
 */
const NUMERIC_PREFIXES: DatePrefixOption[] = DATE_PREFIXES.filter(
  (p) => p.value !== "sa" && p.value !== "eb",
);
const SCALAR_DATE_PREFIXES = NUMERIC_PREFIXES;

/** Date-search target element types that cover a range, so `sa`/`eb` apply. */
const RANGE_DATE_TYPES = new Set(["Period", "Timing", "Range"]);

/**
 * Date prefix options for a param: the full set (with `sa`/`eb`) only when the
 * target element covers a range (Period/Timing/Range); otherwise the scalar set.
 */
export function datePrefixOptions(targetsRange: boolean): DatePrefixOption[] {
  return targetsRange ? DATE_PREFIXES : SCALAR_DATE_PREFIXES;
}

/**
 * Numeric prefix options intersected with a server-advertised comparator list.
 * `undefined` (the SearchParameter didn't advertise `comparator`) keeps the full
 * numeric set; an advertised list narrows to it (an empty list leaves only the
 * `=` default, i.e. no comparator support). The `=` default is always kept.
 */
export function numericPrefixOptions(
  advertised: readonly string[] | undefined,
): DatePrefixOption[] {
  if (!Array.isArray(advertised)) return NUMERIC_PREFIXES;
  const set = new Set(advertised);
  return NUMERIC_PREFIXES.filter((p) => p.value === "" || set.has(p.value));
}

type DateSearchFieldProps = SearchFieldProps;

/**
 * FHIR date search field: a prefix selector (eq/ne/lt/gt/ge/le/ap) paired with
 * a native date picker. Parses the incoming `value` so the two controls stay
 * in sync with whatever the parent holds — e.g. `ge2024-01-01` splits into
 * prefix="ge" + date="2024-01-01".
 */
function DateSearchField({ base, param, value, onChange, profile, modifier, onModifier }: DateSearchFieldProps): ReactNode {
  const match = value.match(/^(eq|ne|lt|le|gt|ge|ap|sa|eb)?(\d{4}-\d{2}-\d{2})?$/);
  const date = match?.[2] ?? "";
  // A prefix picked before any date exists can't live in `value` (a bare
  // "ge" is not a submittable date) — park it locally so prefix-then-date
  // ordering works, and let a parsed prefix from the value win once set.
  const [pendingPrefix, setPendingPrefix] = useState<DatePrefix | "">("");
  const prefix = ((match?.[1] as DatePrefix | undefined) ?? (date ? "" : pendingPrefix));

  // `sa` (starts-after) / `eb` (ends-before) are boundary comparators — they
  // only mean something when the target element covers a range (a Period or
  // Timing), e.g. `Encounter.date` → `Encounter.period`. On a scalar
  // date/dateTime target (`Patient.birthdate`, …) they submit a query the
  // server can't satisfy, so offer them only when we can confirm range backing.
  // Conservative when the element can't be resolved — mirrors the token gates
  // (Codex review on #732).
  const { data: spec } = useSearchParameter(base, param.name ?? "");
  const elementPath = elementPathForSearchParam(param, base, spec ?? undefined);
  const { data: sd } = useStructureDefinition({ type: base, profile }, { enabled: Boolean(elementPath) });
  const element = elementPath && sd ? findElement(sd, elementPath) : undefined;
  const targetsRange = element?.type?.some((t) => RANGE_DATE_TYPES.has(t.code)) ?? false;
  const datePrefixes = datePrefixOptions(targetsRange);

  // External clears (form Clear, AI replacing criteria) empty `value`
  // without going through commit — drop the parked prefix with it so it
  // doesn't silently reattach to the next date. The park case (prefix
  // picked while value was already "") never transitions the prop, so this
  // effect doesn't fire for it.
  useEffect(() => {
    if (value === "") setPendingPrefix("");
  }, [value]);

  // A prefix hydrated from the URL (`birthdate=sa2000-01-01`) that this target
  // doesn't offer would leave the select blank while the value still submits
  // it — strip it back to a plain date so the query stays valid.
  const prefixOffered = datePrefixes.some((p) => p.value === prefix);
  useEffect(() => {
    if (prefix && !prefixOffered && date) onChange(date);
  }, [prefix, prefixOffered, date, onChange]);

  const commit = (nextPrefix: string, nextDate: string) => {
    setPendingPrefix(nextPrefix as DatePrefix | "");
    if (!nextDate) return onChange("");
    onChange(`${nextPrefix}${nextDate}`);
  };

  return fieldWrapper(
    <div className="flex gap-1">
      <select
        aria-label={`${param.name} prefix`}
        data-testid={`search-prefix-${param.name}`}
        value={prefix}
        onChange={(e) => commit(e.target.value, date)}
        className="rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-sm text-[var(--text)] shadow-sm focus:border-[var(--accent,#3b82f6)] focus:outline-none"
      >
        {datePrefixes.map((p) => (
          <option key={`${p.value}-${p.label}`} value={p.value} title={p.title}>
            {p.label}
          </option>
        ))}
      </select>
      <input
        type="date"
        aria-label={param.name}
        data-testid={`search-value-${param.name}`}
        value={date}
        onChange={(e) => commit(prefix, e.target.value)}
        className="w-full rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-sm text-[var(--text)] shadow-sm focus:border-[var(--accent,#3b82f6)] focus:outline-none"
      />
    </div>,
    param,
    base,
    modifier,
    onModifier,
  );
}

/* ---------- number / quantity ---------- */

/**
 * Number and quantity search field (#254 PR B): the numeric prefix
 * vocabulary (`eq/ne/lt/le/gt/ge/ap` — `sa`/`eb` are range comparators and
 * date-only) in front of a free-value input — `gt` +
 * `5.4|http://unitsofmeasure.org|mg` round-trips as `gt5.4|…|mg`.
 */
function PrefixedValueField({
  base,
  param,
  value,
  onChange,
  modifier,
  onModifier,
}: SearchFieldProps): ReactNode {
  const match = value.match(/^(eq|ne|lt|le|gt|ge|ap)?(.*)$/);
  const rest = match?.[2] ?? "";
  // See DateSearchField: park a prefix picked before any value exists.
  const [pendingPrefix, setPendingPrefix] = useState<DatePrefix | "">("");
  const prefix = ((match?.[1] as DatePrefix | undefined) ?? (rest ? "" : pendingPrefix));

  // A server's `SearchParameter.comparator` names the comparators it supports;
  // an empty/absent list means clients shouldn't expect any. When it's
  // advertised, intersect the menu with it so the form can't offer a comparator
  // (e.g. `ap`) the server would reject. Absent → keep the full numeric set
  // (Codex review on #732).
  const { data: spec } = useSearchParameter(base, param.name ?? "");
  const numericPrefixes = numericPrefixOptions(spec?.comparator);

  // See DateSearchField: external clears also drop the parked prefix.
  useEffect(() => {
    if (value === "") setPendingPrefix("");
  }, [value]);

  // See DateSearchField: a hydrated prefix the server doesn't advertise is
  // stripped back to a bare value so the query stays valid.
  const prefixOffered = numericPrefixes.some((p) => p.value === prefix);
  useEffect(() => {
    if (prefix && !prefixOffered && rest) onChange(rest);
  }, [prefix, prefixOffered, rest, onChange]);

  const commit = (nextPrefix: string, nextValue: string) => {
    setPendingPrefix(nextPrefix as DatePrefix | "");
    if (!nextValue) return onChange("");
    onChange(`${nextPrefix}${nextValue}`);
  };

  return fieldWrapper(
    <div className="flex gap-1">
      <select
        aria-label={`${param.name} prefix`}
        data-testid={`search-prefix-${param.name}`}
        value={prefix}
        onChange={(e) => commit(e.target.value, rest)}
        className="rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-sm text-[var(--text)] shadow-sm focus:border-[var(--accent,#3b82f6)] focus:outline-none"
      >
        {numericPrefixes.map((p) => (
          <option key={`${p.value}-${p.label}`} value={p.value} title={p.title}>
            {p.label}
          </option>
        ))}
      </select>
      <input
        type="text"
        aria-label={param.name}
        data-testid={`search-value-${param.name}`}
        placeholder={param.type === "quantity" ? "123|system|code" : "123"}
        value={rest}
        onChange={(e) => commit(prefix, e.target.value)}
        className="w-full rounded border border-[var(--border)] bg-[var(--sunken)] px-2 py-1 text-sm text-[var(--text)] shadow-sm focus:border-[var(--accent,#3b82f6)] focus:outline-none"
      />
    </div>,
    param,
    base,
    modifier,
    onModifier,
  );
}

/** Extract the searchParam list for a given resource type from a CapabilityStatement. */
export function findSearchParamsForResource(
  cap: CapabilityStatement | undefined,
  resourceType: string,
  priority: string[] = [],
): CapabilityStatementRestResourceSearchParam[] {
  if (!cap) return [];
  const server = cap.rest?.find((r) => r.mode === "server") ?? cap.rest?.[0];
  const resource = server?.resource?.find((r) => r.type === resourceType);
  const params = (resource?.searchParam ?? []).filter((p) => p.name && p.name !== "_count");
  if (priority.length === 0) return params;
  const rank = new Map(priority.map((p, i) => [p, i]));
  return [...params].sort((a, b) => {
    const ai = rank.get(a.name!) ?? Number.POSITIVE_INFINITY;
    const bi = rank.get(b.name!) ?? Number.POSITIVE_INFINITY;
    if (ai === bi) return (a.name ?? "").localeCompare(b.name ?? "");
    return ai - bi;
  });
}

/**
 * Split incoming params (URL hydration, AI fill) into bare-name values and
 * their modifiers: `{ "given:exact": "Ada" }` → values `{ given: "Ada" }`,
 * modifiers `{ given: "exact" }`. Chained keys pass through untouched.
 *
 * The form is one editable input per param (the #254 v0 limit); when a URL
 * carries two variants of the same base name (`name=Smith` + `name:exact`),
 * the last one wins in the form. The underlying query still runs every
 * pasted criterion — `paramsFromUrl` preserves repeated keys — until the
 * user edits and re-submits.
 */
const splitIncomingParams = (
  incoming: Record<string, string>,
): {
  values: Record<string, string>;
  modifiers: Record<string, string>;
} => {
  const values: Record<string, string> = {};
  const modifiers: Record<string, string> = {};
  for (const [key, v] of Object.entries(incoming)) {
    const { name, modifier } = splitModifierKey(key);
    values[name] = v;
    if (modifier) modifiers[name] = modifier;
    else delete modifiers[name];
  }
  return { values, modifiers };
};

const buildSearchParams = (
  values: Record<string, string>,
  modifiers: Record<string, string> = {},
): SearchParams => {
  const out: SearchParams = {};
  for (const [k, v] of Object.entries(values)) {
    if (v !== "" && v !== undefined) out[joinModifierKey(k, modifiers[k])] = v;
  }
  return out;
};
