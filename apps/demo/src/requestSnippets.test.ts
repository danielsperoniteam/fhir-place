import { describe, expect, it } from "vitest";
import { formatAsCurl, formatAsFetch } from "./requestSnippets.js";

const envelope = {
  url: "https://hapi.fhir.org/baseR4/Patient?name=smith&_count=20",
  headers: { Accept: "application/fhir+json" },
};

describe("formatAsCurl", () => {
  it("emits a runnable curl command with headers and a quoted URL", () => {
    expect(formatAsCurl(envelope)).toBe(
      "curl -H 'Accept: application/fhir+json' \\\n" +
        "  'https://hapi.fhir.org/baseR4/Patient?name=smith&_count=20'",
    );
  });

  it("includes auth and custom headers", () => {
    const out = formatAsCurl({
      ...envelope,
      headers: {
        Accept: "application/fhir+json",
        Authorization: "Bearer sekret",
        "X-Tenant": "acme",
      },
    });
    expect(out).toContain("-H 'Authorization: Bearer sekret'");
    expect(out).toContain("-H 'X-Tenant: acme'");
  });

  it("escapes single quotes so the shell string cannot be broken out of", () => {
    const out = formatAsCurl({
      url: "https://x.test/Patient?name=o'brien",
      headers: { Accept: "application/fhir+json" },
    });
    expect(out).toContain(`'https://x.test/Patient?name=o'\\''brien'`);
  });
});

describe("formatAsFetch", () => {
  it("emits valid JS with a headers object", () => {
    expect(formatAsFetch(envelope)).toBe(
      [
        "await fetch('https://hapi.fhir.org/baseR4/Patient?name=smith&_count=20', {",
        "  headers: {",
        "    'Accept': 'application/fhir+json',",
        "  },",
        "});",
      ].join("\n"),
    );
  });

  it("escapes quotes and backslashes in header values", () => {
    const out = formatAsFetch({
      ...envelope,
      headers: { Accept: "application/fhir+json", "X-Note": `it's a \\ test` },
    });
    expect(out).toContain(`'X-Note': 'it\\'s a \\\\ test',`);
  });
});
