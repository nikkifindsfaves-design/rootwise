/**
 * Shared date/place vs per-row notes for review step 1 (extracted vs manual upload).
 * Used by `review-record-client` and covered by `__tests__/shared-event-merge.test.ts`.
 */

export type SharedEventDetailsState = {
  eventDate: string;
  event_place_display: string;
  event_place_id: string | null;
  event_place_fields: {
    township: string | null;
    county: string | null;
    state: string | null;
    country: string;
  } | null;
  eventNotes: string;
};

export type MergeEventRow = {
  key: string;
  eventType: string;
  eventDate: string;
  event_place_display: string;
  event_place_id: string | null;
  event_place_fields: SharedEventDetailsState["event_place_fields"];
  eventNotes: string;
  useSharedDetails?: boolean;
  eventStoryFull?: string;
  landData?: { acres: number | null; transaction_type: string | null } | null;
};

export type MergePersonCard = {
  events: MergeEventRow[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function eventUsesSharedDetails(
  e: Pick<MergeEventRow, "useSharedDetails">
): boolean {
  return e.useSharedDetails === true;
}

export function resolveEventDatePlaceNotes(
  e: MergeEventRow,
  shared: SharedEventDetailsState,
  /** Manual upload: description lives in shared. AI extraction: keep per-row notes. */
  useSharedNotesLayer: boolean
): {
  eventDate: string;
  event_place_display: string;
  event_place_id: string | null;
  event_place_fields: SharedEventDetailsState["event_place_fields"];
  eventNotes: string;
} {
  if (eventUsesSharedDetails(e)) {
    return {
      eventDate: shared.eventDate,
      event_place_display: shared.event_place_display,
      event_place_id: shared.event_place_id,
      event_place_fields: shared.event_place_fields,
      eventNotes: useSharedNotesLayer ? shared.eventNotes : e.eventNotes,
    };
  }
  return {
    eventDate: e.eventDate,
    event_place_display: e.event_place_display,
    event_place_id: e.event_place_id,
    event_place_fields: e.event_place_fields,
    eventNotes: e.eventNotes,
  };
}

export function emptySharedEventDetails(): SharedEventDetailsState {
  return {
    eventDate: "",
    event_place_display: "",
    event_place_id: null,
    event_place_fields: null,
    eventNotes: "",
  };
}

export function extractionSkippedFromAi(aiResponse: unknown): boolean {
  return isRecord(aiResponse) && aiResponse.extraction_skipped === true;
}

/**
 * Link matching events to shared date/place. By default clears row notes (manual
 * entry). For AI extraction, set `preserveRowNotes` so per-person descriptions
 * (e.g. census role) stay on each row.
 */
export function linkMatchingEventsToShared<T extends MergePersonCard>(
  cards: T[],
  match: (ev: MergeEventRow) => boolean,
  options?: { preserveRowNotes?: boolean }
): T[] {
  const preserveRowNotes = options?.preserveRowNotes === true;
  return cards.map((card) => ({
    ...card,
    events: card.events.map((ev) => {
      if (!match(ev)) return ev;
      const linked: MergeEventRow = {
        ...ev,
        useSharedDetails: true,
        eventDate: "",
        event_place_display: "",
        event_place_id: null,
        event_place_fields: null,
      };
      return preserveRowNotes ? linked : { ...linked, eventNotes: "" };
    }),
  })) as T[];
}

/** Groups extracted events that share the same when/where (not description). */
export function eventSignatureForSharedCluster(ev: MergeEventRow): string {
  return [
    ev.eventDate.trim(),
    ev.event_place_display.trim(),
    String(ev.event_place_id ?? ""),
  ].join("\u0001");
}

/**
 * After AI extraction: one shared date/place for the most common fact on the
 * document. Per-row notes stay on each event. Land events stay local.
 */
export function migrateExtractedEventsToShared<T extends MergePersonCard>(
  cards: T[]
): { cards: T[]; shared: SharedEventDetailsState } {
  type SignatureStats = {
    count: number;
    firstEvent: MergeEventRow;
    keys: string[];
  };
  const bySignature = new Map<string, SignatureStats>();
  let best: SignatureStats | null = null;

  for (const card of cards) {
    for (const ev of card.events) {
      if (ev.eventType === "land") continue;
      const signature = eventSignatureForSharedCluster(ev);
      const existing = bySignature.get(signature);
      if (existing) {
        existing.count += 1;
        existing.keys.push(ev.key);
        if (best == null || existing.count > best.count) {
          best = existing;
        }
      } else {
        const created: SignatureStats = {
          count: 1,
          firstEvent: ev,
          keys: [ev.key],
        };
        bySignature.set(signature, created);
        if (best == null) {
          best = created;
        }
      }
    }
  }

  if (best == null) {
    return { cards, shared: emptySharedEventDetails() };
  }

  const template = best.firstEvent;
  const shared: SharedEventDetailsState = {
    eventDate: template.eventDate,
    event_place_display: template.event_place_display,
    event_place_id: template.event_place_id,
    event_place_fields: template.event_place_fields,
    eventNotes: "",
  };

  const linkKeys = new Set(best.keys);
  const nextCards = linkMatchingEventsToShared(
    cards,
    (ev) => linkKeys.has(ev.key),
    { preserveRowNotes: true }
  );

  return { cards: nextCards, shared };
}
