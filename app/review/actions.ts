"use server";

import { savePersonEventWithDedupe } from "@/lib/events/dedupe";
import { inverseRelationshipType } from "@/lib/relationships/direction";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_GENDER, normalizeGender } from "@/lib/utils/gender";
import {
  findOrCreatePlace,
  findOrCreateInReviewPlace,
  normalizePlaceFields,
  type PlaceFields,
} from "@/lib/utils/places";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PersonRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  birth_date: string | null;
  death_date: string | null;
  gender: string | null;
  notes: string | null;
};

export type PersonFormInput = {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  birth_date: string | null;
  death_date: string | null;
  gender: string | null;
  notes: string | null;
};

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

function isEmptyDbField(v: string | null | undefined): boolean {
  return v == null || String(v).trim() === "";
}

function parsePlaceFields(raw: unknown): PlaceFields | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const o = raw as Record<string, unknown>;
  return {
    township:
      typeof o.township === "string" || o.township === null
        ? (o.township as string | null)
        : null,
    county:
      typeof o.county === "string" || o.county === null
        ? (o.county as string | null)
        : null,
    state:
      typeof o.state === "string" || o.state === null
        ? (o.state as string | null)
        : null,
    country: typeof o.country === "string" ? o.country : "",
  };
}

/**
 * Loads all persons for the current user and returns those whose first and last names
 * are each within `maxDistance` Levenshtein edits of the given names (case-insensitive).
 */
export async function findFuzzyPersonMatches(
  firstName: string,
  lastName: string,
  maxDistance = 2
): Promise<{ matches: PersonRow[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { matches: [], error: "Unauthorized" };
  }

  const fn = firstName.trim();
  const ln = lastName.trim();
  if (!fn || !ln) {
    return { matches: [] };
  }

  const { data, error } = await supabase
    .from("persons")
    .select(
      "id, first_name, middle_name, last_name, birth_date, death_date, gender, notes"
    )
    .eq("user_id", user.id);

  if (error) {
    return { matches: [], error: error.message };
  }

  const fnNorm = fn.toLowerCase();
  const lnNorm = ln.toLowerCase();
  const seen = new Set<string>();
  const matches: PersonRow[] = [];

  for (const row of data ?? []) {
    const p = row as PersonRow;
    const dbFn = (p.first_name ?? "").trim().toLowerCase();
    const dbLn = (p.last_name ?? "").trim().toLowerCase();
    if (
      levenshtein(fnNorm, dbFn) <= maxDistance &&
      levenshtein(lnNorm, dbLn) <= maxDistance
    ) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        matches.push(p);
      }
    }
  }

  return { matches };
}

export async function findPersonByName(
  firstName: string,
  lastName: string
): Promise<{ match: PersonRow | null; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { match: null, error: "Unauthorized" };
  }

  const fn = firstName.trim();
  const ln = lastName.trim();
  if (!fn || !ln) {
    return { match: null };
  }

  const { data, error } = await supabase
    .from("persons")
    .select(
      "id, first_name, middle_name, last_name, birth_date, death_date, gender, notes"
    )
    .eq("user_id", user.id)
    .ilike("first_name", fn)
    .ilike("last_name", ln)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { match: null, error: error.message };
  }

  return { match: data as PersonRow | null };
}

