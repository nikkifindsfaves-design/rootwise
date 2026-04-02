import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
import {
  matchesPersonNameQuery,
  parseNameSearchQuery,
} from "@/lib/person-merge/fuzzy-name";
import { NextResponse, type NextRequest } from "next/server";

const PERSON_SELECT =
  "id, first_name, middle_name, last_name, birth_date, death_date, birth_place_id, photo_url, gender, notes";

const MERGE_FIELD_KEYS = [
  "first_name",
  "middle_name",
  "last_name",
  "birth_date",
  "death_date",
  "birth_place_id",
  "gender",
  "notes",
] as const;

type MergeFieldKey = (typeof MERGE_FIELD_KEYS)[number];

function strVal(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

function isEmpty(v: string | null | undefined): boolean {
  return v == null || String(v).trim() === "";
}

type PersonRow = Record<string, unknown> & { id: string };

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const excludeId = (searchParams.get("exclude") ?? "").trim();

  if (q.length < 2) {
    return NextResponse.json({ matches: [] });
  }

  const { first: qFirst, last: qLast } = parseNameSearchQuery(q);

  const { data, error } = await supabase
    .from("persons")
    .select(PERSON_SELECT)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as PersonRow[];
  const matches: PersonRow[] = [];

  for (const row of rows) {
    if (row.id === excludeId) continue;
    const fn = strVal(row.first_name);
    const ln = strVal(row.last_name);
    if (matchesPersonNameQuery(fn, ln, qFirst, qLast, 2)) {
      matches.push(row);
    }
  }

  matches.sort((a, b) => {
    const la = `${strVal(a.last_name)}, ${strVal(a.first_name)}`;
    const lb = `${strVal(b.last_name)}, ${strVal(b.first_name)}`;
    return la.localeCompare(lb);
  });

  return NextResponse.json({ matches: matches.slice(0, 50) });
}

