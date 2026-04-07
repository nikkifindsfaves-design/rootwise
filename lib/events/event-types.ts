export const EVENT_TYPES = [
  "birth",
  "baptism",
  "child born",
  "christening",
  "marriage",
  "divorce",
  "death",
  "burial",
  "child died",
  "spouse died",
  "census",
  "immigration",
  "emigration",
  "military service",
  "occupation",
  "land",
  "court",
  "other",
] as const;

export type EventType = typeof EVENT_TYPES[number];

// "child born" is AI-generated only and excluded from manual entry UI
export const AI_ONLY_EVENT_TYPES = ["child born"] as const;

export const ALL_EVENT_TYPES = [...EVENT_TYPES, ...AI_ONLY_EVENT_TYPES] as const;
