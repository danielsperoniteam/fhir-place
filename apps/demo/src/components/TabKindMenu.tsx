import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CC_MONO } from "./ccStyles.js";

/**
 * Kind-picker dropdown for the tabs row "+" trigger. Sections:
 *   Primary: GET browse, GET read-by-id, POST create, PATCH update, DELETE
 *   Other:   BATCH, CFG
 * Only Browse and Server settings are wired today; the rest are surfaced
 * as disabled rows so the menu reflects the Direction A spec without
 * pretending to ship features that don't exist yet. See issue #247.
 */

type ItemKind = "GET" | "POST" | "PATCH" | "DELETE" | "BATCH" | "CFG";

interface Item {
  id: string;
  kind: ItemKind;
  label: string;
  hint: string;
  shortcut?: string;
  onSelect?: () => void;
  disabled?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onBrowse: () => void;
  onSettings: () => void;
  anchorRef: React.RefObject<HTMLElement>;
}

const KIND_COLOR: Record<ItemKind, string> = {
  GET: "var(--accent)",
  POST: "var(--success, #2da44e)",
  PATCH: "var(--warning, #bf8700)",
  DELETE: "var(--danger, #cf222e)",
  BATCH: "var(--text-muted)",
  CFG: "var(--text-muted)",
};

export function TabKindMenu({ open, onClose, onBrowse, onSettings, anchorRef }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  // The tabs row uses overflow:hidden, so an absolutely-positioned child is
  // clipped. Use position:fixed pinned to the trigger's viewport rect.
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const r = anchorRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom, left: r.left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const pick = (fn: () => void) => () => { fn(); onClose(); };
  const items: Item[] = [
    { id: "browse",     kind: "GET",    label: "Browse / search",        hint: "Pick a resource type and list",   shortcut: "⌘T", onSelect: pick(onBrowse) },
    { id: "read-by-id", kind: "GET",    label: "Read by ID",             hint: "Open one resource by Type/id",    shortcut: "⌘O", disabled: true },
    { id: "create",     kind: "POST",   label: "Create",                 hint: "New resource of a chosen type",   shortcut: "⌘N", disabled: true },
    { id: "update",     kind: "PATCH",  label: "Update",                 hint: "Patch fields on an existing resource",            disabled: true },
    { id: "delete",     kind: "DELETE", label: "Delete",                 hint: "Remove a resource by Type/id",                    disabled: true },
    { id: "batch",      kind: "BATCH",  label: "New batch / transaction", hint: "Compose a Bundle of operations",                 disabled: true },
    { id: "settings",   kind: "CFG",    label: "Server settings",        hint: "Switch or add a FHIR server",     onSelect: pick(onSettings) },
  ];

  return (
    <div
      ref={menuRef}
      data-testid="tab-kind-menu"
      role="menu"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 50,
        width: 260,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 14px 36px rgba(0,0,0,0.22)",
        padding: 4,
        fontFamily: "var(--font-sans, system-ui)",
      }}
    >
      <SectionLabel>Primary actions</SectionLabel>
      {items.slice(0, 5).map((item) => <Row key={item.id} item={item} />)}
      <div style={{ height: 4 }} />
      <SectionLabel>Other</SectionLabel>
      {items.slice(5).map((item) => <Row key={item.id} item={item} />)}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--text-subtle)", padding: "6px 8px 4px" }}>
      {children}
    </div>
  );
}

function Row({ item }: { item: Item }) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={`tab-kind-menu-item-${item.id}`}
      disabled={item.disabled}
      onClick={item.onSelect}
      title={item.disabled ? "Not yet implemented" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        width: "100%",
        padding: "6px 8px",
        background: "transparent",
        border: "none",
        borderRadius: 6,
        cursor: item.disabled ? "not-allowed" : "pointer",
        color: item.disabled ? "var(--text-subtle)" : "var(--text)",
        opacity: item.disabled ? 0.55 : 1,
        textAlign: "left",
      }}
      onMouseEnter={(e) => { if (!item.disabled) e.currentTarget.style.background = "var(--hover, rgba(0,0,0,0.04))"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <span style={{ fontFamily: CC_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, padding: "1px 5px", borderRadius: 3, color: KIND_COLOR[item.kind], border: `1px solid ${KIND_COLOR[item.kind]}`, minWidth: 46, textAlign: "center", flexShrink: 0 }}>
        {item.kind}
      </span>
      <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{item.label}</span>
        <span style={{ fontSize: 11, color: "var(--text-subtle)" }}>{item.hint}</span>
      </span>
      {item.shortcut && (
        <span style={{ fontSize: 10, fontFamily: CC_MONO, color: "var(--text-subtle)", flexShrink: 0 }}>{item.shortcut}</span>
      )}
    </button>
  );
}
