import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface ColumnPickerOption {
  /** Stable identifier for the column (typically the FHIR path used by `<ResourceTable>`). */
  path: string;
  /** Human-readable label shown next to the checkbox. */
  label: string;
}

export interface ColumnPickerProps {
  /** Full set of selectable columns. Order is preserved in the panel. */
  options: ColumnPickerOption[];
  /** Currently selected column paths. Either pass `selected` to control externally or omit and rely on `defaultSelected` + storageKey. */
  selected?: string[];
  /** Initial selection when uncontrolled. Defaults to every option. */
  defaultSelected?: string[];
  /** Fires whenever the selection changes (including on rehydration from localStorage). */
  onChange: (selected: string[]) => void;
  /** When set, selection is persisted to and rehydrated from `localStorage[storageKey]`. */
  storageKey?: string;
  /** Override the trigger button label (default: "Columns"). */
  buttonLabel?: string;
  className?: string;
}

const readPersisted = (key: string | undefined): string[] | undefined => {
  if (!key || typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed;
    }
  } catch {
    // localStorage unavailable or value malformed — treat as missing.
  }
  return undefined;
};

const writePersisted = (key: string | undefined, value: string[]): void => {
  if (!key || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota / privacy mode — silently drop.
  }
};

/**
 * Header companion to `<ResourceTable>` — a popover-style "Columns" button
 * with a checkbox list. When `storageKey` is provided, the selection
 * round-trips through `localStorage`, so user preference survives reloads.
 *
 * Keyboard: Esc closes the panel, ArrowUp / ArrowDown move focus between
 * checkboxes, the trigger button acts as a normal `aria-haspopup` control.
 */
export function ColumnPicker({
  options,
  selected,
  defaultSelected,
  onChange,
  storageKey,
  buttonLabel = "Columns",
  className,
}: ColumnPickerProps) {
  const isControlled = selected !== undefined;
  const validPaths = useMemo(() => new Set(options.map((o) => o.path)), [options]);

  const [internalSelected, setInternalSelected] = useState<string[]>(() => {
    if (isControlled) return selected!;
    const persisted = readPersisted(storageKey)?.filter((p) => validPaths.has(p));
    if (persisted && persisted.length > 0) return persisted;
    return defaultSelected ?? options.map((o) => o.path);
  });

  // Sync the parent with our resolved initial selection on mount. Without
  // this, an uncontrolled picker mounted after a resource-type change (e.g.
  // SPA nav Patient → AllergyIntolerance keyed by `resourceType`) would show
  // the new type's defaults checked while the parent still holds the previous
  // type's `columns` state — and the table would render the wrong columns.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (isControlled || hydratedRef.current) return;
    hydratedRef.current = true;
    const persisted = readPersisted(storageKey)?.filter((p) => validPaths.has(p));
    if (persisted && persisted.length > 0) {
      setInternalSelected(persisted);
      onChange(persisted);
    } else {
      onChange(internalSelected);
    }
    // Run once on mount; storageKey / validPaths changes do not retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = isControlled ? selected! : internalSelected;

  const commit = (next: string[]) => {
    if (!isControlled) setInternalSelected(next);
    writePersisted(storageKey, next);
    onChange(next);
  };

  const toggle = (path: string) => {
    if (current.includes(path)) {
      commit(current.filter((p) => p !== path));
    } else {
      // Preserve the option order so the table columns stay stable.
      const set = new Set([...current, path]);
      commit(options.map((o) => o.path).filter((p) => set.has(p)));
    }
  };

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const checkboxRefs = useRef<Array<HTMLInputElement | null>>([]);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const focusables = checkboxRefs.current.filter(Boolean) as HTMLInputElement[];
    if (focusables.length === 0) return;
    const active = document.activeElement as HTMLInputElement | null;
    const idx = active ? focusables.indexOf(active) : -1;
    const delta = e.key === "ArrowDown" ? 1 : -1;
    const next = focusables[(idx + delta + focusables.length) % focusables.length];
    next?.focus();
  };

  return (
    <div
      ref={containerRef}
      className={className ?? "relative inline-block"}
      data-testid="column-picker"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-sm text-[var(--text)] shadow-sm hover:bg-[var(--sunken)]"
      >
        {buttonLabel}
        <span aria-hidden className="text-[10px]">▾</span>
      </button>

      {open && (
        <div
          id={panelId}
          role="group"
          aria-label="Choose visible columns"
          onKeyDown={handleListKeyDown}
          className="absolute right-0 z-10 mt-1 max-h-64 min-w-[12rem] overflow-y-auto rounded border border-[var(--border)] bg-[var(--surface)] p-2 shadow-lg"
        >
          <ul className="space-y-1">
            {options.map((opt, i) => {
              const checked = current.includes(opt.path);
              return (
                <li key={opt.path}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-[var(--sunken)]">
                    <input
                      type="checkbox"
                      ref={(el) => {
                        checkboxRefs.current[i] = el;
                      }}
                      checked={checked}
                      onChange={() => toggle(opt.path)}
                    />
                    <span>{opt.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
