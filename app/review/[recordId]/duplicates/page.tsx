"use client";

import { createClient } from "@/lib/supabase/client";
import { formatPlace, type PlaceObject } from "@/lib/utils/places";
import type { PendingReviewPayload } from "../review-record-client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

const PENDING_REVIEW_KEY = "pendingReview";

const MERGE_FIELDS = [
  "first_name",
  "middle_name",
  "last_name",
  "birth_date",
  "death_date",
  "birth_place_id",
  "gender",
  "notes",
] as const;

type MergeField = (typeof MERGE_FIELDS)[number];

/** Shown in the duplicate comparison UI; merge/save still uses full `MERGE_FIELDS`. */
const COMPARISON_FIELDS = MERGE_FIELDS.filter(
  (f): f is Exclude<MergeField, "notes"> => f !== "notes"
);

type DbPerson = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  birth_date: string | null;
  death_date: string | null;
  birth_place_id: string | null;
  birth_place: PlaceObject | null;
  gender: string | null;
  notes: string | null;
};

type PendingPerson = PendingReviewPayload["people"][number] & {
  birth_place_display?: string | null;
};

type PersonWithMatch = {
  pendingIndex: number;
  pending: PendingPerson;
  match: DbPerson;
};

/** Per duplicate card: merge using field-level choices vs add extracted person as new. */
type DuplicateCardMode = "merge" | "new";

type FieldMergePick = "existing" | "record";

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const row = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) row[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = row[0]!;
    row[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        prev + cost
      );
      prev = tmp;
    }
  }
  return row[n]!;
}

function findBestFuzzyMatch(
  pending: PendingPerson,
  tree: DbPerson[],
  excludeIds: Set<string>
): DbPerson | null {
  const rf = pending.first_name.trim().toLowerCase();
  const rl = pending.last_name.trim().toLowerCase();
  if (!rf || !rl) return null;

  let best: { person: DbPerson; score: number } | null = null;

  for (const p of tree) {
    if (excludeIds.has(p.id)) continue;
    const df = (p.first_name ?? "").trim().toLowerCase();
    const dl = (p.last_name ?? "").trim().toLowerCase();
    const d1 = levenshtein(rf, df);
    const d2 = levenshtein(rl, dl);
    if (d1 <= 2 && d2 <= 2) {
      const score = d1 + d2;
      if (!best || score < best.score) {
        best = { person: p, score };
      }
    }
  }

  return best?.person ?? null;
}

function fieldStr(v: string | null | undefined): string {
  return (v ?? "").trim();
}

function labelForField(field: MergeField): string {
  const map: Record<MergeField, string> = {
    first_name: "First name",
    middle_name: "Middle name",
    last_name: "Last name",
    birth_date: "Birth date",
    death_date: "Death date",
    birth_place_id: "Birth place",
    gender: "Gender",
    notes: "Notes",
  };
  return map[field];
}

function displayValue(
  pending: PendingPerson,
  existing: DbPerson,
  field: MergeField
): { record: string; tree: string } {
  const r =
    field === "first_name"
      ? fieldStr(pending.first_name)
      : field === "last_name"
        ? fieldStr(pending.last_name)
        : field === "middle_name"
          ? fieldStr(pending.middle_name)
          : field === "birth_date"
            ? fieldStr(pending.birth_date)
              : field === "death_date"
              ? fieldStr(pending.death_date)
              : field === "birth_place_id"
                ? fieldStr(pending.birth_place_display)
                : field === "gender"
                  ? fieldStr(pending.gender)
                  : fieldStr(pending.notes);

  const e =
    field === "first_name"
      ? fieldStr(existing.first_name)
      : field === "last_name"
        ? fieldStr(existing.last_name)
        : field === "middle_name"
          ? fieldStr(existing.middle_name)
          : field === "birth_date"
            ? fieldStr(existing.birth_date)
            : field === "death_date"
              ? fieldStr(existing.death_date)
              : field === "birth_place_id"
                ? existing.birth_place
                  ? formatPlace(existing.birth_place)
                  : ""
                : field === "gender"
                  ? fieldStr(existing.gender)
                  : fieldStr(existing.notes);

  return { record: r || "—", tree: e || "—" };
}

