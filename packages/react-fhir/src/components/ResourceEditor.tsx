import type {
  ElementDefinition,
  ElementDefinitionType,
  Observation,
  Patient,
  Resource,
  StructureDefinition,
} from "fhir/r4";
import { UcumLhcUtils } from "@lhncbc/ucum-lhc";
import { Fragment, useCallback, useMemo, useState, type ReactNode } from "react";
import { useStructureDefinition } from "../hooks/queries.js";
import {
  directChildren,
  isUcumQuantity,
  pathGet,
  pathRemove,
  pathSet,
  prune,
  type Path,
} from "../structure/index.js";
import {
  defaultPathInputs,
  defaultTypeInputs,
  JsonFallbackInput,
  type FhirTypeInput,
  type PathInputs,
  type TypeInputs,
} from "./inputs/index.js";
import { resourceEditorClinicalSafetyGuardrailFor } from "./clinicalSafetyGuardrails.js";

export interface ResourceEditorProps {
  resource: Resource;
  structureDefinition?: StructureDefinition;
  /** Called with the latest draft on every keystroke. */
  onChange?: (draft: Resource) => void;
  /** Called on Save. Draft is `prune()`-d of empty values before handoff. */
  onSave?: (draft: Resource) => void | Promise<void>;
  onCancel?: () => void;
  /** Override input components by FHIR datatype code. */
  inputs?: TypeInputs;
  /** Override input components by full ElementDefinition path (e.g. "Observation.dataAbsentReason"). Wins over `inputs`. */
  pathInputs?: PathInputs;
  saveLabel?: string;
  /** When true, the Save button shows a spinner and becomes disabled. */
  saving?: boolean;
  className?: string;
  profile?: string | null;
}

const capitalize = (s: string): string => (s ? s[0]!.toUpperCase() + s.slice(1) : s);

const labelFromPath = (path: string, short?: string): string => {
  if (short && short.length <= 40 && !short.includes("|") && !short.includes(".")) {
    return short;
  }
  const last = path.split(".").pop() ?? path;
  return last
    .replace(/\[x\]$/, "")
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
};

const isArrayCardinality = (el: ElementDefinition): boolean => {
  const max = el.max;
  if (!max) return false;
  if (max === "*") return true;
  const n = Number.parseInt(max, 10);
  return Number.isFinite(n) && n > 1;
};

/**
 * Elements we skip by default. `id` / `meta` are server-managed;
 * extension / modifierExtension / contained are easier to handle with
 * dedicated flows than with a generic form.
 */
const skipKeys = new Set([
  "id",
  "meta",
  "implicitRules",
  "language",
  "extension",
  "modifierExtension",
  "contained",
]);

interface ResourceEditorFieldError {
  path: Path;
  message: string;
}

type ResourceEditorClinicalSafetyGuardrail = (
  draft: Resource,
) => ResourceEditorFieldError[];

const pathKey = (path: Path): string => path.join(".");

const isValidUcumCode = (code: string): boolean =>
  UcumLhcUtils.getInstance().validateUnitString(code, false).status === "valid";

const observationValueQuantityUcumCodeGuardrail: ResourceEditorClinicalSafetyGuardrail = (
  draft,
) => {
  if (draft.resourceType !== "Observation") return [];
  const quantity = (draft as Observation).valueQuantity;
  // A code is only a UCUM code when the system says so (or is absent —
  // FHIR's implicit default). Site-specific systems scope their own codes
  // and must not be rejected by the UCUM validator.
  if (quantity && !isUcumQuantity(quantity)) return [];
  const code = quantity?.code?.trim();
  if (!code || isValidUcumCode(code)) return [];
  return [
    {
      path: ["valueQuantity"],
      message: `valueQuantity.code "${code}" is not a valid UCUM code; this is a developer-tool warning, not clinical decision support.`,
    },
  ];
};

// A new Patient with no name and no identifier is unfindable once created
// (#588). Only applies to creates (no id yet): servers can legitimately hold
// anonymized patients, and editing those must stay possible. Path [] marks
// this as a form-level error rendered in the footer banner rather than next
// to a specific input (an empty form has no inputs to anchor to).
const patientIdentityGuardrail: ResourceEditorClinicalSafetyGuardrail = (draft) => {
  if (draft.resourceType !== "Patient" || draft.id) return [];
  const patient = draft as Patient;
  // Whitespace-only strings and identifiers with only a `system` don't make
  // the Patient findable — require a real identifier value or name component.
  const hasText = (s: string | undefined): boolean => Boolean(s?.trim());
  const hasIdentifier = (patient.identifier ?? []).some((i) => hasText(i.value));
  const hasName = (patient.name ?? []).some(
    (n) => hasText(n.text) || hasText(n.family) || (n.given ?? []).some(hasText),
  );
  if (hasIdentifier || hasName) return [];
  return [
    {
      path: [],
      message:
        "This Patient has no identifying information — add at least a name or an identifier before saving.",
    },
  ];
};

