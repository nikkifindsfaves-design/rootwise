import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveEventDatePlaceNotes,
  type SharedEventDetailsState,
} from "@/lib/review/shared-event-merge";

/** One row of chronological context for story generation (tree or review cards). */
export type LifeSpineEntry = {
  subject_name: string;
  relationship_to_anchor:
    | "self"
    | "child"
    | "spouse"
    | "parent"
    | "sibling"
    | "grandparent"
    | "grandchild"
    | "aunt/uncle"
    | "niece/nephew"
    | "other";
  event_type: string;
  event_date: string | null;
  place: string | null;
  notes: string | null;
};

type RelRow = {
  person_a_id: string;
  person_b_id: string;
  relationship_type: string;
};

/** Same semantics as `classifyRelationship` on the person profile page. */
function classifyRelationship(
  personId: string,
  rel: RelRow
): {
  otherId: string;
  category: LifeSpineEntry["relationship_to_anchor"];
} | null {
  const t = rel.relationship_type.trim().toLowerCase();
  if (rel.person_a_id === personId) {
    const other = rel.person_b_id;
    if (t === "parent") return { otherId: other, category: "child" };
    if (t === "child") return { otherId: other, category: "parent" };
    if (t === "spouse") return { otherId: other, category: "spouse" };
    if (t === "sibling") return { otherId: other, category: "sibling" };
    if (t === "grandparent") return { otherId: other, category: "grandchild" };
    if (t === "grandchild") return { otherId: other, category: "grandparent" };
    if (t === "aunt/uncle") return { otherId: other, category: "niece/nephew" };
    if (t === "niece/nephew") return { otherId: other, category: "aunt/uncle" };
    return null;
  }
  if (rel.person_b_id === personId) {
    const other = rel.person_a_id;
    if (t === "parent") return { otherId: other, category: "parent" };
    if (t === "child") return { otherId: other, category: "child" };
    if (t === "spouse") return { otherId: other, category: "spouse" };
    if (t === "sibling") return { otherId: other, category: "sibling" };
    if (t === "grandparent") return { otherId: other, category: "grandparent" };
    if (t === "grandchild") return { otherId: other, category: "grandchild" };
    if (t === "aunt/uncle") return { otherId: other, category: "aunt/uncle" };
    if (t === "niece/nephew") return { otherId: other, category: "niece/nephew" };
    return null;
  }
  return null;
}

function parseEventDateMs(s: string | null | undefined): number | null {
  if (s == null) return null;
  const t = Date.parse(s.trim());
  return Number.isNaN(t) ? null : t;
}

function sortSpineEntries(entries: LifeSpineEntry[]): LifeSpineEntry[] {
  return [...entries].sort((a, b) => {
    const da = (a.event_date ?? "").trim();
    const db = (b.event_date ?? "").trim();
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    const ma = parseEventDateMs(da);
    const mb = parseEventDateMs(db);
    if (ma != null && mb != null) return ma - mb;
    return da.localeCompare(db, undefined, { numeric: true });
  });
}

export function isCensusLikeEventType(eventType: string): boolean {
  return eventType.trim().toLowerCase().includes("census");
}

