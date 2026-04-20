import { savePersonEventWithDedupe } from "@/lib/events/dedupe";
import { createClient } from "@/lib/supabase/server";
import { MERGE_FIELDS, type MergeField } from "@/lib/person-merge/merge-fields";
import { findOrCreatePlace, type PlaceFields } from "@/lib/utils/places";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Event dedupe writes `event_sources` via `@/lib/events/dedupe` with `user_id` set
 * to the authenticated user on every insert.
 * Migrations: `20260329120000_event_sources.sql`, `20260330120000_event_sources_user_id.sql`.
 */

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
  military_branch?: string | null;
  service_number?: string | null;
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

function parsePlaceDisplayToFields(display: string): PlaceFields | null {
  const parts = display
    .trim()
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  if (parts.length === 1) {
    return { township: null, county: null, state: null, country: parts[0]! };
  }
  if (parts.length === 2) {
    return { township: null, county: null, state: parts[0]!, country: parts[1]! };
  }
  if (parts.length === 3) {
    return {
      township: null,
      county: parts[0]!,
      state: parts[1]!,
      country: parts[2]!,
    };
  }
  const country = parts[parts.length - 1]!;
  const state = parts[parts.length - 2]!;
  const county = parts[parts.length - 3]!;
  const township = parts.slice(0, -3).join(", ");
  return { township, county, state, country };
}

async function resolveBirthPlaceIdFromBody(
  supabase: SupabaseClient,
  p: PendingPersonBody
): Promise<{ id: string | null; error: string | null }> {
  const rawId = p.birth_place_id;
  if (typeof rawId === "string" && rawId.trim() !== "") {
    return { id: rawId.trim(), error: null };
  }
  let fields = parsePlaceFields(p.birth_place_fields);
  if (fields === null && typeof p.birth_place_fields === "string") {
    const display = p.birth_place_fields.trim();
    if (display !== "") {
      fields = parsePlaceDisplayToFields(display);
    }
  }
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

export async function POST(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error(
      "[save-review]",
      "supabase-env-missing",
      "Supabase environment variables are not configured"
    );
    return NextResponse.json(
      { error: "Supabase environment variables are not configured" },
      { status: 500 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.error("[save-review]", "json-parse", "Invalid JSON body");
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    console.error("[save-review]", "body-not-object", "Expected JSON object");
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const recordId = typeof b.recordId === "string" ? b.recordId.trim() : "";
  if (!recordId) {
    console.error("[save-review]", "record-id-missing", "recordId is required");
    return NextResponse.json({ error: "recordId is required" }, { status: 400 });
  }

  const pendingPersons = parsePendingPersons(b.pendingPersons);
  const mergeByExistingId = parseMergeDecisions(b.mergeDecisions);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    console.error("[save-review]", "auth-unauthorized", "Unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: recordRow, error: recordErr } = await supabase
    .from("records")
    .select("id, ai_response, tree_id")
    .eq("id", recordId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (recordErr || !recordRow) {
    console.error("[save-review]", "record-fetch", "Record not found.");
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
      console.error("[save-review]", "birth-place-resolve", birthRes.error);
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
        console.error("[save-review]", "existing-person-fetch", fetchErr.message);
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
      }
      if (!row) {
        console.error(
          "[save-review]",
          "existing-person-missing",
          `Person not found: ${existingId}`
        );
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
          console.error("[save-review]", "person-update", updErr.message);
          return NextResponse.json({ error: updErr.message }, { status: 500 });
        }
      }

      const militaryUpdates: Record<string, string | null> = {};
      if (typeof p.military_branch === "string" && p.military_branch.trim() !== "") {
        militaryUpdates.military_branch = p.military_branch.trim();
      }
      if (typeof p.service_number === "string" && p.service_number.trim() !== "") {
        militaryUpdates.service_number = p.service_number.trim();
      }
      if (Object.keys(militaryUpdates).length > 0) {
        const { error: milUpdErr } = await supabase
          .from("persons")
          .update(militaryUpdates)
          .eq("id", existingId)
          .eq("user_id", user.id);
        if (milUpdErr) {
          console.error("[save-review]", "military-fields-update", milUpdErr.message);
          return NextResponse.json({ error: milUpdErr.message }, { status: 500 });
        }
      }

      resolvedIds.push(existingId);
    } else {
      if (!payload.first_name && !payload.last_name) {
        console.error(
          "[save-review]",
          "new-person-name-required",
          "At least a first or last name is required for each new person."
        );
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
        military_branch:
          typeof p.military_branch === "string"
            ? p.military_branch.trim() || null
            : null,
        service_number:
          typeof p.service_number === "string"
            ? p.service_number.trim() || null
            : null,
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
        .maybeSingle();

      if (insErr || !inserted) {
        console.error(
          "[save-review]",
          "person-insert",
          insErr?.message ?? "Failed to create person."
        );
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
    console.error("[save-review]", "person-name-list", listErr.message);
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
        console.error(
          "[save-review]",
          "relationship-related-name-not-found",
          `No person found matching "${relatedName}". Save related people first or fix the name.`
        );
        return NextResponse.json(
          {
            error: `No person found matching "${relatedName}". Save related people first or fix the name.`,
          },
          { status: 400 }
        );
      }
      if (relatedId === personId) {
        console.error(
          "[save-review]",
          "relationship-self",
          "A relationship cannot connect a person to themselves."
        );
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
        console.error("[save-review]", "relationship-insert-forward", r1.message);
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
        console.error("[save-review]", "relationship-insert-inverse", r2.message);
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
        console.error("[save-review]", "event-place-resolve", evPlaceRes.error);
        return NextResponse.json({ error: evPlaceRes.error }, { status: 500 });
      }
      let landData: {
        acres: number | null;
        transaction_type: string | null;
      } | null = null;
      const rawLand = e.land_data;
      if (rawLand != null && typeof rawLand === "object" && !Array.isArray(rawLand)) {
        const ld = rawLand as Record<string, unknown>;
        let acres: number | null = null;
        const rawAcres = ld.acres;
        if (typeof rawAcres === "number" && Number.isFinite(rawAcres)) {
          acres = rawAcres;
        } else if (typeof rawAcres === "string") {
          const n = Number(rawAcres.trim());
          acres = Number.isFinite(n) ? n : null;
        }
        const rawTt = ld.transaction_type;
        const transaction_type =
          typeof rawTt === "string" ? rawTt.trim() || null : null;
        landData = { acres, transaction_type };
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
          land_data: landData,
        }
      );

      if (evSaveErr) {
        console.error("[save-review]", "event-save-dedupe", evSaveErr);
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
      console.error("[save-review]", "sibling-parent-query", asChildErr.message);
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
        console.error("[save-review]", "sibling-cochild-query", coErr.message);
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
        const { data: sib1Rows, error: s1Err } = await sib1Q.limit(1);
        const sib1 = sib1Rows?.[0] ?? null;

        if (s1Err) {
          console.error("[save-review]", "sibling-exists-query-a", s1Err.message);
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
        const { data: sib2Rows, error: s2Err } = await sib2Q.limit(1);
        const sib2 = sib2Rows?.[0] ?? null;

        if (s2Err) {
          console.error("[save-review]", "sibling-exists-query-b", s2Err.message);
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
          console.error("[save-review]", "sibling-insert-forward", insSib1.message);
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
          console.error("[save-review]", "sibling-insert-inverse", insSib2.message);
          return NextResponse.json({ error: insSib2.message }, { status: 500 });
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}
