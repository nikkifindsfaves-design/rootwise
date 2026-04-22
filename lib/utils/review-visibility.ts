/**
 * Whether the review session’s document is labeled as a death record.
 * Matches `recordTypeLabel === "Death Record"` in the review UI.
 */
export function getIsDeathRecord(recordType: string): boolean {
  return recordType === "Death Record";
}

/**
 * Whether this person card is treated as a birth-record child row: the document is
 * not a death or marriage record, and the card has at least one event with type `birth`.
 * Matches `!isDeathRecord && !isMarriageRecord && item.events.some((e) => e.eventType === "birth")`.
 */
export function getIsBirthRecordChild(
  events: ReadonlyArray<{ eventType: string }>,
  recordType: string,
): boolean {
  return (
    !getIsDeathRecord(recordType) &&
    !getIsMarriageRecord(recordType) &&
    events.some((e) => e.eventType === "birth")
  );
}

/**
 * Whether the review session’s document is labeled as a birth record.
 * Matches `recordTypeLabel === "Birth Record"` (same convention as upload / record types).
 */
export function getIsBirthRecord(recordType: string): boolean {
  return recordType === "Birth Record";
}

/**
 * Whether the review session’s document is labeled as a marriage record.
 * Matches `recordTypeLabel === "Marriage Record"` (marriage-specific field hiding and shared marriage block).
 */
export function getIsMarriageRecord(recordType: string): boolean {
  return recordType === "Marriage Record";
}

/** Matches upload / review label for census documents (`RECORD_TYPES`). */
export function getIsCensusRecord(recordType: string): boolean {
  return recordType === "Census Record";
}

/** Matches upload / review label for land documents (`RECORD_TYPES`). */
export function getIsLandRecord(recordType: string): boolean {
  return recordType === "Land Record";
}
