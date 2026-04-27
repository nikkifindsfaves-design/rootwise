export const RECORD_TYPES = [
  "Birth Record",
  "Death Record",
  "Burial Record",
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

const RECORD_TYPE_SET: ReadonlySet<string> = new Set(RECORD_TYPES);

function normalizeRecordType(recordType: string): string {
  return recordType.trim().toLowerCase();
}

export function isRecordType(value: string): value is RecordType {
  return RECORD_TYPE_SET.has(value);
}

export function matchesRecordTypeLabel(
  recordType: string,
  expectedLabel: RecordType
): boolean {
  return normalizeRecordType(recordType) === normalizeRecordType(expectedLabel);
}
