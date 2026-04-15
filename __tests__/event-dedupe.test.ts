/// <reference types="vitest/globals" />

import type { SupabaseClient } from "@supabase/supabase-js";
import { savePersonEventWithDedupe } from "@/lib/events/dedupe";

type EventRow = {
  id: string;
  user_id: string;
  person_id: string;
  record_id: string;
  event_type: string;
  event_date: string | null;
  event_place_id: string | null;
  notes: string | null;
  story_short: string | null;
  story_full: string | null;
  land_data: { acres: number | null; transaction_type: string | null } | null;
};

type EventSourceRow = {
  id: string;
  user_id: string;
  event_id: string;
  record_id: string;
  notes: string | null;
};

function createSupabaseMock(seed?: {
  events?: EventRow[];
  event_sources?: EventSourceRow[];
}) {
  const db = {
    events: [...(seed?.events ?? [])],
    event_sources: [...(seed?.event_sources ?? [])],
  };

  let eventIdCounter = db.events.length;
  let sourceIdCounter = db.event_sources.length;

  function from(tableName: string) {
    const table = tableName as "events" | "event_sources";
    const filters: Record<string, unknown> = {};

    const runSelect = () => {
      const rows = table === "events" ? db.events : db.event_sources;
      return rows.filter((row) =>
        Object.entries(filters).every(([k, v]) => (row as Record<string, unknown>)[k] === v),
      );
    };

    const builder = {
      select(_columns: string) {
        return builder;
      },
      eq(field: string, value: unknown) {
        filters[field] = value;
        return builder;
      },
      maybeSingle: async () => {
        const rows = runSelect();
        return { data: rows[0] ?? null, error: null };
      },
      insert(payload: Record<string, unknown>) {
        if (table === "events") {
          const inserted: EventRow = {
            id: `ev_${++eventIdCounter}`,
            user_id: String(payload.user_id),
            person_id: String(payload.person_id),
            record_id: String(payload.record_id),
            event_type: String(payload.event_type),
            event_date: (payload.event_date as string | null) ?? null,
            event_place_id: (payload.event_place_id as string | null) ?? null,
            notes: (payload.notes as string | null) ?? null,
            story_short: (payload.story_short as string | null) ?? null,
            story_full: (payload.story_full as string | null) ?? null,
            land_data:
              (payload.land_data as {
                acres: number | null;
                transaction_type: string | null;
              } | null) ?? null,
          };
          db.events.push(inserted);

          return {
            select(_columns: string) {
              return {
                maybeSingle: async () => ({ data: { id: inserted.id }, error: null }),
              };
            },
          };
        }

        const inserted: EventSourceRow = {
          id: `es_${++sourceIdCounter}`,
          user_id: String(payload.user_id),
          event_id: String(payload.event_id),
          record_id: String(payload.record_id),
          notes: (payload.notes as string | null) ?? null,
        };
        db.event_sources.push(inserted);
        return Promise.resolve({ error: null });
      },
      then(
        resolve: (value: { data: (EventRow | EventSourceRow)[]; error: null }) => void,
        reject?: (reason: unknown) => void,
      ) {
        try {
          resolve({ data: runSelect(), error: null });
        } catch (error) {
          if (reject) reject(error);
        }
      },
    };

    return builder;
  }

  return {
    supabase: { from } as unknown as SupabaseClient,
    db,
  };
}

describe("savePersonEventWithDedupe", () => {
  it("keeps personal birth events unique per person", async () => {
    const { supabase, db } = createSupabaseMock({
      events: [
        {
          id: "ev_existing_birth",
          user_id: "u1",
          person_id: "p1",
          record_id: "r_old",
          event_type: "birth",
          event_date: "1870-01-01",
          event_place_id: null,
          notes: "existing",
          story_short: null,
          story_full: "existing story",
          land_data: null,
        },
      ],
    });

    const result = await savePersonEventWithDedupe(supabase, "u1", "p1", "r_new", {
      event_type: "birth",
      event_date: "1870-01-01",
      event_place_id: null,
      notes: "new source",
      story_full: "new story",
    });

    expect(result.error).toBeNull();
    expect(db.events).toHaveLength(1);
    expect(db.event_sources).toHaveLength(1);
    expect(db.event_sources[0]?.event_id).toBe("ev_existing_birth");
    expect(db.event_sources[0]?.record_id).toBe("r_new");
  });

  it("allows multiple child born events for the same parent", async () => {
    const { supabase, db } = createSupabaseMock();

    const first = await savePersonEventWithDedupe(supabase, "u1", "parent_1", "r1", {
      event_type: "child born",
      event_date: "1901-05-01",
      event_place_id: null,
      notes: "First child",
      story_full: "Story one",
    });

    const second = await savePersonEventWithDedupe(supabase, "u1", "parent_1", "r2", {
      event_type: "child born",
      event_date: "1903-07-09",
      event_place_id: null,
      notes: "Second child",
      story_full: "Story two",
    });

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(db.events).toHaveLength(2);
    expect(db.events.map((e) => e.event_type)).toEqual(["child born", "child born"]);
    expect(new Set(db.events.map((e) => e.id)).size).toBe(2);
    expect(db.event_sources).toHaveLength(2);
  });
});
