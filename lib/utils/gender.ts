export type CanonicalGender = "Male" | "Female" | "Unknown";

/**
 * Must match <select> option values exactly: Male, Female, Unknown.
 * AI and imported data may provide lowercase values or common synonyms.
 */
export function normalizeGender(
  raw: string | null | undefined
): CanonicalGender {
  const s = String(raw ?? "").trim();
  if (!s) return "Unknown";
  const n = s.toLowerCase();
  if (n === "male" || n === "m" || n === "man") return "Male";
  if (n === "female" || n === "f" || n === "woman") return "Female";
  if (
    n === "unknown" ||
    n === "other" ||
    n === "u" ||
    n === "nonbinary" ||
    n === "non-binary"
  ) {
    return "Unknown";
  }
  if (s === "Male" || s === "Female" || s === "Unknown") return s;
  return "Unknown";
}
