/** Rough token estimator: ~4 characters per token for English text */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
