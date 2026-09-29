"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import { CodeBlockWrapper } from "./CodeBlockWrapper";
import { memo } from "react";
import { stripMarkdown } from "@/lib/markdown";

interface MarkdownProps {
  content: string;
  /** When true, render cleaned plain text (for streaming). Default: false */
  raw?: boolean;
}

export const Markdown = memo(function Markdown({ content, raw }: MarkdownProps) {
  if (raw) {
    return <p className="whitespace-pre-wrap">{stripMarkdown(content)}</p>;
  }
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        [rehypeHighlight, { ignoreMissing: true }],
        rehypeKatex,
      ]}
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const isInline = !match;

          if (isInline) {
            return (
              <code
                className="rounded bg-[var(--color-border)] px-1.5 py-0.5 font-mono text-sm"
                {...props}
              >
                {children}
              </code>
            );
          }

          // Block code: pass through with hljs classes
          return <code className={className}>{children}</code>;
        },
        pre({ children, className, ...props }) {
          // Extract language from hljs class on <code> child
          const codeEl = children as React.ReactElement | undefined;
          const codeClass = (codeEl?.props as { className?: string } | undefined)?.className || "";
          const langMatch = /language-(\w+)/.exec(codeClass);
          const lang = langMatch?.[1] || "";

          return <CodeBlockWrapper language={lang}>{children}</CodeBlockWrapper>;
        },
        table({ children }) {
          return (
            <div className="my-4 overflow-x-auto rounded-lg border border-[var(--color-border)]">
              <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
                {children}
              </table>
            </div>
          );
        },
        th({ children }) {
          return (
            <th className="bg-[var(--color-sidebar)] px-4 py-2 text-left font-semibold">
              {children}
            </th>
          );
        },
        td({ children }) {
          return (
            <td className="border-t border-[var(--color-border)] px-4 py-2">{children}</td>
          );
        },
        blockquote({ children }) {
          return (
            <blockquote className="my-3 border-l-4 border-[var(--color-accent)] bg-[var(--color-sidebar)] py-2 pl-4 pr-2 italic text-[var(--color-text-secondary)]">
              {children}
            </blockquote>
          );
        },
        hr() {
          return <hr className="my-4 border-[var(--color-border)]" />;
        },
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>;
        },
        ul({ children }) {
          return <ul className="mb-2 list-disc pl-6 last:mb-0">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="mb-2 list-decimal pl-6 last:mb-0">{children}</ol>;
        },
        h2({ children }) {
          return <h2>{children}</h2>;
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] underline hover:text-[var(--color-accent-hover)]"
            >
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
});
