/**
 * Playwright-backed tool implementations exposed to the LLM as
 * Anthropic-format function tools. Each tool returns a small JSON-friendly
 * payload — never raw HTML — so token usage stays bounded.
 */

import type { Page } from "@playwright/test";
import type Anthropic from "@anthropic-ai/sdk";
import type { Selector } from "./types.js";

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "navigate",
    description:
      "Navigate the browser to a URL. Use a relative path like '#/Patient' to stay within the app, or an absolute URL.",
    input_schema: {
      type: "object",
      properties: { url: { type: "string" } },
      required: ["url"],
    },
  },
  {
    name: "click",
    description:
      "Click an element. Provide exactly one of testid, role+name, or text. Use nth (0-indexed) when multiple match.",
    input_schema: {
      type: "object",
      properties: {
        testid: { type: "string" },
        role: { type: "string" },
        name: { type: "string" },
        text: { type: "string" },
        nth: { type: "number" },
      },
    },
  },
  {
    name: "fill",
    description: "Type a value into an input. Identify by testid, role+name, or text.",
    input_schema: {
      type: "object",
      properties: {
        testid: { type: "string" },
        role: { type: "string" },
        name: { type: "string" },
        text: { type: "string" },
        nth: { type: "number" },
        value: { type: "string" },
      },
      required: ["value"],
    },
  },
  {
    name: "read_page",
    description:
      "Read the current page state. Mode 'testids' lists all data-testid values currently in the DOM (best for picking selectors). Mode 'text' returns visible text. Mode 'aria' returns an aria snapshot.",
    input_schema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["testids", "text", "aria"] },
      },
      required: ["mode"],
    },
  },
  {
    name: "wait_for",
    description:
      "Wait for an element to become visible. Identify by testid, role+name, or text. Default timeout 10s.",
    input_schema: {
      type: "object",
      properties: {
        testid: { type: "string" },
        role: { type: "string" },
        name: { type: "string" },
        text: { type: "string" },
        timeoutMs: { type: "number" },
      },
    },
  },
  {
    name: "screenshot",
    description:
      "Take a viewport screenshot. Use sparingly — tokens are expensive. Returns a path saved alongside the run report.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "report_outcome",
    description:
      "Terminal tool. Call exactly once when done. status='success' if you achieved the goal, 'blocked' if you couldn't reach a verdict (loading errors, missing data), 'bug-suspected' if the app behaved incorrectly.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["success", "blocked", "bug-suspected"],
        },
        summary: { type: "string" },
        evidenceSteps: { type: "array", items: { type: "string" } },
      },
      required: ["status", "summary"],
    },
  },
];

const buildLocator = (page: Page, sel: Partial<Selector & { name: string }>) => {
  if ("testid" in sel && sel.testid) {
    const loc = page.getByTestId(sel.testid);
    return sel.nth != null ? loc.nth(sel.nth) : loc;
  }
  if ("role" in sel && sel.role) {
    const loc = page.getByRole(sel.role as Parameters<Page["getByRole"]>[0], {
      name: sel.name,
    });
    return sel.nth != null ? loc.nth(sel.nth) : loc;
  }
  if ("text" in sel && sel.text) {
    const loc = page.getByText(sel.text);
    return sel.nth != null ? loc.nth(sel.nth) : loc;
  }
  throw new Error("Selector requires one of: testid, role (+name), or text");
};

export interface ToolContext {
  page: Page;
  screenshotsDir: string;
  takeScreenshot: () => Promise<string>;
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  try {
    switch (name) {
      case "navigate": {
        const url = String(input.url ?? "");
        const response = await ctx.page.goto(url, { waitUntil: "domcontentloaded" });
        return {
          ok: true,
          result: { url: ctx.page.url(), status: response?.status() ?? null },
        };
      }
      case "click": {
        await buildLocator(ctx.page, input).click({ timeout: 10_000 });
        return { ok: true, result: { url: ctx.page.url() } };
      }
      case "fill": {
        const value = String(input.value ?? "");
        await buildLocator(ctx.page, input).fill(value, { timeout: 10_000 });
        return { ok: true };
      }
      case "wait_for": {
        const timeout = Number(input.timeoutMs ?? 10_000);
        await buildLocator(ctx.page, input).waitFor({ state: "visible", timeout });
        return { ok: true };
      }
      case "read_page": {
        const mode = String(input.mode ?? "testids");
        if (mode === "testids") {
          const testids = await ctx.page.evaluate(() => {
            const els = document.querySelectorAll<HTMLElement>("[data-testid]");
            const counts: Record<string, number> = {};
            els.forEach((el) => {
              const id = el.getAttribute("data-testid");
              if (id) counts[id] = (counts[id] ?? 0) + 1;
            });
            return counts;
          });
          return { ok: true, result: { url: ctx.page.url(), testids } };
        }
        if (mode === "aria") {
          const snapshot = await ctx.page.locator("body").ariaSnapshot();
          return { ok: true, result: { url: ctx.page.url(), aria: snapshot.slice(0, 8_000) } };
        }
        const text = (await ctx.page.locator("body").innerText()).slice(0, 8_000);
        return { ok: true, result: { url: ctx.page.url(), text } };
      }
      case "screenshot": {
        const path = await ctx.takeScreenshot();
        return { ok: true, result: { path } };
      }
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
