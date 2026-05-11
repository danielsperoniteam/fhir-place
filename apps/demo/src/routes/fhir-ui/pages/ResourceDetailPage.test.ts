import { describe, expect, it } from "vitest";
import { colorJson } from "./ResourceDetailPage.js";

// Regression for #360: `colorJson` previously did a raw `replace`-into-
// `dangerouslySetInnerHTML` so any FHIR resource whose JSON
// serialization contained `<`, `>`, or `&` (e.g. a `text.div` narrative
// — a *required* element on most resources) injected raw markup. The
// fix HTML-escapes each line before token-coloring.
describe("colorJson", () => {
  it("escapes <, >, and & before wrapping JSON tokens", () => {
    const line = '    "div": "<img src=x onerror=alert(1)>",';
    const out = colorJson(line);
    // Angle brackets from the FHIR data must be entity-encoded so a
    // browser parsing this with `dangerouslySetInnerHTML` can't see
    // them as the start of a tag.
    expect(out).not.toContain("<img");
    expect(out).not.toContain("alert(1)>");
    expect(out).toContain("&lt;img");
    expect(out).toContain("&gt;");
  });

  it("escapes a literal <script> payload", () => {
    const line = '    "given": "<script>window.__pwn=true</script>"';
    const out = colorJson(line);
    expect(out).not.toMatch(/<script\b/i);
    expect(out).toContain("&lt;script&gt;");
    expect(out).toContain("&lt;/script&gt;");
  });

  it("escapes ampersands so existing entities aren't double-decoded", () => {
    const line = '    "name": "Smith &amp; Jones"';
    const out = colorJson(line);
    expect(out).toContain("Smith &amp;amp; Jones");
  });

  it("still wraps JSON keys, string values, booleans, and numbers in styling spans", () => {
    expect(colorJson('  "active": true,')).toContain(
      'style="color:var(--accent-text)">"active"',
    );
    expect(colorJson('  "active": true,')).toContain(
      'style="color:var(--accent)">true',
    );
    expect(colorJson('  "name": "Alice",')).toContain(
      'style="color:var(--success)">"Alice"',
    );
    expect(colorJson('  "count": 42')).toContain(
      'style="color:var(--accent)">42',
    );
  });

  it("leaves safe lines untouched aside from token spans", () => {
    const out = colorJson('{');
    // Bare punctuation has no JSON tokens to wrap; it should round-trip.
    expect(out).toBe("{");
  });
});