type PostBody = {
  primaryId?: unknown;
  duplicateId?: unknown;
  fieldChoices?: unknown;
};

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostBody;
  try {
    body = (await req.json()) as PostBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const primaryId = typeof body.primaryId === "string" ? body.primaryId.trim() : "";
  const duplicateId =
    typeof body.duplicateId === "string" ? body.duplicateId.trim() : "";

  if (!primaryId || !duplicateId || primaryId === duplicateId) {
    return NextResponse.json(
      { error: "primaryId and duplicateId are required and must differ." },
      { status: 400 }
    );
  }

  const rawChoices =
    body.fieldChoices && typeof body.fieldChoices === "object" && body.fieldChoices !== null
      ? (body.fieldChoices as Record<string, unknown>)
      : {};

  const { data: primaryRow, error: pErr } = await supabase
    .from("persons")
    .select(PERSON_SELECT)
    .eq("id", primaryId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (pErr || !primaryRow) {
    return NextResponse.json(
      { error: pErr?.message ?? "Primary person not found." },
      { status: 404 }
    );
  }

  const { data: dupRow, error: dErr } = await supabase
    .from("persons")
    .select(PERSON_SELECT)
    .eq("id", duplicateId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (dErr || !dupRow) {
    return NextResponse.json(
      { error: dErr?.message ?? "Duplicate person not found." },
      { status: 404 }
    );
  }

  const primary = primaryRow as PersonRow;
  const dup = dupRow as PersonRow;

  function resolveField(key: MergeFieldKey): string | null {
    const pv = strVal(primary[key]);
    const dv = strVal(dup[key]);
    if (isEmpty(pv) && isEmpty(dv)) return null;
    if (isEmpty(pv)) return dv || null;
    if (isEmpty(dv)) return pv || null;
    if (pv === dv) return pv;
    const choice = rawChoices[key];
    if (choice === "duplicate") return dv;
    return pv;
  }

  const updatePayload: Record<string, string | null> = {};
  for (const key of MERGE_FIELD_KEYS) {
    const v = resolveField(key);
    updatePayload[key] = v === "" ? null : v;
  }

  // --- person_notes: merge or repoint before deleting duplicate ---
  const { data: notePrimary } = await supabase
    .from("person_notes")
    .select("id, content")
    .eq("user_id", user.id)
    .eq("person_id", primaryId)
    .maybeSingle();

  const { data: noteDup } = await supabase
    .from("person_notes")
    .select("id, content")
    .eq("user_id", user.id)
    .eq("person_id", duplicateId)
    .maybeSingle();

  if (noteDup?.id) {
    const dupContent = strVal(noteDup.content);
    if (notePrimary?.id) {
      const merged =
        [strVal(notePrimary.content), dupContent].filter(Boolean).join("\n\n") ||
        "";
      const { error: nuErr } = await supabase
        .from("person_notes")
        .update({ content: merged, updated_at: new Date().toISOString() })
        .eq("id", notePrimary.id)
        .eq("user_id", user.id);
      if (nuErr) {
        return NextResponse.json({ error: nuErr.message }, { status: 500 });
      }
      await supabase
        .from("person_notes")
        .delete()
        .eq("id", noteDup.id)
        .eq("user_id", user.id);
    } else {
      const { error: mvErr } = await supabase
        .from("person_notes")
        .update({ person_id: primaryId, updated_at: new Date().toISOString() })
        .eq("id", noteDup.id)
        .eq("user_id", user.id);
      if (mvErr) {
        return NextResponse.json({ error: mvErr.message }, { status: 500 });
      }
    }
  }

  const { error: evErr } = await supabase
    .from("events")
    .update({ person_id: primaryId })
    .eq("person_id", duplicateId)
    .eq("user_id", user.id);

  if (evErr) {
    return NextResponse.json({ error: evErr.message }, { status: 500 });
  }

  const { error: phErr } = await supabase
    .from("photo_tags")
    .update({ person_id: primaryId })
    .eq("person_id", duplicateId);

  if (phErr) {
    // Table may be missing in some environments; ignore relation errors.
    if (!/relation|does not exist/i.test(phErr.message)) {
      return NextResponse.json({ error: phErr.message }, { status: 500 });
    }
  }

  const { error: raErr } = await supabase
    .from("relationships")
    .update({ person_a_id: primaryId })
    .eq("user_id", user.id)
    .eq("person_a_id", duplicateId);

  if (raErr) {
    return NextResponse.json({ error: raErr.message }, { status: 500 });
  }

  const { error: rbErr } = await supabase
    .from("relationships")
    .update({ person_b_id: primaryId })
    .eq("user_id", user.id)
    .eq("person_b_id", duplicateId);

  if (rbErr) {
    return NextResponse.json({ error: rbErr.message }, { status: 500 });
  }

  const { data: allRels, error: relListErr } = await supabase
    .from("relationships")
    .select("id, person_a_id, person_b_id, relationship_type")
    .eq("user_id", user.id);

  if (relListErr) {
    return NextResponse.json({ error: relListErr.message }, { status: 500 });
  }

  type Rel = {
    id: string;
    person_a_id: string;
    person_b_id: string;
    relationship_type: string;
  };

  const relRows = (allRels ?? []) as Rel[];

  for (const r of relRows) {
    if (r.person_a_id === r.person_b_id) {
      const { error: delErr } = await supabase
        .from("relationships")
        .delete()
        .eq("id", r.id)
        .eq("user_id", user.id);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }
    }
  }

  const { data: relsAfterSelf } = await supabase
    .from("relationships")
    .select("id, person_a_id, person_b_id, relationship_type")
    .eq("user_id", user.id);

  const afterRows = (relsAfterSelf ?? []) as Rel[];
  const directed = new Map<string, string[]>();

  for (const r of afterRows) {
    const k = `${r.person_a_id}|${r.person_b_id}|${r.relationship_type}`;
    if (!directed.has(k)) directed.set(k, []);
    directed.get(k)!.push(r.id);
  }

  for (const ids of directed.values()) {
    if (ids.length <= 1) continue;
    ids.sort();
    const toRemove = ids.slice(1);
    for (const id of toRemove) {
      const { error: delErr } = await supabase
        .from("relationships")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 });
      }
    }
  }

  const { error: updErr } = await supabase
    .from("persons")
    .update(updatePayload)
    .eq("id", primaryId)
    .eq("user_id", user.id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const { error: delPersonErr } = await supabase
    .from("persons")
    .delete()
    .eq("id", duplicateId)
    .eq("user_id", user.id);

  if (delPersonErr) {
    return NextResponse.json({ error: delPersonErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
