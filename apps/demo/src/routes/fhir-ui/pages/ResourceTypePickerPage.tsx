import { bundledTypes } from "@fhir-place/react-fhir";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CC_MONO } from "../../../components/ccStyles.js";
import {
  TOP_RESOURCE_TYPES,
  isTopResourceType,
} from "../../../resourceListConfig.js";

const TOP_SET = new Set<string>(TOP_RESOURCE_TYPES);

interface Section {
  label: string;
  types: string[];
}

function partition(filter: string): Section[] {
  const trimmed = filter.trim().toLowerCase();
  const matches = (t: string) =>
    !trimmed || t.toLowerCase().includes(trimmed);
  const top = TOP_RESOURCE_TYPES.filter(matches);
  const others = bundledTypes
    .filter((t) => !TOP_SET.has(t))
    .filter(matches);
  const sections: Section[] = [];
  if (top.length > 0) sections.push({ label: "Common", types: [...top] });
  if (others.length > 0) sections.push({ label: "All other types", types: others });
  return sections;
}

export function ResourceTypePickerPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const sections = useMemo(() => partition(filter), [filter]);

  // Flat ordered list of types currently visible — used for keyboard nav.
  const flat = useMemo(
    () => sections.flatMap((s) => s.types),
    [sections],
  );
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [filter]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const open = (rt: string) => navigate(`/fhir-ui/${rt}`);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, flat.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const rt = flat[activeIndex];
      if (rt) open(rt);
    }
  };

  return (
    <div
      data-testid="resource-type-picker-page"
      style={{
        padding: "24px 28px",
        maxWidth: 880,
        margin: "0 auto",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            margin: 0,
            color: "var(--text)",
            letterSpacing: -0.2,
          }}
        >
          Choose a resource type
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "var(--text-muted)",
            margin: "6px 0 0",
          }}
        >
          Open the list page for any of the {bundledTypes.length} R4 resource
          types this server may store.
        </p>
      </div>

      <input
        ref={inputRef}
        data-testid="resource-type-picker-filter"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Filter resource types…"
        style={{
          padding: "10px 12px",
          fontSize: 14,
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--surface)",
          color: "var(--text)",
          outline: "none",
        }}
      />

      {flat.length === 0 ? (
        <div
          style={{
            padding: "32px 16px",
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 13,
            border: "1px dashed var(--border)",
            borderRadius: 8,
          }}
        >
          No resource types match "{filter}"
        </div>
      ) : (
        sections.map((section) => {
          const sectionStart = flat.indexOf(section.types[0]!);
          return (
            <div
              key={section.label}
              data-testid={`resource-type-picker-section-${section.label
                .replace(/\s+/g, "-")
                .toLowerCase()}`}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--text-subtle)",
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  padding: "0 4px 8px",
                }}
              >
                {section.label}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: 8,
                }}
              >
                {section.types.map((rt, i) => {
                  const idx = sectionStart + i;
                  const isActive = idx === activeIndex;
                  const curated = isTopResourceType(rt);
                  return (
                    <button
                      key={rt}
                      type="button"
                      data-testid={`resource-type-picker-item-${rt}`}
                      onClick={() => open(rt)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 4,
                        padding: "10px 12px",
                        border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                        borderRadius: 8,
                        background: isActive ? "var(--accent-soft)" : "var(--surface)",
                        color: "var(--text)",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background 80ms ease, border-color 80ms ease",
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{rt}</span>
                      <span
                        style={{
                          fontSize: 10,
                          color: "var(--text-subtle)",
                          fontFamily: CC_MONO,
                        }}
                      >
                        {curated ? "Common" : "Browse"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
