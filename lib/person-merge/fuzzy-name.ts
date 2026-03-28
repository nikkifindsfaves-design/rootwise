/** Levenshtein distance for fuzzy name matching (same idea as `app/review/actions.ts`). */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[n] as number;
}

export function parseNameSearchQuery(q: string): {
  first: string;
  last: string;
} {
  const t = q.trim();
  if (!t) return { first: "", last: "" };
  const parts = t.split(/\s+/);
  if (parts.length === 1) {
    return { first: parts[0]!.toLowerCase(), last: "" };
  }
  return {
    first: parts[0]!.toLowerCase(),
    last: parts.slice(1).join(" ").toLowerCase(),
  };
}

/**
 * Multi-word: fuzzy on first and last (each ≤ maxDistance).
 * Single word: fuzzy match against either first or last name.
 */
export function matchesPersonNameQuery(
  dbFirst: string,
  dbLast: string,
  qFirst: string,
  qLast: string,
  maxDistance = 2
): boolean {
  const dbFn = (dbFirst ?? "").trim().toLowerCase();
  const dbLn = (dbLast ?? "").trim().toLowerCase();
  if (!qFirst && !qLast) return false;
  if (qFirst && !qLast) {
    return (
      levenshtein(qFirst, dbFn) <= maxDistance ||
      levenshtein(qFirst, dbLn) <= maxDistance
    );
  }
  return (
    levenshtein(qFirst, dbFn) <= maxDistance &&
    levenshtein(qLast, dbLn) <= maxDistance
  );
}
