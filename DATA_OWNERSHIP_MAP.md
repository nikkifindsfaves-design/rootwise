# Data Ownership Map

This document defines where each genealogical fact is canonically stored, where (if anywhere) it may be mirrored, and how to keep mirrored values in sync.

## Purpose

- Prevent conflicting truths across `persons`, `events`, and related tables.
- Preserve source traceability to records/documents.
- Keep timeline/history facts time-aware.
- Support UI speed with minimal, explicit caching only where needed.

## Core Rules

- Canonical-first: each fact has one primary source of truth.
- Time-varying facts should not be flattened into single-value person columns.
- If a field is mirrored for UI performance, define a one-way sync direction.
- Every extracted fact should remain traceable to a source record/document.

---

## Ownership by Fact

### Occupation

- Canonical table: `occupations`
- Recommended columns:
  - `person_id`
  - `job_title`
  - `year_observed` (or date/date range)
  - `record_id` (or equivalent source link)
- Person mirror: none (do not rely on single occupation field on `persons`)
- Reason: one person can have many occupations across time.

### Marital Status

- Canonical table: `events` (timeline-based facts)
- Recommended representation:
  - marriage/divorce/widowed/annulment/separation as event types or structured event metadata
- Person mirror: optional display-only "computed current status"; avoid canonical `persons.marital_status`
- Reason: status can change multiple times across life.

### Cause of Death

- Canonical table: `events` (death event)
- Person mirror:
  - Optional: `persons.cause_of_death` as a cache/display convenience
  - If mirrored, sync direction must be `death event -> persons cache`
- Reason: the death event is the evidentiary source context.

### Death Place

- Canonical table: `events` via `event_place_id` on death event
- Place dimension: `places` remains canonical place vocabulary/source
- Person mirror:
  - Optional: `persons.death_place_id` as a cache for quick profile/filter use
  - If mirrored, sync direction must be `death event -> persons cache`
- Reason: person dies once, but event-level location is primary fact context.

### Birth Place

- Canonical table: `persons.birth_place_id` (stable identity fact)
- Event-level birth place:
  - Allowed when tied to birth event evidence
  - Should match person-level birth place unless explicitly uncertain/variant
- Reason: both identity and event evidence are useful; person value should be authoritative default.

---

## Source Linking Policy

For extracted or manually entered factual rows, store source linkage whenever possible:

- Preferred: `record_id` on fact/history rows (e.g., occupations)
- If external documents are separate entities, link through `record_id` or normalized source relation table
- UI source icon behavior should resolve from these links, not from inferred text

---

## Duplication Policy

Only duplicate a fact across tables when all of the following are true:

- There is a measurable UX/performance benefit.
- Canonical owner is explicitly documented.
- A deterministic sync rule exists.
- Conflict resolution behavior is defined.

If these are not met, do not duplicate.

---

## Sync Rules (when mirrors exist)

- `cause_of_death` mirror:
  - write canonical value on death event save/update
  - derive/update person cache from death event
- `death_place_id` mirror:
  - write canonical value on death event save/update
  - derive/update person cache from death event
- If death event is deleted/changed:
  - clear/recompute person cache deterministically

---

## Migration / Refactor Guidance

When de-duplicating fields:

1. Mark canonical owner in code comments and API boundaries.
2. Backfill canonical table from legacy fields.
3. Update reads to prefer canonical source.
4. Keep legacy fields as temporary cache only (if needed).
5. Remove or deprecate writes to non-canonical fields.
6. Remove legacy columns only after UI and API are fully migrated.

---

## Current Project Decisions (Agreed Direction)

- Occupations should live in `occupations` (many rows per person, source-linked).
- Marital status should be timeline/event-based, not a single person truth field.
- Cause of death may be mirrored to person for convenience, but event is canonical.
- Death place may be mirrored to person for convenience, but death event is canonical.

---

## Open Decisions (before implementation changes)

- Whether to keep `persons.cause_of_death` long-term as a cache or fully derive.
- Whether to keep `persons.death_place_id` long-term as a cache or fully derive.
- Exact event taxonomy for marital-status transitions.

