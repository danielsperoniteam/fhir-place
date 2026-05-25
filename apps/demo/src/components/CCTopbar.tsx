import { Link, useLocation } from "react-router-dom";
import { useTheme } from "../context/ThemeContext.js";
import { usePinned } from "../state/pinned.js";
import { CC_FONT, CC_MONO, ccBtn } from "./ccStyles.js";

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="7" cy="7" r="2.5" />
      <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.6 2.6l1 1M10.4 10.4l1 1M11.4 2.6l-1 1M3.6 10.4l-1 1" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M11 8A5 5 0 016 3a5 5 0 100 10 5 5 0 005-5z" />
    </svg>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  // Bookmark/pin glyph; switches to a filled fill when the route is pinned
  // so the topbar reads as a toggle, not a one-shot action.
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    >
      <path d="M3.5 1.5h7v9.25L7 8.5 3.5 10.75z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M2 3.5h10M2 7h10M2 10.5h10" />
    </svg>
  );
}

interface CCTopbarProps {
  onMobileNavOpen?: () => void;
}

export function CCTopbar({ onMobileNavOpen }: CCTopbarProps) {
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const { isPinned, togglePin } = usePinned();
  const isSettings = location.pathname === "/fhir-ui/settings";

  const fullPath = `${location.pathname}${location.search}`;
  const pinnable =
    location.pathname.startsWith("/fhir-ui/") &&
    location.pathname !== "/fhir-ui/settings" &&
    location.pathname !== "/fhir-ui/ask" &&
    location.pathname !== "/fhir-ui/types" &&
    !location.pathname.endsWith("/new");
  const pinned = pinnable && isPinned(fullPath);

  // useParams() returns {} when rendered outside <Routes>, so parse from pathname directly.
  const p = location.pathname;
  const routeMatch = p.match(/^\/fhir-ui\/([^/]+?)(?:\/([^/]+?)(?:\/(edit))?)?$/);
  const resourceType = routeMatch?.[1];
  const id = routeMatch?.[2];

  const breadcrumb = (() => {
    if (p === "/fhir-ui/settings") return ["Settings", "Servers"];
    if (p === "/fhir-ui/ask") return ["Ask"];
    if (id) {
      const suffix = p.endsWith("/edit") ? ["edit"] : [];
      return ["FHIR Explorer", resourceType ?? "", id, ...suffix].filter(Boolean);
    }
    if (resourceType) return ["FHIR Explorer", resourceType];
    return ["FHIR Explorer"];
  })();

  return (
    <div
      style={{
        height: 44,
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 16,
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={onMobileNavOpen}
        className="mobile-nav-trigger"
        style={ccBtn("ghost")}
        title="Open navigation"
        aria-label="Open navigation"
        data-testid="mobile-nav-trigger"
      >
        <MenuIcon />
      </button>

      {/* Breadcrumb */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--text-muted)",
          fontFamily: CC_FONT,
          minWidth: 0,
        }}
      >
        {breadcrumb.map((b, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span
              style={{
                color: i === breadcrumb.length - 1 ? "var(--text)" : "var(--text-muted)",
                fontWeight: i === breadcrumb.length - 1 ? 500 : 400,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontFamily: i > 1 ? CC_MONO : CC_FONT,
                fontSize: i > 1 ? 12 : 13,
              }}
            >
              {b}
            </span>
            {i < breadcrumb.length - 1 && (
              <span style={{ color: "var(--text-subtle)", flexShrink: 0 }}>/</span>
            )}
          </span>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      {/* Actions */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 6 }}
        data-testid="topbar-actions"
      >
        <button
          onClick={() => pinnable && togglePin(fullPath)}
          disabled={!pinnable}
          style={{
            ...ccBtn("ghost"),
            color: pinned ? "var(--accent-text)" : "var(--text-muted)",
            background: pinned ? "var(--accent-soft)" : "transparent",
            opacity: pinnable ? 1 : 0.4,
            cursor: pinnable ? "pointer" : "not-allowed",
          }}
          title={pinned ? "Unpin this view" : "Pin this view"}
          aria-pressed={pinned}
          data-testid="topbar-pin"
        >
          <PinIcon filled={pinned} />
        </button>
        <button
          onClick={toggle}
          style={ccBtn("ghost")}
          title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          aria-label={theme === "light" ? "Toggle dark mode" : "Toggle light mode"}
          data-testid="topbar-theme"
        >
          {theme === "light" ? <MoonIcon /> : <SunIcon />}
        </button>
        <Link
          to="/fhir-ui/settings"
          style={{
            ...ccBtn("ghost"),
            color: isSettings ? "var(--accent-text)" : "var(--text-muted)",
            background: isSettings ? "var(--accent-soft)" : "transparent",
            textDecoration: "none",
          }}
          data-testid="topbar-settings"
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="7" cy="7" r="2" />
            <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.6 2.6l1 1M10.4 10.4l1 1M11.4 2.6l-1 1M3.6 10.4l-1 1" />
          </svg>
          Settings
        </Link>
      </div>
    </div>
  );
}
