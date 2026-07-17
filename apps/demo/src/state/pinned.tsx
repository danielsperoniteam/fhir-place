import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ACTIVE_SERVER_CONFIG, loadActiveServerId } from "../config.js";

export type PinKind = "search" | "id" | "list";

export interface PinnedItem {
  id: string;
  kind: PinKind;
  label: string;
  /** Full route incl. search string; canonical key for de-duplication. */
  path: string;
  /** Set when kind === "search" — the encoded query string. */
  query?: string;
  /** Set for kinds that target a specific resource type. */
  resourceType?: string;
  /** Set when kind === "id" — e.g. "Patient/eve-baker". */
  ref?: string;
}

type ByServer = Record<string, PinnedItem[]>;

const STORAGE_KEY = "fhir-place:pinned";
const RESERVED = new Set(["settings", "ask", "types"]);

function load(): ByServer {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { byServer?: ByServer } | null;
    return (parsed?.byServer && typeof parsed.byServer === "object") ? parsed.byServer : {};
  } catch {
    return {};
  }
}

function save(byServer: ByServer): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ byServer }));
  } catch {
    /* private mode / quota */
  }
}

const newId = (): string =>
  `pin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Convert a route + search string into a PinnedItem. Returns null for routes
 * we deliberately don't pin (settings, ask, /new, etc.). Edit routes are
 * filtered upstream by the topbar's pinnable gate.
 */
export function pathToPin(pathname: string, search: string): PinnedItem | null {
  const detail = pathname.match(/^\/fhir-ui\/([^/]+)\/([^/]+)$/);
  if (detail?.[1] && detail[2] && detail[2] !== "new") {
    return {
      id: newId(), kind: "id", label: detail[2],
      ref: `${detail[1]}/${detail[2]}`, path: pathname,
    };
  }
  const list = pathname.match(/^\/fhir-ui\/([^/]+)$/);
  if (list?.[1] && !RESERVED.has(list[1])) {
    const rt = list[1];
    const q = search.startsWith("?") ? search.slice(1) : search;
    return q
      ? { id: newId(), kind: "search", label: rt, resourceType: rt, query: q, path: `${pathname}${search}` }
      : { id: newId(), kind: "list", label: rt, resourceType: rt, path: pathname };
  }
  return null;
}

interface PinnedCtx {
  pins: PinnedItem[];
  isPinned: (path: string) => boolean;
  togglePin: (path: string) => void;
  removePin: (id: string) => void;
  renamePin: (id: string, label: string) => void;
  /**
   * Save a query under a user-chosen label (#254 saved queries). Unlike
   * togglePin this never removes: pinning an already-pinned path renames
   * it to the new label instead.
   */
  pinSearch: (path: string, label: string) => void;
}

const PinnedContext = createContext<PinnedCtx>({
  pins: [], isPinned: () => false, togglePin: () => {}, removePin: () => {},
  renamePin: () => {}, pinSearch: () => {},
});

export function PinnedProvider({ children }: { children: ReactNode }) {
  const [byServer, setByServer] = useState<ByServer>(load);
  const serverId = loadActiveServerId() ?? ACTIVE_SERVER_CONFIG.id;

  useEffect(() => save(byServer), [byServer]);

  const pins = useMemo(() => byServer[serverId] ?? [], [byServer, serverId]);

  const update = useCallback(
    (fn: (prev: PinnedItem[]) => PinnedItem[]) =>
      setByServer((prev) => ({ ...prev, [serverId]: fn(prev[serverId] ?? []) })),
    [serverId],
  );

  const value = useMemo<PinnedCtx>(() => ({
    pins,
    isPinned: (path) => pins.some((p) => p.path === path),
    togglePin: (path) => {
      const existing = pins.find((p) => p.path === path);
      if (existing) return update((prev) => prev.filter((p) => p.id !== existing.id));
      const [pathname, ...rest] = path.split("?");
      const search = rest.length > 0 ? `?${rest.join("?")}` : "";
      const item = pathToPin(pathname ?? path, search);
      if (item) update((prev) => [...prev, item]);
    },
    removePin: (id) => update((prev) => prev.filter((p) => p.id !== id)),
    renamePin: (id, label) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      update((prev) => prev.map((p) => (p.id === id ? { ...p, label: trimmed } : p)));
    },
    pinSearch: (path, label) => {
      const trimmed = label.trim();
      const existing = pins.find((p) => p.path === path);
      if (existing) {
        if (trimmed && trimmed !== existing.label) {
          update((prev) =>
            prev.map((p) => (p.id === existing.id ? { ...p, label: trimmed } : p)),
          );
        }
        return;
      }
      const [pathname, ...rest] = path.split("?");
      const search = rest.length > 0 ? `?${rest.join("?")}` : "";
      const item = pathToPin(pathname ?? path, search);
      if (item) {
        update((prev) => [...prev, trimmed ? { ...item, label: trimmed } : item]);
      }
    },
  }), [pins, update]);

  return <PinnedContext.Provider value={value}>{children}</PinnedContext.Provider>;
}

export const usePinned = () => useContext(PinnedContext);
