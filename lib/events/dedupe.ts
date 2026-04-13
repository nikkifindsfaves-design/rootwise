  import type { SupabaseClient } from "@supabase/supabase-js";

  export function normalizeEventTypeKey(t: string): string {
    return (t || "other").trim().toLowerCase() || "other";
  }

  export async function findExistingEventIdForPersonType(
    supabase: SupabaseClient,
    userId: string,
    personId: string,
    eventTypeRaw: string
  ): Promise<string | null> {
    const target = normalizeEventTypeKey(eventTypeRaw);
    const { data, error } = await supabase
      .from("events")
      .select("id, event_type")
      .eq("user_id", userId)
      .eq("person_id", personId);

    if (error || !data?.length) return null;
    for (const row of data as { id: string; event_type: string | null }[]) {
      if (normalizeEventTypeKey(row.event_type ?? "") === target) {
        return row.id;
      }
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
  ): Promise<{ error: string | null }> {
    const existingId = await findExistingEventIdForPersonType(
      supabase,
      userId,
      personId,
      fields.event_type
    );

    if (existingId) {
      return insertEventSourceIfMissing(
        supabase,
        userId,
        existingId,
        recordId,
        fields.notes
      );
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
      return { error: insErr?.message ?? "Failed to create event." };
    }

    return insertEventSourceIfMissing(
      supabase,
      userId,
      inserted.id as string,
      recordId,
      fields.notes
    );
  }
