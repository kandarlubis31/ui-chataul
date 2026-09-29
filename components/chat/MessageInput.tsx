"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowUp, Square, Paperclip, X, Play } from "lucide-react";
import type { UploadedFile } from "@/lib/providers";
import { estimateTokens } from "@/lib/estimateTokens";

interface MessageInputProps {
  onSend: (content: string, files: UploadedFile[]) => void;
  onStop: () => void;
  onContinue: () => void;
  isStreaming: boolean;
  stoppedEarly: boolean;
  editContent?: string;
  onCancelEdit?: () => void;
  /** Total estimated tokens in all messages (for context usage counter) */
  contextTokens?: number;
  /** Total message count (for memory indicator) */
  totalMessages?: number;
}

export function MessageInput({
  onSend,
  onStop,
  onContinue,
  isStreaming,
  stoppedEarly,
  editContent,
  onCancelEdit,
  contextTokens,
  totalMessages,
}: MessageInputProps) {
  const [content, setContent] = useState(editContent || "");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tokenCount = estimateTokens(content);

  useEffect(() => {
    if (editContent !== undefined) {
      setContent(editContent);
      textareaRef.current?.focus();
    }
  }, [editContent]);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [content, adjustHeight]);

  const handleSend = useCallback(() => {
    const trimmed = content.trim();
    if (!trimmed && files.length === 0) return;
    if (isStreaming) return;

    onSend(trimmed || "Describe this image", files);
    setContent("");
    setFiles([]);
    if (onCancelEdit) onCancelEdit();
  }, [content, files, isStreaming, onSend, onCancelEdit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        const blob = item.getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result as string;
            const file: UploadedFile = {
              id: Date.now().toString(36) + Math.random().toString(36).slice(2),
              name: `pasted-image-${Date.now()}.png`,
              type: "image/png",
              size: blob.size,
              data: base64,
              preview: base64,
            };
            setFiles((prev) => [...prev, file]);
          };
          reader.readAsDataURL(blob);
        }
      }
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFiles = Array.from(e.dataTransfer.files);
    processFiles(droppedFiles);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(e.target.files || []);
      processFiles(selectedFiles);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [],
  );

  function processFiles(fileList: File[]) {
    for (const f of fileList) {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const file: UploadedFile = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2),
          name: f.name,
          type: f.type,
          size: f.size,
          data: base64,
          preview: f.type.startsWith("image/") ? base64 : undefined,
        };
        setFiles((prev) => [...prev, file]);
      };
      reader.readAsDataURL(f);
    }
  }

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const canSend = content.trim() || files.length > 0;

  return (
    <div className="mx-auto w-full max-w-chat px-4 pb-6">
      {editContent !== undefined && (
        <div className="mb-2 flex items-center gap-2 text-sm">
          <span className="text-[var(--color-text-secondary)]">Editing message</span>
          <button
            onClick={() => {
              onCancelEdit?.();
              setContent("");
            }}
            className="text-[var(--color-accent)] hover:underline"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Continue button */}
      {stoppedEarly && !isStreaming && (
        <div className="mb-2 flex justify-center">
          <button
            onClick={onContinue}
            className="flex items-center gap-2 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 px-4 py-2 text-sm font-medium text-[var(--color-accent)] transition-all hover:bg-[var(--color-accent)]/20 hover:border-[var(--color-accent)]/50"
          >
            <Play className="h-3.5 w-3.5" fill="currentColor" />
            Continue generation
          </button>
        </div>
      )}

      {/* PDF/text attachment info — text IS extracted server-side now */}
      {files.some(
        (f) =>
          f.type === "application/pdf" ||
          f.type.startsWith("text/") ||
          f.type === "application/json",
      ) && (
        <div className="mb-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Text from PDF and text files is extracted automatically before sending. Scanned
            (image-only) PDFs may yield little or no text — the model will see an empty
            document in that case.
          </p>
        </div>
      )}

      {/* File previews */}
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {files.map((file) => (
            <div
              key={file.id}
              className="relative flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm"
            >
              {file.preview ? (
                <img src={file.preview} alt={file.name} className="h-10 w-10 rounded object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded bg-[var(--color-sidebar)] text-xs text-[var(--color-text-secondary)]">
                  {file.name.split(".").pop()?.toUpperCase() ?? "?"}
                </div>
              )}
              <div className="flex flex-col">
                <span className="max-w-[120px] truncate text-xs">{file.name}</span>
                <span className="text-[10px] text-[var(--color-text-secondary)]">
                  {(file.size / 1024).toFixed(0)} KB
                </span>
              </div>
              <button
                onClick={() => removeFile(file.id)}
                className="ml-1 rounded-full p-0.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)]"
                aria-label={`Remove ${file.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        className={`flex items-end gap-2 rounded-2xl border bg-[var(--color-surface)] px-4 py-3 shadow-sm transition-colors ${
          editContent !== undefined ? "border-[var(--color-accent)]" : "border-[var(--color-border)]"
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          className="shrink-0 rounded-lg p-1.5 text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-sidebar)] hover:text-[var(--color-text)]"
          aria-label="Attach file"
        >
          <Paperclip className="h-4 w-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,.pdf,.txt,.md,.json,.csv"
          className="hidden"
          onChange={handleFileSelect}
        />

        <textarea
          ref={textareaRef}
          rows={1}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Type a message..."
          className="min-h-[24px] max-h-[200px] w-full resize-none bg-transparent text-body leading-relaxed text-[var(--color-text)] placeholder-[var(--color-text-secondary)] outline-none"
          aria-label="Message input"
        />

        {isStreaming ? (
          <button
            onClick={onStop}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-text)] text-[var(--color-bg)] transition-colors hover:opacity-80"
            aria-label="Stop generating"
          >
            <Square className="h-3.5 w-3.5" fill="currentColor" />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all ${
              canSend
                ? "bg-[var(--color-text)] text-[var(--color-bg)] hover:opacity-80"
                : "cursor-not-allowed bg-[var(--color-border)] text-[var(--color-text-secondary)]"
            }`}
            aria-label="Send message"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Token counter + context bar + disclaimer */}
      <div className="mt-2 space-y-1.5 px-1">
        {/* Context usage bar — shown when there are messages */}
        {contextTokens !== undefined && contextTokens > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-secondary)]">
            <span className="shrink-0 font-mono tabular-nums">
              Context: ~{contextTokens.toLocaleString()} tok
            </span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--color-border)]">
              <div
                className={`h-full rounded-full transition-all ${
                  contextTokens > 100000
                    ? "bg-red-500/60"
                    : contextTokens > 50000
                      ? "bg-amber-500/60"
                      : "bg-[var(--color-accent)]/60"
                }`}
                style={{ width: `${Math.min((contextTokens / 50000) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
          <p className="flex items-center gap-1">
            <span>AI may produce inaccurate information.</span>
            {totalMessages !== undefined && totalMessages > 0 && (
              <span className="hidden text-[var(--color-text-tertiary)] sm:inline">
                · {totalMessages} msg
              </span>
            )}
          </p>
          {content.length > 0 && (
            <span className="font-mono tabular-nums" title={`~${tokenCount} tokens`}>
              ~{tokenCount} tok
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
