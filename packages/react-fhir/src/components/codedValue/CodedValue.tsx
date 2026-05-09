import type { CodeableConcept, Coding } from "fhir/r4";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useCodeLookup } from "../../hooks/queries.js";
import { lookupCoreDisplay } from "../../structure/core/valuesets.js";
import {
  isKnown,
  labelForSystem,
  normalizeSystem,
  partition,
  pickPrimary,
} from "./registry.js";

/** Optional callback fired when the popover opens or the hidden-codings
 *  expander is toggled. The library has no opinion on transport — wire it
 *  to your telemetry of choice. Defaults to a no-op. */
export type CodedValueTelemetry = (
  event: "coded_value_hover" | "coded_value_other_expanded",
  detail: { system?: string; code?: string; total: number; hidden: number },
) => void;

const noopTelemetry: CodedValueTelemetry = () => undefined;

export interface CodedValueProps {
  /** Either a single `Coding` or a full `CodeableConcept`. */
  value: CodeableConcept | Coding | undefined;
  /**
   * Optional opt-in tone. The component never derives tone from the value —
   * callers attach it explicitly per element (e.g. `tone="success"` for
   * `AllergyIntolerance.clinicalStatus` when the code is `active`).
   */
  tone?: "success" | "warn" | "danger";
  /** Telemetry hook; both events are fired with `(name, detail)`. */
  onTelemetry?: CodedValueTelemetry;
  /** Test id forwarded to the chip wrapper for stable e2e selectors. */
  "data-testid"?: string;
}

interface NormalizedCodedValue {
  text?: string;
  codings: Coding[];
}

function normalize(
  value: CodeableConcept | Coding | undefined,
): NormalizedCodedValue {
  if (!value) return { codings: [] };
  // A Coding has `code` or `system` at the top level; a CodeableConcept has
  // `coding` (and/or `text`). The two shapes are mutually exclusive in
  // FHIR R4 so a single discriminating check is enough.
  if ("coding" in value || "text" in value) {
    const cc = value as CodeableConcept;
    return { text: cc.text, codings: cc.coding ?? [] };
  }
  return { codings: [value as Coding] };
}

function visibleLabel(
  norm: NormalizedCodedValue,
  primary: Coding | undefined,
): string {
  if (norm.text) return norm.text;
  const display =
    primary?.display ?? lookupCoreDisplay(primary?.system, primary?.code);
  if (display) return display;
  if (primary?.code) return primary.code;
  return "—";
}

const TONE_STYLES: Record<
  NonNullable<CodedValueProps["tone"]>,
  { bg: string; fg: string; border: string; dot: string }
> = {
  success: {
    bg: "rgba(34, 197, 94, 0.12)",
    fg: "rgb(21, 128, 61)",
    border: "rgba(34, 197, 94, 0.45)",
    dot: "rgb(34, 197, 94)",
  },
  warn: {
    bg: "rgba(234, 179, 8, 0.14)",
    fg: "rgb(161, 98, 7)",
    border: "rgba(234, 179, 8, 0.45)",
    dot: "rgb(234, 179, 8)",
  },
  danger: {
    bg: "rgba(239, 68, 68, 0.12)",
    fg: "rgb(185, 28, 28)",
    border: "rgba(239, 68, 68, 0.45)",
    dot: "rgb(239, 68, 68)",
  },
};

const MONO_STACK =
  "ui-monospace, 'JetBrains Mono', SFMono-Regular, Menlo, Consolas, monospace";

const SANS_STACK =
  "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif";

/**
 * `<CodedValue />` — rich chip + hover popover for FHIR `Coding` /
 * `CodeableConcept` values.
 *
 * Resting state is a bordered ~24px chip with a human-readable label on the
 * left and a sunken pill on the right showing the primary code. Hovering
 * (or focusing for keyboard users) reveals a 360px popover with a TEXT row
 * (when present), one row per *known* coding using the registry's friendly
 * label, and a collapsed expander for hidden / OID / local-URI codings.
 *
 * Definition text is fetched only for the primary coding via
 * {@link useCodeLookup} to avoid spamming the terminology server on hover.
 *
 * The component is framework-agnostic — it uses inline styles and standard
 * DOM hover/focus, so it works inside `react-fhir` without pulling in
 * Mantine or any other UI kit.
 */
