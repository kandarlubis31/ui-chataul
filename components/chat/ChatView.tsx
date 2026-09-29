"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useChatStore, type Message } from "@/lib/store/chatStore";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { getMessage } from "@/lib/db/indexeddb";
import { createSSEParser } from "@/lib/sse";
import type { UploadedFile } from "@/lib/providers";
import type { ChatMessageVariant } from "@/lib/db/indexeddb";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { EmptyState } from "./EmptyState";
import { QuickTask } from "./QuickTask";
import { showToast } from "@/components/ui/Toast";
import { IS_LOCKED } from "@/lib/isLocked";
import { estimateTokens } from "@/lib/estimateTokens";
import { compressMessages, getContextBudget } from "@/lib/compressContext";
import { Archive, X } from "lucide-react";

/**
 * Re-hydrate base64 file data from IndexedDB before sending to the API.
 * In-memory message copies have file data stripped ("data: ") to save RAM —
 * resend/edit/regenerate would otherwise send empty images to the model.
 */
async function hydrateFileData(messages: Message[]): Promise<Message[]> {
  const needsHydration = messages.some((m) => m.files?.some((f) => !f.data));
  if (!needsHydration) return messages;

  return Promise.all(
    messages.map(async (m) => {
      if (!m.files || !m.files.some((f) => !f.data)) return m;
      const full = await getMessage(m.id).catch(() => undefined);
      if (!full?.files) return m;
      return {
        ...m,
        files: m.files.map(
          (f) => (f.data ? f : full.files!.find((df) => df.id === f.id) ?? f),
        ),
      } as Message;
    }),
  );
}

interface StreamConfig {
  provider: string;
  baseURL: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  systemPrompt: string;
  useServerKey: boolean;
  numCtx?: number;
  webSearchEnabled: boolean;
  useModelDefaults: boolean;
}