export const RESOURCE_EDITOR_CLINICAL_SAFETY_GUARDRAILS: readonly ResourceEditorClinicalSafetyGuardrail[] = [
  observationValueQuantityUcumCodeGuardrail,
  patientIdentityGuardrail,
];

export function ResourceEditor(props: ResourceEditorProps) {
  const { resource, structureDefinition, onChange, onSave, onCancel, profile } = props;
  const detectedProfile = profile === undefined ? resource.meta?.profile?.[0] : profile;
  const [draft, setDraft] = useState<Resource>(resource);
  const [fieldErrors, setFieldErrors] = useState<Map<string, string>>(() => new Map());
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const sdQuery = useStructureDefinition({ type: resource.resourceType, profile: detectedProfile }, {
    enabled: !structureDefinition,
  });
  const sd = structureDefinition ?? sdQuery.data;

  const inputs = useMemo(
    () => ({ ...defaultTypeInputs, ...props.inputs }),
    [props.inputs],
  );
  const pathInputs = useMemo(
    () => ({ ...defaultPathInputs, ...props.pathInputs }),
    [props.pathInputs],
  );
  const guardrail = resourceEditorClinicalSafetyGuardrailFor(resource.resourceType);

  const setAt = useCallback(
    (path: Path, value: unknown) => {
      setDraft((prev) => {
        const prevObj = prev as unknown as Record<string, unknown>;
        const next =
          value === undefined
            ? pathRemove(prevObj, path)
            : pathSet(prevObj, path, value);
        const asResource = next as unknown as Resource;
        setFieldErrors((prevErrors) => {
          if (prevErrors.size === 0) return prevErrors;
          const nextErrors = new Map(prevErrors);
          nextErrors.delete(pathKey(path));
          return nextErrors;
        });
        setFormErrors((prev) => (prev.length === 0 ? prev : []));
        onChange?.(asResource);
        return asResource;
      });
    },
    [onChange],
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSave) return;
    const pruned = prune(draft);
    const errors = RESOURCE_EDITOR_CLINICAL_SAFETY_GUARDRAILS.flatMap((guardrail) =>
      guardrail(pruned),
    );
    if (errors.length > 0) {
      const atField = errors.filter((error) => error.path.length > 0);
      setFieldErrors(new Map(atField.map((error) => [pathKey(error.path), error.message])));
      setFormErrors(errors.filter((error) => error.path.length === 0).map((e) => e.message));
      return;
    }
    setFieldErrors(new Map());
    setFormErrors([]);
    await onSave(pruned);
  };

  if (!sd) {
    if (sdQuery.isError) {
      return (
        <p className="text-sm text-[var(--danger,#dc2626)]">
          Failed to load StructureDefinition: {sdQuery.error?.message}
        </p>
      );
    }
    return <p className="text-sm text-[var(--text-muted,#64748b)]">Loading {resource.resourceType} structure…</p>;
  }

  return (
    <form
      className={props.className ?? "space-y-4"}
      onSubmit={onSubmit}
      data-testid="resource-editor"
    >
      <header className="flex items-baseline gap-2 border-b border-[var(--border,#e2e8f0)] pb-2">
        <h2 className="text-lg font-semibold">
          {draft.id ? `Edit ${draft.resourceType}` : `New ${draft.resourceType}`}
        </h2>
        {draft.id && (
          <code className="rounded bg-[var(--chip,#f1f5f9)] px-1 py-0.5 text-xs">{draft.id}</code>
        )}
      </header>

      {guardrail && (
        <aside
          className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
          data-testid="resource-editor-clinical-safety-guardrail"
        >
          <p className="font-medium">{guardrail.title}</p>
          <p className="mt-1">{guardrail.warning}</p>
          <p className="mt-1 text-xs">
            Fields:{" "}
            {guardrail.fields.map((field, index) => (
              <Fragment key={field}>
                {index > 0 ? ", " : null}
                <code>{field}</code>
              </Fragment>
            ))}
          </p>
        </aside>
      )}

      <FieldGroup
        sd={sd}
        parentPath={sd.type!}
        pathPrefix={[]}
        draft={draft as unknown as Record<string, unknown>}
        inputs={inputs}
        pathInputs={pathInputs}
        fieldErrors={fieldErrors}
        setAt={setAt}
      />

      {formErrors.length > 0 && (
        <div
          role="alert"
          data-testid="resource-editor-form-error"
          className="rounded border border-[var(--warn,#fcd34d)] bg-[var(--warn-soft,#fffbeb)] p-3 text-sm text-[var(--warn,#92400e)]"
        >
          {formErrors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <div className="flex justify-end gap-2 border-t border-[var(--border,#e2e8f0)] pt-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-[var(--border-strong,#cbd5e1)] bg-[var(--surface,#ffffff)] px-3 py-1.5 text-sm hover:bg-[var(--sunken,#f8fafc)]"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={props.saving}
          className="rounded bg-[var(--accent,#2563eb)] px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {props.saving ? "Saving…" : (props.saveLabel ?? "Save")}
        </button>
      </div>
    </form>
  );
}

interface FieldGroupProps {
  sd: StructureDefinition;
  parentPath: string;
  pathPrefix: Path;
  draft: Record<string, unknown>;
  inputs: TypeInputs;
  pathInputs: PathInputs;
  fieldErrors: Map<string, string>;
  setAt: (path: Path, value: unknown) => void;
}

function FieldGroup({
  sd,
  parentPath,
  pathPrefix,
  draft,
  inputs,
  pathInputs,
  fieldErrors,
  setAt,
}: FieldGroupProps): ReactNode {
  const children = directChildren(sd, parentPath).filter((el) => {
    const relative = (el.path ?? "").slice(parentPath.length + 1);
    if (relative === "") return false;
    const key = relative.replace(/\[x\]$/, "");
    return !skipKeys.has(key);
  });

  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-[minmax(8rem,1fr)_3fr]">
      {children.map((el) => (
        <Field
          key={el.path}
          sd={sd}
          parentPath={parentPath}
          element={el}
          pathPrefix={pathPrefix}
          draft={draft}
          inputs={inputs}
          pathInputs={pathInputs}
          fieldErrors={fieldErrors}
          setAt={setAt}
        />
      ))}
    </div>
  );
}

interface FieldProps extends FieldGroupProps {
  element: ElementDefinition;
}

function Field({
  sd,
  parentPath,
  element,
  pathPrefix,
  draft,
  inputs,
  pathInputs,
  fieldErrors,
  setAt,
}: FieldProps): ReactNode {
  const path = element.path!;
  const relative = path.slice(parentPath.length + 1);
  const label = labelFromPath(path, element.short);
  const isChoice = relative.endsWith("[x]");

  if (isChoice) {
    return (
      <ChoiceField
        sd={sd}
        element={element}
        relative={relative}
        pathPrefix={pathPrefix}
        label={label}
        draft={draft}
        inputs={inputs}
        pathInputs={pathInputs}
        fieldErrors={fieldErrors}
        setAt={setAt}
      />
    );
  }

  const fullPath: Path = [...pathPrefix, relative];
  const typeCode = element.type?.[0]?.code;
  const array = isArrayCardinality(element);
  const currentValue = pathGet(draft, fullPath);

  if (array) {
    const items = Array.isArray(currentValue) ? currentValue : [];
    return (
      <Fragment>
        <FieldLabel label={label} path={path} />
        <div className="space-y-2">
          {items.map((_, i) => (
            <ArrayRow
              key={i}
              index={i}
              length={items.length}
              onRemove={() => setAt(fullPath, items.filter((_, j) => j !== i))}
            >
              <SingleValueInput
                sd={sd}
                element={element}
                typeCode={typeCode}
                path={[...fullPath, i]}
                draft={draft}
                inputs={inputs}
                pathInputs={pathInputs}
                fieldErrors={fieldErrors}
                setAt={setAt}
              />
            </ArrayRow>
          ))}
          <button
            type="button"
            onClick={() => setAt(fullPath, [...items, emptyOf(typeCode)])}
            className="rounded border border-dashed border-[var(--border-strong,#cbd5e1)] px-2 py-1 text-xs text-[var(--text-muted,#475569)] hover:border-[var(--border-strong,#94a3b8)]"
          >
            + Add {relative}
          </button>
        </div>
      </Fragment>
    );
  }

  return (
    <Fragment>
      <FieldLabel label={label} path={path} />
      <div>
        <SingleValueInput
          sd={sd}
          element={element}
          typeCode={typeCode}
          path={fullPath}
          draft={draft}
          inputs={inputs}
          pathInputs={pathInputs}
          fieldErrors={fieldErrors}
          setAt={setAt}
        />
      </div>
    </Fragment>
  );
}

interface ChoiceFieldProps {
  sd: StructureDefinition;
  element: ElementDefinition;
  relative: string;
  pathPrefix: Path;
  label: string;
  draft: Record<string, unknown>;
  inputs: TypeInputs;
  pathInputs: PathInputs;
  fieldErrors: Map<string, string>;
  setAt: (path: Path, value: unknown) => void;
}

function ChoiceField({
  sd,
  element,
  relative,
  pathPrefix,
  label,
  draft,
  inputs,
  pathInputs,
  fieldErrors,
  setAt,
}: ChoiceFieldProps): ReactNode {
  const base = relative.slice(0, -3);
  const types: ElementDefinitionType[] = element.type ?? [];
  // detect which variant is populated
  const populated = types.find(
    (t) => pathGet(draft, [...pathPrefix, `${base}${capitalize(t.code!)}`]) !== undefined,
  );
  const [selected, setSelected] = useState<string | undefined>(populated?.code);

  const activeType = selected ?? populated?.code;
  const activeKey = activeType ? `${base}${capitalize(activeType)}` : undefined;
  const activePath: Path = activeKey ? [...pathPrefix, activeKey] : [];
  const activeValue = activeKey ? pathGet(draft, activePath) : undefined;

  const switchTo = (next: string | undefined) => {
    // clear any previously-populated variant
    for (const t of types) {
      const key = `${base}${capitalize(t.code!)}`;
      if (pathGet(draft, [...pathPrefix, key]) !== undefined) {
        setAt([...pathPrefix, key], undefined);
      }
    }
    setSelected(next);
  };

  return (
    <Fragment>
      <FieldLabel label={label} path={element.path!} />
      <div className="space-y-2">
        <select
          data-testid={`choice-${base}`}
          className="rounded border border-[var(--border-strong,#cbd5e1)] bg-[var(--surface,#ffffff)] px-2 py-1 text-xs"
          value={activeType ?? ""}
          onChange={(e) => switchTo(e.target.value || undefined)}
        >
          <option value="">— type —</option>
          {types.map((t) => (
            <option key={t.code} value={t.code}>
              {t.code}
            </option>
          ))}
        </select>
        {activeType && activeKey && (
          <SingleValueInput
            sd={sd}
            element={element}
            typeCode={activeType}
            path={activePath}
            draft={draft}
            inputs={inputs}
            pathInputs={pathInputs}
            fieldErrors={fieldErrors}
            setAt={setAt}
            override={activeValue}
          />
        )}
      </div>
    </Fragment>
  );
}

interface SingleValueInputProps {
  sd: StructureDefinition;
  element: ElementDefinition;
  typeCode: string | undefined;
  path: Path;
  draft: Record<string, unknown>;
  inputs: TypeInputs;
  pathInputs: PathInputs;
  fieldErrors: Map<string, string>;
  setAt: (path: Path, value: unknown) => void;
  override?: unknown;
}

function SingleValueInput({
  sd,
  element,
  typeCode,
  path,
  draft,
  inputs,
  pathInputs,
  fieldErrors,
  setAt,
  override,
}: SingleValueInputProps): ReactNode {
  const value = override !== undefined ? override : pathGet(draft, path);
  const error = fieldErrors.get(pathKey(path));

  if (typeCode === "BackboneElement" || typeCode === "Element") {
    return (
      <div className="rounded border border-[var(--border,#e2e8f0)] bg-[var(--sunken,#f8fafc)] p-2">
        <FieldGroup
          sd={sd}
          parentPath={element.path!}
          pathPrefix={path}
          draft={draft}
          inputs={inputs}
          pathInputs={pathInputs}
          fieldErrors={fieldErrors}
          setAt={setAt}
        />
      </div>
    );
  }

  const input: FhirTypeInput =
    pathInputs[element.path!] ??
    (typeCode ? inputs[typeCode] : undefined) ??
    JsonFallbackInput;
  return (
    <>
      {input({
        value,
        onChange: (v: unknown) => setAt(path, v),
        context: { path: element.path!, typeCode, element },
        error,
      })}
    </>
  );
}

// Label cell of the editor grid. Deliberately a <div>, not <dt>: the grid
// container is a <div> and fields nest inside other fields' value cells, so
// <dt>/<dd> here is invalid HTML (issue #587 — validateDOMNesting warnings).
function FieldLabel({ label, path }: { label: string; path: string }) {
  return (
    <div className="font-medium text-[var(--text-muted,#475569)]" title={path}>
      {label}
    </div>
  );
}

function ArrayRow({
  index,
  length,
  onRemove,
  children,
}: {
  index: number;
  length: number;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2">
      <span className="pt-1 text-xs text-[var(--text-subtle,#94a3b8)]">#{index + 1}</span>
      <div className="flex-1">{children}</div>
      {length > 0 && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove item ${index + 1}`}
          className="rounded border border-[var(--border-strong,#cbd5e1)] bg-[var(--surface,#ffffff)] px-2 py-1 text-xs text-[var(--text-muted,#475569)] hover:border-[var(--danger,#f87171)] hover:text-[var(--danger,#dc2626)]"
        >
          ×
        </button>
      )}
    </div>
  );
}

function emptyOf(typeCode: string | undefined): unknown {
  if (!typeCode) return {};
  if (typeCode === "boolean") return false;
  if (["integer", "decimal", "positiveInt", "unsignedInt"].includes(typeCode)) return 0;
  if (["BackboneElement", "Element"].includes(typeCode)) return {};
  return undefined;
}
