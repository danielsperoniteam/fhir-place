import type {
  ElementDefinition,
  ElementDefinitionType,
  Resource,
  StructureDefinition,
} from "fhir/r4";
import { Fragment, useCallback, useMemo, useState, type ReactNode } from "react";
import { useStructureDefinition } from "../hooks/queries.js";
import {
  directChildren,
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

export function ResourceEditor(props: ResourceEditorProps) {
  const { resource, structureDefinition, onChange, onSave, onCancel, profile } = props;
  const detectedProfile = profile === undefined ? resource.meta?.profile?.[0] : profile;
  const [draft, setDraft] = useState<Resource>(resource);

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

  const setAt = useCallback(
    (path: Path, value: unknown) => {
      setDraft((prev) => {
        const prevObj = prev as unknown as Record<string, unknown>;
        const next =
          value === undefined
            ? pathRemove(prevObj, path)
            : pathSet(prevObj, path, value);
        const asResource = next as unknown as Resource;
        onChange?.(asResource);
        return asResource;
      });
    },
    [onChange],
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSave) return;
    await onSave(prune(draft));
  };

  if (!sd) {
    if (sdQuery.isError) {
      return (
        <p className="text-sm text-red-600">
          Failed to load StructureDefinition: {sdQuery.error?.message}
        </p>
      );
    }
    return <p className="text-sm text-slate-500">Loading {resource.resourceType} structure…</p>;
  }

  return (
    <form
      className={props.className ?? "space-y-4"}
      onSubmit={onSubmit}
      data-testid="resource-editor"
    >
      <header className="flex items-baseline gap-2 border-b border-slate-200 pb-2">
        <h2 className="text-lg font-semibold">
          {draft.id ? `Edit ${draft.resourceType}` : `New ${draft.resourceType}`}
        </h2>
        {draft.id && (
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{draft.id}</code>
        )}
      </header>

      <FieldGroup
        sd={sd}
        parentPath={sd.type!}
        pathPrefix={[]}
        draft={draft as unknown as Record<string, unknown>}
        inputs={inputs}
        pathInputs={pathInputs}
        setAt={setAt}
      />

      <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={props.saving}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
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
  setAt: (path: Path, value: unknown) => void;
}

function FieldGroup({
  sd,
  parentPath,
  pathPrefix,
  draft,
  inputs,
  pathInputs,
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
        <Dt label={label} path={path} />
        <dd className="space-y-2">
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
                setAt={setAt}
              />
            </ArrayRow>
          ))}
          <button
            type="button"
            onClick={() => setAt(fullPath, [...items, emptyOf(typeCode)])}
            className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-slate-400"
          >
            + Add {relative}
          </button>
        </dd>
      </Fragment>
    );
  }

  return (
    <Fragment>
      <Dt label={label} path={path} />
      <dd>
        <SingleValueInput
          sd={sd}
          element={element}
          typeCode={typeCode}
          path={fullPath}
          draft={draft}
          inputs={inputs}
          pathInputs={pathInputs}
          setAt={setAt}
        />
      </dd>
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
      <Dt label={label} path={element.path!} />
      <dd className="space-y-2">
        <select
          data-testid={`choice-${base}`}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
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
            setAt={setAt}
            override={activeValue}
          />
        )}
      </dd>
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
  setAt,
  override,
}: SingleValueInputProps): ReactNode {
  const value = override !== undefined ? override : pathGet(draft, path);

  if (typeCode === "BackboneElement" || typeCode === "Element") {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 p-2">
        <FieldGroup
          sd={sd}
          parentPath={element.path!}
          pathPrefix={path}
          draft={draft}
          inputs={inputs}
          pathInputs={pathInputs}
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
      })}
    </>
  );
}

function Dt({ label, path }: { label: string; path: string }) {
  return (
    <dt className="font-medium text-slate-600" title={path}>
      {label}
    </dt>
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
      <span className="pt-1 text-xs text-slate-400">#{index + 1}</span>
      <div className="flex-1">{children}</div>
      {length > 0 && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove item ${index + 1}`}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600 hover:border-red-400 hover:text-red-600"
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
