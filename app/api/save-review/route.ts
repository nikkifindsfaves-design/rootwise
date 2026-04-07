import { savePersonEventWithDedupe } from "@/lib/events/dedupe";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Event dedupe writes `event_sources` via `@/lib/events/dedupe` with `user_id` set
 * to the authenticated user on every insert.
 * Migrations: `20260329120000_event_sources.sql`, `20260330120000_event_sources_user_id.sql`.
 */

const MERGE_FIELDS = [
  "first_name",
  "middle_name",
  "last_name",
  "birth_date",
  "death_date",
  "birth_place_id",
  "gender",
  "notes",
] as const;

type MergeField = (typeof MERGE_FIELDS)[number];

type PendingPersonBody = {
  existingPersonId?: string | null;
  first_name?: unknown;
  middle_name?: unknown;
  last_name?: unknown;
  birth_date?: unknown;
  death_date?: unknown;
  birth_place_id?: unknown;
  birth_place_fields?: unknown;
  marital_status?: string | null;
  cause_of_death?: string | null;
  surviving_spouse?: string | null;
  gender?: unknown;
  notes?: unknown;
  relationships?: unknown;
  events?: unknown;
};

type PersonNameRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
};

function buildFullName(row: {
  first_name: string;
  middle_name: string | null;
  last_name: string;
}): string {
  return [row.first_name, row.middle_name, row.last_name]
    .filter((p) => p != null && String(p).trim() !== "")
    .map((p) => String(p).trim())
    .join(" ");
}

function normalizeFullName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function inverseRelationshipType(t: string): string {
  const n = t.trim().toLowerCase();
  const map: Record<string, string> = {
    parent: "child",
    child: "parent",
    spouse: "spouse",
    sibling: "sibling",
    grandparent: "grandchild",
    grandchild: "grandparent",
    "aunt/uncle": "niece/nephew",
    "niece/nephew": "aunt/uncle",
    other: "other",
  };
  return map[n] ?? "other";
}

function isMergeField(k: string): k is MergeField {
  return (MERGE_FIELDS as readonly string[]).includes(k);
}

function isEmptyDbField(v: string | null | undefined): boolean {
  return v == null || String(v).trim() === "";
}

type PlaceFields = {
  township: string | null;
  county: string | null;
  state: string | null;
  country: string;
};

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

async function findOrCreatePlace(
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

  const { data: found, error: findErr } = await q.maybeSingle();

  if (findErr) {
    return { ok: false, message: findErr.message };
  }
  const fid = (found as { id?: string } | null)?.id;
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
    .single();

  if (insErr) {
    return { ok: false, message: insErr.message };
  }
  const iid = (inserted as { id?: string } | null)?.id;
  if (typeof iid !== "string" || iid === "") {
    return { ok: false, message: "Failed to create place." };
  }
  return { ok: true, id: iid };
}

async function resolveBirthPlaceIdFromBody(
  supabase: SupabaseClient,
  p: PendingPersonBody
): Promise<{ id: string | null; error: string | null }> {
  const rawId = p.birth_place_id;
  if (typeof rawId === "string" && rawId.trim() !== "") {
    return { id: rawId.trim(), error: null };
  }
  const fields = parsePlaceFields(p.birth_place_fields);
  if (fields === null) {
    return { id: null, error: null };
  }
  const r = await findOrCreatePlace(supabase, fields);
  if (!r.ok) {
    return { id: null, error: r.message };
  }
  return { id: r.id, error: null };
}

async function resolveEventPlaceIdFromEvent(
  supabase: SupabaseClient,
  e: Record<string, unknown>
): Promise<{ id: string | null; error: string | null }> {
  const rawId = e.event_place_id;
  if (typeof rawId === "string" && rawId.trim() !== "") {
    return { id: rawId.trim(), error: null };
  }
  const fields = parsePlaceFields(e.event_place_fields);
  if (fields === null) {
    return { id: null, error: null };
  }
  const r = await findOrCreatePlace(supabase, fields);
  if (!r.ok) {
    return { id: null, error: r.message };
  }
  return { id: r.id, error: null };
}

function placeFieldsFromAiEventPlaceRaw(raw: unknown): PlaceFields | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    return { township: null, county: null, state: null, country: t };
  }
  return parsePlaceFields(raw);
}

function toPersonPayload(p: PendingPersonBody) {
  const first_name = String(p.first_name ?? "").trim();
  const last_name = String(p.last_name ?? "").trim();
  return {
    first_name,
    last_name,
    middle_name: String(p.middle_name ?? "").trim() || null,
    birth_date: String(p.birth_date ?? "").trim() || null,
    death_date: String(p.death_date ?? "").trim() || null,
    gender: String(p.gender ?? "").trim() || "Unknown",
    notes: String(p.notes ?? "").trim() || null,
  };
}

