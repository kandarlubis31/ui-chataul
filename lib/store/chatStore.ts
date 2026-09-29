import { create } from "zustand";
import {
  getAllSessions,
  saveSession,
  deleteSession,
  getLastMessagesBySession,
  getMessagesBeforeTimestamp,
  countMessagesBySession,
  saveMessage,
  getMessage,
  deleteMessagesFrom,
  searchMessages,
  type ChatSessionDB,
  type ChatMessageDB,
  type ChatMessageVariant,
} from "@/lib/db/indexeddb";
import type { UploadedFile } from "@/lib/providers";

// ── Tuning ──
/** Max messages to keep in memory (zustand store) at any time */
export const MAX_IN_MEMORY = 60;
/** Number of older messages to load each time user scrolls up */
export const LOAD_PAGE_SIZE = 30;

export interface Session {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  files?: UploadedFile[];
  createdAt: number;
  usage?: { inputTokens: number; outputTokens: number };
  /** Alternative responses (regenerate history). Only set when >1 variant exists. */
  variants?: ChatMessageVariant[];
  /** Index of the currently displayed variant */
  activeVariant?: number;
}

export interface SessionSearchResult {
  sessionId: string;
  sessionTitle: string;
  messageId: string;
  role: "user" | "assistant" | "system";
  snippet: string;
  createdAt: number;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

/** Safely access localStorage — returns null if blocked or unavailable */
function safeGetItem(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSetItem(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* silently ignore */ }
}

interface ChatStore {
  sessions: Session[];
  currentSessionId: string | null;
  /** Messages currently in memory (most recent N only) */
  messages: Message[];
  /** Total number of messages in IndexedDB for the current session */
  totalMessageCount: number;
  /** How many older messages exist beyond what's loaded in memory */
  olderMessagesCount: number;
  /** Whether older messages are being loaded */
  loadingOlder: boolean;
  isStreaming: boolean;
  streamContent: string;
  loaded: boolean;
  stoppedEarly: boolean;
  /** Session the active stream belongs to (may differ from currentSessionId if user switched mid-stream) */
  streamSessionId: string | null;

  load: () => Promise<void>;
  createSession: () => Promise<string>;
  selectSession: (id: string) => Promise<void>;
  /** Load older messages from IndexedDB into memory, discarding oldest to stay under MAX_IN_MEMORY */
  loadOlderMessages: () => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  addMessage: (role: "user" | "assistant", content: string, files?: UploadedFile[]) => void;
  updateMessage: (id: string, content: string) => void;
  appendToLastAssistant: (content: string, persist?: boolean) => void;
  setStreaming: (streaming: boolean) => void;
  appendStreamContent: (token: string) => void;
  commitStreamContent: () => void;
  commitStoppedContent: () => void;
  setStreamContent: (content: string) => void;
  /** Remove a message (and everything after it) from memory + IndexedDB. Returns false if not found. */
  removeMessageFrom: (messageId: string) => Promise<boolean>;
  /** Append a regenerate result as a new variant on an existing assistant message */
  addVariant: (messageId: string, content: string, usage?: { inputTokens: number; outputTokens: number }) => void;
  /** Replace the variant list of a fresh message (edit flow: preserve old answers) */
  seedVariants: (messageId: string, prior: ChatMessageVariant[]) => void;
  /** Switch the displayed variant of an assistant message */
  setActiveVariant: (messageId: string, index: number) => void;
  /** Fetch full variant list (memory may hold a stripped copy) */
  getVariants: (messageId: string) => Promise<ChatMessageVariant[]>;
  /** Search messages across all sessions (client-side IndexedDB scan) */
  searchSessions: (query: string) => Promise<SessionSearchResult[]>;
  getCurrentSessionMessages: () => Message[];
  setUsage: (messageId: string, usage: { inputTokens: number; outputTokens: number }) => void;
}

/** Strip heavy base64 file data from messages before storing in memory */
function stripFileData(msg: ChatMessageDB): Message {
  if (!msg.files || msg.files.length === 0) return msg as unknown as Message;
  return {
    ...msg,
    files: msg.files.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      size: f.size,
      data: "", // stripped! full data only in IndexedDB — saves ~5-7MB per image
      preview: f.preview,
    })),
  } as unknown as Message;
}

