"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Copy, Check } from "lucide-react";

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handle = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={handle}
      className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      prevFocusRef.current = document.activeElement as HTMLElement | null;
      const timer = setTimeout(() => {
        dialogRef.current?.querySelector<HTMLElement>('button:not([aria-label="Close"])')?.focus();
      }, 100);
      return () => clearTimeout(timer);
    } else {
      prevFocusRef.current?.focus();
      prevFocusRef.current = null;
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = dialog.querySelectorAll<HTMLElement>(
          'input, select, textarea, button, a[href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [onClose],
  );

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onKeyDown={handleKeyDown}
          >
            <div
              ref={dialogRef}
              className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="help-title"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
                <h2 id="help-title" className="text-lg font-semibold text-[var(--color-text)]">
                  Setup Guide
                </h2>
                <button
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="prose-custom space-y-6 text-sm leading-relaxed text-[var(--color-text)]">

                  {/* Step 1 */}
                  <section>
                    <h3 className="mb-2 text-base font-semibold">Step 1 — Get an API Key</h3>
                    <p className="mb-2 text-[var(--color-text-secondary)]">
                      Choose a provider and create an API key:
                    </p>

                    {/* OpenAI */}
                    <div className="mb-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-sidebar)] p-4">
                      <h4 className="mb-1 font-semibold">OpenAI</h4>
                      <p className="mb-2 text-xs text-[var(--color-text-secondary)]">
                        Go to{" "}
                        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" className="text-[var(--color-accent)] underline">
                          platform.openai.com/api-keys
                        </a>
                        {" "}→ Create new secret key → Copy it.
                      </p>
                      <div className="rounded-lg bg-[var(--color-bg)] px-3 py-2 font-mono text-xs">
                        Base URL:{" "}
                        <code className="text-[var(--color-accent)]">https://api.openai.com/v1</code>
                        <CopyButton text="https://api.openai.com/v1" />
                      </div>
                    </div>

                    {/* Anthropic */}
                    <div className="mb-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-sidebar)] p-4">
                      <h4 className="mb-1 font-semibold">Anthropic (Claude)</h4>
                      <p className="mb-2 text-xs text-[var(--color-text-secondary)]">
                        Go to{" "}
                        <a href="https://console.anthropic.com/keys" target="_blank" rel="noopener" className="text-[var(--color-accent)] underline">
                          console.anthropic.com/keys
                        </a>
                        {" "}→ Create key → Copy it.
                      </p>
                      <div className="rounded-lg bg-[var(--color-bg)] px-3 py-2 font-mono text-xs">
                        Base URL:{" "}
                        <code className="text-[var(--color-accent)]">https://api.anthropic.com/v1</code>
                        <CopyButton text="https://api.anthropic.com/v1" />
                      </div>
                    </div>

                    {/* OpenRouter */}
                    <div className="mb-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-sidebar)] p-4">
                      <h4 className="mb-1 font-semibold">OpenRouter (all models)</h4>
                      <p className="mb-2 text-xs text-[var(--color-text-secondary)]">
                        Go to{" "}
                        <a href="https://openrouter.ai/keys" target="_blank" rel="noopener" className="text-[var(--color-accent)] underline">
                          openrouter.ai/keys
                        </a>
                        {" "}→ Create key → Paste it. The app auto-detects{" "}
                        <code className="rounded bg-[var(--color-bg)] px-1 text-[11px]">sk-or-v1-</code> keys!
                      </p>
                      <div className="rounded-lg bg-[var(--color-bg)] px-3 py-2 font-mono text-xs">
                        Base URL:{" "}
                        <code className="text-[var(--color-accent)]">https://openrouter.ai/api/v1</code>
                        <CopyButton text="https://openrouter.ai/api/v1" />
                      </div>
                    </div>

                    {/* Google Gemini */}
                    <div className="mb-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-sidebar)] p-4">
                      <h4 className="mb-1 font-semibold">Google Gemini (via OpenAI-compatible)</h4>
                      <p className="mb-2 text-xs text-[var(--color-text-secondary)]">
                        Get key at{" "}
                        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="text-[var(--color-accent)] underline">
                          aistudio.google.com
                        </a>
                        . Use OpenAI-compatible endpoint:
                      </p>
                      <div className="rounded-lg bg-[var(--color-bg)] px-3 py-2 font-mono text-xs">
                        Base URL:{" "}
                        <code className="text-[var(--color-accent)]">https://generativelanguage.googleapis.com/v1beta/openai</code>
                        <CopyButton text="https://generativelanguage.googleapis.com/v1beta/openai" />
                      </div>
                    </div>

                    {/* Ollama */}
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-sidebar)] p-4">
                      <h4 className="mb-1 font-semibold">Ollama (Local)</h4>
                      <p className="mb-2 text-xs text-[var(--color-text-secondary)]">
                        Download Ollama from{" "}
                        <a href="https://ollama.com" target="_blank" rel="noopener" className="text-[var(--color-accent)] underline">
                          ollama.com
                        </a>
                        , then pull a model:
                      </p>
                      <div className="mb-2 rounded-lg bg-[var(--color-bg)] px-3 py-2 font-mono text-xs">
                        <code className="text-[var(--color-accent)]">ollama pull llama3.2</code>
                        <CopyButton text="ollama pull llama3.2" />
                      </div>
                      <p className="mb-2 text-xs text-[var(--color-text-secondary)]">
                        Once Ollama is running, select it in Settings. <strong>No API key needed!</strong>
                      </p>
                      <div className="rounded-lg bg-[var(--color-bg)] px-3 py-2 font-mono text-xs">
                        Base URL:{" "}
                        <code className="text-[var(--color-accent)]">http://localhost:11434/v1</code>
                        <CopyButton text="http://localhost:11434/v1" />
                      </div>
                    </div>
                  </section>

                  {/* Step 2 */}
                  <section>
                    <h3 className="mb-2 text-base font-semibold">Step 2 — Open Settings</h3>
                    <p className="text-[var(--color-text-secondary)]">
                      Click the <strong>gear icon ⚙</strong> in the bottom-right of the sidebar.
                    </p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-[var(--color-text-secondary)]">
                      <li>Select your <strong>Provider</strong> (OpenAI / Anthropic)</li>
                      <li>Paste the <strong>Base URL</strong> (auto-set when you pick provider)</li>
                      <li>Paste your <strong>API Key</strong> — stored only in your browser</li>
                      <li>Choose a <strong>Model</strong> — use the search dropdown</li>
                      <li>Adjust <strong>Temperature</strong> (0=precise, 2=creative)</li>
                      <li>Set a custom <strong>System Prompt</strong> if you want</li>
                      <li>Click <strong>Save Settings</strong></li>
                    </ol>
                  </section>

                  {/* Step 3 */}
                  <section>
                    <h3 className="mb-2 text-base font-semibold">Step 3 — Start Chatting!</h3>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--color-text-secondary)]">
                      <li><strong>New chat:</strong> Click <code className="rounded bg-[var(--color-sidebar)] px-1">+</code> in the sidebar</li>
                      <li><strong>Send:</strong> Type your message → press <strong>Enter</strong></li>
                      <li><strong>New line:</strong> <strong>Shift + Enter</strong></li>
                      <li><strong>Stop:</strong> Click the stop button during generation</li>
                      <li><strong>Continue:</strong> Resume a stopped response</li>
                      <li><strong>Regenerate:</strong> Hover an assistant message → click Regenerate</li>
                      <li><strong>Edit:</strong> Hover your message → click the pencil icon</li>
                      <li><strong>Attach files:</strong> Click the paperclip, paste images, or drag &amp; drop</li>
                      <li><strong>Export:</strong> Download current chat as Markdown</li>
                      <li><strong>Theme:</strong> Toggle Light / Dark / System with the sun/moon icon</li>
                    </ul>
                  </section>

                  {/* Tips */}
                  <section>
                    <h3 className="mb-2 text-base font-semibold">Pro Tips</h3>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--color-text-secondary)]">
                      <li>Use <strong>OpenRouter</strong> to access 200+ models with one API key</li>
                      <li>For <strong>o1 / o3</strong> models: temperature is auto-disabled (not supported)</li>
                      <li>Model list auto-refreshes with FREE model badges on OpenRouter</li>
                      <li>All chat history is stored <strong>locally</strong> in your browser (IndexedDB)</li>
                      <li>Your API key is never sent to our server — it goes directly to the AI provider</li>
                    </ul>
                  </section>

                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-[var(--color-border)] px-6 py-4">
                <button
                  onClick={onClose}
                  className="w-full rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)]"
                >
                  Got it!
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