type PersonPayload = ReturnType<typeof toPersonPayload> & {
  birth_place_id: string | null;
};

function valueForMergeUpdate(
  payload: PersonPayload,
  field: MergeField
): string | null {
  switch (field) {
    case "first_name":
      return payload.first_name;
    case "last_name":
      return payload.last_name;
    case "middle_name":
      return payload.middle_name;
    case "birth_date":
      return payload.birth_date;
    case "death_date":
      return payload.death_date;
    case "birth_place_id":
      return payload.birth_place_id;
    case "gender":
      return payload.gender;
    case "notes":
      return payload.notes;
    default:
      return null;
  }
}

function parseMergeDecisions(raw: unknown): Map<string, Record<string, "existing" | "record">> {
  const out = new Map<string, Record<string, "existing" | "record">>();
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.existingPersonId === "string" ? rec.existingPersonId.trim() : "";
    if (!id) continue;
    const fc = rec.fieldChoices;
    const choices: Record<string, "existing" | "record"> = {};
    if (typeof fc === "object" && fc !== null && !Array.isArray(fc)) {
      for (const [k, v] of Object.entries(fc)) {
        if (v === "existing" || v === "record") choices[k] = v;
      }
    }
    out.set(id, choices);
  }
  return out;
}

function parsePendingPersons(raw: unknown): PendingPersonBody[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => typeof x === "object" && x !== null) as PendingPersonBody[];
}

function extractParentEventsFromAi(ai: unknown): Record<string, unknown>[] {
  if (typeof ai !== "object" || ai === null) return [];
  const pe = (ai as Record<string, unknown>).parent_events;
  if (!Array.isArray(pe)) return [];
  return pe.filter(
    (x): x is Record<string, unknown> =>
      typeof x === "object" && x !== null && !Array.isArray(x)
  );
}