async function streamAPI(
  messages: Array<{ role: string; content: string; files?: UploadedFile[] }>,
  config: StreamConfig,
  signal: AbortSignal,
  onToken: (token: string) => void,
  onUsage?: (usage: { inputTokens: number; outputTokens: number }) => void,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  // Only send Authorization header when NOT using server-side key
  if (!config.useServerKey) {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  const response = await fetch("/api/chat", {
    method: "POST",
    headers,      body: JSON.stringify({
      provider: config.provider,
      baseURL: config.baseURL,
      model: config.model,
      messages,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      systemPrompt: config.systemPrompt,
      useServerKey: config.useServerKey,
      numCtx: config.numCtx,
      webSearchEnabled: config.webSearchEnabled,
      useModelDefaults: config.useModelDefaults,
    }),
    signal,
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let done = false;

  // Buffered SSE parser — never drops tokens split across network chunks
  const parser = createSSEParser((data) => {
    if (data === "[DONE]") {
      done = true;
      return;
    }
    try {
      const parsed = JSON.parse(data);
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.correctedBaseURL) {
        // Server corrected our baseURL — update settings silently
        useSettingsStore.getState().setBaseURL(parsed.correctedBaseURL);
      }
      if (parsed.token) onToken(parsed.token);
      if (parsed.usage) onUsage?.(parsed.usage);
    } catch (e) {
      if ((e as Error).message !== "Unexpected end of JSON input") throw e;
    }
  });

  while (true) {
    const { done: readerDone, value } = await reader.read();
    if (readerDone || done) break;
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.flush();
}

export function ChatView() {
  const {
    messages,
    isStreaming,
    streamContent,
    currentSessionId,
    stoppedEarly,
    addMessage,
    removeMessageFrom,
    setStreaming,
    appendStreamContent,
    commitStreamContent,
    commitStoppedContent,
    appendToLastAssistant,
    setStreamContent,
    setUsage,
    addVariant,
    seedVariants,
    setActiveVariant,
    getVariants,
  } = useChatStore();

  const { provider, baseURL, apiKey, model, temperature, maxTokens, systemPrompt, useServerKey, numCtx, webSearchEnabled, useModelDefaults } =
    useSettingsStore();

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [trimmedCount, setTrimmedCount] = useState(0);
  const trimmedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-dismiss trimmed indicator after 8s
  useEffect(() => {
    if (trimmedCount > 0) {
      if (trimmedTimerRef.current) clearTimeout(trimmedTimerRef.current);
      trimmedTimerRef.current = setTimeout(() => setTrimmedCount(0), 8000);
    }
    return () => {
      if (trimmedTimerRef.current) clearTimeout(trimmedTimerRef.current);
    };
  }, [trimmedCount]);

  const editingMessage = editingMessageId
    ? messages.find((m) => m.id === editingMessageId)
    : null;

  // In locked mode, always use server key
  const effectiveUseServerKey = useServerKey || IS_LOCKED;

  // Total context tokens (memoized to avoid recompute on every render)
  const contextTokens = useMemo(
    () => messages.reduce((sum, m) => sum + estimateTokens(m.content), 0),
    [messages],
  );

  const streamConfig: StreamConfig = { provider, baseURL, apiKey, model, temperature, maxTokens, systemPrompt, useServerKey: effectiveUseServerKey, numCtx, webSearchEnabled, useModelDefaults };

  const doStream = useCallback(
    async (
      apiMessages: Array<{ role: string; content: string; files?: UploadedFile[] }>,
      controller: AbortController,
      onDone?: (usage?: { inputTokens: number; outputTokens: number }) => void,
    ) => {
      try {
        let capturedUsage: { inputTokens: number; outputTokens: number } | undefined;
        await streamAPI(
          apiMessages,
          streamConfig,
          controller.signal,
          (token) => {
            appendStreamContent(token);
          },
          (usage) => {
            capturedUsage = usage;
          },
        );
        commitStreamContent();
        onDone?.(capturedUsage);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          commitStoppedContent();
        } else {
          const errMsg = (error as Error).message || "Something went wrong.";
          handleStreamError(errMsg);
          setStreamContent("An error occurred. Please try again.");
          commitStreamContent();
        }
      }
    },
    [streamConfig, appendStreamContent, commitStreamContent, commitStoppedContent, setStreamContent],
  );

  const handleSend = useCallback(
    async (content: string, files: UploadedFile[]) => {
      let sessionId = currentSessionId;
      if (!sessionId) {
        sessionId = await useChatStore.getState().createSession();
      }

      // ── Edit flow: preserve previous answers as variants ──
      let priorVariants: ChatMessageVariant[] = [];
      if (editingMessageId) {
        priorVariants = await getVariants(editingMessageId);
        const removed = await removeMessageFrom(editingMessageId);
        setEditingMessageId(null);
        if (!removed) priorVariants = []; // message vanished — don't resurrect stale answers
      }


      addMessage("user", content, files);

      // ── Edit flow: attach old answers as variants to the fresh assistant message ──
      if (priorVariants.length > 0) {
        const freshMsgId = useChatStore.getState().messages.filter((m) => m.role === "assistant").slice(-1)[0]?.id;
        if (freshMsgId) seedVariants(freshMsgId, priorVariants);
      }

      setStreaming(true);
      setStreamContent("");
      // Remember which session this stream belongs to — user may switch mid-stream
      useChatStore.setState({ streamSessionId: sessionId });

      // Re-hydrate stripped base64 file data from IndexedDB before sending
      const hydrated = await hydrateFileData(useChatStore.getState().messages);
      const rawMessages = hydrated.map((m, i) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
        // The message being sent right now uses the fresh full-res files param
        files:
          i === hydrated.length - 1 && files.length > 0
            ? files
            : (m.files as UploadedFile[] | undefined),
      }));

      // Auto-compress context if needed
      const budget = getContextBudget(streamConfig.model);
      const apiMessages = compressMessages(rawMessages, budget);
      // compressMessages adds a summary note, so net reduction = trimmed - 1. Add 1 back.
      const diff = rawMessages.length - apiMessages.length;
      setTrimmedCount(diff > 0 ? diff + 1 : 0);

      const controller = new AbortController();
      abortRef.current = controller;

      await doStream(apiMessages, controller, (usage) => {
        if (usage) {
          const msgs = useChatStore.getState().messages;
          // Usage goes on the last assistant message (which was just committed)
          const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
          if (lastAssistant) {
            useChatStore.getState().setUsage(lastAssistant.id, usage);
          }
        }
      });
    },
    [currentSessionId, editingMessageId, addMessage, removeMessageFrom, getVariants, seedVariants, setStreaming, setStreamContent, doStream],
  );

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const handleContinue = useCallback(async () => {
    const msgs = useChatStore.getState().messages;
    if (msgs.length < 1) return;

    // Abort any existing stream before starting a new one
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    setStreaming(true);
    setStreamContent("");
    useChatStore.setState({ streamSessionId: useChatStore.getState().currentSessionId });

    // Re-hydrate stripped base64 file data before resending
    const hydrated = await hydrateFileData(msgs);
    const apiMessages = hydrated.map((m) => ({
      role: m.role as "system" | "user" | "assistant",
      content: m.content,
      files: m.files as UploadedFile[] | undefined,
    }));

    // Auto-compress context if needed
    const budget = getContextBudget(streamConfig.model);
    const compressedMessages = compressMessages(apiMessages, budget);
    const diff = apiMessages.length - compressedMessages.length;
    setTrimmedCount(diff > 0 ? diff + 1 : 0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
        let capturedUsage: { inputTokens: number; outputTokens: number } | undefined;
        await streamAPI(
          compressedMessages,
          streamConfig,
          controller.signal,
          (token) => {
            appendStreamContent(token);
          },
          (usage) => {
            capturedUsage = usage;
          },
        );
        // Append continued stream content to the last assistant message
        appendToLastAssistant(useChatStore.getState().streamContent, true);
        if (capturedUsage) {
          const msgs = useChatStore.getState().messages;
          const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
          if (lastAssistant) {
            useChatStore.getState().setUsage(lastAssistant.id, capturedUsage);
          }
        }
      } catch (error) {
      if ((error as Error).name === "AbortError") {
        // Stopped again — append partial stream to last message
        const partial = useChatStore.getState().streamContent;
        if (partial) {
          appendToLastAssistant(partial, true);
        }
        // Set stoppedEarly back to true for another potential continue
        useChatStore.setState({ stoppedEarly: true, isStreaming: false, streamContent: "" });
      } else {
        handleStreamError((error as Error).message || "Something went wrong.");
        useChatStore.setState({ streamContent: "", isStreaming: false, stoppedEarly: false });
      }
    }
  }, [streamConfig, appendStreamContent, appendToLastAssistant, setStreamContent, setStreaming]);

  const handleRegenerate = useCallback(async () => {
    const state = useChatStore.getState();
    const msgs = state.messages;
    if (msgs.length < 1 || state.isStreaming) return;

    // Abort any existing stream before starting a new regenerate
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    // New answer becomes a variant on the LAST assistant message
    if (msgs[msgs.length - 1].role !== "assistant") return;
    const variantTargetId = msgs[msgs.length - 1].id;

    setStreaming(true);
    setStreamContent("");
    useChatStore.setState({ streamSessionId: useChatStore.getState().currentSessionId });

    // ── Variant flow: keep the old answer, stream a new one on top ──
    const hydrated = await hydrateFileData(msgs);
    const apiMessages = hydrated
      .slice(0, -1) // drop the assistant message being regenerated
      .map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
        files: m.files as UploadedFile[] | undefined,
      }));

    const budget = getContextBudget(streamConfig.model);
    const compressed = compressMessages(apiMessages, budget);
    const diff = apiMessages.length - compressed.length;
    setTrimmedCount(diff > 0 ? diff + 1 : 0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let capturedUsage: { inputTokens: number; outputTokens: number } | undefined;
      await streamAPI(
        compressed,
        streamConfig,
        controller.signal,
        (token) => appendStreamContent(token),
        (usage) => {
          capturedUsage = usage;
        },
      );
      const content = useChatStore.getState().streamContent;
      addVariant(variantTargetId, content, capturedUsage);
      setStreaming(false);
      setStreamContent("");
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        // Keep partial output as a variant too
        const partial = useChatStore.getState().streamContent;
        if (partial.trim()) {
          addVariant(variantTargetId, partial);
        }
        setStreaming(false);
        setStreamContent("");
      } else {
        handleStreamError((error as Error).message || "Something went wrong.");
        setStreaming(false);
        setStreamContent("");
      }
    }
  // (handleStreamError intentionally omitted from deps — declared below, stable)
  }, [addVariant, setStreaming, setStreamContent, appendStreamContent, streamConfig]);

  const handleEdit = useCallback((messageId: string) => {
    setEditingMessageId(messageId);
  }, []);

  /**
   * Extract the first JSON object from a string safely (no regex s flag needed).
   * Works with ES2017 by finding first { and matching balanced braces.
   */
  const extractJsonFromString = useCallback((text: string): string | null => {
    const start = text.indexOf("{");
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === "\\" && inString) {
        escaped = true;
        continue;
      }

      if (ch === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }

    return null;
  }, []);

  /**
   * Try to parse a provider JSON error from the raw error message string.
   * OpenRouter and other providers may return nested JSON in HTTP error text.
   * Returns extracted info or null if it doesn't look like a provider error.
   */
  const parseProviderJsonError = useCallback((errMsg: string): {
    providerName?: string;
    isProviderError: boolean;
    isQuotaError: boolean;
    isModelError: boolean;
    isInsufficientCredits: boolean;
    friendlyMessage: string;
  } | null => {
    // Try to extract JSON from the error. Format: "OpenAI API error 400: {...}"
    const jsonStr = extractJsonFromString(errMsg);
    if (!jsonStr) return null;

    try {
      const parsed = JSON.parse(jsonStr);
      const meta = parsed?.error?.metadata;
      const message = (parsed?.error?.message || "").toLowerCase();

      // Check if it's a provider error (has provider_name in metadata)
      const providerName = meta?.provider_name;
      const isProviderError = !!providerName;

      // Quota/insufficient credits checks
      const isQuotaError =
        message.includes("quota") ||
        message.includes("insufficient_quota") ||
        message.includes("rate limit") ||
        parsed?.error?.code === 429;

      const isInsufficientCredits =
        message.includes("insufficient credit") ||
        message.includes("payment required") ||
        message.includes("credits") ||
        message.includes("balance") ||
        parsed?.error?.code === 402;

      // Model errors
      const isModelError =
        message.includes("model") ||
        message.includes("not found") ||
        message.includes("not supported") ||
        message.includes("not available") ||
        parsed?.error?.code === 404;

      // If it doesn't look like any known pattern, skip
      if (!isProviderError && !isQuotaError && !isModelError && !isInsufficientCredits) return null;

      // Build friendly message
      let friendlyMessage = "";
      if (isProviderError && providerName) {
        friendlyMessage = `Provider "${providerName}" is temporarily unavailable. This model may not be served by this provider right now. Try switching to a different model in Settings.`;
      } else if (isInsufficientCredits) {
        friendlyMessage = "Your API provider account has insufficient credits. Top up to continue.";
      } else if (isQuotaError) {
        friendlyMessage = "Rate limit or quota exceeded. Wait a moment and try again.";
      } else if (isModelError) {
        friendlyMessage = `Model "${model}" may not be available on this provider. Try a different model in Settings.`;
      } else {
        friendlyMessage = `Provider error: ${parsed?.error?.message || errMsg}`;
      }

      return { providerName, isProviderError, isQuotaError, isModelError, isInsufficientCredits, friendlyMessage };
    } catch {
      return null;
    }
  }, [model, extractJsonFromString]);

  /** Map error messages to contextual toasts with actions */
  const handleStreamError = useCallback(
    (errMsg: string) => {
      const lower = errMsg.toLowerCase();

      // Try to parse as a provider JSON error first (covers OpenRouter, etc.)
      const providerError = parseProviderJsonError(errMsg);
      if (providerError) {
        if (providerError.isProviderError) {
          showToast("error", providerError.friendlyMessage, {
            title: `Provider: ${providerError.providerName}`,
            duration: 8000,
            action: {
              label: "Open Settings",
              onClick: () => window.dispatchEvent(new CustomEvent("chataul:open-settings")),
            },
          });
          return;
        }

        if (providerError.isInsufficientCredits) {
          showToast("error", providerError.friendlyMessage, {
            title: "Insufficient Credits",
            duration: 0,
          });
          return;
        }

        if (providerError.isQuotaError) {
          showToast("warning", providerError.friendlyMessage, {
            title: "Rate Limit / Quota",
            duration: 6000,
          });
          return;
        }

        if (providerError.isModelError) {
          showToast("error", providerError.friendlyMessage, {
            title: "Model Unavailable",
            duration: 8000,
            action: {
              label: "Open Settings",
              onClick: () => window.dispatchEvent(new CustomEvent("chataul:open-settings")),
            },
          });
          return;
        }

        showToast("error", providerError.friendlyMessage);
        return;
      }

      // Missing API key
      if (lower.includes("no api key") || lower.includes("api key not configured") || lower.includes("missing_api_key")) {
        showToast("error", "Add your API key in Settings to continue.", {
          title: "API Key Missing",
          duration: 0,
          action: {
            label: "Open Settings",
            onClick: () => {
              // The SettingsDialog open state is in page.tsx
              // We dispatch a custom event for the parent to catch
              window.dispatchEvent(new CustomEvent("chataul:open-settings"));
            },
          },
        });
        return;
      }

      // Invalid API key / 401
      if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("invalid api key")) {
        showToast("error", "Check your API key in Settings → Credentials.", {
          title: "Invalid API Key",
          duration: 0,
          action: {
            label: "Open Settings",
            onClick: () => window.dispatchEvent(new CustomEvent("chataul:open-settings")),
          },
        });
        return;
      }

      // Rate limit
      if (lower.includes("429") || lower.includes("rate limit")) {
        showToast("warning", "Wait a moment and try again.", {
          title: "Rate Limited",
          duration: 5000,
        });
        return;
      }

      // Provider down / 503
      if (lower.includes("503") || lower.includes("service unavailable") || lower.includes("overloaded")) {
        showToast("warning", "Try switching to a different model or provider in Settings.", {
          title: "Service Unavailable",
          duration: 6000,
          action: {
            label: "Open Settings",
            onClick: () => window.dispatchEvent(new CustomEvent("chataul:open-settings")),
          },
        });
        return;
      }

      // Network error
      if (lower.includes("network") || lower.includes("fetch") || lower.includes("connection")) {
        showToast("error", "Check your internet connection and try again.", {
          title: "Connection Lost",
        });
        return;
      }

      // Generic fallback
      showToast("error", errMsg);
    },
    [parseProviderJsonError],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <AnimatePresence>
        {trimmedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="mx-2 mt-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400"
          >
          <Archive className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            <strong>{trimmedCount}</strong> older message{trimmedCount !== 1 ? "s" : ""} trimmed to fit context window
          </span>
          <button
            onClick={() => setTrimmedCount(0)}
            className="ml-1 rounded p-0.5 transition-colors hover:bg-amber-500/20"
            aria-label="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        </motion.div>
      )}
      </AnimatePresence>

      {messages.length === 0 && !isStreaming ? (
        <EmptyState onPromptClick={handleSend} />
      ) : (
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          stoppedEarly={stoppedEarly}
          sessionId={currentSessionId}
          onEditMessage={handleEdit}
          onRegenerate={handleRegenerate}
          onContinue={handleContinue}
          onSwitchVariant={setActiveVariant}
        />
      )}

      {messages.length > 0 && !isStreaming && !stoppedEarly && (
        <QuickTask
          lastAssistantContent={
            [...messages].reverse().find((m) => m.role === "assistant")?.content
          }
          onTaskClick={(prompt) => {
            handleSend(prompt, []);
          }}
        />
      )}

      <MessageInput
        onSend={handleSend}
        onStop={handleStop}
        onContinue={handleContinue}
        isStreaming={isStreaming}
        stoppedEarly={stoppedEarly}
        editContent={editingMessage?.content}
        onCancelEdit={() => setEditingMessageId(null)}
        contextTokens={contextTokens}
        totalMessages={messages.length}
      />
    </div>
  );
}
