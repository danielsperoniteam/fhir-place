import { useNavigate } from "react-router-dom";
import { useTabs } from "../context/TabsContext.js";
import { CC_MONO } from "./ccStyles.js";

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

      {/* Add tab — opens the resource-type picker so users can reach any
          R4 type, not just the curated set in the sidebar. ⌘K still opens
          the natural-language jump dialog. */}
      <div
        data-testid="new-tab-button"
        onClick={() => navigate("/fhir-ui/types")}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          color: "var(--text-muted)",
          fontSize: 16,
          cursor: "pointer",
          borderRight: "1px solid var(--border)",
          flexShrink: 0,
          userSelect: "none",
        }}
        title="New tab — choose resource type"
      >
        +
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
