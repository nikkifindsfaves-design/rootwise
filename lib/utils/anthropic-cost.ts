/**
 * Estimates Anthropic API cost in USD.
 * Rates are model-specific and should match the model used in each route.
 * Update this file if model pricing changes — do not duplicate this formula elsewhere.
 */
function getModelRates(model: string): { inputPerMillion: number; outputPerMillion: number } {
  const normalized = model.trim().toLowerCase();

  if (normalized.includes("haiku")) {
    return { inputPerMillion: 1, outputPerMillion: 5 };
  }
  if (normalized.includes("sonnet")) {
    return { inputPerMillion: 3, outputPerMillion: 15 };
  }
  if (normalized.includes("opus")) {
    return { inputPerMillion: 5, outputPerMillion: 25 };
  }

  // Conservative fallback.
  return { inputPerMillion: 3, outputPerMillion: 15 };
}

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: string
): string {
  const rates = getModelRates(model);
  return (
    (inputTokens * rates.inputPerMillion + outputTokens * rates.outputPerMillion) /
    1_000_000
  ).toFixed(5);
}