export async function POST(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { error: "Supabase environment variables are not configured" },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const recordId = typeof b.recordId === "string" ? b.recordId.trim() : "";
  if (!recordId) {
    return NextResponse.json({ error: "recordId is required" }, { status: 400 });
  }

  const pendingPersons = parsePendingPersons(b.pendingPersons);
  const mergeByExistingId = parseMergeDecisions(b.mergeDecisions);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: recordRow, error: recordErr } = await supabase
    .from("records")
    .select("id, ai_response, tree_id")
    .eq("id", recordId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (recordErr || !recordRow) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const recordTreeIdRaw = (recordRow as { tree_id?: string | null }).tree_id;
  const recordTreeId =
    typeof recordTreeIdRaw === "string" && recordTreeIdRaw.trim() !== ""
      ? recordTreeIdRaw.trim()
      : null;

  const resolvedIds: string[] = [];

  for (const p of pendingPersons) {
    const existingId =
      typeof p.existingPersonId === "string" ? p.existingPersonId.trim() : "";

    const birthRes = await resolveBirthPlaceIdFromBody(supabase, p);
    if (birthRes.error) {
      return NextResponse.json({ error: birthRes.error }, { status: 500 });
    }
    const payload: PersonPayload = {
      ...toPersonPayload(p),
      birth_place_id: birthRes.id,
    };

    if (existingId) {
      const { data: row, error: fetchErr } = await supabase
        .from("persons")
        .select("id, birth_place_id")
        .eq("id", existingId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (fetchErr) {
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
      }
      if (!row) {
        return NextResponse.json(
          { error: `Person not found: ${existingId}` },
          { status: 400 }
        );
      }

      const fieldChoices = mergeByExistingId.get(existingId) ?? {};
      const updates: Partial<Record<MergeField, string | null>> = {};

      for (const [fieldKey, choice] of Object.entries(fieldChoices)) {
        if (choice !== "record" || !isMergeField(fieldKey)) continue;
        updates[fieldKey] = valueForMergeUpdate(payload, fieldKey);
      }

      const existingBirthPlaceId = (row as { birth_place_id?: string | null })
        .birth_place_id;
      if (
        isEmptyDbField(existingBirthPlaceId) &&
        !isEmptyDbField(payload.birth_place_id)
      ) {
        updates.birth_place_id = payload.birth_place_id;
      }

      if (Object.keys(updates).length > 0) {
        const { error: updErr } = await supabase
          .from("persons")
          .update(updates)
          .eq("id", existingId)
          .eq("user_id", user.id);

        if (updErr) {
          return NextResponse.json({ error: updErr.message }, { status: 500 });
        }
      }

      resolvedIds.push(existingId);
    } else {
      if (!payload.first_name && !payload.last_name) {
        return NextResponse.json(
          { error: "At least a first or last name is required for each new person." },
          { status: 400 }
        );
      }

      const newPersonRow: Record<string, unknown> = {
        user_id: user.id,
        first_name: payload.first_name,
        middle_name: payload.middle_name,
        last_name: payload.last_name,
        birth_date: payload.birth_date,
        death_date: payload.death_date,
        birth_place_id: payload.birth_place_id,
        marital_status: p.marital_status ?? null,
        cause_of_death: p.cause_of_death ?? null,
        surviving_spouse: p.surviving_spouse ?? null,
        gender: payload.gender,
        notes: payload.notes,
      };
      if (recordTreeId) {
        newPersonRow.tree_id = recordTreeId;
      }

      const { data: inserted, error: insErr } = await supabase
        .from("persons")
        .insert(newPersonRow)
        .select("id")
        .single();

      if (insErr || !inserted) {
        return NextResponse.json(
          { error: insErr?.message ?? "Failed to create person." },
          { status: 500 }
        );
      }

      resolvedIds.push(inserted.id as string);
    }
  }

  let nameListQuery = supabase
    .from("persons")
    .select("id, first_name, middle_name, last_name")
    .eq("user_id", user.id);
  if (recordTreeId) {
    nameListQuery = nameListQuery.eq("tree_id", recordTreeId);
  }
  const { data: allPersons, error: listErr } = await nameListQuery;

  if (listErr) {
    return NextResponse.json({ error: listErr.message }, { status: 500 });
  }

  const nameToId = new Map<string, string>();
  for (const row of (allPersons ?? []) as PersonNameRow[]) {
    const key = normalizeFullName(buildFullName(row));
    if (key) nameToId.set(key, row.id);
  }

  for (let i = 0; i < pendingPersons.length; i++) {
    const p = pendingPersons[i];
    const payload = toPersonPayload(p);
    const key = normalizeFullName(
      buildFullName({
        first_name: payload.first_name,
        middle_name: payload.middle_name,
        last_name: payload.last_name,
      })
    );
    if (key) nameToId.set(key, resolvedIds[i]!);
  }

  for (let i = 0; i < pendingPersons.length; i++) {
    const p = pendingPersons[i];
    const personId = resolvedIds[i]!;
    const rels = Array.isArray(p.relationships) ? p.relationships : [];

    for (const rel of rels) {
      if (typeof rel !== "object" || rel === null) continue;
      const r = rel as Record<string, unknown>;
      const relatedName = String(r.related_name ?? "").trim();
      if (!relatedName) continue;

      const relatedKey = normalizeFullName(relatedName);
      const relatedId = nameToId.get(relatedKey);
      if (!relatedId) {
        return NextResponse.json(
          {
            error: `No person found matching "${relatedName}". Save related people first or fix the name.`,
          },
          { status: 400 }
        );
      }
      if (relatedId === personId) {
        return NextResponse.json(
          { error: "A relationship cannot connect a person to themselves." },
          { status: 400 }
        );
      }

      const relType = String(r.relationship_type ?? "").trim() || "other";

      const relRow1: Record<string, unknown> = {
        user_id: user.id,
        person_a_id: personId,
        person_b_id: relatedId,
        relationship_type: relType,
      };
      const relRow2: Record<string, unknown> = {
        user_id: user.id,
        person_a_id: relatedId,
        person_b_id: personId,
        relationship_type: inverseRelationshipType(relType),
      };
      if (recordTreeId) {
        relRow1.tree_id = recordTreeId;
        relRow2.tree_id = recordTreeId;
      }

      const { error: r1 } = await supabase.from("relationships").insert(relRow1);

      if (r1) {
        return NextResponse.json({ error: r1.message }, { status: 500 });
      }

      const { error: r2 } = await supabase.from("relationships").insert(relRow2);

      if (r2) {
        let del = supabase
          .from("relationships")
          .delete()
          .eq("user_id", user.id)
          .eq("person_a_id", personId)
          .eq("person_b_id", relatedId);
        if (recordTreeId) {
          del = del.eq("tree_id", recordTreeId);
        }
        await del;
        return NextResponse.json({ error: r2.message }, { status: 500 });
      }
    }
  }

  for (let i = 0; i < pendingPersons.length; i++) {
    const p = pendingPersons[i];
    const personId = resolvedIds[i]!;
    const evs = Array.isArray(p.events) ? p.events : [];

    for (const ev of evs) {
      if (typeof ev !== "object" || ev === null) continue;
      const e = ev as Record<string, unknown>;
      const noteText =
        String(e.notes ?? e.description ?? "").trim() || null;
      const storyFull = String(e.story_full ?? "").trim() || null;
      const evPlaceRes = await resolveEventPlaceIdFromEvent(supabase, e);
      if (evPlaceRes.error) {
        return NextResponse.json({ error: evPlaceRes.error }, { status: 500 });
      }
      const { error: evSaveErr } = await savePersonEventWithDedupe(
        supabase,
        user.id,
        personId,
        recordId,
        {
          event_type: String(e.event_type ?? "").trim() || "other",
          event_date: String(e.event_date ?? "").trim() || null,
          event_place_id: evPlaceRes.id,
          notes: noteText,
          story_full: storyFull,
        }
      );

      if (evSaveErr) {
        return NextResponse.json({ error: evSaveErr }, { status: 500 });
      }
    }
  }

  // Half-siblings / full siblings: for each person saved in this batch who has a
  // parent edge (person_a = parent, person_b = child, type parent), link them as
  // siblings to every other child of the same parent if not already linked.
  for (const personId of resolvedIds) {
    let asChildQ = supabase
      .from("relationships")
      .select("person_a_id")
      .eq("user_id", user.id)
      .eq("person_b_id", personId)
      .eq("relationship_type", "parent");
    if (recordTreeId) {
      asChildQ = asChildQ.eq("tree_id", recordTreeId);
    }
    const { data: asChildRows, error: asChildErr } = await asChildQ;

    if (asChildErr) {
      return NextResponse.json({ error: asChildErr.message }, { status: 500 });
    }

    const parentIds = [
      ...new Set(
        (asChildRows ?? []).map(
          (row: { person_a_id: string }) => row.person_a_id
        )
      ),
    ];

    for (const parentId of parentIds) {
      let coChildQ = supabase
        .from("relationships")
        .select("person_b_id")
        .eq("user_id", user.id)
        .eq("person_a_id", parentId)
        .eq("relationship_type", "parent");
      if (recordTreeId) {
        coChildQ = coChildQ.eq("tree_id", recordTreeId);
      }
      const { data: coChildRows, error: coErr } = await coChildQ;

      if (coErr) {
        return NextResponse.json({ error: coErr.message }, { status: 500 });
      }

      const otherChildren = [
        ...new Set(
          (coChildRows ?? [])
            .map((row: { person_b_id: string }) => row.person_b_id)
            .filter((id: string) => id !== personId)
        ),
      ];

      for (const otherId of otherChildren) {
        let sib1Q = supabase
          .from("relationships")
          .select("id")
          .eq("user_id", user.id)
          .eq("relationship_type", "sibling")
          .eq("person_a_id", personId)
          .eq("person_b_id", otherId);
        if (recordTreeId) {
          sib1Q = sib1Q.eq("tree_id", recordTreeId);
        }
        const { data: sib1, error: s1Err } = await sib1Q.maybeSingle();

        if (s1Err) {
          return NextResponse.json({ error: s1Err.message }, { status: 500 });
        }

        let sib2Q = supabase
          .from("relationships")
          .select("id")
          .eq("user_id", user.id)
          .eq("relationship_type", "sibling")
          .eq("person_a_id", otherId)
          .eq("person_b_id", personId);
        if (recordTreeId) {
          sib2Q = sib2Q.eq("tree_id", recordTreeId);
        }
        const { data: sib2, error: s2Err } = await sib2Q.maybeSingle();

        if (s2Err) {
          return NextResponse.json({ error: s2Err.message }, { status: 500 });
        }

        if (sib1 || sib2) continue;

        const sibIns1: Record<string, unknown> = {
          user_id: user.id,
          person_a_id: personId,
          person_b_id: otherId,
          relationship_type: "sibling",
        };
        const sibIns2: Record<string, unknown> = {
          user_id: user.id,
          person_a_id: otherId,
          person_b_id: personId,
          relationship_type: "sibling",
        };
        if (recordTreeId) {
          sibIns1.tree_id = recordTreeId;
          sibIns2.tree_id = recordTreeId;
        }

        const { error: insSib1 } = await supabase
          .from("relationships")
          .insert(sibIns1);

        if (insSib1) {
          return NextResponse.json({ error: insSib1.message }, { status: 500 });
        }

        const { error: insSib2 } = await supabase
          .from("relationships")
          .insert(sibIns2);

        if (insSib2) {
          let delS = supabase
            .from("relationships")
            .delete()
            .eq("user_id", user.id)
            .eq("person_a_id", personId)
            .eq("person_b_id", otherId)
            .eq("relationship_type", "sibling");
          if (recordTreeId) {
            delS = delS.eq("tree_id", recordTreeId);
          }
          await delS;
          return NextResponse.json({ error: insSib2.message }, { status: 500 });
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}
