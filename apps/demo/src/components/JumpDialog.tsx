import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { naturalLanguageToFhirQuery } from "../ask/anthropicQuery.js";
import { loadAnthropicApiKey } from "../config.js";
import { CC_MONO } from "./ccStyles.js";

interface JumpDialogProps {
  open: boolean;
  onClose: () => void;
}

export function JumpDialog({ open, onClose }: JumpDialogProps) {
  const navigate = useNavigate();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuestion("");
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const submit = async () => {
    if (!question.trim() || loading) return;
    const apiKey = loadAnthropicApiKey();
    if (!apiKey) {
      setError("No Anthropic API key — add one in Settings first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const plan = await naturalLanguageToFhirQuery(question, apiKey);
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(plan.params)) {
        if (v) qs.append(k, v);
      }
      const search = qs.toString();
      navigate(`/fhir-ui/${plan.resourceType}${search ? `?${search}` : ""}`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: 120,
        background: "rgba(0,0,0,0.4)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          boxShadow: "0 24px 60px rgba(0,0,0,0.25)",
          width: "100%",
          maxWidth: 560,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            borderBottom: error ? "1px solid var(--border)" : undefined,
          }}
        >
          {loading ? (
            <svg
              width="16" height="16" viewBox="0 0 16 16"
              fill="none" stroke="var(--accent)" strokeWidth="1.5"
              style={{ flexShrink: 0, animation: "spin 1s linear infinite" }}
            >
              <circle cx="8" cy="8" r="6" strokeOpacity="0.25" />
              <path d="M8 2a6 6 0 016 6" />
            </svg>
          ) : (
            <svg
              width="16" height="16" viewBox="0 0 16 16"
              fill="none" stroke="var(--text-subtle)" strokeWidth="1.5"
              style={{ flexShrink: 0 }}
            >
              <circle cx="7" cy="7" r="5" />
              <path d="M11 11l3.5 3.5" />
            </svg>
          )}
          <input
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Search in plain English… e.g. patients with diabetes over 65"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 15,
              color: "var(--text)",
              fontFamily: "inherit",
            }}
          />
          <span
            style={{
              fontSize: 10,
              color: "var(--text-subtle)",
              fontFamily: CC_MONO,
              padding: "2px 6px",
              border: "1px solid var(--border)",
              borderRadius: 4,
              flexShrink: 0,
            }}
          >
            ⏎ search
          </span>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: "10px 16px", fontSize: 12, color: "var(--error, #dc2626)" }}>
            {error}
          </div>
        )}

        {/* Footer hint */}
        {!error && (
          <div
            style={{
              padding: "8px 16px",
              fontSize: 11,
              color: "var(--text-subtle)",
              borderTop: "1px solid var(--border)",
            }}
          >
            Claude translates your question into a FHIR search and opens it as a new tab
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
