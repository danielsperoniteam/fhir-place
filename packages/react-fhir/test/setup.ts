import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Node 25's built-in `globalThis.localStorage` (gated behind
// `--localstorage-file`) shadows jsdom's Storage with an object whose
// `setItem` / `clear` are `undefined`. Tests calling those methods
// throw `TypeError` before their first assertion. CI runs Node 22 so
// this is silent there; the shim below is a no-op when the real impl
// is present.
const shim = (target: typeof globalThis | Window, name: "localStorage" | "sessionStorage") => {
  const existing = (target as unknown as Record<string, Storage | undefined>)[name];
  if (existing && typeof existing.setItem === "function") return;
  const data: Record<string, string> = {};
  const impl = {
    setItem: (k: string, v: string) => { data[k] = String(v); },
    getItem: (k: string) => (k in data ? data[k]! : null),
    removeItem: (k: string) => { delete data[k]; },
    clear: () => { for (const k of Object.keys(data)) delete data[k]; },
  } as unknown as Storage;
  try {
    Object.defineProperty(target, name, { value: impl, configurable: true });
  } catch { /* property locked — let the real impl take its course */ }
};
shim(globalThis, "localStorage");
if (typeof window !== "undefined") shim(window, "localStorage");

afterEach(() => {
  cleanup();
});
