import { savePersonEventWithDedupe } from "@/lib/events/dedupe";
import { createClient } from "@/lib/supabase/server";
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

function valueForMergeUpdate(
  payload: ReturnType<typeof toPersonPayload>,
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
    .select("id, ai_response")
    .eq("id", recordId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (recordErr || !recordRow) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const resolvedIds: string[] = [];

  for (const p of pendingPersons) {
    const existingId =
      typeof p.existingPersonId === "string" ? p.existingPersonId.trim() : "";

    if (existingId) {
      const { data: row, error: fetchErr } = await supabase
        .from("persons")
        .select("id")
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
      const payload = toPersonPayload(p);
      const updates: Partial<Record<MergeField, string | null>> = {};

      for (const [fieldKey, choice] of Object.entries(fieldChoices)) {
        if (choice !== "record" || !isMergeField(fieldKey)) continue;
        updates[fieldKey] = valueForMergeUpdate(payload, fieldKey);
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
      const payload = toPersonPayload(p);
      if (!payload.first_name || !payload.last_name) {
        return NextResponse.json(
          { error: "First and last name are required for each new person." },
          { status: 400 }
        );
      }

      const { data: inserted, error: insErr } = await supabase
        .from("persons")
        .insert({
          user_id: user.id,
          first_name: payload.first_name,
          middle_name: payload.middle_name,
          last_name: payload.last_name,
          birth_date: payload.birth_date,
          death_date: payload.death_date,
          gender: payload.gender,
          notes: payload.notes,
        })
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

  const { data: allPersons, error: listErr } = await supabase
    .from("persons")
    .select("id, first_name, middle_name, last_name")
    .eq("user_id", user.id);

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

      const { error: r1 } = await supabase.from("relationships").insert({
        user_id: user.id,
        person_a_id: personId,
        person_b_id: relatedId,
        relationship_type: relType,
      });

      if (r1) {
        return NextResponse.json({ error: r1.message }, { status: 500 });
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
      const storyShort =
        String(e.story_short ?? "").trim() || null;
      const storyFull = String(e.story_full ?? "").trim() || null;
      const { error: evSaveErr } = await savePersonEventWithDedupe(
        supabase,
        user.id,
        personId,
        recordId,
        {
          event_type: String(e.event_type ?? "").trim() || "other",
          event_date: String(e.event_date ?? "").trim() || null,
          event_place: String(e.event_place ?? "").trim() || null,
          notes: noteText,
          story_short: storyShort,
          story_full: storyFull,
        }
      );

      if (evSaveErr) {
        return NextResponse.json({ error: evSaveErr }, { status: 500 });
      }
    }
  }

  for (const pe of extractParentEventsFromAi(recordRow.ai_response)) {
    const parentName = String(pe.person_name ?? "").trim();
    if (!parentName) continue;

    const parentId = nameToId.get(normalizeFullName(parentName));
    if (!parentId) continue;

    const descText = String(pe.description ?? "").trim() || null;
    const pStoryShort = String(pe.story_short ?? "").trim() || null;
    const pStoryFull = String(pe.story_full ?? "").trim() || null;

    const { error: peSaveErr } = await savePersonEventWithDedupe(
      supabase,
      user.id,
      parentId,
      recordId,
      {
        event_type: String(pe.event_type ?? "").trim() || "child born",
        event_date: String(pe.event_date ?? "").trim() || null,
        event_place: String(pe.event_place ?? "").trim() || null,
        notes: descText,
        story_short: pStoryShort,
        story_full: pStoryFull,
      }
    );

    if (peSaveErr) {
      return NextResponse.json({ error: peSaveErr }, { status: 500 });
    }
  }

  // Half-siblings / full siblings: for each person saved in this batch who has a
  // parent edge (person_a = parent, person_b = child, type parent), link them as
  // siblings to every other child of the same parent if not already linked.
  for (const personId of resolvedIds) {
    const { data: asChildRows, error: asChildErr } = await supabase
      .from("relationships")
      .select("person_a_id")
      .eq("user_id", user.id)
      .eq("person_b_id", personId)
      .eq("relationship_type", "parent");

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
      const { data: coChildRows, error: coErr } = await supabase
        .from("relationships")
        .select("person_b_id")
        .eq("user_id", user.id)
        .eq("person_a_id", parentId)
        .eq("relationship_type", "parent");

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
        const { data: sib1, error: s1Err } = await supabase
          .from("relationships")
          .select("id")
          .eq("user_id", user.id)
          .eq("relationship_type", "sibling")
          .eq("person_a_id", personId)
          .eq("person_b_id", otherId)
          .maybeSingle();

        if (s1Err) {
          return NextResponse.json({ error: s1Err.message }, { status: 500 });
        }

        const { data: sib2, error: s2Err } = await supabase
          .from("relationships")
          .select("id")
          .eq("user_id", user.id)
          .eq("relationship_type", "sibling")
          .eq("person_a_id", otherId)
          .eq("person_b_id", personId)
          .maybeSingle();

        if (s2Err) {
          return NextResponse.json({ error: s2Err.message }, { status: 500 });
        }

        if (sib1 || sib2) continue;

        const { error: insSib1 } = await supabase.from("relationships").insert({
          user_id: user.id,
          person_a_id: personId,
          person_b_id: otherId,
          relationship_type: "sibling",
        });

        if (insSib1) {
          return NextResponse.json({ error: insSib1.message }, { status: 500 });
        }

        const { error: insSib2 } = await supabase.from("relationships").insert({
          user_id: user.id,
          person_a_id: otherId,
          person_b_id: personId,
          relationship_type: "sibling",
        });

        if (insSib2) {
          await supabase
            .from("relationships")
            .delete()
            .eq("user_id", user.id)
            .eq("person_a_id", personId)
            .eq("person_b_id", otherId)
            .eq("relationship_type", "sibling");
          return NextResponse.json({ error: insSib2.message }, { status: 500 });
        }
      }
    }
  }

  return NextResponse.json({ success: true });
}
