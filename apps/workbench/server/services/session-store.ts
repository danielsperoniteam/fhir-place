import { eq } from "drizzle-orm";
import { agentSession, type AgentSession } from "../../db/schema.js";
import type { WorkbenchDb } from "../../db/client.js";

export interface CreateSessionInput {
  connectionId: string;
  patientId: string;
}

export function createSessionStore(
  db: WorkbenchDb,
  options: { generateId?: () => string; now?: () => string } = {},
) {
  const generateId = options.generateId ?? defaultId;
  const now = options.now ?? (() => new Date().toISOString());

  return {
    list(): AgentSession[] {
      return db.select().from(agentSession).all();
    },

    get(id: string): AgentSession | null {
      return (
        db.select().from(agentSession).where(eq(agentSession.id, id)).get() ??
        null
      );
    },

    create(input: CreateSessionInput): AgentSession {
      const id = generateId();
      const ts = now();
      db.insert(agentSession)
        .values({
          id,
          connectionId: input.connectionId,
          patientId: input.patientId,
          createdAt: ts,
          updatedAt: ts,
        })
        .run();
      const row = db
        .select()
        .from(agentSession)
        .where(eq(agentSession.id, id))
        .get();
      if (!row) throw new Error("session insert failed");
      return row;
    },

    delete(id: string): boolean {
      const result = db
        .delete(agentSession)
        .where(eq(agentSession.id, id))
        .run();
      return result.changes > 0;
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;

function defaultId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
