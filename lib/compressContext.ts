import { estimateTokens } from "./estimateTokens";

interface CompressibleMessage {
  role: string;
  content: string;
}

/**
 * Compress a list of messages to fit within a token budget.
 * Strategy: keep context anchor (first user+assistant pair) +
 * the most recent messages that fit within the budget.
 *
 * Returns the trimmed messages array. If no trimming is needed, returns the original.
 */
export function compressMessages<T extends CompressibleMessage>(
  messages: T[],
  maxContextTokens: number,
): T[] {
  if (messages.length === 0) return messages;

  const totalTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  // No compression needed
  if (totalTokens <= maxContextTokens) return messages;

  // Always keep the first user message and its assistant response as context anchor
  const firstUserIdx = messages.findIndex((m) => m.role === "user");
  const anchorEndIdx =
    firstUserIdx >= 0
      ? Math.min(firstUserIdx + 2, messages.length) // first user + first assistant
      : 0;

  const anchorMessages = messages.slice(0, anchorEndIdx);
  const anchorTokens = anchorMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);

  // Token budget for recent messages
  const recentBudget = maxContextTokens - anchorTokens;
  if (recentBudget <= 0) {
    // Edge case: anchor alone already fills the budget — return anchor + note
    const skipped = messages.length - anchorMessages.length;
    const note: CompressibleMessage = {
      role: "user",
      content: `[Context compressed: ${skipped} earlier messages not shown. Continue the conversation based on what you remember.]`,
    };
    return [...anchorMessages, note as unknown as T];
  }

  // Walk backward from the end, collecting messages until budget exhausted
  const recent: T[] = [];
  let recentTokens = 0;

  for (let i = messages.length - 1; i >= anchorEndIdx; i--) {
    const msgTokens = estimateTokens(messages[i].content);
    if (recentTokens + msgTokens > recentBudget) break;
    recent.unshift(messages[i]);
    recentTokens += msgTokens;
  }

  // Combine: anchor + summary note + recent
  const skipped = messages.length - anchorMessages.length - recent.length;
  const result: T[] = [...anchorMessages];

  if (skipped > 0) {
    const note: CompressibleMessage = {
      role: "user",
      content: `[${skipped} older messages trimmed to fit context. Continue naturally from the most recent messages below.]`,
    };
    result.push(note as unknown as T);
  }

  result.push(...recent);

  return result;
}

/**
 * Determine a safe max context token budget.
 * Uses 80% of the model's advertised context window.
 */
export function getContextBudget(model: string, customBudget?: number): number {
  if (customBudget) return customBudget;

  // Known context windows (as of 2026; models not listed fall back to 128k)
  const windows: Record<string, number> = {
    // OpenAI
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "gpt-4.1": 1047576,
    "gpt-4.1-mini": 1047576,
    "gpt-4.1-nano": 1047576,
    "gpt-4-turbo": 128000,
    "gpt-4": 8192,
    "gpt-3.5-turbo": 16385,
    "o1-mini": 128000,
    "o1-preview": 128000,
    "o3-mini": 200000,
    // Anthropic
    "claude-3-5-sonnet-20241022": 200000,
    "claude-3-5-haiku-20241022": 200000,
    "claude-3-opus-20240229": 200000,
    "claude-3-sonnet-20240229": 200000,
    "claude-3-haiku-20240307": 200000,
    "claude-sonnet-4-20250514": 200000,
    "claude-opus-4-20250514": 200000,
    "claude-3-7-sonnet-20250219": 200000,
  };

  // Prefix match: e.g. "gpt-4.1-2025-04-14" or "claude-sonnet-4-..." variants
  let fullWindow = windows[model];
  if (fullWindow === undefined) {
    for (const [key, value] of Object.entries(windows)) {
      if (model.startsWith(key)) {
        fullWindow = value;
        break;
      }
    }
  }

  // Ollama runs small local models — 128k default would over-estimate badly.
  // Conservative 8k keeps compression honest when the model is unknown.
  return Math.floor((fullWindow ?? 8192) * 0.8);
}