/** Load last N messages into memory, compute olderMessagesCount */
async function loadSessionMessages(
  sessionId: string,
): Promise<Pick<ChatStore, "messages" | "totalMessageCount" | "olderMessagesCount">> {
  const totalMessages = await countMessagesBySession(sessionId);
  const recent = await getLastMessagesBySession(sessionId, MAX_IN_MEMORY);
  return {
    messages: recent.map(stripFileData),
    totalMessageCount: totalMessages,
    olderMessagesCount: Math.max(0, totalMessages - recent.length),
  };
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  messages: [],
  totalMessageCount: 0,
  olderMessagesCount: 0,
  loadingOlder: false,
  isStreaming: false,
  streamContent: "",
  loaded: false,
  stoppedEarly: false,
  streamSessionId: null,

  load: async () => {
    try {
      const sessions = await getAllSessions();
      set({ sessions, loaded: true });

      if (sessions.length > 0) {
        const lastId = safeGetItem("chataul:lastSessionId");
        const targetId = lastId && sessions.some((s) => s.id === lastId)
          ? lastId
          : sessions[0].id;
        const msgState = await loadSessionMessages(targetId);
        set({ currentSessionId: targetId, ...msgState });
      }
    } catch {
      set({ loaded: true });
    }
  },

  loadOlderMessages: async () => {
    const state = get();
    if (state.loadingOlder || state.olderMessagesCount <= 0 || !state.currentSessionId) return;

    const sessionAtStart = state.currentSessionId;
    set({ loadingOlder: true });
    try {
      // Find the oldest message currently in memory
      const oldest = state.messages[0];
      const olderMsgs = await getMessagesBeforeTimestamp(
        sessionAtStart,
        oldest?.createdAt ?? Date.now(),
        LOAD_PAGE_SIZE,
      );

      // Guard: user might have switched sessions during async load
      if (get().currentSessionId !== sessionAtStart) {
        set({ loadingOlder: false });
        return;
      }

      if (olderMsgs.length === 0) {
        set({ olderMessagesCount: 0, loadingOlder: false });
        return;
      }

      const olderCleaned = olderMsgs.map(stripFileData);
      const combined = [...olderCleaned, ...state.messages];

      // Keep within MAX_IN_MEMORY: drop oldest from the front
      const trimmed = combined.length > MAX_IN_MEMORY
        ? combined.slice(combined.length - MAX_IN_MEMORY)
        : combined;

      set({
        messages: trimmed,
        olderMessagesCount: Math.max(0, state.olderMessagesCount - olderMsgs.length),
        loadingOlder: false,
      });
    } catch {
      set({ loadingOlder: false });
    }
  },

  createSession: async () => {
    const id = generateId();
    const now = Date.now();
    const session: ChatSessionDB = {
      id,
      title: "New Chat",
      createdAt: now,
      updatedAt: now,
    };
    await saveSession(session);
    const sessions = [session, ...get().sessions];
    safeSetItem("chataul:lastSessionId", id);
    set({
      sessions,
      currentSessionId: id,
      messages: [],
      totalMessageCount: 0,
      olderMessagesCount: 0,
      streamContent: "",
      isStreaming: false,
      stoppedEarly: false,
      streamSessionId: null,
    });
    return id;
  },

  selectSession: async (id: string) => {
    // Switching mid-stream: persist the in-flight partial response to the
    // ORIGINAL session before the view resets
    const state = get();
    if (
      state.isStreaming &&
      state.streamSessionId &&
      state.streamSessionId !== id &&
      state.streamContent.trim()
    ) {
      const partial: Message = {
        id: generateId(),
        role: "assistant",
        content: state.streamContent,
        createdAt: Date.now(),
      };
      saveMessage({ ...partial, sessionId: state.streamSessionId });
    }

    safeSetItem("chataul:lastSessionId", id);
    const msgState = await loadSessionMessages(id);
    set({
      currentSessionId: id,
      ...msgState,
      streamContent: "",
      isStreaming: false,
      stoppedEarly: false,
      streamSessionId: null,
    });
  },

  renameSession: async (id: string, title: string) => {
    const sessions = get().sessions.map((s) =>
      s.id === id ? { ...s, title, updatedAt: Date.now() } : s,
    );
    set({ sessions });

    const session = sessions.find((s) => s.id === id);
    if (session) await saveSession(session);
  },

  removeSession: async (id: string) => {
    await deleteSession(id);
    const sessions = get().sessions.filter((s) => s.id !== id);
    const newCurrentId = get().currentSessionId === id ? sessions[0]?.id ?? null : get().currentSessionId;

    if (newCurrentId && newCurrentId !== get().currentSessionId) {
      const msgState = await loadSessionMessages(newCurrentId);
      set({ sessions, currentSessionId: newCurrentId, ...msgState });
    } else if (!newCurrentId) {
      set({ sessions, currentSessionId: null, messages: [], totalMessageCount: 0, olderMessagesCount: 0 });
    } else {
      set({ sessions });
    }
  },

  addMessage: (role, content, files?) => {
    const id = generateId();
    const msg: Message = {
      id,
      role,
      content,
      files: files ? [...files] : undefined,
      createdAt: Date.now(),
    };

    const currentSessionId = get().currentSessionId;

    if (currentSessionId) {
      // Save FULL data to IndexedDB (with base64) for future re-sends
      // Fire-and-forget: don't block UI on IndexedDB write
      saveMessage({ ...msg, sessionId: currentSessionId });

      // Strip file data from in-memory copy to save RAM (~5-7MB per image)
      const strippedMsg: Message = msg.files
        ? { ...msg, files: msg.files.map((f) => ({ ...f, data: "" })) }
        : msg;
      const msgs = [...get().messages, strippedMsg];
      const sessions = get().sessions.map((s) =>
        s.id === currentSessionId ? { ...s, updatedAt: Date.now() } : s,
      );
      set({
        sessions,
        messages: msgs,
        totalMessageCount: get().totalMessageCount + 1,
      });

      // Auto-title from first user message
      const userMessages = msgs.filter((m) => m.role === "user");
      if (userMessages.length === 1 && role === "user") {
        const title = content.slice(0, 50) + (content.length > 50 ? "..." : "");
        const session = sessions.find((s) => s.id === currentSessionId);
        if (session && session.title === "New Chat") {
          get().renameSession(currentSessionId, title);
        }
      }
    } else {
      set({ messages: [...get().messages, msg] });
    }
  },

  updateMessage: (id, content) => {
    const messages = get().messages.map((m) => (m.id === id ? { ...m, content } : m));
    set({ messages });
  },

  appendToLastAssistant: (content: string, persist = true) => {
    const state = get();
    const targetSessionId = state.streamSessionId ?? state.currentSessionId;

    // User switched sessions mid-continue: persist partial content to the
    // original session as its own message; don't touch the current view
    if (targetSessionId !== state.currentSessionId) {
      set({ streamContent: "", isStreaming: false, stoppedEarly: false, streamSessionId: null });
      if (persist && content.trim() && targetSessionId) {
        const msg: Message = { id: generateId(), role: "assistant", content, createdAt: Date.now() };
        saveMessage({ ...msg, sessionId: targetSessionId });
      }
      return;
    }

    const msgs = [...state.messages];
    const lastIdx = msgs.length - 1;
    if (lastIdx >= 0 && msgs[lastIdx].role === "assistant") {
      msgs[lastIdx] = { ...msgs[lastIdx], content: msgs[lastIdx].content + content };
      set({ messages: msgs, streamContent: "", isStreaming: false, stoppedEarly: false });
      if (persist && state.currentSessionId) {
        const updated = msgs[lastIdx];
        // Fire-and-forget: don't block UI on IndexedDB write
        saveMessage({ ...updated, sessionId: state.currentSessionId });
        const sessions = state.sessions.map((s) =>
          s.id === state.currentSessionId ? { ...s, updatedAt: Date.now() } : s,
        );
        set({ sessions });
      }
    } else {
      set({ streamContent: "", isStreaming: false, stoppedEarly: false });
    }
  },

  setStreaming: (streaming) => set({ isStreaming: streaming, stoppedEarly: false }),

  appendStreamContent: (token) => {
    set((state) => ({ streamContent: state.streamContent + token }));
  },

  commitStreamContent: () => {
    const content = get().streamContent;
    // Commit to the session the stream STARTED in, not whichever is open now
    const targetSessionId = get().streamSessionId ?? get().currentSessionId;
    const id = generateId();
    const msg: Message = {
      id,
      role: "assistant",
      content,
      createdAt: Date.now(),
    };

    // User switched sessions mid-stream: persist to the ORIGINAL session
    // without touching the newly selected session's in-memory messages
    if (targetSessionId !== get().currentSessionId) {
      set({ streamContent: "", isStreaming: false, stoppedEarly: false, streamSessionId: null });
      if (targetSessionId && content.trim()) {
        saveMessage({ ...msg, sessionId: targetSessionId });
      }
      return;
    }

    const messages = [...get().messages, msg];
    set({ messages, streamContent: "", isStreaming: false, stoppedEarly: false, streamSessionId: null });

    if (targetSessionId) {
      // Fire-and-forget: don't block UI on IndexedDB write
      saveMessage({ ...msg, sessionId: targetSessionId });
      const sessions = get().sessions.map((s) =>
        s.id === targetSessionId ? { ...s, updatedAt: Date.now() } : s,
      );
      set({ sessions, totalMessageCount: get().totalMessageCount + 1 });
    }
  },

  commitStoppedContent: () => {
    const content = get().streamContent;
    // Commit to the session the stream STARTED in, not whichever is open now
    const targetSessionId = get().streamSessionId ?? get().currentSessionId;
    const id = generateId();
    const msg: Message = {
      id,
      role: "assistant",
      content,
      createdAt: Date.now(),
    };

    // User switched sessions mid-stream: persist partial to the ORIGINAL
    // session without touching the newly selected session's in-memory messages
    if (targetSessionId !== get().currentSessionId) {
      set({ streamContent: "", isStreaming: false, stoppedEarly: false, streamSessionId: null });
      if (targetSessionId && content.trim()) {
        saveMessage({ ...msg, sessionId: targetSessionId });
      }
      return;
    }

    const messages = [...get().messages, msg];
    set({ messages, streamContent: "", isStreaming: false, stoppedEarly: true, streamSessionId: null });

    if (targetSessionId) {
      saveMessage({ ...msg, sessionId: targetSessionId });
      const sessions = get().sessions.map((s) =>
        s.id === targetSessionId ? { ...s, updatedAt: Date.now() } : s,
      );
      set({ sessions, totalMessageCount: get().totalMessageCount + 1 });
    }
  },

  setStreamContent: (content) => set({ streamContent: content }),

  removeMessageFrom: async (messageId: string) => {
    const idx = get().messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return false;
    const removedCount = get().messages.length - idx;
    const fromTs = get().messages[idx].createdAt;
    const sessionId = get().streamSessionId ?? get().currentSessionId;

    set({
      messages: get().messages.slice(0, idx),
      totalMessageCount: Math.max(0, get().totalMessageCount - removedCount),
    });

    // Also delete from IndexedDB (message + everything after it) so removed
    // messages don't reappear after a page reload
    if (sessionId) {
      try {
        await deleteMessagesFrom(sessionId, fromTs);
      } catch {
        // best-effort
      }
    }
    return true;
  },

  addVariant: (messageId, content, usage) => {
    const messages = get().messages.map((m) => {
      if (m.id !== messageId) return m;
      const variants: ChatMessageVariant[] = [
        ...(m.variants ?? [{ content: m.content, createdAt: m.createdAt, usage: m.usage }]),
        { content, createdAt: Date.now(), usage },
      ];
      return { ...m, content, variants, activeVariant: variants.length - 1 };
    });
    set({ messages });

    // Persist the variant list to IndexedDB (single record — variants live on the message)
    const updated = messages.find((m) => m.id === messageId);
    const sessionId = get().streamSessionId ?? get().currentSessionId;
    if (updated && sessionId) {
      saveMessage({ ...updated, sessionId });
    }
  },

  seedVariants: (messageId, prior) => {
    const messages = get().messages.map((m) => {
      if (m.id !== messageId) return m;
      const variants: ChatMessageVariant[] = [
        ...prior,
        { content: m.content, createdAt: m.createdAt, usage: m.usage },
      ];
      return { ...m, variants, activeVariant: variants.length - 1 };
    });
    set({ messages });

    const updated = messages.find((m) => m.id === messageId);
    const sessionId = get().currentSessionId;
    if (updated && sessionId) {
      saveMessage({ ...updated, sessionId });
    }
  },

  setActiveVariant: (messageId, index) => {
    const messages = get().messages.map((m) => {
      if (m.id !== messageId || !m.variants) return m;
      const clamped = Math.max(0, Math.min(index, m.variants.length - 1));
      const v = m.variants[clamped];
      return { ...m, content: v.content, activeVariant: clamped, usage: v.usage };
    });
    set({ messages });

    // Persist the active index so it survives reloads
    const updated = messages.find((m) => m.id === messageId);
    const sessionId = get().currentSessionId;
    if (updated && sessionId) {
      saveMessage({ ...updated, sessionId });
    }
  },

  getVariants: async (messageId) => {
    const inMemory = get().messages.find((m) => m.id === messageId);
    if (inMemory?.variants && inMemory.variants.length > 0) return inMemory.variants;

    // Memory copy may be a fresh DB record (or pre-variants data) — check IndexedDB
    const sessionId = get().currentSessionId;
    if (!sessionId) return inMemory?.variants ?? [];
    const full = await getMessage(messageId);
    return full?.variants ?? [];
  },

  searchSessions: async (query) => {
    const hits = await searchMessages(query, 30);
    const sessions = get().sessions;
    return hits.map((h) => ({
      sessionId: h.message.sessionId,
      sessionTitle: sessions.find((s) => s.id === h.message.sessionId)?.title ?? "Chat",
      messageId: h.message.id,
      role: h.message.role,
      snippet: h.snippet,
      createdAt: h.message.createdAt,
    }));
  },

  getCurrentSessionMessages: () => {
    return get().messages;
  },

  setUsage: (messageId, usage) => {
    const messages = get().messages.map((m) =>
      m.id === messageId ? { ...m, usage } : m,
    );
    set({ messages });

    // Persist to IndexedDB
    const updated = messages.find((m) => m.id === messageId);
    const currentSessionId = get().currentSessionId;
    if (updated && currentSessionId) {
      saveMessage({ ...updated, sessionId: currentSessionId });
    }
  },
}));