export function CodedValue(props: CodedValueProps) {
  const { value, tone, onTelemetry = noopTelemetry } = props;
  const norm = normalize(value);
  const { known, hidden } = partition(norm.codings);
  const primary = pickPrimary(norm.codings);
  // When every coding is hidden we still render the first as the primary,
  // but the chip is muted so reviewers can see at a glance that no known
  // terminology covers this concept.
  const allHidden = primary !== undefined && !isKnown(primary);

  const [open, setOpen] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const popoverId = useId();

  // Close popover and reset the expander whenever the cursor leaves the chip
  // wrapper (the hard requirement from the issue acceptance criteria).
  const close = useCallback(() => {
    setOpen(false);
    setOtherOpen(false);
  }, []);

  const openPopover = useCallback(() => {
    if (!open && norm.codings.length > 0) {
      onTelemetry("coded_value_hover", {
        system: primary?.system,
        code: primary?.code,
        total: norm.codings.length,
        hidden: hidden.length,
      });
    }
    setOpen(true);
  }, [open, norm.codings.length, hidden.length, primary, onTelemetry]);

  // Esc closes the popover when focus is somewhere inside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const toneStyles = tone ? TONE_STYLES[tone] : undefined;

  const label = visibleLabel(norm, primary);
  const codeText = primary?.code ?? "";
  const extraCount = norm.codings.length > 1 ? norm.codings.length - 1 : 0;

  // Definition lookup only for the primary coding — never for the others.
  const { data: primaryLookup } = useCodeLookup(
    primary?.system,
    primary?.code,
  );

  const wrapperStyle: CSSProperties = {
    position: "relative",
    display: "inline-block",
    lineHeight: 1,
  };

  const chipStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minHeight: 22,
    padding: "2px 6px 2px 8px",
    borderRadius: 6,
    border: `1px solid ${toneStyles?.border ?? "var(--border-strong, #d4d4d8)"}`,
    background: toneStyles?.bg ?? "var(--surface, #ffffff)",
    color: toneStyles?.fg ?? "var(--text, #09090b)",
    fontFamily: SANS_STACK,
    fontSize: 13,
    fontWeight: 500,
    cursor: "default",
    opacity: allHidden && !tone ? 0.85 : 1,
    verticalAlign: "middle",
  };

  const dotStyle: CSSProperties | undefined = toneStyles
    ? {
        display: "inline-block",
        width: 5,
        height: 5,
        borderRadius: "50%",
        background: toneStyles.dot,
        flex: "0 0 auto",
      }
    : undefined;

  const codePillStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "1px 5px",
    borderRadius: 4,
    background: "var(--bg, rgba(0,0,0,0.04))",
    color: "var(--text-muted, #71717a)",
    fontFamily: MONO_STACK,
    fontSize: 10.5,
    lineHeight: 1.3,
  };

  const extraIndicatorStyle: CSSProperties = {
    fontFamily: MONO_STACK,
    fontSize: 10,
    color: "var(--text-muted, #71717a)",
  };

  const popoverStyle: CSSProperties = {
    position: "absolute",
    zIndex: 50,
    top: "calc(100% + 4px)",
    left: 0,
    width: 360,
    maxWidth: "min(360px, 90vw)",
    background: "var(--surface, #ffffff)",
    color: "var(--text, #09090b)",
    border: "1px solid var(--border-strong, #d4d4d8)",
    borderRadius: 8,
    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
    padding: 12,
    fontFamily: SANS_STACK,
    fontSize: 12.5,
  };

  // Only render when the popover is open. Keeping it permanently in the DOM
  // (e.g. for a fade-out animation) duplicates every label and definition
  // string into the accessibility tree and breaks `getByText` strict-mode
  // queries in any test that scrolls the chip's text.
  const showPopover = open && (norm.codings.length > 0 || norm.text !== undefined);

  return (
    <span
      ref={wrapperRef}
      style={wrapperStyle}
      onMouseEnter={openPopover}
      onMouseLeave={close}
      onFocus={openPopover}
      onBlur={(e) => {
        // Only close when focus genuinely left the wrapper (not when it moved
        // to a child like the expander button).
        if (!wrapperRef.current?.contains(e.relatedTarget as Node)) close();
      }}
      data-testid={props["data-testid"] ?? "coded-value"}
      data-coded-value-open={open ? "true" : "false"}
      aria-describedby={open ? popoverId : undefined}
    >
      <span style={chipStyle} tabIndex={0} data-testid="coded-value-chip">
        {dotStyle ? <span aria-hidden="true" style={dotStyle} /> : null}
        <span data-testid="coded-value-label">{label}</span>
        {codeText ? (
          <span style={codePillStyle} data-testid="coded-value-code">
            {codeText}
          </span>
        ) : null}
        {extraCount > 0 ? (
          <span
            style={extraIndicatorStyle}
            data-testid="coded-value-extra-count"
            aria-label={`${extraCount} additional coding${extraCount === 1 ? "" : "s"}`}
          >
            +{extraCount}
          </span>
        ) : null}
      </span>
      {showPopover ? (
        <div
          id={popoverId}
          role="tooltip"
          style={popoverStyle}
          data-testid="coded-value-popover"
        >
          {norm.text ? (
            <PopoverSection title="TEXT">
              <div data-testid="coded-value-popover-text">{norm.text}</div>
            </PopoverSection>
          ) : null}
          {known.length > 0 ? (
            <PopoverSection
              title={`${known.length === 1 ? "CODING" : "CODINGS"} · ${known.length}`}
            >
              <ul
                style={{
                  listStyle: "none",
                  margin: 0,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                {known.map((c, i) => (
                  <KnownCodingRow
                    key={`${c.system ?? ""}#${c.code ?? ""}#${i}`}
                    coding={c}
                    isPrimary={c === primary}
                    primaryDefinition={
                      c === primary ? primaryLookup?.definition : undefined
                    }
                  />
                ))}
              </ul>
            </PopoverSection>
          ) : null}
          {hidden.length > 0 ? (
            <HiddenCodingsBand
              codings={hidden}
              open={otherOpen}
              onToggle={() => {
                setOtherOpen((o) => {
                  const next = !o;
                  if (next) {
                    onTelemetry("coded_value_other_expanded", {
                      system: primary?.system,
                      code: primary?.code,
                      total: norm.codings.length,
                      hidden: hidden.length,
                    });
                  }
                  return next;
                });
              }}
            />
          ) : null}
        </div>
      ) : null}
    </span>
  );
}

function PopoverSection(props: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 10 }}>
      <header
        style={{
          fontFamily: MONO_STACK,
          fontSize: 9.5,
          fontWeight: 600,
          letterSpacing: "0.06em",
          color: "var(--text-subtle, #a1a1aa)",
          marginBottom: 4,
        }}
      >
        {props.title}
      </header>
      {props.children}
    </section>
  );
}