export async function insertPerson(
  input: PersonFormInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const first_name = input.first_name.trim();
  const last_name = input.last_name.trim();
  if (!first_name || !last_name) {
    return { ok: false, error: "First and last name are required." };
  }

  const { error } = await supabase.from("persons").insert({
    user_id: user.id,
    first_name,
    middle_name: input.middle_name?.trim() || null,
    last_name,
    birth_date: input.birth_date?.trim() || null,
    death_date: input.death_date?.trim() || null,
    gender: normalizeGender(input.gender),
    notes: input.notes?.trim() || null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

export async function insertPersonReturningId(
  input: PersonFormInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const first_name = input.first_name.trim();
  const last_name = input.last_name.trim();
  if (!first_name || !last_name) {
    return { ok: false, error: "First and last name are required." };
  }

  const { data, error } = await supabase
    .from("persons")
    .insert({
      user_id: user.id,
      first_name,
      middle_name: input.middle_name?.trim() || null,
      last_name,
      birth_date: input.birth_date?.trim() || null,
      death_date: input.death_date?.trim() || null,
      gender: normalizeGender(input.gender),
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: "Insert failed." };
  }

  return { ok: true, id: data.id as string };
}

export async function mergePerson(
  personId: string,
  input: PersonFormInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const first_name = input.first_name.trim();
  const last_name = input.last_name.trim();
  if (!first_name || !last_name) {
    return { ok: false, error: "First and last name are required." };
  }

  const { error } = await supabase
    .from("persons")
    .update({
      first_name,
      middle_name: input.middle_name?.trim() || null,
      last_name,
      birth_date: input.birth_date?.trim() || null,
      death_date: input.death_date?.trim() || null,
      gender: normalizeGender(input.gender),
      notes: input.notes?.trim() || null,
    })
    .eq("id", personId)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

type PersonNameRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
};

function buildFullName(row: PersonNameRow): string {
  return [row.first_name, row.middle_name, row.last_name]
    .filter((p) => p != null && String(p).trim() !== "")
    .map((p) => String(p).trim())
    .join(" ");
}

function normalizeFullName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function findPersonIdByFullName(
  persons: PersonNameRow[],
  fullName: string
): string | null {
  const target = normalizeFullName(fullName);
  if (!target) return null;
  for (const p of persons) {
    if (normalizeFullName(buildFullName(p)) === target) {
      return p.id;
    }
  }
  return null;
}

/**
 * Inserts two rows: (person_a_id, person_b_id, relationship_type) from each endpoint’s perspective.
 * Resolves persons by normalized full name.
 */
export async function insertRelationshipPairFromFullNames(
  personAFullName: string,
  personBFullName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const { data: persons, error: personsError } = await supabase
    .from("persons")
    .select("id, first_name, middle_name, last_name")
    .eq("user_id", user.id);

  if (personsError) {
    return { ok: false, error: personsError.message };
  }

  const list = (persons ?? []) as PersonNameRow[];
  const idA = findPersonIdByFullName(list, personAFullName);
  const idB = findPersonIdByFullName(list, personBFullName);

  if (!idA) {
    return {
      ok: false,
      error: `No person found matching "${personAFullName.trim()}". Add them to your tree first or fix the name.`,
    };
  }
  if (!idB) {
    return {
      ok: false,
      error: `No person found matching "${personBFullName.trim()}". Add them to your tree first or fix the name.`,
    };
  }
  if (idA === idB) {
    return { ok: false, error: "Both sides refer to the same person." };
  }

  const { error: err1 } = await supabase.from("relationships").insert({
    user_id: user.id,
    person_a_id: idA,
    person_b_id: idB,
    relationship_type: "parent",
  });

  if (err1) {
    return { ok: false, error: err1.message };
  }

  const { error: err2 } = await supabase.from("relationships").insert({
    user_id: user.id,
    person_a_id: idB,
    person_b_id: idA,
    relationship_type: "child",
  });

  if (err2) {
    await supabase
      .from("relationships")
      .delete()
      .eq("user_id", user.id)
      .eq("person_a_id", idA)
      .eq("person_b_id", idB);
    return { ok: false, error: err2.message };
  }

  return { ok: true };
}

export type CardRelationshipInput = {
  related_name: string;
  relationship_type: string;
};

export type CardEventInput = {
  event_type: string;
  event_date: string | null;
  event_place_display: string | null;
  event_place_id: string | null;
  event_place_fields: PlaceFields | null;
  notes: string | null;
  story_full: string | null;
};

async function resolveEventPlaceIdFromCardEvent(
  supabase: SupabaseClient,
  ev: CardEventInput,
  _recordId: string
): Promise<{ id: string | null; error: string | null }> {
  const rawId = ev.event_place_id;
  if (typeof rawId === "string" && rawId.trim() !== "") {
    return { id: rawId.trim(), error: null };
  }
  const fields =
    ev.event_place_fields == null
      ? null
      : parsePlaceFields(ev.event_place_fields);
  if (fields === null) {
    return { id: null, error: null };
  }
  const normalizedFields = normalizePlaceFields(fields);
  const r = await findOrCreatePlace(supabase, normalizedFields, { allowCreate: false });
  if (!r.ok) {
    return { id: null, error: r.message };
  }
  if (r.id) {
    return { id: r.id, error: null };
  }
  const inReviewRes = await findOrCreateInReviewPlace(supabase, {
    ...normalizedFields,
    source_dataset: "manual_review",
    source_ref:
      ev.event_place_display?.trim() ||
      JSON.stringify(ev.event_place_fields ?? {}) ||
      "(empty)",
  });
  if (!inReviewRes.ok) return { id: null, error: inReviewRes.message };
  return { id: inReviewRes.id, error: null };
}

/**
 * Saves the person, relationship edges (two rows per relationship: A→B and B→A perspectives), and events.
 * `relationships`: this person's relationship toward `related_name` with `relationship_type`.
 * Tables: `relationships` (user_id, person_a_id, person_b_id, relationship_type),
 * `events` (user_id, person_id, record_id, event_type, event_date, event_place_id, notes, story_full).
 */
export async function acceptPersonCard(params: {
  form: PersonFormInput;
  recordId: string;
  relationships: CardRelationshipInput[];
  events: CardEventInput[];
  mergeWithPersonId?: string | null;
  /**
   * When merging, only write form values into columns that are null/empty in the DB.
   * Ignored unless `mergeWithPersonId` is set.
   */
  mergeFillEmptyOnly?: boolean;
  /** Person row already inserted (e.g. duplicate name flow); update fields then save rels/events. */
  existingPersonId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Unauthorized" };
  }

  const { data: recordRow, error: recordErr } = await supabase
    .from("records")
    .select("id")
    .eq("id", params.recordId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (recordErr || !recordRow) {
    return { ok: false, error: "Record not found." };
  }

  const first_name = params.form.first_name.trim();
  const last_name = params.form.last_name.trim();
  if (!first_name || !last_name) {
    return { ok: false, error: "First and last name are required." };
  }

  let personId: string;

  const personPayload = {
    first_name,
    middle_name: params.form.middle_name?.trim() || null,
    last_name,
    birth_date: params.form.birth_date?.trim() || null,
    death_date: params.form.death_date?.trim() || null,
    gender: normalizeGender(params.form.gender),
    notes: params.form.notes?.trim() || null,
  };

  if (params.mergeWithPersonId) {
    let updatePayload: typeof personPayload;

    if (params.mergeFillEmptyOnly) {
      const { data: existingRow, error: fetchMergeErr } = await supabase
        .from("persons")
        .select(
          "id, first_name, middle_name, last_name, birth_date, death_date, gender, notes"
        )
        .eq("id", params.mergeWithPersonId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchMergeErr || !existingRow) {
        return {
          ok: false,
          error: fetchMergeErr?.message ?? "Person not found.",
        };
      }

      const ex = existingRow as PersonRow;
      const formMid = params.form.middle_name?.trim() || null;
      const formBirth = params.form.birth_date?.trim() || null;
      const formDeath = params.form.death_date?.trim() || null;
      const formGender = normalizeGender(params.form.gender);
      const formNotes = params.form.notes?.trim() || null;

      updatePayload = {
        first_name: isEmptyDbField(ex.first_name) ? first_name : ex.first_name.trim(),
        last_name: isEmptyDbField(ex.last_name) ? last_name : ex.last_name.trim(),
        middle_name: isEmptyDbField(ex.middle_name) ? formMid : ex.middle_name,
        birth_date: isEmptyDbField(ex.birth_date) ? formBirth : ex.birth_date,
        death_date: isEmptyDbField(ex.death_date) ? formDeath : ex.death_date,
        gender: isEmptyDbField(ex.gender)
          ? formGender
          : normalizeGender(ex.gender),
        notes: isEmptyDbField(ex.notes) ? formNotes : ex.notes,
      };
    } else {
      updatePayload = personPayload;
    }

    const { error: mergeError } = await supabase
      .from("persons")
      .update(updatePayload)
      .eq("id", params.mergeWithPersonId)
      .eq("user_id", user.id);

    if (mergeError) {
      return { ok: false, error: mergeError.message };
    }
    personId = params.mergeWithPersonId;
  } else if (params.existingPersonId) {
    const { error: updErr } = await supabase
      .from("persons")
      .update(personPayload)
      .eq("id", params.existingPersonId)
      .eq("user_id", user.id);

    if (updErr) {
      return { ok: false, error: updErr.message };
    }
    personId = params.existingPersonId;
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("persons")
      .insert({
        user_id: user.id,
        ...personPayload,
      })
      .select("id")
      .maybeSingle();

    if (insErr) {
      return { ok: false, error: insErr.message };
    }
    if (!inserted) {
      return { ok: false, error: "Failed to create person." };
    }
    personId = inserted.id as string;
  }

  const { data: allPersons, error: listErr } = await supabase
    .from("persons")
    .select("id, first_name, middle_name, last_name")
    .eq("user_id", user.id);

  if (listErr) {
    return { ok: false, error: listErr.message };
  }

  const list = (allPersons ?? []) as PersonNameRow[];

  for (const rel of params.relationships) {
    const relatedName = rel.related_name.trim();
    if (!relatedName) continue;

    const relatedId = findPersonIdByFullName(list, relatedName);
    if (!relatedId) {
      return {
        ok: false,
        error: `No person found matching "${relatedName}". Save the other person first or fix the name.`,
      };
    }
    if (relatedId === personId) {
      return {
        ok: false,
        error: "A relationship cannot connect a person to themselves.",
      };
    }

    const relType = rel.relationship_type.trim() || "other";

    const { error: r1 } = await supabase.from("relationships").insert({
      user_id: user.id,
      person_a_id: personId,
      person_b_id: relatedId,
      relationship_type: relType,
    });

    if (r1) {
      return { ok: false, error: r1.message };
    }

    const { error: r2 } = await supabase.from("relationships").insert({
      user_id: user.id,
      person_a_id: relatedId,
      person_b_id: personId,
      relationship_type: inverseRelationshipType(relType),
    });

    if (r2) {
      await supabase
        .from("relationships")
        .delete()
        .eq("user_id", user.id)
        .eq("person_a_id", personId)
        .eq("person_b_id", relatedId);
      return { ok: false, error: r2.message };
    }
  }

  for (const ev of params.events) {
    const placeRes = await resolveEventPlaceIdFromCardEvent(
      supabase,
      ev,
      params.recordId
    );
    if (placeRes.error) {
      return { ok: false, error: placeRes.error };
    }
    const { error: evErr } = await savePersonEventWithDedupe(
      supabase,
      user.id,
      personId,
      params.recordId,
      {
        event_type: ev.event_type.trim() || "other",
        event_date: ev.event_date?.trim() || null,
        event_place_id: placeRes.id,
        notes: ev.notes?.trim() || null,
        story_full: ev.story_full?.trim() || null,
      }
    );

    if (evErr) {
      return { ok: false, error: evErr };
    }
  }

  return { ok: true };
}
