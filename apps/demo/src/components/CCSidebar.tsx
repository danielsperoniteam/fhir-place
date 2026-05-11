import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { fhirQueryKeys, useFhirClient, type SearchParams } from "@fhir-place/react-fhir";
import { useQueries } from "@tanstack/react-query";
import type { Bundle, Resource } from "fhir/r4";
import { ACTIVE_SERVER_CONFIG, loadActiveServerId, loadServers, saveActiveServerId } from "../config.js";
import { TOP_RESOURCE_TYPES } from "../resourceListConfig.js";
import { usePinned } from "../state/pinned.js";
import { JumpDialog } from "./JumpDialog.js";
import { CC_MONO } from "./ccStyles.js";

const COUNT_PARAMS: SearchParams = { _summary: "count", _count: 0 };

const formatCount = (n: number | undefined): string => {
  if (n === undefined) return "";
  return n.toLocaleString();
};

export function CCSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [jumpOpen, setJumpOpen] = useState(false);
  const { pins, removePin, renamePin } = usePinned();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setJumpOpen(true);
      }
    };
    const onOpenJump = () => setJumpOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("fhir-place:open-jump", onOpenJump);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("fhir-place:open-jump", onOpenJump);
    };
  }, []);

  const activeType = (() => {
    const m = location.pathname.match(/^\/fhir-ui\/([^/]+)/);
    if (!m) return null;
    const rt = m[1];
    return TOP_RESOURCE_TYPES.includes(rt as (typeof TOP_RESOURCE_TYPES)[number]) ? rt : null;
  })();

  const isSettings = location.pathname === "/fhir-ui/settings";
  const isAsk = location.pathname === "/fhir-ui/ask";
  const isCql = location.pathname === "/cql-runner";
  const isGallery = location.pathname === "/fhir-ui/failure-gallery";
  const isDocs = location.pathname.startsWith("/docs");

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [pickerOpen]);

  const servers = loadServers();
  const activeServerId = loadActiveServerId() ?? ACTIVE_SERVER_CONFIG.id;

  const client = useFhirClient();
  const countQueries = useQueries({
    queries: TOP_RESOURCE_TYPES.map((rt) => ({
      queryKey: fhirQueryKeys.search(client.baseUrl, rt, COUNT_PARAMS),
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        client.search<Resource>(rt, COUNT_PARAMS, { signal }),
      staleTime: 60_000,
    })),
  });

  const counts = useMemo(() => {
    const out: Partial<Record<(typeof TOP_RESOURCE_TYPES)[number], number>> = {};
    TOP_RESOURCE_TYPES.forEach((rt, i) => {
      const total = (countQueries[i]?.data as Bundle | undefined)?.total;
      if (typeof total === "number") out[rt] = total;
    });
    return out;
  }, [countQueries]);

  const allResourcesTotal = useMemo(
    () => Object.values(counts).reduce((sum: number, n) => sum + (n ?? 0), 0),
    [counts],
  );
  const allResourcesLoading = countQueries.some((q) => q.isLoading);

  const switchServer = (id: string) => {
    saveActiveServerId(id);
    setPickerOpen(false);
    window.location.reload();
  };

  return (
    <div
      data-testid="fhir-ui-sidebar"
      className="cc-sidebar"
      style={{
        width: 260,
        borderRight: "1px solid var(--border)",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        height: "100%",
      }}
    >
      {/* Server picker */}
      <div ref={pickerRef} style={{ padding: "14px 12px", borderBottom: "1px solid var(--border)", position: "relative" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            border: "1px solid var(--border)",
            borderRadius: 8,
            background: "var(--sunken)",
            cursor: "pointer",
          }}
          onClick={() => setPickerOpen((v) => !v)}
          title="Switch server"
          data-testid="server-picker-trigger"
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: "var(--success)",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", lineHeight: 1.2 }}>
              {ACTIVE_SERVER_CONFIG.label}
            </div>
            <div
              data-testid="base-url"
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                fontFamily: CC_MONO,
                lineHeight: 1.2,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {ACTIVE_SERVER_CONFIG.baseUrl}
            </div>
          </div>
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="var(--text-muted)"
            strokeWidth="1.5"
            style={{ transform: pickerOpen ? "rotate(180deg)" : "none", transition: "transform 120ms", flexShrink: 0 }}
          >
            <path d="M3 5l3-3 3 3M3 7l3 3 3-3" />
          </svg>
        </div>

        {pickerOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% - 4px)",
              left: 12,
              right: 12,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              zIndex: 100,
              overflow: "hidden",
            }}
          >
            {servers.map((s) => {
              const isActive = s.id === activeServerId;
              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    cursor: isActive ? "default" : "pointer",
                    background: isActive ? "var(--accent-soft)" : "transparent",
                  }}
                  onClick={() => !isActive && switchServer(s.id)}
                  data-testid={`server-option-${s.id}`}
                >
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      background: isActive ? "var(--success)" : "var(--text-subtle)",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: isActive ? 600 : 400, color: "var(--text)", lineHeight: 1.2 }}>
                      {s.label}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--text-muted)",
                        fontFamily: CC_MONO,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {s.baseUrl}
                    </div>
                  </div>
                  {isActive && (
                    <span style={{ fontSize: 10, color: "var(--accent-text)", fontWeight: 600 }}>Active</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Search / Jump */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <div
          role="button"
          tabIndex={0}
          data-testid="jump-search-trigger"
          onClick={() => setJumpOpen(true)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setJumpOpen(true); }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 10px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            background: "var(--bg)",
            cursor: "pointer",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="var(--text-subtle)" strokeWidth="1.5">
            <circle cx="6" cy="6" r="4.5" />
            <path d="M9.5 9.5L13 13" />
          </svg>
          <span style={{ fontSize: 12, color: "var(--text-subtle)", flex: 1 }}>Search in plain English…</span>
          <span
            style={{
              fontSize: 10,
              color: "var(--text-subtle)",
              fontFamily: CC_MONO,
              padding: "1px 5px",
              border: "1px solid var(--border)",
              borderRadius: 3,
            }}
          >
            ⌘K
          </span>
        </div>
      </div>

      <JumpDialog open={jumpOpen} onClose={() => setJumpOpen(false)} />

      {/* Resources + Pinned scroll region */}
      <div style={{ overflowY: "auto", flex: 1 }} data-testid="sidebar-scroll">
      {/* Resources */}
      <div style={{ padding: "12px 8px 4px" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--text-subtle)",
            letterSpacing: 0.6,
            textTransform: "uppercase",
            padding: "6px 10px 8px",
          }}
        >
          Resources
        </div>
        <div
          data-testid="sidebar-link-all"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "5px 10px",
            borderRadius: 6,
            color: "var(--text)",
            marginBottom: 1,
          }}
        >
          <span style={{ fontSize: 13, flex: 1, minWidth: 0 }}>All resources</span>
          <SidebarCount
            value={allResourcesLoading && allResourcesTotal === 0 ? undefined : allResourcesTotal}
            isActive={false}
            testId="sidebar-count-all"
          />
        </div>
        {TOP_RESOURCE_TYPES.map((rt) => {
          const isActive = rt === activeType;
          return (
            <Link
              key={rt}
              to={`/fhir-ui/${rt}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 10px",
                borderRadius: 6,
                background: isActive ? "var(--accent-soft)" : "transparent",
                color: isActive ? "var(--accent-text)" : "var(--text)",
                cursor: "pointer",
                marginBottom: 1,
                textDecoration: "none",
                transition: "background 80ms ease",
              }}
              data-testid={`sidebar-link-${rt}`}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {rt}
              </span>
              <SidebarCount
                value={counts[rt]}
                isActive={isActive}
                testId={`sidebar-count-${rt}`}
              />
            </Link>
          );
        })}
      </div>

      {/* Pinned */}
      <div
        data-testid="sidebar-pinned-section"
        style={{ padding: "8px 8px 12px", borderTop: "1px solid var(--border)", marginTop: 8 }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "var(--text-subtle)",
            letterSpacing: 0.6,
            textTransform: "uppercase",
            padding: "6px 10px 8px",
          }}
        >
          Pinned
        </div>
        {pins.length === 0 ? (
          <div
            data-testid="pinned-empty-state"
            style={{
              margin: "2px 6px",
              padding: "10px 12px",
              border: "1px dashed var(--border-strong, var(--border))",
              borderRadius: 6,
              fontSize: 11,
              color: "var(--text-subtle)",
              lineHeight: 1.4,
            }}
          >
            Click the pin icon in the topbar to save a query or resource here.
          </div>
        ) : (
          pins.map((pin) => {
            const isActive = pin.path === `${location.pathname}${location.search}`;
            return (
              <Link
                key={pin.id}
                to={pin.path}
                data-testid={`pinned-row-${pin.id}`}
                onContextMenu={(e) => handlePinContext(e, pin, renamePin, removePin)}
                title="Right-click to rename or remove"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 10px",
                  borderRadius: 6,
                  background: isActive ? "var(--accent-soft)" : "transparent",
                  color: isActive ? "var(--accent-text)" : "var(--text)",
                  cursor: "pointer",
                  marginBottom: 1,
                  textDecoration: "none",
                  transition: "background 80ms ease",
                }}
              >
                <BookmarkIcon active={isActive} />
                <span
                  data-testid={`pinned-label-${pin.id}`}
                  style={{
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {pin.label}
                </span>
                <span
                  data-testid={`pinned-kind-${pin.id}`}
                  style={{
                    fontSize: 11,
                    fontFamily: CC_MONO,
                    color: isActive ? "var(--accent-text)" : "var(--text-muted)",
                    flexShrink: 0,
                  }}
                >
                  {pin.kind}
                </span>
              </Link>
            );
          })
        )}
      </div>
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "10px 14px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 11,
            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 11,
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          FP
        </div>
        <div style={{ flex: 1, fontSize: 12, color: "var(--text)" }}>fhir-place</div>
        {/* Ask */}
        <button
          onClick={() => navigate("/fhir-ui/ask")}
          title="Ask"
          data-testid="ask-nav"
          style={{
            background: isAsk ? "var(--accent-soft)" : "transparent",
            border: "none",
            borderRadius: 6,
            padding: "4px 5px",
            cursor: "pointer",
            color: isAsk ? "var(--accent-text)" : "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8.5a1 1 0 01-1 1H4l-2.5 2.5V3a1 1 0 011-1h9a1 1 0 011 1v5.5z" />
          </svg>
        </button>
        {/* CQL Runner */}
        <button
          onClick={() => navigate("/cql-runner")}
          title="CQL Runner"
          data-testid="cql-nav"
          style={{
            background: isCql ? "var(--accent-soft)" : "transparent",
            border: "none",
            borderRadius: 6,
            padding: "4px 5px",
            cursor: "pointer",
            color: isCql ? "var(--accent-text)" : "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 4.5L1 7l2.5 2.5M10.5 4.5L13 7l-2.5 2.5M8 2l-2 10" />
          </svg>
        </button>
        {/* Docs */}
        <button
          onClick={() => navigate("/docs")}
          title="Docs"
          data-testid="docs-nav"
          style={{
            background: isDocs ? "var(--accent-soft)" : "transparent",
            border: "none",
            borderRadius: 6,
            padding: "4px 5px",
            cursor: "pointer",
            color: isDocs ? "var(--accent-text)" : "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 2h6.5l3 3v7H2.5z" />
            <path d="M9 2v3h3" />
            <path d="M4.5 7.5h5M4.5 9.5h5M4.5 5.5h2" />
          </svg>
        </button>
        {/* Failure Gallery */}
        <button
          onClick={() => navigate("/fhir-ui/failure-gallery")}
          title="Safety Failure Gallery"
          data-testid="failure-gallery-nav"
          style={{
            background: isGallery ? "var(--accent-soft)" : "transparent",
            border: "none",
            borderRadius: 6,
            padding: "4px 5px",
            cursor: "pointer",
            color: isGallery ? "var(--accent-text)" : "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 1L7 4M7 10L7 13M1 7L4 7M10 7L13 7M3 3L5 5M9 9L11 11M11 3L9 5M5 9L3 11" />
            <circle cx="7" cy="7" r="2" />
          </svg>
        </button>
        {/* Settings */}
        <button
          onClick={() => navigate("/fhir-ui/settings")}
          title="Settings"
          data-testid="settings-nav"
          style={{
            background: isSettings ? "var(--accent-soft)" : "transparent",
            border: "none",
            borderRadius: 6,
            padding: "4px 5px",
            cursor: "pointer",
            color: isSettings ? "var(--accent-text)" : "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 0,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="7" cy="7" r="2" />
            <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.6 2.6l1 1M10.4 10.4l1 1M11.4 2.6l-1 1M3.6 10.4l-1 1" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function BookmarkIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 14 14"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d="M3.5 1.5h7v9.25L7 8.5 3.5 10.75z" />
    </svg>
  );
}

/**
 * v1 right-click handler. Native confirm/prompt keep this off the critical
 * path while we wait for the design system's menu primitive (#TBD).
 */
function handlePinContext(
  e: React.MouseEvent,
  pin: { id: string; label: string },
  rename: (id: string, label: string) => void,
  remove: (id: string) => void,
) {
  e.preventDefault();
  const action = window.prompt(
    `Type "rename" to rename "${pin.label}" or "remove" to delete it.`,
    "rename",
  );
  if (!action) return;
  if (action.toLowerCase() === "remove") {
    if (window.confirm(`Remove pin "${pin.label}"?`)) remove(pin.id);
    return;
  }
  if (action.toLowerCase() === "rename") {
    const next = window.prompt("Rename pin", pin.label);
    if (next !== null) rename(pin.id, next);
  }
}

interface SidebarCountProps {
  value: number | undefined;
  isActive: boolean;
  testId: string;
}

function SidebarCount({ value, isActive, testId }: SidebarCountProps) {
  return (
    <span
      data-testid={testId}
      style={{
        fontSize: 11,
        fontFamily: CC_MONO,
        color: isActive ? "var(--accent-text)" : "var(--text-subtle)",
        fontVariantNumeric: "tabular-nums",
        flexShrink: 0,
      }}
    >
      {formatCount(value)}
    </span>
  );
}
