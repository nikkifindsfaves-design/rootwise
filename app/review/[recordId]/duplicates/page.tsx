"use client";

import { createClient } from "@/lib/supabase/client";
import type { PendingReviewPayload } from "../review-record-client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const PENDING_REVIEW_KEY = "pendingReview";

const MERGE_FIELDS = [
  "first_name",
  "middle_name",
  "last_name",
  "birth_date",
  "death_date",
  "gender",
  "notes",
] as const;

type MergeField = (typeof MERGE_FIELDS)[number];

type DbPerson = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  birth_date: string | null;
  death_date: string | null;
  gender: string | null;
  notes: string | null;
};

type PendingPerson = PendingReviewPayload["people"][number];

type PersonWithMatch = {
  pendingIndex: number;
  pending: PendingPerson;
  match: DbPerson;
};

type FieldChoice = "existing" | "record" | "new";

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
              : field === "gender"
                ? fieldStr(existing.gender)
                : fieldStr(existing.notes);

  return { record: r || "—", tree: e || "—" };
}

/** One card-level choice applies to every merge field for the API (merge path only). */
function fieldChoicesForCard(
  mode: "existing" | "record"
): Record<string, "existing" | "record"> {
  const out: Record<string, "existing" | "record"> = {};
  for (const field of MERGE_FIELDS) {
    out[field] = mode;
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

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600";

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
  /** Per matched tree person: keep DB as-is vs overwrite from the record. */
  const [cardMergeChoice, setCardMergeChoice] = useState<
    Record<string, FieldChoice>
  >({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

      const payload: PendingReviewPayload = {
        recordId: pr.recordId,
        recordTypeLabel:
          typeof pr.recordTypeLabel === "string" ? pr.recordTypeLabel : "",
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

      const { data: persons, error: personsError } = await supabase
        .from("persons")
        .select(
          "id, first_name, middle_name, last_name, birth_date, death_date, gender, notes"
        )
        .eq("user_id", user.id);

      if (cancelled) return;

      if (personsError) {
        setLoadError(personsError.message);
        setLoadState("error");
        return;
      }

      const tree = (persons ?? []) as DbPerson[];
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

      const initialMerge: Record<string, FieldChoice> = {};
      for (const row of withMatches) {
        initialMerge[row.match.id] = "existing";
      }

      if (cancelled) return;

      setPendingReview(payload);
      setPeopleWithMatches(withMatches);
      setNewPeople(fresh);
      setCardMergeChoice(initialMerge);
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
      .filter(({ match }) => {
        const c = cardMergeChoice[match.id] ?? "existing";
        return c === "existing" || c === "record";
      })
      .map(({ match }) => ({
        existingPersonId: match.id,
        fieldChoices: fieldChoicesForCard(
          (cardMergeChoice[match.id] ?? "existing") as "existing" | "record"
        ),
      }));
  }, [pendingReview, peopleWithMatches, cardMergeChoice]);

  const pendingPersonsPayload = useMemo(() => {
    if (!pendingReview) return [];
    const matchByIndex = new Map<number, DbPerson>();
    const addAsNewIndex = new Set<number>();
    for (const row of peopleWithMatches) {
      const c = cardMergeChoice[row.match.id] ?? "existing";
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
      router.push("/dashboard");
    } catch {
      setSubmitError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function setCardMergeChoiceForPerson(
    matchPersonId: string,
    choice: FieldChoice
  ) {
    setCardMergeChoice((prev) => ({ ...prev, [matchPersonId]: choice }));
  }

  if (loadState === "unauthorized") {
    return null;
  }

  if (loadState === "loading") {
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm text-zinc-600">Loading…</p>
        </div>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="min-h-screen bg-zinc-50 px-4 py-12">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-2xl font-semibold text-zinc-900">
            Review your records
          </h1>
          <p className="mt-4 text-sm text-red-600">{loadError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-zinc-50 px-4 py-12">
      {submitting ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/50 backdrop-blur-[1px]"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-xl border border-zinc-200 bg-white px-8 py-6 shadow-lg">
            <p className="text-base font-medium text-zinc-900">
              Adding to your tree…
            </p>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-5xl space-y-10">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Review your records
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
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
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              Possible duplicates
            </h2>
            {peopleWithMatches.map(
              ({ pending, match, pendingIndex }) => {
                const cardChoice = cardMergeChoice[match.id] ?? "existing";
                const addAsNew = cardChoice === "new";
                return (
                <article
                  key={`${pendingIndex}-${match.id}`}
                  className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm"
                >
                  <div className="border-b border-zinc-100 bg-zinc-50/80 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Match suggestion
                    </p>
                    <p className="mt-1 text-sm text-zinc-800">
                      Record:{" "}
                      <span className="font-medium">
                        {fullNameFromPending(pending)}
                      </span>
                      {!addAsNew ? (
                        <>
                          <span className="mx-2 text-zinc-300">·</span>
                          Tree:{" "}
                          <span className="font-medium">
                            {fullNameFromDbPerson(match)}
                          </span>
                        </>
                      ) : (
                        <span className="ml-2 text-xs font-normal text-zinc-500">
                          (adding as new person — tree match ignored)
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="space-y-1 p-4">
                    <div
                      className={`mb-3 grid gap-4 border-b border-zinc-100 pb-2 text-xs font-semibold uppercase tracking-wide ${
                        addAsNew ? "grid-cols-1" : "grid-cols-2"
                      }`}
                    >
                      <span className="text-emerald-700">
                        {addAsNew
                          ? "From record (will be added as new)"
                          : "From record"}
                      </span>
                      {!addAsNew ? (
                        <span className="text-zinc-600">In your tree</span>
                      ) : null}
                    </div>
                    {MERGE_FIELDS.map((field) => {
                      const { record: rv, tree: tv } = displayValue(
                        pending,
                        match,
                        field
                      );
                      return (
                        <div
                          key={field}
                          className="border-b border-zinc-50 py-3 last:border-b-0"
                        >
                          <p className="text-xs font-medium text-zinc-500">
                            {labelForField(field)}
                          </p>
                          <div
                            className={`mt-1 grid gap-4 text-sm ${
                              addAsNew ? "grid-cols-1" : "grid-cols-2"
                            }`}
                          >
                            <p className="text-zinc-900">{rv}</p>
                            {!addAsNew ? (
                              <p className="text-zinc-900">{tv}</p>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t border-zinc-200 bg-zinc-50/60 px-4 py-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                      Merge decision
                    </p>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-8">
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
                          <input
                            type="radio"
                            name={`merge-card-${match.id}`}
                            checked={cardChoice === "record"}
                            onChange={() =>
                              setCardMergeChoiceForPerson(match.id, "record")
                            }
                            className="text-emerald-600"
                          />
                          Use from record
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
                          <input
                            type="radio"
                            name={`merge-card-${match.id}`}
                            checked={cardChoice === "existing"}
                            onChange={() =>
                              setCardMergeChoiceForPerson(match.id, "existing")
                            }
                            className="text-emerald-600"
                          />
                          Keep from tree
                        </label>
                      </div>
                      <div className="border-t border-zinc-200/90 pt-4">
                        <label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-700">
                          <input
                            type="radio"
                            name={`merge-card-${match.id}`}
                            checked={cardChoice === "new"}
                            onChange={() =>
                              setCardMergeChoiceForPerson(match.id, "new")
                            }
                            className="mt-0.5 text-emerald-600"
                          />
                          <span>
                            <span className="font-medium text-zinc-900">
                              These are different people — add as new person to
                              my tree
                            </span>
                            <span className="mt-0.5 block text-xs font-normal text-zinc-500">
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
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
              New people
            </h2>
            <ul className="space-y-3">
              {newPeople.map(({ pending, pendingIndex }) => (
                <li
                  key={pendingIndex}
                  className={`${inputClass} border-zinc-200 bg-white text-zinc-800`}
                >
                  <p className="font-medium text-zinc-900">
                    {fullNameFromPending(pending)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Will be added as new person
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {peopleWithMatches.length === 0 && newPeople.length === 0 ? (
          <p className="text-sm text-zinc-600">
            No people in this review. Go back to step 1 and include at least one
            person.
          </p>
        ) : null}

        <div className="border-t border-zinc-200 pt-8">
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
    </div>
  );
}
