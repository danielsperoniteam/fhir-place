import { describe, expect, it, vi } from "vitest";
import { translateCql } from "./translator.js";

const okResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

const errResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("translateCql", () => {
  it("returns ok with the parsed ELM payload", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse({ library: { name: "Foo" } }));
    const result = await translateCql("library Foo", {
      url: "http://t.local",
      fetchImpl,
    });
    expect(result).toEqual({ ok: true, elm: { library: { name: "Foo" } } });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://t.local/translate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ cql: "library Foo" }),
      }),
    );
  });

  it("surfaces translator-reported errors", async () => {
    const errors = [{ message: "boom", line: 3, col: 5, severity: "Error" }];
    const fetchImpl = vi.fn().mockResolvedValue(errResponse(400, { errors }));
    const result = await translateCql("oops", { url: "http://t.local", fetchImpl });
    expect(result).toEqual({
      ok: false,
      errors: [
        { message: "boom", line: 3, col: 5, severity: "Error" },
      ],
    });
  });

  it("returns a synthetic error when the translator is unreachable", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    const result = await translateCql("x", { url: "http://t.local", fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]!.message).toMatch(/Translator unreachable/);
    }
  });

  it("falls back to a generic error when payload has no error array", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(errResponse(500, { other: "x" }));
    const result = await translateCql("x", { url: "http://t.local", fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]!.message).toMatch(/HTTP 500/);
    }
  });
});
