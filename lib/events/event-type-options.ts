/**
 * Canonical event types for selects (person profile, review UI, etc.).
 * Includes types produced by document extraction.
 */
export const EVENT_TYPE_OPTIONS = [
  "birth",
  "death",
  "marriage",
  "census appearance",
  "military service",
  "immigration",
  "land record",
  "court record",
  "child born",
  "other",
] as const;

export type EventTypeOption = (typeof EVENT_TYPE_OPTIONS)[number];

export function buildEventTypeSelectOptions(events: { event_type: string }[]): string[] {
  const set = new Set<string>([...EVENT_TYPE_OPTIONS]);
  for (const e of events) {
    const t = e.event_type?.trim();
    if (t) set.add(t);
  }
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}
