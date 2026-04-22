  import type { SupabaseClient } from "@supabase/supabase-js";

  export function normalizeEventTypeKey(t: string): string {
    return (t || "other").trim().toLowerCase() || "other";
  }

function isSingleInstanceEventType(eventTypeRaw: string): boolean {
  const eventType = normalizeEventTypeKey(eventTypeRaw);
  return eventType === "birth" || eventType === "death";
}

function normalizeDateKey(raw: string | null): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const m = t.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
  if (!m) return t.toLowerCase();
  const y = m[1];
  const mo = m[2];
  const d = m[3];
  if (!mo) return y;
  if (!d) return `${y}-${mo}`;
  return `${y}-${mo}-${d}`;
}

function yearsMatch(a: string, b: string): boolean {
  const ya = a.slice(0, 4);
  const yb = b.slice(0, 4);
  return /^\d{4}$/.test(ya) && /^\d{4}$/.test(yb) && ya === yb;
}

function datesMatch(aRaw: string | null, bRaw: string | null): boolean {
  const a = normalizeDateKey(aRaw);
  const b = normalizeDateKey(bRaw);
  if (!a || !b) return false;
  if (a === b) return true;
  // Treat year-only input as matching specific same-year dates.
  if ((a.length === 4 || b.length === 4) && yearsMatch(a, b)) return true;
  return false;
}

function normalizeTextKey(raw: string | null): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinkedPersonName(eventTypeRaw: string, notesRaw: string | null): string {
  const eventType = normalizeEventTypeKey(eventTypeRaw);
  const notes = normalizeTextKey(notesRaw);
  if (!notes) return "";
  if (eventType === "child born" || eventType === "child died") {
    const m = notes.match(/\bchild\s+([a-z0-9 ]{2,80})$/);
    if (m?.[1]) return m[1].trim();
  }
  if (eventType === "spouse died") {
    const m = notes.match(/\bspouse\s+([a-z0-9 ]{2,80})$/);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

type ExistingEventCandidate = {
  id: string;
  event_type: string | null;
  event_date: string | null;
  event_place_id: string | null;
  notes: string | null;
};

function pickBestSingleInstanceCandidate(
  candidates: ExistingEventCandidate[],
  incomingDate: string | null
): string | null {
  for (const c of candidates) {
    if (datesMatch(c.event_date, incomingDate)) return c.id;
  }
  return candidates[0]?.id ?? null;
}

function isSameEventInstance(
  existing: ExistingEventCandidate,
  incoming: {
    event_type: string;
    event_date: string | null;
    event_place_id: string | null;
    notes: string | null;
  }
): boolean {
  const incomingType = normalizeEventTypeKey(incoming.event_type);
  if (normalizeEventTypeKey(existing.event_type ?? "") !== incomingType) return false;
  if (!datesMatch(existing.event_date, incoming.event_date)) return false;

  const existingPlace = (existing.event_place_id ?? "").trim();
  const incomingPlace = (incoming.event_place_id ?? "").trim();
  if (existingPlace && incomingPlace) return existingPlace === incomingPlace;

  const linkedExisting = extractLinkedPersonName(incomingType, existing.notes);
  const linkedIncoming = extractLinkedPersonName(incomingType, incoming.notes);
  if (linkedExisting && linkedIncoming) return linkedExisting === linkedIncoming;

  const existingNotes = normalizeTextKey(existing.notes);
  const incomingNotes = normalizeTextKey(incoming.notes);
  if (existingNotes && incomingNotes) return existingNotes === incomingNotes;

  // If we only have type + date, treat as duplicate.
  return true;
}

export async function findExistingEventIdForPersonType(
    supabase: SupabaseClient,
    userId: string,
    personId: string,
  fields: {
    event_type: string;
    event_date: string | null;
    event_place_id: string | null;
    notes: string | null;
  }
  ): Promise<string | null> {
  const target = normalizeEventTypeKey(fields.event_type);
    const { data, error } = await supabase
      .from("events")
    .select("id, event_type, event_date, event_place_id, notes")
      .eq("user_id", userId)
    .eq("person_id", personId);

    if (error || !data?.length) return null;
  const candidates = (data as ExistingEventCandidate[]).filter(
    (row) => normalizeEventTypeKey(row.event_type ?? "") === target
  );
  if (!candidates.length) return null;

  if (isSingleInstanceEventType(fields.event_type)) {
    return pickBestSingleInstanceCandidate(candidates, fields.event_date);
  }

  for (const row of candidates) {
    if (isSameEventInstance(row, fields)) return row.id;
    }
    return null;
  }

  /** Inserts a junction row unless (event_id, record_id) already exists. */
  export async function insertEventSourceIfMissing(
    supabase: SupabaseClient,
    userId: string,
    eventId: string,
    recordId: string,
    notes: string | null
  ): Promise<{ error: string | null }> {
    const { data: existing } = await supabase
      .from("event_sources")
      .select("id")
      .eq("event_id", eventId)
      .eq("record_id", recordId)
      .maybeSingle();

    if (existing) return { error: null };

    const { error } = await supabase.from("event_sources").insert({
      user_id: userId,
      event_id: eventId,
      record_id: recordId,
      notes,
    });

    return { error: error?.message ?? null };
  }

  export async function savePersonEventWithDedupe(
    supabase: SupabaseClient,
    userId: string,
    personId: string,
    recordId: string,
    fields: {
      event_type: string;
      event_date: string | null;
      event_place_id: string | null;
      notes: string | null;
      story_short?: string | null;
      story_full: string | null;
      land_data?: { acres: number | null; transaction_type: string | null } | null;
    }
  ): Promise<{ error: string | null; eventId: string | null }> {
  const existingId = await findExistingEventIdForPersonType(
    supabase,
    userId,
    personId,
    {
      event_type: fields.event_type,
      event_date: fields.event_date,
      event_place_id: fields.event_place_id,
      notes: fields.notes,
    }
  );

    if (existingId) {
      const src = await insertEventSourceIfMissing(
        supabase,
        userId,
        existingId,
        recordId,
        fields.notes
      );
      return { error: src.error, eventId: existingId };
    }

    const { data: inserted, error: insErr } = await supabase
      .from("events")
      .insert({
        user_id: userId,
        person_id: personId,
        record_id: recordId,
        event_type: fields.event_type,
        event_date: fields.event_date,
        event_place_id: fields.event_place_id,
        notes: fields.notes,
        story_short: fields.story_short ?? null,
        story_full: fields.story_full,
        land_data: fields.land_data ?? null,
      })
      .select("id")
      .maybeSingle();

    if (insErr || !inserted) {
      return {
        error: insErr?.message ?? "Failed to create event.",
        eventId: null,
      };
    }

    const newId = inserted.id as string;
    const src = await insertEventSourceIfMissing(
      supabase,
      userId,
      newId,
      recordId,
      fields.notes
    );
    return { error: src.error, eventId: newId };
  }
