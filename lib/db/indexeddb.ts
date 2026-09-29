import { openDB, type IDBPDatabase } from "idb";

export interface ChatMessageVariant {
  content: string;
  createdAt: number;
  usage?: { inputTokens: number; outputTokens: number };
  model?: string;
}

export interface ChatMessageDB {
  id: string;
  sessionId: string;
  role: "system" | "user" | "assistant";
  content: string;
  files?: Array<{
    id: string;
    name: string;
    type: string;
    size: number;
    data: string;
    preview?: string;
  }>;
  /** Alternative responses (regenerate history). `content` mirrors variants[activeVariant]. */
  variants?: ChatMessageVariant[];
  /** Index of the currently displayed variant (only set when variants exist) */
  activeVariant?: number;
  createdAt: number;
}

export interface ChatSessionDB {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = "ui-chataul";
const DB_VERSION = 2;

let dbInstance: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, _newVersion, transaction) {
      // ── v1: initial schema ──
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains("sessions")) {
          const sessionStore = db.createObjectStore("sessions", { keyPath: "id" });
          sessionStore.createIndex("updatedAt", "updatedAt");
        }
        if (!db.objectStoreNames.contains("messages")) {
          const msgStore = db.createObjectStore("messages", { keyPath: "id" });
          msgStore.createIndex("sessionId", "sessionId");
          msgStore.createIndex("createdAt", "createdAt");
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }
      }

      // ── v2: compound index for efficient per-session createdAt queries ──
      if (oldVersion < 2 && db.objectStoreNames.contains("messages")) {
        const msgStore = transaction.objectStore("messages");
        if (!msgStore.indexNames.contains("sessionCreatedAt")) {
          msgStore.createIndex("sessionCreatedAt", ["sessionId", "createdAt"]);
        }
      }
    },
  });

  return dbInstance;
}

// --- Sessions ---

export async function getAllSessions(): Promise<ChatSessionDB[]> {
  const db = await getDB();
  const sessions = await db.getAll("sessions");
  return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSession(id: string): Promise<ChatSessionDB | undefined> {
  const db = await getDB();
  return db.get("sessions", id);
}

export async function saveSession(session: ChatSessionDB): Promise<void> {
  const db = await getDB();
  await db.put("sessions", session);
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["sessions", "messages"], "readwrite");
  await tx.objectStore("sessions").delete(id);
  const msgStore = tx.objectStore("messages");
  const index = msgStore.index("sessionId");
  let cursor = await index.openCursor(IDBKeyRange.only(id));
  while (cursor) {
    await msgStore.delete(cursor.primaryKey);
    cursor = await cursor.continue();
  }
  await tx.done;
}

// --- Messages ---

/** Get ALL messages for a session (fallback, not recommended for large sessions) */
export async function getMessagesBySession(sessionId: string): Promise<ChatMessageDB[]> {
  const db = await getDB();
  const index = db.transaction("messages").store.index("sessionId");
  const messages = await index.getAll(sessionId);
  return messages.sort((a, b) => a.createdAt - b.createdAt);
}

/** Count total messages in a session */
export async function countMessagesBySession(sessionId: string): Promise<number> {
  const db = await getDB();
  const index = db.transaction("messages").store.index("sessionId");
  let count = 0;
  let cursor = await index.openCursor(IDBKeyRange.only(sessionId));
  while (cursor) {
    count++;
    cursor = await cursor.continue();
  }
  return count;
}

/**
 * Get the last N messages for a session (most recent).
 * Uses the compound index `sessionCreatedAt` with a reverse cursor
 * so only the requested items are loaded from IndexedDB — no full table scan.
 */
export async function getLastMessagesBySession(
  sessionId: string,
  limit: number,
): Promise<ChatMessageDB[]> {
  const db = await getDB();
  const tx = db.transaction("messages");
  const store = tx.store;

  // Use the compound index if available, otherwise fall back to sessionId index
  let index;
  if (store.indexNames.contains("sessionCreatedAt")) {
    index = store.index("sessionCreatedAt");
  } else {
    index = store.index("sessionId");
  }

  const messages: ChatMessageDB[] = [];

  if (store.indexNames.contains("sessionCreatedAt")) {
    // Efficient: reverse cursor on compound index — only fetches N items
    const range = IDBKeyRange.bound(
      [sessionId, 0],
      [sessionId, Date.now()],
    );
    let cursor = await index.openCursor(range, "prev");
    while (cursor && messages.length < limit) {
      messages.push(cursor.value);
      cursor = await cursor.continue();
    }
    // Return in chronological order
    return messages.reverse();
  } else {
    // Fallback: load all and slice
    const all = await index.getAll(sessionId);
    all.sort((a, b) => a.createdAt - b.createdAt);
    return all.slice(-limit);
  }
}

