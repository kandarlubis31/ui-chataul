"use client";

import { useCallback, useRef, useState, useEffect, useMemo, memo } from "react";
import type { ChatMessageVariant } from "@/lib/db/indexeddb";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDown, Archive, Loader2 } from "lucide-react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";
import { MessageItem } from "./MessageItem";
import { ThinkingDots } from "./StreamingCursor";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { useSettingsStore } from "@/lib/store/settingsStore";
import { useChatStore } from "@/lib/store/chatStore";
import type { Message } from "@/lib/store/chatStore";
import { isBalancedFence } from "@/lib/markdown";
import { Markdown } from "@/components/markdown/Markdown";

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
  stoppedEarly: boolean;
  onEditMessage: (messageId: string) => void;
  onRegenerate: () => void;
  onContinue: () => void;
  onSwitchVariant: (messageId: string, index: number) => void;
  sessionId: string | null;
}

export function MessageList({
  messages,
  isStreaming,
  stoppedEarly,
  onEditMessage,
  onRegenerate,
  onContinue,
  onSwitchVariant,
  sessionId,
}: MessageListProps) {
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [atBottom, setAtBottom] = useState(true);
  const { model } = useSettingsStore();
  const { olderMessagesCount, loadingOlder, loadOlderMessages } = useChatStore();
  const hasScrolledAfterLoad = useRef(false);
  const prevSessionRef = useRef<string | null>(null);

  // ── Auto-scroll to bottom on initial load ──
  // After messages load from IndexedDB (going from empty → non-empty),
  // scroll Virtuoso to the very bottom
  useEffect(() => {
    if (messages.length > 0 && !hasScrolledAfterLoad.current) {
      // Small delay to let Virtuoso render first
      const timer = setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({
          index: messages.length - 1,
          behavior: "auto",
        });
        hasScrolledAfterLoad.current = true;
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  // Reset scroll tracking on session switch
  useEffect(() => {
    if (sessionId && sessionId !== prevSessionRef.current) {
      hasScrolledAfterLoad.current = false;
      prevSessionRef.current = sessionId;
    }
  }, [sessionId]);

  // ── Load older messages when user scrolls to top ──
  const handleStartReached = useCallback(() => {
    if (olderMessagesCount > 0 && !loadingOlder) {
      loadOlderMessages();
    }
  }, [olderMessagesCount, loadingOlder, loadOlderMessages]);

  const scrollToBottom = useCallback(() => {
    if (messages.length > 0) {
      virtuosoRef.current?.scrollToIndex({
        index: messages.length - 1,
        behavior: "smooth",
      });
    }
  }, [messages.length]);

  // ── Refs untuk stabilkan renderItem dependency ──
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const switchVariantRef = useRef(onSwitchVariant);
  switchVariantRef.current = onSwitchVariant;

  // ── Item renderer ──
  const renderItem = useCallback(
    (_index: number, message: Message) => {
      const msgs = messagesRef.current;
      const isLastMessage = _index === msgs.length - 1;

      let responseTimeMs: number | undefined;
      if (message.role === "assistant" && _index > 0) {
        const prev = msgs[_index - 1];
        if (prev?.role === "user") {
          responseTimeMs = message.createdAt - prev.createdAt;
        }
      }

      return (
        <MessageItem
          message={message}
          isStreaming={false}
          onEdit={message.role === "user" ? onEditMessage : undefined}
          onRegenerate={
            message.role === "assistant" && isLastMessage ? onRegenerate : undefined
          }
          variantCount={message.variants?.length}
          activeVariant={message.activeVariant}
          onSwitchVariant={(index: number) => switchVariantRef.current(message.id, index)}
          showContinue={
            stoppedEarly && message.role === "assistant" && isLastMessage
          }
          onContinue={onContinue}
          modelName={message.role === "assistant" ? model : undefined}
          responseTimeMs={responseTimeMs}
        />
      );
    },
    [model, stoppedEarly, onEditMessage, onRegenerate, onContinue],
  );

  // ── Stable Footer (streaming indicator) ──
  const Footer = useCallback(() => {
    if (!isStreaming) return null;
    return <StreamingFooter />;
  }, [isStreaming]);

  // ── Header: archive banner + loading indicator ──
  const Header = useCallback(() => {
    if (olderMessagesCount <= 0 && !loadingOlder) return null;

    return (
      <div className="flex items-center justify-center py-4">
        {loadingOlder ? (
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Loading older messages...</span>
          </div>
        ) : (
          <div
            className="flex cursor-pointer items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-1.5 text-xs text-[var(--color-text-secondary)] shadow-sm transition-colors hover:bg-[var(--color-sidebar)]"
            onClick={() => {
              if (olderMessagesCount > 0 && !loadingOlder) {
                loadOlderMessages();
              }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                loadOlderMessages();
              }
            }}
          >
            <Archive className="h-3 w-3 opacity-50" />
            <span>
              {olderMessagesCount} older message{olderMessagesCount !== 1 ? "s" : ""} · click to load
            </span>
          </div>
        )}
      </div>
    );
  }, [olderMessagesCount, loadingOlder, loadOlderMessages]);

  if (messages.length === 0 && !isStreaming) return null;

  return (
    <div className="relative flex-1">
      <Virtuoso
        key={sessionId || "__no_session__"}
        ref={virtuosoRef}
        data={messages}
        firstItemIndex={olderMessagesCount}
        initialTopMostItemIndex={messages.length > 0 ? messages.length - 1 : 0}
        followOutput="smooth"
        atBottomStateChange={setAtBottom}
        startReached={handleStartReached}
        itemContent={renderItem}
        increaseViewportBy={{ top: 500, bottom: 200 }}
        components={{
          Header,
          Footer,
        }}
        style={{ height: "100%" }}
      />

      {/* Scroll-to-bottom button */}
      <AnimatePresence>
        {!atBottom && messages.length > 0 && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.15 }}
            onClick={scrollToBottom}
            className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg transition-all hover:bg-[var(--color-sidebar)]"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="h-4 w-4 text-[var(--color-text-secondary)]" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Streaming footer ──
const StreamingFooter = memo(function StreamingFooter() {
  const streamContent = useChatStore((s) => s.streamContent);
  // Debounce markdown parsing — token bursts shouldn't re-parse on every token
  const debouncedContent = useDebouncedValue(streamContent, 150);

  // While a code fence is still open, close it so react-markdown doesn't
  // swallow the whole message into one giant unparsed code block
  const balancedContent = useMemo(
    () => (isBalancedFence(debouncedContent) ? debouncedContent : `${debouncedContent}\n\`\`\``),
    [debouncedContent],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="group mx-auto w-full max-w-chat px-4 py-4"
      aria-live="polite"
      aria-label="AI is generating a response"
    >
      <div className="response-card relative border-l-4 border-l-[var(--color-accent)] pl-[18px]">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 8V4H8" />
              <rect width="16" height="12" x="4" y="8" rx="2" />
              <path d="M2 14h2" />
              <path d="M20 14h2" />
              <path d="M15 13v2" />
              <path d="M9 13v2" />
            </svg>
          </div>
        </div>
        <div className="prose-custom text-body leading-relaxed">
          {streamContent ? (
            <>
              <Markdown content={balancedContent} />
              <span
                className="ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm bg-[var(--color-accent)] align-text-bottom"
                aria-hidden="true"
              />
            </>
          ) : (
            <div className="flex items-center gap-3 py-2">
              <span className="text-sm text-[var(--color-text-secondary)]">Thinking</span>
              <ThinkingDots />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});
