import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTabs } from "../context/TabsContext.js";
import { CC_MONO } from "./ccStyles.js";
import { TabKindMenu } from "./TabKindMenu.js";

const METHOD_COLORS: Record<string, { bg: string; color: string }> = {
  GET:    { bg: "transparent", color: "var(--text-subtle)" },
  POST:   { bg: "transparent", color: "var(--text-subtle)" },
  PUT:    { bg: "transparent", color: "var(--text-subtle)" },
  DELETE: { bg: "transparent", color: "var(--text-subtle)" },
  CFG:    { bg: "transparent", color: "var(--text-subtle)" },
};

export function CCTabs() {
  const { tabs, activeTabId, closeTab } = useTabs();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);

  // ⌘T / Ctrl+T opens the default Browse action without showing the menu.
  // Power users skip the dropdown entirely. The browser's own new-tab is
  // ⌘N for most platforms; ⌘T inside the app is a no-op for the browser
  // chrome when focus is inside our window — we still preventDefault as
  // defense-in-depth.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() !== "t") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      navigate("/fhir-ui/types");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  if (tabs.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        background: "var(--sunken)",
        borderBottom: "1px solid var(--border)",
        height: 34,
        flexShrink: 0,
        overflowX: "auto",
        overflowY: "hidden",
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const chip = METHOD_COLORS[tab.kind] ?? { bg: "transparent", color: "var(--text-subtle)" };

        return (
          <div
            key={tab.id}
            onClick={() => navigate(tab.path)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "0 12px",
              borderRight: "1px solid var(--border)",
              background: isActive ? "var(--surface)" : "transparent",
              cursor: "pointer",
              position: "relative",
              minWidth: 140,
              maxWidth: 220,
              flexShrink: 0,
              userSelect: "none",
            }}
            title={tab.label}
          >
            {/* Active underline */}
            {isActive && (
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: "var(--accent)",
                }}
              />
            )}

            {/* Method chip */}
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                fontFamily: CC_MONO,
                color: isActive ? "var(--accent)" : chip.color,
                padding: "1px 4px",
                borderRadius: 3,
                background: isActive ? "var(--accent-soft)" : "transparent",
                letterSpacing: 0.3,
                textTransform: "uppercase",
                flexShrink: 0,
              }}
            >
              {tab.kind}
            </span>

            {/* Label */}
            <span
              style={{
                fontSize: 12,
                color: isActive ? "var(--text)" : "var(--text-muted)",
                fontWeight: isActive ? 500 : 400,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
              }}
            >
              {tab.label}
            </span>

            {/* Dirty dot */}
            {tab.dirty && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: "var(--accent)",
                  flexShrink: 0,
                }}
              />
            )}

            {/* Close */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              style={{
                background: "none",
                border: "none",
                padding: "0 0 0 2px",
                color: "var(--text-subtle)",
                fontSize: 14,
                cursor: "pointer",
                flexShrink: 0,
                lineHeight: 1,
                display: "flex",
                alignItems: "center",
              }}
              aria-label={`Close ${tab.label}`}
            >
              ×
            </button>
          </div>
        );
      })}

      {/* New-tab dropdown — picks GET browse / read-by-id / POST create / …
          per the Direction A spec. Clicking + opens a menu; ⌘T skips it and
          goes straight to Browse (the prior `+` behavior). Most rows beyond
          Browse + Settings are stubbed pending follow-up routing work. */}
      <div ref={triggerRef} style={{ position: "relative", flexShrink: 0 }}>
        <div
          data-testid="new-tab-button"
          role="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "0 12px",
            color: "var(--text-muted)",
            fontSize: 16,
            cursor: "pointer",
            borderRight: "1px solid var(--border)",
            height: "100%",
            userSelect: "none",
          }}
          title="New tab — pick a kind"
        >
          <span>+</span>
          <span
            aria-hidden
            style={{
              fontSize: 9,
              lineHeight: 1,
              color: "var(--text-subtle)",
              transform: menuOpen ? "rotate(180deg)" : "none",
              transition: "transform 120ms ease",
            }}
          >
            ▾
          </span>
        </div>
        <TabKindMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onBrowse={() => navigate("/fhir-ui/types")}
          onSettings={() => navigate("/fhir-ui/settings")}
          anchorRef={triggerRef}
        />
      </div>

      <div style={{ flex: 1 }} />

      {/* Split hint */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0 12px",
          color: "var(--text-subtle)",
          fontSize: 11,
          fontFamily: CC_MONO,
          flexShrink: 0,
        }}
      >
        <span>⌘\</span>
        <span>split</span>
      </div>
    </div>
  );
}
