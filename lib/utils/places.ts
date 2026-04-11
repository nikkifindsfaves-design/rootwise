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

export async function findOrCreatePlace(
  supabase: SupabaseClient,
  fields: PlaceFields
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  let q = supabase.from("places").select("id");
  if (fields.township === null) {
    q = q.is("township", null);
  } else {
    q = q.eq("township", fields.township);
  }
  if (fields.county === null) {
    q = q.is("county", null);
  } else {
    q = q.eq("county", fields.county);
  }
  if (fields.state === null) {
    q = q.is("state", null);
  } else {
    q = q.eq("state", fields.state);
  }
  q = q.eq("country", fields.country);

  const { data: foundRows, error: findErr } = await q.limit(1);
  if (findErr) return { ok: false, message: findErr.message };
  const fid = (foundRows?.[0] as { id?: string } | undefined)?.id;
  if (typeof fid === "string" && fid !== "") {
    return { ok: true, id: fid };
  }

  const { data: inserted, error: insErr } = await supabase
    .from("places")
    .insert({
      township: fields.township,
      county: fields.county,
      state: fields.state,
      country: fields.country,
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
