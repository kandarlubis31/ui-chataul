"use client";

import { memo, forwardRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Copy, Check, Play, RotateCcw, Pencil, Cpu, ChevronLeft, ChevronRight } from "lucide-react";
import { Markdown } from "@/components/markdown/Markdown";
import { ThinkingDots } from "./StreamingCursor";
import type { Message } from "@/lib/store/chatStore";

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
  streamContent?: string;
  onEdit?: (id: string) => void;
  onRegenerate?: () => void;
  /** Number of stored variants for this assistant message (>1 shows the nav) */
  variantCount?: number;
  /** 0-based index of the currently displayed variant */
  activeVariant?: number;
  onSwitchVariant?: (index: number) => void;
  showContinue?: boolean;
  onContinue?: () => void;
  modelName?: string;
  responseTimeMs?: number;
}

/** Extract the first 1–2 lines of text from markdown for TL;DR preview */
function extractTLDR(content: string): string | null {
  const plain = content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~`>]/g, "")
    .trim();

  const lines = plain.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return null;

  // Take up to 2 lines, max 140 chars
  const tldr = lines.slice(0, 2).join(" ").trim();
  return tldr.length > 140 ? tldr.slice(0, 137) + "…" : tldr;
}

function formatResponseTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const MessageItem = memo(forwardRef<HTMLDivElement, MessageItemProps>(function MessageItem({
  message,
  isStreaming,
  streamContent,
  onEdit,
  onRegenerate,
  variantCount,
  activeVariant,
  onSwitchVariant,
  showContinue,
  onContinue,
  modelName,
  responseTimeMs,
}, ref) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const displayContent = isStreaming && streamContent !== undefined ? streamContent : message.content;

  // TL;DR only for completed assistant messages with substantial content
  const tldr = !isUser && !isStreaming && displayContent.length > 100 ? extractTLDR(displayContent) : null;

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(displayContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [displayContent]);

  // ---- User message ----
  if (isUser) {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="group mx-auto w-full max-w-chat px-4 py-6"
      >
        <div className="mx-auto flex max-w-chat gap-4">
          {/* Avatar */}
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-white"
            aria-hidden="true"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>

          {/* Content */}
          <div className="min-w-0 flex-1">
            {message.files && message.files.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {message.files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
                  >
                    {file.preview && file.type.startsWith("image/") ? (
                      <img
                        src={file.preview}
                        alt={file.name}
                        className="h-8 w-8 rounded object-cover"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--color-sidebar)] text-xs text-[var(--color-text-secondary)]">
                        {file.name.split(".").pop()?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <span className="truncate text-xs text-[var(--color-text-secondary)]">{file.name}</span>
                  </div>
                ))}
              </div>
            )}

            <p className="whitespace-pre-wrap text-body leading-relaxed">{displayContent}</p>
          </div>

          {/* Edit button */}
          {onEdit && (
            <button
              onClick={() => onEdit(message.id)}
              className="mt-0.5 shrink-0 rounded-lg p-1.5 text-[var(--color-text-secondary)] opacity-0 transition-all hover:bg-[var(--color-border)] hover:text-[var(--color-text)] group-hover:opacity-100"
              aria-label="Edit message"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </motion.div>
    );
  }

  // ---- Assistant message (redesigned card) ----
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="group mx-auto w-full max-w-chat px-4 py-4"
    >
      {/* Response card with left accent border */}
      <div className="response-card relative border-l-4 border-l-[var(--color-accent)] pl-[18px]">
        {/* Header: AI avatar + model badge */}
        {!isStreaming && (
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)]">
              <Cpu className="h-3.5 w-3.5" />
            </div>
            {modelName && <span className="code-language-pill">{modelName}</span>}
          </div>
        )}

        {/* TL;DR preview */}
        {tldr && (
          <p className="mb-3 text-[16px] font-semibold leading-snug text-[var(--color-text)]">
            {tldr}
          </p>
        )}

        {/* Main markdown content */}
        <div className="prose-custom text-body leading-relaxed">
          {isStreaming && !displayContent ? (
            <div className="flex items-center gap-3 py-2">
              <span className="text-sm text-[var(--color-text-secondary)]">Thinking</span>
              <ThinkingDots />
            </div>
          ) : (
            <Markdown content={displayContent} />
          )}
        </div>

        {/* File attachments */}
        {message.files && message.files.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {message.files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
              >
                {file.preview && file.type.startsWith("image/") ? (
                  <img src={file.preview} alt={file.name} className="h-8 w-8 rounded object-cover" />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--color-sidebar)] text-xs text-[var(--color-text-secondary)]">
                    {file.name.split(".").pop()?.toUpperCase() ?? "?"}
                  </div>
                )}
                <span className="truncate text-xs text-[var(--color-text-secondary)]">{file.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Variant navigation: < 1/3 > */}
        {!isUser && !isStreaming && variantCount !== undefined && variantCount > 1 && (
          <div className="mt-4 flex items-center gap-1.5 text-xs text-[var(--color-text-tertiary)]">
            <button
              onClick={() => onSwitchVariant?.((activeVariant ?? 0) - 1)}
              disabled={(activeVariant ?? 0) <= 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:bg-[var(--color-sidebar)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous variant"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="tabular-nums" aria-live="polite">
              {(activeVariant ?? 0) + 1}/{variantCount}
            </span>
            <button
              onClick={() => onSwitchVariant?.((activeVariant ?? 0) + 1)}
              disabled={(activeVariant ?? 0) >= variantCount - 1}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] transition-colors hover:bg-[var(--color-sidebar)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next variant"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Metadata footer: tokens + response time */}
        {!isStreaming && (message.usage || responseTimeMs) && (
          <div className="mt-4 flex items-center gap-3 text-xs text-[var(--color-text-tertiary)]">
            {message.usage && (
              <span>
                Tokens: {message.usage.inputTokens.toLocaleString()}↑ · {message.usage.outputTokens.toLocaleString()}↓
              </span>
            )}
            {message.usage && responseTimeMs && <span aria-hidden="true">|</span>}
            {responseTimeMs && (
              <span>Generated in {formatResponseTime(responseTimeMs)}</span>
            )}
          </div>
        )}

        {/* Action buttons — outline style */}
        {!isStreaming && displayContent && (
          <div className="mt-3 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={handleCopy}
              className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-sidebar)] hover:text-[var(--color-text)]"
              aria-label={copied ? "Copied" : "Copy response"}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
            {onRegenerate && (
              <button
                onClick={onRegenerate}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-sidebar)] hover:text-[var(--color-text)]"
                aria-label="Regenerate response"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Regenerate
              </button>
            )}
            {showContinue && onContinue && (
              <button
                onClick={onContinue}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 px-3 text-xs text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/10 hover:border-[var(--color-accent)]/50"
                aria-label="Continue generation"
              >
                <Play className="h-3 w-3" fill="currentColor" />
                Continue
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}));
