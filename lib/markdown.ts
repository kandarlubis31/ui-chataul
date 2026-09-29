/**
 * Strip common markdown syntax to show clean text during streaming.
 * Preserves structure while removing formatting characters.
 */
export function stripMarkdown(text: string): string {
  return (
    text
      // Remove code blocks (complete ones only)
      .replace(/```[\s\S]*?```/g, (_m) => _m.replace(/```\w*\n?/g, "").replace(/```/g, ""))
      // Remove inline code
      .replace(/`([^`]+)`/g, "$1")
      // Remove bold+italic first (*** or ___)
      .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
      .replace(/___([^_]+)___/g, "$1")
      // Remove bold (** or __)
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/__([^_]+)__/g, "$1")
      // Remove italic (* or _) — use lookbehind to avoid matching ** leftovers
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
      .replace(/(?<!_)_([^_]+)_(?!_)/g, "$1")
      // Remove strikethrough
      .replace(/~~([^~]+)~~/g, "$1")
      // Remove headings
      .replace(/^#{1,6}\s+/gm, "")
      // Remove blockquote markers
      .replace(/^>\s?/gm, "")
      // Remove horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, "")
      // Remove list markers (unordered)
      .replace(/^[\s]*[-*+]\s+/gm, "• ")
      // Remove list markers (ordered)
      .replace(/^[\s]*\d+\.\s+/gm, "")
      // Remove link formatting, keep text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Remove image formatting, keep alt text
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      // Remove HTML tags
      .replace(/<[^>]*>/g, "")
      // Final cleanup: remove any leftover unmatched formatting chars
      .replace(/[*_]{1,3}/g, "")
      // Collapse multiple newlines
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Check whether all code fences (```) in the text are balanced (closed).
 * Used during streaming: react-markdown treats an unclosed fence as one giant
 * code block, so we append a closing fence before rendering partial content.
 */
export function isBalancedFence(text: string): boolean {
  const fences = text.match(/^[ \t]*```/gm);
  return (fences?.length ?? 0) % 2 === 0;
}
