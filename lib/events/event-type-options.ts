import { EVENT_TYPES, AI_ONLY_EVENT_TYPES } from "./event-types";

/**
 * Builds the event type dropdown options for UI selects.
 * Canonical types come from event-types.ts.
 * Any non-standard types already on existing events are appended dynamically.
 * AI-only types (e.g. "child born") are excluded from manual entry dropdowns
 * but preserved if already present on an existing event.
 */
export function buildEventTypeSelectOptions(
  events: { event_type: string }[],
  includeAiOnly = false
): string[] {
  const base = includeAiOnly
    ? [...EVENT_TYPES, ...AI_ONLY_EVENT_TYPES]
    : [...EVENT_TYPES];

  const set = new Set<string>(base);

  for (const e of events) {
    const t = e.event_type?.trim();
    if (t) set.add(t);
  }

  return [...set].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" })
  );
}

export type { EventType } from "./event-types";
