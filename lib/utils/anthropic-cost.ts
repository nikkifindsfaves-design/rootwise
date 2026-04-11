/**
 * Estimates Anthropic API cost in USD.
 * Rates: $3 per million input tokens, $15 per million output tokens.
 * Update this file if model pricing changes — do not duplicate this formula elsewhere.
 */
export function estimateCost(inputTokens: number, outputTokens: number): string {
  return ((inputTokens * 3 + outputTokens * 15) / 1_000_000).toFixed(5);
}
