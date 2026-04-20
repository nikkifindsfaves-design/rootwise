export const GENDER_VALUES = {
  MALE: "Male",
  FEMALE: "Female",
  UNKNOWN: "Unknown",
} as const;

export const GENDER_OPTIONS = [
  GENDER_VALUES.MALE,
  GENDER_VALUES.FEMALE,
  GENDER_VALUES.UNKNOWN,
] as const;

export type CanonicalGender = (typeof GENDER_OPTIONS)[number];

export const DEFAULT_GENDER: CanonicalGender = GENDER_VALUES.UNKNOWN;

/**
 * Must match <select> option values exactly.
 * AI and imported data may provide lowercase values or common synonyms.
 */
export function normalizeGender(
  raw: string | null | undefined
): CanonicalGender {
  const s = String(raw ?? "").trim();
  if (!s) return DEFAULT_GENDER;
  const n = s.toLowerCase();
  if (n === "male" || n === "m" || n === "man") return GENDER_VALUES.MALE;
  if (n === "female" || n === "f" || n === "woman") return GENDER_VALUES.FEMALE;
  if (
    n === "unknown" ||
    n === "other" ||
    n === "u" ||
    n === "nonbinary" ||
    n === "non-binary"
  ) {
    return GENDER_VALUES.UNKNOWN;
  }
  if ((GENDER_OPTIONS as readonly string[]).includes(s)) {
    return s as CanonicalGender;
  }
  return DEFAULT_GENDER;
}
