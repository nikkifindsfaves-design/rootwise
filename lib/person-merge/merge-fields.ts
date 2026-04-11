export const MERGE_FIELDS = [
  "first_name",
  "middle_name",
  "last_name",
  "birth_date",
  "death_date",
  "birth_place_id",
  "gender",
  "notes",
] as const;

export type MergeField = (typeof MERGE_FIELDS)[number];