function fieldRowNeedsChoice(
  pending: PendingPerson,
  match: DbPerson,
  field: MergeField
): boolean {
  const { record: rv, tree: tv } = displayValue(pending, match, field);
  if (rv === "—" || tv === "—") return false;
  return rv !== tv;
}

function buildFieldChoicesForMatch(
  matchId: string,
  fieldMergeChoices: Record<string, Partial<Record<MergeField, FieldMergePick>>>
): Record<string, "existing" | "record"> {
  const chosen = fieldMergeChoices[matchId] ?? {};
  const out: Record<string, "existing" | "record"> = {};
  for (const field of MERGE_FIELDS) {
    out[field] = chosen[field] ?? "existing";
  }
  return out;
}

function fullNameFromPending(p: PendingPerson): string {
  return [p.first_name, p.middle_name, p.last_name]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function fullNameFromDbPerson(p: DbPerson): string {
  return [p.first_name, p.middle_name, p.last_name]
    .map((x) => (x ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

const newPersonCardClass =
  "w-full rounded-lg border px-3 py-2 text-sm shadow-sm";

const newPersonCardStyle: CSSProperties = {
  backgroundColor: "var(--dg-cream)",
  borderColor: "var(--dg-brown-border)",
};

export default function ReviewDuplicatesPage() {
  const params = useParams();
  const router = useRouter();
  const recordIdParam = typeof params.recordId === "string" ? params.recordId : "";

  const [loadState, setLoadState] = useState<
    "loading" | "ready" | "error" | "unauthorized"
  >("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingReview, setPendingReview] = useState<PendingReviewPayload | null>(
    null
  );
  const [peopleWithMatches, setPeopleWithMatches] = useState<PersonWithMatch[]>(
    []
  );
  const [newPeople, setNewPeople] = useState<
    { pendingIndex: number; pending: PendingPerson }[]
  >([]);
  /** Per matched tree person: merge (field-level picks) vs add as new person. */
  const [cardMergeChoice, setCardMergeChoice] = useState<
    Record<string, DuplicateCardMode>
  >({});
  /** Per match id + field: when values conflict, "record" vs "existing" (tree). */
  const [fieldMergeChoices, setFieldMergeChoices] = useState<
    Record<string, Partial<Record<MergeField, FieldMergePick>>>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [treePeople, setTreePeople] = useState<DbPerson[]>([]);
  const [manualMatchModalIndex, setManualMatchModalIndex] = useState<
    number | null
  >(null);
  const [manualMatchSearch, setManualMatchSearch] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoadState("loading");
      setLoadError(null);

      let raw: string | null = null;
      try {
        raw = localStorage.getItem(PENDING_REVIEW_KEY);
      } catch {
        setLoadError("Could not read browser storage.");
        setLoadState("error");
        return;
      }

      if (!raw) {
        setLoadError(
          "No pending review found. Go back to step 1 and continue from the record review."
        );
        setLoadState("error");
        return;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        setLoadError("Stored review data is invalid. Please start over from step 1.");
        setLoadState("error");
        return;
      }

      const pr = parsed as Partial<PendingReviewPayload>;
      if (
        !pr ||
        typeof pr.recordId !== "string" ||
        !Array.isArray(pr.people)
      ) {
        setLoadError("Stored review data is missing required fields.");
        setLoadState("error");
        return;
      }

      const returnTreeId =
        typeof pr.returnTreeId === "string" && pr.returnTreeId.trim() !== ""
          ? pr.returnTreeId.trim()
          : null;

      const payload: PendingReviewPayload = {
        recordId: pr.recordId,
        recordTypeLabel:
          typeof pr.recordTypeLabel === "string" ? pr.recordTypeLabel : "",
        ...(returnTreeId ? { returnTreeId } : {}),
        people: pr.people as PendingPerson[],
      };

      payload.people.forEach((person, idx) => {
        console.log(
          `[duplicates] person[${idx}] from localStorage:`,
          JSON.parse(JSON.stringify(person)),
          "gender:",
          person.gender
        );
      });

      if (payload.recordId !== recordIdParam) {
        setLoadError(
          "This page does not match the record in your saved review. Open the correct record or restart from step 1."
        );
        setLoadState("error");
        return;
      }

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setLoadState("unauthorized");
        router.replace("/login");
        return;
      }

      let personsQuery = supabase
        .from("persons")
        .select(
          "id, first_name, middle_name, last_name, birth_date, death_date, birth_place_id, gender, notes, birth_place:places!birth_place_id(township, county, state, country)"
        )
        .eq("user_id", user.id);
      if (returnTreeId) {
        personsQuery = personsQuery.eq("tree_id", returnTreeId);
      }
      const { data: persons, error: personsError } = await personsQuery;

      if (cancelled) return;

      if (personsError) {
        setLoadError(personsError.message);
        setLoadState("error");
        return;
      }

      const tree = (persons ?? []).map((row) => {
        const r = row as typeof row & {
          birth_place?: PlaceObject | PlaceObject[] | null;
        };
        const bp = r.birth_place;
        const birth_place: PlaceObject | null =
          bp == null ? null : Array.isArray(bp) ? (bp[0] ?? null) : bp;
        return { ...r, birth_place } as DbPerson;
      });
      setTreePeople(tree);
      const usedMatchIds = new Set<string>();
      const withMatches: PersonWithMatch[] = [];
      const fresh: { pendingIndex: number; pending: PendingPerson }[] = [];

      payload.people.forEach((person, pendingIndex) => {
        const match = findBestFuzzyMatch(person, tree, usedMatchIds);
        if (match) {
          usedMatchIds.add(match.id);
          withMatches.push({ pendingIndex, pending: person, match });
        } else {
          fresh.push({ pendingIndex, pending: person });
        }
      });

      const initialCard: Record<string, DuplicateCardMode> = {};
      const initialField: Record<
        string,
        Partial<Record<MergeField, FieldMergePick>>
      > = {};
      for (const row of withMatches) {
        initialCard[row.match.id] = "merge";
        const perField: Partial<Record<MergeField, FieldMergePick>> = {};
        for (const field of MERGE_FIELDS) {
          if (fieldRowNeedsChoice(row.pending, row.match, field)) {
            perField[field] = "existing";
          }
        }
        if (Object.keys(perField).length > 0) {
          initialField[row.match.id] = perField;
        }
      }

      if (cancelled) return;

      setPendingReview(payload);
      setPeopleWithMatches(withMatches);
      setNewPeople(fresh);
      setCardMergeChoice(initialCard);
      setFieldMergeChoices(initialField);
      setLoadState("ready");
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [recordIdParam, router]);

  const mergeDecisionsPayload = useMemo(() => {
    if (!pendingReview) return [];
    return peopleWithMatches
      .filter(({ match }) => (cardMergeChoice[match.id] ?? "merge") === "merge")
      .map(({ match }) => ({
        existingPersonId: match.id,
        fieldChoices: buildFieldChoicesForMatch(match.id, fieldMergeChoices),
      }));
  }, [pendingReview, peopleWithMatches, cardMergeChoice, fieldMergeChoices]);

  const pendingPersonsPayload = useMemo(() => {
    if (!pendingReview) return [];
    const matchByIndex = new Map<number, DbPerson>();
    const addAsNewIndex = new Set<number>();
    for (const row of peopleWithMatches) {
      const c = cardMergeChoice[row.match.id] ?? "merge";
      if (c === "new") {
        addAsNewIndex.add(row.pendingIndex);
      } else {
        matchByIndex.set(row.pendingIndex, row.match);
      }
    }
    return pendingReview.people.map((person, idx) => {
      if (addAsNewIndex.has(idx)) {
        return { ...person };
      }
      const m = matchByIndex.get(idx);
      if (m) {
        return {
          ...person,
          existingPersonId: m.id,
        };
      }
      return { ...person };
    });
  }, [pendingReview, peopleWithMatches, cardMergeChoice]);

  function setFieldMergePick(
    matchId: string,
    field: MergeField,
    pick: FieldMergePick
  ) {
    setFieldMergeChoices((prev) => ({
      ...prev,
      [matchId]: { ...prev[matchId], [field]: pick },
    }));
  }

  async function handleAddToTree() {
    if (!pendingReview || submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/save-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          recordId: pendingReview.recordId,
          pendingPersons: pendingPersonsPayload,
          mergeDecisions: mergeDecisionsPayload,
        }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !data.success) {
        setSubmitError(data.error ?? "Request failed.");
        return;
      }
      try {
        localStorage.removeItem(PENDING_REVIEW_KEY);
      } catch {
        // still redirect
      }
      const dest =
        pendingReview.returnTreeId &&
        pendingReview.returnTreeId.trim() !== ""
          ? `/dashboard/${pendingReview.returnTreeId.trim()}`
          : "/dashboard";
      router.push(dest);
    } catch {
      setSubmitError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function setDuplicateCardMode(matchPersonId: string, mode: DuplicateCardMode) {
    setCardMergeChoice((prev) => ({ ...prev, [matchPersonId]: mode }));
  }

  function handleManualMatch(pendingIndex: number, selectedPerson: DbPerson) {
    const entry = newPeople.find((p) => p.pendingIndex === pendingIndex);
    if (!entry) return;

    // Move from newPeople to peopleWithMatches
    setNewPeople((prev) => prev.filter((p) => p.pendingIndex !== pendingIndex));
    setPeopleWithMatches((prev) => [
      ...prev,
      { pendingIndex: entry.pendingIndex, pending: entry.pending, match: selectedPerson },
    ]);

    // Initialize card and field merge choices
    setCardMergeChoice((prev) => ({ ...prev, [selectedPerson.id]: "merge" }));
    const perField: Partial<Record<MergeField, FieldMergePick>> = {};
    for (const field of MERGE_FIELDS) {
      if (fieldRowNeedsChoice(entry.pending, selectedPerson, field)) {
        perField[field] = "existing";
      }
    }
    if (Object.keys(perField).length > 0) {
      setFieldMergeChoices((prev) => ({ ...prev, [selectedPerson.id]: perField }));
    }

    // Close modal
    setManualMatchModalIndex(null);
    setManualMatchSearch("");
  }

  if (loadState === "unauthorized") {
    return null;
  }

  if (loadState === "loading") {
    return (
      <div
        className="min-h-screen px-4 py-12"
        style={{ backgroundColor: "var(--dg-bg-main)" }}
      >
        <div className="mx-auto max-w-4xl">
          <p className="text-sm" style={{ color: "var(--dg-brown-muted)" }}>
            Loading…
          </p>
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div
        className="min-h-screen px-4 py-12"
        style={{ backgroundColor: "var(--dg-bg-main)" }}
      >
        <div className="mx-auto max-w-4xl">
          <h1
            className="text-2xl font-semibold"
            style={{ color: "var(--dg-brown-dark)" }}
          >
            Review your records
          </h1>
          <p className="mt-4 text-sm text-red-600">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative min-h-screen px-4 py-12"
      style={{ backgroundColor: "var(--dg-bg-main)" }}
    >
      {submitting ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-[1px]"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="status"
          aria-live="polite"
        >
          <div
            className="rounded-xl border px-8 py-6 shadow-lg"
            style={{
              backgroundColor: "var(--dg-cream)",
              borderColor: "var(--dg-brown-border)",
            }}
          >
            <p
              className="text-base font-medium"
              style={{ color: "var(--dg-brown-dark)" }}
            >
              Adding to your tree…
            </p>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-5xl space-y-10">
        <header>
          <h1
            className="text-2xl font-semibold tracking-tight"
            style={{ color: "var(--dg-brown-dark)" }}
          >
            Review your records
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--dg-brown-muted)" }}>
            Compare extracted people with your tree. For each suggested duplicate,
            choose whether to keep your existing record, update it from this
            document, or add the extracted person as someone new if they are not
            the same individual—then add everything in one step.
          </p>
        </header>

        {submitError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {submitError}
          </p>
        ) : null}

        {peopleWithMatches.length > 0 ? (
          <section className="space-y-6">
            <h2
              className="text-sm font-semibold uppercase tracking-wide"
              style={{ color: "var(--dg-brown-muted)" }}
            >
              Possible duplicates
            </h2>
            {peopleWithMatches.map(
              ({ pending, match, pendingIndex }) => {
                const cardMode = cardMergeChoice[match.id] ?? "merge";
                const addAsNew = cardMode === "new";
                return (
                <article
                  key={`${pendingIndex}-${match.id}`}
                  className="overflow-hidden rounded-xl border shadow-sm"
                  style={{
                    backgroundColor: "var(--dg-cream)",
                    borderColor: "var(--dg-brown-border)",
                  }}
                >
                  <div
                    className="border-b px-4 py-3"
                    style={{
                      borderBottomColor: "var(--dg-brown-border)",
                      backgroundColor: "var(--dg-parchment)",
                    }}
                  >
                    <p
                      className="text-xs font-medium uppercase tracking-wide"
                      style={{ color: "var(--dg-brown-muted)" }}
                    >
                      Match suggestion
                    </p>
                    {!addAsNew ? (
                      <div
                        className="mt-1 grid grid-cols-2 gap-4 text-left text-sm"
                        style={{
                          color: "var(--dg-brown-muted)",
                          gridTemplateColumns: "1fr 1fr",
                        }}
                      >
                        <p className="min-w-0">
                          Record:{" "}
                          <span
                            className="font-medium"
                            style={{ color: "var(--dg-brown-dark)" }}
                          >
                            {fullNameFromPending(pending)}
                          </span>
                        </p>
                        <p className="min-w-0">
                          Tree:{" "}
                          <span
                            className="font-medium"
                            style={{ color: "var(--dg-brown-dark)" }}
                          >
                            {fullNameFromDbPerson(match)}
                          </span>
                        </p>
                      </div>
                    ) : (
                      <p
                        className="mt-1 text-sm"
                        style={{ color: "var(--dg-brown-muted)" }}
                      >
                        Record:{" "}
                        <span
                          className="font-medium"
                          style={{ color: "var(--dg-brown-dark)" }}
                        >
                          {fullNameFromPending(pending)}
                        </span>
                        <span
                          className="ml-2 text-xs font-normal"
                          style={{ color: "var(--dg-brown-muted)" }}
                        >
                          (adding as new person — tree match ignored)
                        </span>
                      </p>
                    )}
                  </div>

                  <div
                    className={`space-y-1 p-4 ${addAsNew ? "opacity-40" : ""}`}
                  >
                    <div
                      className={`mb-3 grid gap-4 border-b pb-2 text-left text-xs font-semibold uppercase tracking-wide ${
                        addAsNew ? "grid-cols-1" : "grid-cols-2"
                      }`}
                      style={{
                        borderBottomColor: "var(--dg-brown-border)",
                        gridTemplateColumns: addAsNew ? undefined : "1fr 1fr",
                      }}
                    >
                      <span className="min-w-0 text-left text-emerald-700">
                        {addAsNew
                          ? "From record (will be added as new)"
                          : "From record"}
                      </span>
                      {!addAsNew ? (
                        <span
                          className="min-w-0 text-left"
                          style={{ color: "var(--dg-brown-muted)" }}
                        >
                          In your tree
                        </span>
                      ) : null}
                    </div>
                    {COMPARISON_FIELDS.map((field) => {
                      const { record: rv, tree: tv } = displayValue(
                        pending,
                        match,
                        field
                      );
                      const needsChoice = fieldRowNeedsChoice(
                        pending,
                        match,
                        field
                      );
                      const pick =
                        fieldMergeChoices[match.id]?.[field] ?? "existing";
                      return (
                        <div
                          key={field}
                          className="border-b py-3 last:border-b-0"
                          style={{ borderBottomColor: "var(--dg-brown-border)" }}
                        >
                          <p
                            className="text-xs font-medium"
                            style={{ color: "var(--dg-brown-muted)" }}
                          >
                            {labelForField(field)}
                          </p>
                          <div
                            className={`mt-1 grid gap-4 text-left text-sm ${
                              addAsNew ? "grid-cols-1" : "grid-cols-2"
                            }`}
                            style={
                              addAsNew
                                ? undefined
                                : { gridTemplateColumns: "1fr 1fr" }
                            }
                          >
                            <p
                              className="min-w-0 text-left"
                              style={{ color: "var(--dg-brown-dark)" }}
                            >
                              {rv}
                            </p>
                            {!addAsNew ? (
                              <p
                                className="min-w-0 text-left"
                                style={{ color: "var(--dg-brown-dark)" }}
                              >
                                {tv}
                              </p>
                            ) : null}
                          </div>
                          {needsChoice && !addAsNew ? (
                            <div
                              className="mt-2 grid grid-cols-2 gap-4 text-left text-xs"
                              style={{ gridTemplateColumns: "1fr 1fr" }}
                            >
                              <label
                                className="flex min-w-0 cursor-pointer items-center justify-start gap-2"
                                style={{ color: "var(--dg-brown-dark)" }}
                              >
                                <input
                                  type="radio"
                                  name={`fld-${match.id}-${field}`}
                                  checked={pick === "record"}
                                  onChange={() =>
                                    setFieldMergePick(match.id, field, "record")
                                  }
                                  className="shrink-0 text-emerald-600"
                                />
                                Use from record
                              </label>
                              <label
                                className="flex min-w-0 cursor-pointer items-center justify-start gap-2"
                                style={{ color: "var(--dg-brown-dark)" }}
                              >
                                <input
                                  type="radio"
                                  name={`fld-${match.id}-${field}`}
                                  checked={pick === "existing"}
                                  onChange={() =>
                                    setFieldMergePick(
                                      match.id,
                                      field,
                                      "existing"
                                    )
                                  }
                                  className="shrink-0 text-emerald-600"
                                />
                                Keep from tree
                              </label>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  <div
                    className="border-t px-4 py-4"
                    style={{
                      borderTopColor: "var(--dg-brown-border)",
                      backgroundColor: "var(--dg-parchment)",
                    }}
                  >
                    <p
                      className="mb-3 text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "var(--dg-brown-muted)" }}
                    >
                      Merge decision
                    </p>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-3">
                        <label
                          className="flex cursor-pointer items-center gap-2 text-sm"
                          style={{ color: "var(--dg-brown-dark)" }}
                        >
                          <input
                            type="radio"
                            name={`dup-card-${match.id}`}
                            checked={cardMode === "merge"}
                            onChange={() =>
                              setDuplicateCardMode(match.id, "merge")
                            }
                            className="text-emerald-600"
                          />
                          Merge with tree match (use field choices above)
                        </label>
                      </div>
                      <div
                        className="border-t pt-4"
                        style={{ borderTopColor: "var(--dg-brown-border)" }}
                      >
                        <label
                          className="flex cursor-pointer items-start gap-2 text-sm"
                          style={{ color: "var(--dg-brown-muted)" }}
                        >
                          <input
                            type="radio"
                            name={`dup-card-${match.id}`}
                            checked={cardMode === "new"}
                            onChange={() =>
                              setDuplicateCardMode(match.id, "new")
                            }
                            className="mt-0.5 text-emerald-600"
                          />
                          <span>
                            <span
                              className="font-medium"
                              style={{ color: "var(--dg-brown-dark)" }}
                            >
                              These are different people — add as new person to
                              my tree
                            </span>
                            <span
                              className="mt-0.5 block text-xs font-normal"
                              style={{ color: "var(--dg-brown-muted)" }}
                            >
                              The suggested tree match will not be changed. Only
                              the data from the record will be saved as a new
                              person.
                            </span>
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>
                </article>
              );
              }
            )}
          </section>
        ) : null}

        {newPeople.length > 0 ? (
          <section className="space-y-4">
            <h2
              className="text-sm font-semibold uppercase tracking-wide"
              style={{ color: "var(--dg-brown-muted)" }}
            >
              New people
            </h2>
            <ul className="space-y-3">
              {newPeople.map(({ pending, pendingIndex }) => (
                <li
                  key={pendingIndex}
                  className={newPersonCardClass}
                  style={newPersonCardStyle}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p
                        className="font-medium truncate"
                        style={{ color: "var(--dg-brown-dark)" }}
                      >
                        {fullNameFromPending(pending)}
                      </p>
                      <span
                        className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                        style={{
                          backgroundColor: "var(--dg-parchment)",
                          color: "var(--dg-brown-muted)",
                          border: "1px solid var(--dg-brown-border)",
                        }}
                      >
                        New to tree
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setManualMatchModalIndex(pendingIndex);
                        setManualMatchSearch("");
                      }}
                      className="shrink-0 rounded border px-3 py-1.5 text-xs font-medium transition hover:border-[var(--dg-brown-outline)] hover:text-[var(--dg-brown-dark)]"
                      style={{
                        borderColor: "var(--dg-brown-border)",
                        backgroundColor: "transparent",
                        color: "var(--dg-brown-muted)",
                        cursor: "pointer",
                      }}
                    >
                      This is an existing person
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {peopleWithMatches.length === 0 && newPeople.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--dg-brown-muted)" }}>
            No people in this review. Go back to step 1 and include at least one
            person.
          </p>
        ) : null}

        <div
          className="border-t pt-8"
          style={{ borderTopColor: "var(--dg-brown-border)" }}
        >
          <button
            type="button"
            onClick={() => void handleAddToTree()}
            disabled={
              submitting ||
              !pendingReview ||
              (peopleWithMatches.length === 0 && newPeople.length === 0)
            }
            className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add to my tree
          </button>
        </div>
      </div>

      {manualMatchModalIndex !== null ? (() => {
        const modalPendingIndex = manualMatchModalIndex!;
        const filtered = treePeople.filter((p) => {
          const q = manualMatchSearch.trim().toLowerCase();
          if (!q) return true;
          const full = [p.first_name, p.middle_name, p.last_name]
            .map((x) => (x ?? "").trim())
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return full.includes(q);
        });

        return (
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
            onClick={() => {
              setManualMatchModalIndex(null);
              setManualMatchSearch("");
            }}
          >
            <div
              className="w-full max-w-md rounded-lg border p-6 shadow-xl"
              style={{
                backgroundColor: "var(--dg-parchment)",
                borderColor: "var(--dg-brown-border)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                className="mb-4 text-lg font-bold"
                style={{ fontFamily: "var(--font-dg-display), 'Playfair Display', Georgia, serif", color: "var(--dg-brown-dark)" }}
              >
                Find existing person
              </h2>
              <input
                type="text"
                autoFocus
                placeholder="Search by name…"
                value={manualMatchSearch}
                onChange={(e) => setManualMatchSearch(e.target.value)}
                className="mb-4 w-full rounded border px-3 py-2 text-sm"
                style={{
                  backgroundColor: "var(--dg-cream)",
                  borderColor: "var(--dg-brown-border)",
                  color: "var(--dg-brown-dark)",
                  outline: "none",
                }}
              />
              {filtered.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--dg-brown-muted)" }}>
                  No people found.
                </p>
              ) : (
                <ul className="max-h-64 space-y-2 overflow-y-auto">
                  {filtered.map((person) => (
                    <li key={person.id}>
                      <button
                        type="button"
                        onClick={() => handleManualMatch(modalPendingIndex, person)}
                        className="w-full rounded-lg border px-3 py-2 text-left text-sm transition hover:border-[var(--dg-brown-outline)]"
                        style={{
                          backgroundColor: "var(--dg-cream)",
                          borderColor: "var(--dg-brown-border)",
                          color: "var(--dg-brown-dark)",
                        }}
                      >
                        <span className="font-medium">{fullNameFromDbPerson(person)}</span>
                        {person.birth_date ? (
                          <span className="ml-2 text-xs" style={{ color: "var(--dg-brown-muted)" }}>
                            b. {person.birth_date}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => {
                  setManualMatchModalIndex(null);
                  setManualMatchSearch("");
                }}
                className="mt-4 text-xs underline-offset-2 hover:underline"
                style={{ color: "var(--dg-brown-muted)", background: "none", border: "none", cursor: "pointer" }}
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })() : null}
    </div>
  );
}