function trimNotes(s: string | null, max = 220): string | null {
  if (s == null) return null;
  const t = s.trim();
  if (!t) return null;
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function placeLabelFromJoinedRow(
  ep:
    | {
        township: string | null;
        county: string | null;
        state: string | null;
        country: string;
      }
    | null
    | undefined
): string | null {
  if (ep == null) return null;
  const parts = [ep.township, ep.county, ep.state, ep.country]
    .map((p) => (p != null ? String(p).trim() : ""))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function fullNameFromParts(
  first: string,
  middle: string | null | undefined,
  last: string
): string {
  return [first, middle, last]
    .map((p) => (p != null ? String(p).trim() : ""))
    .filter(Boolean)
    .join(" ");
}

const SPINE_MAX_ROWS = 100;

const REL_TYPES_INCLUDE_PEER: Set<LifeSpineEntry["relationship_to_anchor"]> =
  new Set([
    "parent",
    "child",
    "spouse",
    "sibling",
    "grandparent",
    "grandchild",
    "aunt/uncle",
    "niece/nephew",
  ]);

type ReviewCardForSpine = {
  key: string;
  form: {
    first_name: string;
    middle_name: string;
    last_name: string;
  };
  relationships: Array<{
    relatedPeerIndex: number | null;
    relationshipType: string;
  }>;
  events: Array<{
    key: string;
    eventType: string;
    eventDate: string;
    event_place_display: string;
    event_place_id: string | null;
    event_place_fields: SharedEventDetailsState["event_place_fields"];
    eventNotes: string;
    useSharedDetails?: boolean;
  }>;
};

/**
 * Build spine rows from the current review cards (same document), so stories can
 * reference siblings/parents/spouses before anything is saved to the tree.
 */
export function buildReviewLifeSpineForCard(params: {
  anchorCardKey: string;
  cards: ReviewCardForSpine[];
  shared: SharedEventDetailsState;
  useSharedNotesLayer: boolean;
  /** Omit the row being regenerated so the model is not duplicating it. */
  excludeEventKeys?: ReadonlySet<string>;
}): LifeSpineEntry[] {
  const {
    anchorCardKey,
    cards,
    shared,
    useSharedNotesLayer,
    excludeEventKeys,
  } = params;
  const anchor = cards.find((c) => c.key === anchorCardKey);
  if (!anchor) return [];

  const anchorName = fullNameFromParts(
    anchor.form.first_name,
    anchor.form.middle_name,
    anchor.form.last_name
  ).trim();
  if (!anchorName) return [];

  const out: LifeSpineEntry[] = [];
  const peerKeyToRel = new Map<string, LifeSpineEntry["relationship_to_anchor"]>();

  for (const rel of anchor.relationships) {
    if (rel.relatedPeerIndex == null) continue;
    const peer = cards[rel.relatedPeerIndex];
    if (!peer || peer.key === anchor.key) continue;
    const rt = rel.relationshipType.trim().toLowerCase() as LifeSpineEntry["relationship_to_anchor"];
    if (!REL_TYPES_INCLUDE_PEER.has(rt)) continue;
    peerKeyToRel.set(peer.key, rt);
  }

  const appendCardEvents = (
    card: ReviewCardForSpine,
    relationship: LifeSpineEntry["relationship_to_anchor"]
  ) => {
    const subjectName = fullNameFromParts(
      card.form.first_name,
      card.form.middle_name,
      card.form.last_name
    ).trim();
    if (!subjectName) return;
    for (const ev of card.events) {
      if (excludeEventKeys?.has(ev.key)) continue;
      const resolved = resolveEventDatePlaceNotes(
        ev,
        shared,
        useSharedNotesLayer
      );
      const date = resolved.eventDate.trim() || null;
      const place =
        resolved.event_place_display.trim() ||
        placeLabelFromJoinedRow(resolved.event_place_fields);
      const notes = trimNotes(resolved.eventNotes);
      out.push({
        subject_name: subjectName,
        relationship_to_anchor: relationship,
        event_type: ev.eventType,
        event_date: date,
        place: place?.trim() || null,
        notes,
      });
    }
  };

  appendCardEvents(anchor, "self");
  for (const [peerKey, relOut] of peerKeyToRel) {
    const peer = cards.find((c) => c.key === peerKey);
    if (!peer) continue;
    appendCardEvents(peer, relOut);
  }

  const sorted = sortSpineEntries(out);
  return sorted.length > SPINE_MAX_ROWS
    ? sorted.slice(sorted.length - SPINE_MAX_ROWS)
    : sorted;
}

function normalizeJoinedPlace(
  ep:
    | {
        township: string | null;
        county: string | null;
        state: string | null;
        country: string;
      }
    | {
        township: string | null;
        county: string | null;
        state: string | null;
        country: string;
      }[]
    | null
    | undefined
): { township: string | null; county: string | null; state: string | null; country: string } | null {
  if (ep == null) return null;
  const row = Array.isArray(ep) ? ep[0] ?? null : ep;
  return row ?? null;
}

/**
 * Load chronological context from the saved tree for `anchorPersonId`.
 * Caps row count for token limits.
 */
export async function fetchLifeSpineFromDatabase(params: {
  supabase: SupabaseClient;
  userId: string;
  treeId: string;
  anchorPersonId: string;
}): Promise<LifeSpineEntry[]> {
  const { supabase, userId, treeId, anchorPersonId } = params;

  const { data: personRow, error: personErr } = await supabase
    .from("persons")
    .select("id, tree_id, first_name, middle_name, last_name")
    .eq("id", anchorPersonId)
    .eq("user_id", userId)
    .maybeSingle();

  if (personErr || !personRow) return [];

  const rowTree = (personRow as { tree_id?: string | null }).tree_id;
  if (rowTree == null || rowTree !== treeId) return [];

  const anchorName = fullNameFromParts(
    String((personRow as { first_name?: string }).first_name ?? ""),
    (personRow as { middle_name?: string | null }).middle_name ?? null,
    String((personRow as { last_name?: string }).last_name ?? "")
  ).trim();
  if (!anchorName) return [];

  const { data: relData, error: relErr } = await supabase
    .from("relationships")
    .select("person_a_id, person_b_id, relationship_type, tree_id")
    .eq("user_id", userId)
    .or(`person_a_id.eq.${anchorPersonId},person_b_id.eq.${anchorPersonId}`);

  if (relErr) return [];

  const treeOk = (tid: string | null | undefined) =>
    tid == null || String(tid).trim() === "" || String(tid).trim() === treeId;

  const relatedById = new Map<string, LifeSpineEntry["relationship_to_anchor"]>();
  for (const rel of (relData ?? []) as (RelRow & { tree_id?: string | null })[]) {
    if (!treeOk(rel.tree_id)) continue;
    const c = classifyRelationship(anchorPersonId, rel);
    if (!c) continue;
    relatedById.set(c.otherId, c.category);
  }

  const personIds = [anchorPersonId, ...relatedById.keys()];
  const uniqueIds = [...new Set(personIds)];

  const { data: nameRows } = await supabase
    .from("persons")
    .select("id, first_name, middle_name, last_name")
    .eq("user_id", userId)
    .in("id", uniqueIds);

  const nameById = new Map<string, string>();
  for (const r of nameRows ?? []) {
    const row = r as {
      id: string;
      first_name: string | null;
      middle_name: string | null;
      last_name: string | null;
    };
    const nm = fullNameFromParts(
      String(row.first_name ?? ""),
      row.middle_name,
      String(row.last_name ?? "")
    ).trim();
    if (nm) nameById.set(row.id, nm);
  }

  const { data: eventRows, error: evErr } = await supabase
    .from("events")
    .select(
      "person_id, event_type, event_date, notes, event_place:places!event_place_id(township, county, state, country)"
    )
    .eq("user_id", userId)
    .in("person_id", uniqueIds);

  if (evErr) return [];

  const out: LifeSpineEntry[] = [];
  for (const raw of eventRows ?? []) {
    const row = raw as {
      person_id: string;
      event_type: string;
      event_date: string | null;
      notes: string | null;
      event_place?: unknown;
    };
    const et0 = String(row.event_type ?? "");
    const subjectName = nameById.get(row.person_id);
    if (!subjectName) continue;
    const relToAnchor =
      row.person_id === anchorPersonId
        ? ("self" as const)
        : relatedById.get(row.person_id) ?? "other";
    const ep = normalizeJoinedPlace(
      row.event_place as Parameters<typeof normalizeJoinedPlace>[0]
    );
    out.push({
      subject_name: subjectName,
      relationship_to_anchor: relToAnchor,
      event_type: String(row.event_type ?? "").trim() || "other",
      event_date: row.event_date?.trim() || null,
      place: placeLabelFromJoinedRow(ep),
      notes: trimNotes(row.notes ?? null),
    });
  }

  const sorted = sortSpineEntries(out);
  return sorted.length > SPINE_MAX_ROWS
    ? sorted.slice(sorted.length - SPINE_MAX_ROWS)
    : sorted;
}

/**
 * Union of all events for a fixed set of people (e.g. everyone saved from one document).
 * Optionally omits the focal row (by event id) so the model is not fed the same beat twice.
 */
export async function fetchLifeContextForPersonIds(params: {
  supabase: SupabaseClient;
  userId: string;
  treeId: string;
  focalPersonId: string;
  contextPersonIds: string[];
  excludeEventId: string | null;
}): Promise<LifeSpineEntry[]> {
  const {
    supabase,
    userId,
    treeId,
    focalPersonId,
    contextPersonIds,
    excludeEventId,
  } = params;
  const ids = [...new Set(contextPersonIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];

  const { data: rows, error } = await supabase
    .from("persons")
    .select("id, tree_id, first_name, middle_name, last_name")
    .eq("user_id", userId)
    .in("id", ids);

  if (error || !rows?.length) return [];

  const validIds: string[] = [];
  const nameById = new Map<string, string>();
  for (const r of rows) {
    const row = r as {
      id: string;
      tree_id?: string | null;
      first_name: string | null;
      middle_name: string | null;
      last_name: string | null;
    };
    if (row.tree_id == null || String(row.tree_id).trim() !== treeId) continue;
    validIds.push(row.id);
    const nm = fullNameFromParts(
      String(row.first_name ?? ""),
      row.middle_name,
      String(row.last_name ?? "")
    ).trim();
    if (nm) nameById.set(row.id, nm);
  }
  if (validIds.length === 0) return [];

  let q = supabase
    .from("events")
    .select(
      "id, person_id, event_type, event_date, notes, event_place:places!event_place_id(township, county, state, country)"
    )
    .eq("user_id", userId)
    .in("person_id", validIds);

  const ex = excludeEventId?.trim();
  if (ex) {
    q = q.neq("id", ex);
  }

  const { data: eventRows, error: evErr } = await q;
  if (evErr) return [];

  const out: LifeSpineEntry[] = [];
  for (const raw of eventRows ?? []) {
    const row = raw as {
      id: string;
      person_id: string;
      event_type: string;
      event_date: string | null;
      notes: string | null;
      event_place?: unknown;
    };
    const et = String(row.event_type ?? "");
    const subjectName = nameById.get(row.person_id);
    if (!subjectName) continue;
    const relToAnchor =
      row.person_id === focalPersonId ? ("self" as const) : ("other" as const);
    const ep = normalizeJoinedPlace(
      row.event_place as Parameters<typeof normalizeJoinedPlace>[0]
    );
    out.push({
      subject_name: subjectName,
      relationship_to_anchor: relToAnchor,
      event_type: et.trim() || "other",
      event_date: row.event_date?.trim() || null,
      place: placeLabelFromJoinedRow(ep),
      notes: trimNotes(row.notes ?? null),
    });
  }

  const sorted = sortSpineEntries(out);
  return sorted.length > SPINE_MAX_ROWS
    ? sorted.slice(sorted.length - SPINE_MAX_ROWS)
    : sorted;
}

export function parseLifeSpineFromRequestBody(raw: unknown): LifeSpineEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const out: LifeSpineEntry[] = [];
  for (const item of raw) {
    if (item == null || typeof item !== "object" || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const subject_name =
      typeof o.subject_name === "string" ? o.subject_name.trim() : "";
    const relationship_to_anchor =
      typeof o.relationship_to_anchor === "string"
        ? o.relationship_to_anchor.trim()
        : "";
    const event_type =
      typeof o.event_type === "string" ? o.event_type.trim() : "";
    if (!subject_name || !relationship_to_anchor || !event_type) continue;
    const allowed = new Set([
      "self",
      "child",
      "spouse",
      "parent",
      "sibling",
      "grandparent",
      "grandchild",
      "aunt/uncle",
      "niece/nephew",
      "other",
    ]);
    const rel = allowed.has(relationship_to_anchor)
      ? (relationship_to_anchor as LifeSpineEntry["relationship_to_anchor"])
      : ("other" as const);
    const event_date =
      typeof o.event_date === "string" ? o.event_date.trim() || null : null;
    const place =
      typeof o.place === "string" ? o.place.trim() || null : null;
    const notes =
      typeof o.notes === "string" ? o.notes.trim() || null : null;
    out.push({
      subject_name,
      relationship_to_anchor: rel,
      event_type,
      event_date,
      place,
      notes: trimNotes(notes),
    });
  }
  return out;
}
