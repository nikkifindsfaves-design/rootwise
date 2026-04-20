import { SupabaseClient } from "@supabase/supabase-js";

export type PlaceObject = {
  township: string | null;
  county: string | null;
  state: string | null;
  country: string;
};

function segment(value: string | null | undefined): string | null {
  if (value == null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function formatPlace(place: PlaceObject): string {
  const parts = [
    segment(place.township),
    segment(place.county),
    segment(place.state),
    segment(place.country),
  ].filter((p): p is string => p != null);
  return parts.join(", ");
}

export function placeToSearchString(partial: string): string {
  return partial.trim().toLowerCase();
}

export type PlaceFields = {
  township: string | null;
  county: string | null;
  state: string | null;
  country: string;
};

type PlaceRow = {
  id: string;
  township: string | null;
  county: string | null;
  state: string | null;
  country: string;
};

function normalizeForCompare(value: string | null): string | null {
  const s = segment(value);
  return s == null ? null : s.toLowerCase();
}

function levenshtein(a: string, b: string): number {
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
  return dp[n];
}

function similarity(a: string | null, b: string | null): number {
  if (a == null && b == null) return 1;
  if (a == null || b == null) return 0;
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshtein(a, b);
  return 1 - dist / maxLen;
}

function fuzzyScore(fields: PlaceFields, row: PlaceRow): number {
  const weights = {
    township: 0.4,
    county: 0.25,
    state: 0.2,
    country: 0.15,
  };
  const townshipScore = similarity(
    normalizeForCompare(fields.township),
    normalizeForCompare(row.township)
  );
  const countyScore = similarity(
    normalizeForCompare(fields.county),
    normalizeForCompare(row.county)
  );
  const stateScore = similarity(
    normalizeForCompare(fields.state),
    normalizeForCompare(row.state)
  );
  const countryScore = similarity(
    normalizeForCompare(fields.country),
    normalizeForCompare(row.country)
  );
  return (
    townshipScore * weights.township +
    countyScore * weights.county +
    stateScore * weights.state +
    countryScore * weights.country
  );
}

export async function findOrCreatePlace(
  supabase: SupabaseClient,
  fields: PlaceFields
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const normalizedFields: PlaceFields = {
    township: segment(fields.township),
    county: segment(fields.county),
    state: segment(fields.state),
    country: segment(fields.country) ?? "",
  };
  if (normalizedFields.country === "") {
    return { ok: false, message: "Country is required." };
  }

  let q = supabase.from("places").select("id");
  if (normalizedFields.township === null) {
    q = q.is("township", null);
  } else {
    q = q.eq("township", normalizedFields.township);
  }
  if (normalizedFields.county === null) {
    q = q.is("county", null);
  } else {
    q = q.eq("county", normalizedFields.county);
  }
  if (normalizedFields.state === null) {
    q = q.is("state", null);
  } else {
    q = q.eq("state", normalizedFields.state);
  }
  q = q.eq("country", normalizedFields.country);

  const { data: foundRows, error: findErr } = await q.limit(1);
  if (findErr) return { ok: false, message: findErr.message };
  const fid = (foundRows?.[0] as { id?: string } | undefined)?.id;
  if (typeof fid === "string" && fid !== "") {
    return { ok: true, id: fid };
  }

  const { data: candidates, error: fuzzyFindErr } = await supabase
    .from("places")
    .select("id, township, county, state, country")
    .ilike("country", normalizedFields.country)
    .limit(200);

  if (fuzzyFindErr) return { ok: false, message: fuzzyFindErr.message };

  let bestId: string | null = null;
  let bestScore = 0;
  for (const row of (candidates ?? []) as PlaceRow[]) {
    const score = fuzzyScore(normalizedFields, row);
    if (score > bestScore) {
      bestScore = score;
      bestId = row.id;
    }
  }
  if (bestId !== null && bestScore >= 0.82) {
    return { ok: true, id: bestId };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("places")
    .insert({
      township: normalizedFields.township,
      county: normalizedFields.county,
      state: normalizedFields.state,
      country: normalizedFields.country,
    })
    .select("id")
    .maybeSingle();

  if (insErr) {
    return { ok: false, message: insErr.message };
  }
  const iid = (inserted as { id?: string } | null)?.id;
  if (typeof iid !== "string" || iid === "") {
    return { ok: false, message: "Failed to create place." };
  }
  return { ok: true, id: iid };
}
