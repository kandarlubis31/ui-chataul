"use client";

import { useState, useCallback, useRef } from "react";
import { Copy, Check } from "lucide-react";

interface CodeBlockWrapperProps {
  language: string;
  children: React.ReactNode;
}

/**
 * Wraps highlighted code blocks with a language pill header and copy button.
 * Works with any highlighting engine (highlight.js, shiki, etc.).
 * Uses <pre> for the code body to preserve whitespace and formatting.
 */
export function CodeBlockWrapper({ language, children }: CodeBlockWrapperProps) {
  const [copied, setCopied] = useState(false);
  const preRef = useRef<HTMLPreElement>(null);

  const handleCopy = useCallback(async () => {
    const text = preRef.current?.textContent || "";
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const lang = language || "text";

  return (
    <div className="code-block-container group relative">
      {/* Header bar with language pill + copy — sticky on scroll */}
      <div className="code-block-header sticky top-0 z-10">
        <span className="code-language-pill">{lang}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-[var(--color-text-tertiary)] transition-all hover:bg-[var(--color-border)] hover:text-[var(--color-text)] sm:opacity-0 sm:group-hover:opacity-100"
          aria-label={copied ? "Copied" : "Copy code block"}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" />
              <span>Copied!</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code body: <pre> preserves whitespace, newlines, and indentation */}
      <pre ref={preRef} className="code-block-body">
        {children}
      </pre>
    </div>
  );
}
