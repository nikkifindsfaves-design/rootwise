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
  "residence",
  "emigration",
  "military service",
  "occupation",
  "land",
  "court",
  "other",
] as const;

export type EventType = typeof EVENT_TYPES[number];

// "child born" is AI-generated only and excluded from manual entry UI
export const AI_ONLY_EVENT_TYPES = [
  "child born",
  "enlistment",
  "deployment",
  "military transfer",
  "military award",
  "discharge",
  "missing in action",
  "killed in action",
  "prisoner of war",
] as const;

export const ALL_EVENT_TYPES = [...EVENT_TYPES, ...AI_ONLY_EVENT_TYPES] as const;