/**
 * Get messages older than a given timestamp for a session.
 * Uses the compound index for efficient reverse lookup.
 * Returns up to `limit` messages, sorted by createdAt ascending.
 */
export async function getMessagesBeforeTimestamp(
  sessionId: string,
  beforeTimestamp: number,
  limit: number,
): Promise<ChatMessageDB[]> {
  const db = await getDB();
  const tx = db.transaction("messages");
  const store = tx.store;

  if (store.indexNames.contains("sessionCreatedAt")) {
    const index = store.index("sessionCreatedAt");
    // Messages with sessionId AND createdAt < beforeTimestamp
    const range = IDBKeyRange.bound(
      [sessionId, 0],
      [sessionId, beforeTimestamp],
      false, // lower closed
      true,  // upper open (exclusive)
    );
    // Reverse cursor: newest first among the old ones
    const messages: ChatMessageDB[] = [];
    let cursor = await index.openCursor(range, "prev");
    while (cursor && messages.length < limit) {
      messages.push(cursor.value);
      cursor = await cursor.continue();
    }
    return messages.reverse();
  } else {
    // Fallback: load all, filter, sort, slice
    const index = store.index("sessionId");
    const all = await index.getAll(sessionId);
    return all
      .filter((m) => m.createdAt < beforeTimestamp)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-limit);
  }
}

/** Save (insert/update) a message */
export async function saveMessage(message: ChatMessageDB): Promise<void> {
  const db = await getDB();
  await db.put("messages", message);
}

/** Get a single message by id (includes full base64 file data) */
export async function getMessage(id: string): Promise<ChatMessageDB | undefined> {
  const db = await getDB();
  return db.get("messages", id);
}

/**
 * Delete a message and all messages after it (by createdAt) in a session.
 * Used when editing/regenerating: the message at `fromTimestamp` and every
 * reply after it are removed so they don't reappear on reload.
 */
export async function deleteMessagesFrom(sessionId: string, fromTimestamp: number): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("messages", "readwrite");
  const index = tx.store.index("sessionId");
  const keysToDelete: IDBValidKey[] = [];

  let cursor = await index.openCursor(IDBKeyRange.only(sessionId));
  while (cursor) {
    if (cursor.value.createdAt >= fromTimestamp) {
      keysToDelete.push(cursor.primaryKey);
    }
    cursor = await cursor.continue();
  }

  await Promise.all(keysToDelete.map((key) => tx.store.delete(key)));
  await tx.done;
}

export interface SessionSearchHit {
  message: ChatMessageDB;
  snippet: string;
}

/**
 * Search messages across ALL sessions by content substring (client-side scan).
 * Returns up to `limit` hits with a short surrounding snippet for display.
 */
export async function searchMessages(query: string, limit = 30): Promise<SessionSearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const db = await getDB();
  const tx = db.transaction("messages");
  const hits: SessionSearchHit[] = [];

  let cursor = await tx.store.openCursor();
  while (cursor && hits.length < limit) {
    const msg = cursor.value as ChatMessageDB;
    const idx = msg.content ? msg.content.toLowerCase().indexOf(q) : -1;
    if (idx !== -1) {
      const start = Math.max(0, idx - 40);
      const end = idx + q.length + 80;
      const snippet =
        (start > 0 ? "…" : "") +
        msg.content.slice(start, end) +
        (end < msg.content.length ? "…" : "");
      hits.push({ message: msg, snippet });
    }
    cursor = await cursor.continue();
  }
  // Most recent hits first — matches how users think when searching history
  hits.sort((a, b) => b.message.createdAt - a.message.createdAt);
  return hits;
}

// --- Settings ---

const SETTINGS_KEY = "app-settings";

export interface AppSettingsDB {
  provider: "openai" | "anthropic" | "ollama";
  baseURL: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  theme: "light" | "dark" | "system";
  useServerKey: boolean;
  numCtx: number;
  webSearchEnabled: boolean;
  useModelDefaults: boolean;
}

export const DEFAULT_SETTINGS: AppSettingsDB = {
  provider: "openai",
  baseURL: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4o",
  temperature: 0.7,
  maxTokens: 4096,
  systemPrompt: "You are a helpful assistant.",
  theme: "system",
  useServerKey: false,
  numCtx: 2048,
  webSearchEnabled: false,
  useModelDefaults: false,
};

export async function getSettings(): Promise<AppSettingsDB> {
  const db = await getDB();
  const settings = await db.get("settings", SETTINGS_KEY);
  return settings ? { ...DEFAULT_SETTINGS, ...settings.value } : DEFAULT_SETTINGS;
}

export async function saveSettings(settings: AppSettingsDB): Promise<void> {
  const db = await getDB();
  await db.put("settings", { key: SETTINGS_KEY, value: settings });
}