function KnownCodingRow(props: {
  coding: Coding;
  isPrimary: boolean;
  primaryDefinition?: string;
}) {
  const { coding, isPrimary, primaryDefinition } = props;
  const label = labelForSystem(coding.system) ?? "Code";
  const display =
    coding.display ?? lookupCoreDisplay(coding.system, coding.code);
  return (
    <li style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: MONO_STACK,
            fontSize: 9.5,
            padding: "1px 5px",
            borderRadius: 3,
            background: "var(--bg, rgba(0,0,0,0.05))",
            color: "var(--text-muted, #71717a)",
          }}
          data-testid="coded-value-system-pill"
        >
          {label}
        </span>
        {coding.userSelected ? (
          <span
            aria-label="user selected"
            title="userSelected"
            style={{ color: "var(--text-muted, #71717a)" }}
          >
            ★
          </span>
        ) : null}
        <span style={{ fontFamily: MONO_STACK, fontSize: 11 }}>{coding.code}</span>
        {display ? (
          <span style={{ color: "var(--text, #09090b)", overflowWrap: "anywhere" }}>
            {display}
          </span>
        ) : null}
      </div>
      {isPrimary && primaryDefinition ? (
        <p
          style={{
            margin: 0,
            color: "var(--text-muted, #71717a)",
            fontSize: 12,
            lineHeight: 1.45,
          }}
          data-testid="coded-value-definition"
        >
          {primaryDefinition}
        </p>
      ) : null}
    </li>
  );
}

function HiddenCodingsBand(props: {
  codings: readonly Coding[];
  open: boolean;
  onToggle: () => void;
}) {
  const { codings, open, onToggle } = props;
  const summary = (() => {
    const labels = new Set<string>();
    for (const c of codings) {
      const sys = normalizeSystem(c.system);
      if (!sys) {
        labels.add("Unknown system");
        continue;
      }
      if (sys.startsWith("urn:oid:")) labels.add("OID");
      else labels.add("Unknown system");
    }
    return Array.from(labels).join(", ");
  })();
  return (
    <section
      style={{
        marginTop: 4,
        background: "var(--bg, rgba(0,0,0,0.03))",
        borderRadius: 6,
        padding: "6px 8px",
      }}
      data-testid="coded-value-hidden-band"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        data-testid="coded-value-other-toggle"
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          color: "var(--text-muted, #71717a)",
          fontFamily: SANS_STACK,
          fontSize: 12,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        +{codings.length}{" "}
        {open
          ? `Hide ${codings.length} other coding${codings.length === 1 ? "" : "s"}`
          : `Show ${codings.length} other coding${codings.length === 1 ? "" : "s"}`}
        {!open ? ` (${summary})` : null}
      </button>
      {open ? (
        <ul
          style={{
            listStyle: "none",
            margin: "6px 0 0",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            opacity: 0.85,
          }}
        >
          {codings.map((c, i) => (
            <li
              key={`${c.system ?? ""}#${c.code ?? ""}#${i}`}
              style={{
                fontFamily: MONO_STACK,
                fontSize: 11,
                color: "var(--text-muted, #71717a)",
                overflowWrap: "anywhere",
              }}
            >
              <span style={{ color: "var(--text-subtle, #a1a1aa)" }}>
                {c.system ?? "(no system)"}
              </span>{" "}
              {c.code}
              {c.display ? <span> · {c.display}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
