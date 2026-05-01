import { SupabaseClient } from "@supabase/supabase-js";

export type PlaceObject = {
  township: string | null;
  county: string | null;
  state: string | null;
  country: string;
};

/** Joined from `places.place_identity_id` → `place_identities` (Supabase embed). */
export type PlaceIdentityRow = {
  canonical_township?: string | null;
  canonical_county?: string | null;
  canonical_state?: string | null;
  country?: string | null;
  canonical_display_name?: string | null;
};

export type PlaceVersionRow = PlaceObject & {
  place_identity?: PlaceIdentityRow | PlaceIdentityRow[] | null;
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

function firstPlaceIdentity(
  pi: PlaceIdentityRow | PlaceIdentityRow[] | null | undefined
): PlaceIdentityRow | null {
  if (pi == null) return null;
  return Array.isArray(pi) ? (pi[0] ?? null) : pi;
}

/**
 * Human-readable place for a `places` row, including fallbacks from linked
 * `place_identities` when the version row has no township/county/state/country text.
 */
export function formatPlaceFromVersionRow(
  row: PlaceVersionRow | PlaceObject | null | undefined
): string {
  if (row == null) return "";
  const base: PlaceObject = {
    township: row.township ?? null,
    county: row.county ?? null,
    state: row.state ?? null,
    country: row.country ?? "",
  };
  const primary = formatPlace(base).trim();
  if (primary) return primary;
  const pi =
    "place_identity" in row ? firstPlaceIdentity(row.place_identity) : null;
  if (!pi) return "";
  const fromCanon = formatPlace({
    township: pi.canonical_township ?? null,
    county: pi.canonical_county ?? null,
    state: pi.canonical_state ?? null,
    country: pi.country ?? "",
  }).trim();
  if (fromCanon) return fromCanon;
  const dn =
    typeof pi.canonical_display_name === "string"
      ? pi.canonical_display_name.trim()
      : "";
  return dn;
}

/**
 * Normalizes Supabase embed shapes (arrays, nested `place_identity` arrays)
 * into a single {@link PlaceVersionRow} for app state.
 */
export function normalizePlaceVersionEmbed(
  raw: PlaceVersionRow | PlaceObject | PlaceVersionRow[] | null | undefined
): PlaceVersionRow | null {
  if (raw == null) return null;
  const row = Array.isArray(raw) ? (raw[0] ?? null) : raw;
  if (row == null) return null;
  const base = row as PlaceVersionRow;
  if (!("place_identity" in base) || base.place_identity === undefined) {
    return {
      township: base.township ?? null,
      county: base.county ?? null,
      state: base.state ?? null,
      country: base.country ?? "",
    };
  }
  return {
    township: base.township ?? null,
    county: base.county ?? null,
    state: base.state ?? null,
    country: base.country ?? "",
    place_identity: firstPlaceIdentity(base.place_identity),
  };
}

const PLACE_ROW_WITH_IDENTITY_SELECT =
  "township, county, state, country, place_identity_id, place_identity:place_identities!place_identity_id(canonical_display_name, country, canonical_township, canonical_county, canonical_state)";

/**
 * Loads a single place row (with identity fallback) by id. Use when
 * `persons.birth_place_id` / `death_place_id` is set but the parent query embed
 * returned null or empty display fields.
 */
export async function fetchPlaceVersionRowById(
  supabase: SupabaseClient,
  placeId: string | null | undefined
): Promise<PlaceVersionRow | null> {
  const id =
    typeof placeId === "string" && placeId.trim() !== "" ? placeId.trim() : "";
  if (!id) return null;
  const { data, error } = await supabase
    .from("places")
    .select(PLACE_ROW_WITH_IDENTITY_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error || data == null) return null;
  return normalizePlaceVersionEmbed(data as PlaceVersionRow);
}

export function placeToSearchString(partial: string): string {
  return partial.trim().toLowerCase();
}

export type PlaceFields = {
  township: string | null;
  county: string | null;
  state: string | null;
  country: string;
  review_status?: "approved" | "in_review" | "rejected" | null;
  valid_from?: string | null;
  valid_to?: string | null;
  historical_context?: string | null;
  is_canonical_current?: boolean;
  source_dataset?: string | null;
  source_ref?: string | null;
};

function asDateOrNull(v: string | null | undefined): string | null {
  const s = segment(v);
  return s == null ? null : s;
}

function asBool(v: boolean | null | undefined, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  return fallback;
}

const STATE_NAME_BY_CODE: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function titleCaseWords(value: string): string {
  const tokens = collapseWhitespace(value)
    .split(" ")
    .filter(Boolean);
  return tokens
    .map((token) => {
      if (token.length <= 1) return token.toUpperCase();
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(" ");
}

function normalizeTownship(v: string | null): string | null {
  const s = segment(v);
  if (s == null) return null;
  return titleCaseWords(s);
}

function normalizeCounty(v: string | null): string | null {
  const s = segment(v);
  if (s == null) return null;
  let value = collapseWhitespace(s);
  value = value.replace(/\bco\.?\b/gi, "County");
  value = value.replace(/\bcnty\.?\b/gi, "County");
  value = value.replace(/\bcounty county\b/gi, "County");
  value = titleCaseWords(value);
  if (!/\bCounty$/i.test(value)) {
    value = `${value} County`;
  }
  return value;
}

function normalizeState(v: string | null): string | null {
  const s = segment(v);
  if (s == null) return null;
  const cleaned = s.replace(/\./g, "").trim();
  if (cleaned.length === 2) {
    const fromCode = STATE_NAME_BY_CODE[cleaned.toUpperCase()];
    if (fromCode) return fromCode;
  }
  return titleCaseWords(cleaned);
}

function normalizeCountry(v: string): string {
  const s = segment(v);
  if (s == null) return "";
  const cleaned = s.replace(/\./g, "").trim().toLowerCase();
  if (cleaned === "us" || cleaned === "u s" || cleaned === "usa") {
    return "United States";
  }
  return titleCaseWords(cleaned);
}

export function normalizePlaceFields(fields: PlaceFields): PlaceFields {
  return {
    township: normalizeTownship(fields.township),
    county: normalizeCounty(fields.county),
    state: normalizeState(fields.state),
    country: normalizeCountry(fields.country),
    review_status: fields.review_status ?? null,
    valid_from: asDateOrNull(fields.valid_from),
    valid_to: asDateOrNull(fields.valid_to),
    historical_context: segment(fields.historical_context),
    is_canonical_current: asBool(fields.is_canonical_current, true),
    source_dataset: segment(fields.source_dataset),
    source_ref: segment(fields.source_ref),
  };
}

export async function findOrCreatePlace(
  supabase: SupabaseClient,
  fields: PlaceFields,
  options?: { allowCreate?: boolean }
): Promise<{ ok: true; id: string | null; matched: boolean } | { ok: false; message: string }> {
  const normalizedFields = normalizePlaceFields(fields);
  const allowCreate = options?.allowCreate ?? true;

  if (!allowCreate) {
    let lookup = supabase
      .from("places")
      .select("id")
      .eq("is_canonical_current", normalizedFields.is_canonical_current ?? true);
    if (normalizedFields.township === null) lookup = lookup.is("township", null);
    else lookup = lookup.eq("township", normalizedFields.township);
    if (normalizedFields.county === null) lookup = lookup.is("county", null);
    else lookup = lookup.eq("county", normalizedFields.county);
    if (normalizedFields.state === null) lookup = lookup.is("state", null);
    else lookup = lookup.eq("state", normalizedFields.state);
    if (normalizedFields.country !== "") {
      lookup = lookup.eq("country", normalizedFields.country);
    }
    if (normalizedFields.valid_from == null) lookup = lookup.is("valid_from", null);
    else lookup = lookup.eq("valid_from", normalizedFields.valid_from);
    if (normalizedFields.valid_to == null) lookup = lookup.is("valid_to", null);
    else lookup = lookup.eq("valid_to", normalizedFields.valid_to);
    if (normalizedFields.historical_context == null) {
      lookup = lookup.is("historical_context", null);
    } else {
      lookup = lookup.eq("historical_context", normalizedFields.historical_context);
    }
    const { data: lookupRows, error: lookupErr } = await lookup.limit(2);
    if (lookupErr) return { ok: false, message: lookupErr.message };
    const rows = (lookupRows ?? []) as Array<{ id?: string }>;
    if (rows.length === 1 && typeof rows[0]?.id === "string" && rows[0].id !== "") {
      return { ok: true, id: rows[0].id!, matched: true };
    }
    return { ok: true, id: null, matched: false };
  }

  let q = supabase
    .from("places")
    .select("id")
    .eq("review_status", normalizedFields.review_status ?? "approved");
  if (normalizedFields.township === null) q = q.is("township", null);
  else q = q.eq("township", normalizedFields.township);
  if (normalizedFields.county === null) q = q.is("county", null);
  else q = q.eq("county", normalizedFields.county);
  if (normalizedFields.state === null) q = q.is("state", null);
  else q = q.eq("state", normalizedFields.state);
  q = q.eq("country", normalizedFields.country);
  if (normalizedFields.valid_from == null) q = q.is("valid_from", null);
  else q = q.eq("valid_from", normalizedFields.valid_from);
  if (normalizedFields.valid_to == null) q = q.is("valid_to", null);
  else q = q.eq("valid_to", normalizedFields.valid_to);
  if (normalizedFields.historical_context == null) q = q.is("historical_context", null);
  else q = q.eq("historical_context", normalizedFields.historical_context);
  q = q.eq("is_canonical_current", normalizedFields.is_canonical_current ?? true);

  const { data: foundRows, error: findErr } = await q.limit(1);
  if (findErr) return { ok: false, message: findErr.message };
  const foundId = (foundRows?.[0] as { id?: string } | undefined)?.id;
  if (typeof foundId === "string" && foundId !== "") return { ok: true, id: foundId, matched: true };

  const { data: inserted, error: insErr } = await supabase
    .from("places")
    .insert({
      township: normalizedFields.township,
      county: normalizedFields.county,
      state: normalizedFields.state,
      country: normalizedFields.country,
      review_status: normalizedFields.review_status ?? "approved",
      valid_from: normalizedFields.valid_from ?? null,
      valid_to: normalizedFields.valid_to ?? null,
      historical_context: normalizedFields.historical_context ?? null,
      is_canonical_current: normalizedFields.is_canonical_current ?? true,
      source_dataset: normalizedFields.source_dataset ?? null,
      source_ref: normalizedFields.source_ref ?? null,
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
  return { ok: true, id: iid, matched: false };
}

export async function findOrCreateInReviewPlace(
  supabase: SupabaseClient,
  fields: PlaceFields
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const normalizedFields = normalizePlaceFields(fields);
  const sourceDataset = segment(normalizedFields.source_dataset);
  const sourceRef = segment(normalizedFields.source_ref);

  // If source reference is stable, reuse that unresolved row first.
  if (sourceDataset && sourceRef) {
    const { data: bySourceRows, error: bySourceErr } = await supabase
      .from("places")
      .select("id")
      .eq("review_status", "in_review")
      .eq("source_dataset", sourceDataset)
      .eq("source_ref", sourceRef)
      .limit(1);
    if (bySourceErr) return { ok: false, message: bySourceErr.message };
    const bySourceId = (bySourceRows?.[0] as { id?: string } | undefined)?.id;
    if (typeof bySourceId === "string" && bySourceId !== "") {
      return { ok: true, id: bySourceId };
    }
  }

  const existing = await findOrCreatePlace(supabase, normalizedFields, {
    allowCreate: false,
  });
  if (!existing.ok) return existing;
  if (existing.id) return { ok: true, id: existing.id };

  // Reuse an existing in-review row before creating a new one.
  let inReview = supabase
    .from("places")
    .select("id")
    .eq("review_status", "in_review");
  if (normalizedFields.township === null) inReview = inReview.is("township", null);
  else inReview = inReview.eq("township", normalizedFields.township);
  if (normalizedFields.county === null) inReview = inReview.is("county", null);
  else inReview = inReview.eq("county", normalizedFields.county);
  if (normalizedFields.state === null) inReview = inReview.is("state", null);
  else inReview = inReview.eq("state", normalizedFields.state);
  if (normalizedFields.country === "") inReview = inReview.eq("country", "");
  else inReview = inReview.eq("country", normalizedFields.country);
  const { data: reviewRows, error: reviewErr } = await inReview.limit(1);
  if (reviewErr) return { ok: false, message: reviewErr.message };
  const reviewId = (reviewRows?.[0] as { id?: string } | undefined)?.id;
  if (typeof reviewId === "string" && reviewId !== "") {
    return { ok: true, id: reviewId };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("places")
    .insert({
      township: normalizedFields.township,
      county: normalizedFields.county,
      state: normalizedFields.state,
      country: normalizedFields.country,
      review_status: "in_review",
      valid_from: normalizedFields.valid_from ?? null,
      valid_to: normalizedFields.valid_to ?? null,
      historical_context: normalizedFields.historical_context ?? null,
      is_canonical_current: false,
      source_dataset: sourceDataset ?? "manual_review",
      source_ref: sourceRef ?? null,
    })
    .select("id")
    .maybeSingle();
  if (insErr) return { ok: false, message: insErr.message };
  const createdId = (inserted as { id?: string } | null)?.id;
  if (typeof createdId !== "string" || createdId === "") {
    return { ok: false, message: "Failed to create in-review place." };
  }
  return { ok: true, id: createdId };
}
