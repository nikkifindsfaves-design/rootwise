export const RECORD_TYPES = [
  "Birth Record",
  "Death Record",
  "Marriage Record",
  "Census Record",
  "Church Record",
  "Military Record",
  "Land Record",
  "Court Record",
  "Story or Letter",
  "Other",
] as const;

export type RecordType = (typeof RECORD_TYPES)[number];
