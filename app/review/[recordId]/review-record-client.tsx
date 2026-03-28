"use client";

import { formatDateString } from "@/lib/utils/dates";
import { useRouter } from "next/navigation";
import { useMemo, useState, type MouseEvent } from "react";

type AiPerson = {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  gender?: string | null;
  notes?: string | null;
};

type AiEvent = {
  person_name?: string | null;
  event_type?: string | null;
  event_date?: string | null;
  event_place?: string | null;
  description?: string | null;
  story_short?: string | null;
  story_full?: string | null;
};

type AiRelationship = {
  person_a?: string | null;
  person_b?: string | null;
  relationship_type?: string | null;
};

type AiResponseShape = {
  record_type?: string;
  people?: AiPerson[];
  events?: AiEvent[];
  relationships?: AiRelationship[];
};

const RELATIONSHIP_OPTIONS = [
  "parent",
  "child",
  "spouse",
  "sibling",
  "grandparent",
  "grandchild",
  "aunt/uncle",
  "niece/nephew",
  "other",
] as const;

const EVENT_TYPE_OPTIONS = [
  "birth",
  "death",
  "marriage",
  "census appearance",
  "military service",
  "immigration",
  "land record",
  "court record",
  "other",
] as const;

type RelOption = (typeof RELATIONSHIP_OPTIONS)[number];
type EvOption = (typeof EVENT_TYPE_OPTIONS)[number];

type PersonForm = {
  first_name: string;
  middle_name: string;
  last_name: string;
  birth_date: string;
  death_date: string;
  gender: string;
  notes: string;
};

type RelationshipRow = {
  key: string;
  /** From AI: related name is read-only. User-added: editable text field. */
  fromExtracted: boolean;
  /**
   * Index of the related person in the current `cards` array when they are
   * another extracted person in this review. Null for external/tree-only names
   * or user-typed relationships.
   */
  relatedPeerIndex: number | null;
  /** Static name when `relatedPeerIndex` is null (not in this review set). */
  relatedNameExternal: string;
  relationshipType: RelOption;
};

type EventRow = {
  key: string;
  eventType: EvOption;
  eventDate: string;
  eventPlace: string;
  /** From AI `description`; saved to DB as `events.notes`. */
  eventNotes: string;
  eventStoryShort: string;
  eventStoryFull: string;
};

type PersonCardState = {
  key: string;
  include: boolean;
  form: PersonForm;
  relationships: RelationshipRow[];
  events: EventRow[];
};

/** Stored for step 2 (duplicates) — matches checked cards only. */
export type PendingReviewPayload = {
  recordId: string;
  recordTypeLabel: string;
  people: Array<{
    first_name: string;
    middle_name: string | null;
    last_name: string;
    birth_date: string | null;
    death_date: string | null;
    gender: string | null;
    notes: string | null;
    relationships: Array<{
      related_name: string;
      relationship_type: string;
    }>;
    events: Array<{
      event_type: string;
      event_date: string | null;
      event_place: string | null;
      notes: string | null;
      story_short: string | null;
      story_full: string | null;
    }>;
  }>;
};

const PENDING_REVIEW_KEY = "pendingReview";

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function namesMatch(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

function fullNameFromForm(f: PersonForm): string {
  return [f.first_name, f.middle_name, f.last_name]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/** Display in relationship rows for in-review peers (first + last only). */
function displayFirstLastFromForm(f: PersonForm): string {
  const first = f.first_name.trim();
  const last = f.last_name.trim();
  if (first && last) return `${first} ${last}`;
  if (first) return first;
  if (last) return last;
  return "—";
}

function resolveRelationshipExportName(
  rel: RelationshipRow,
  allCards: PersonCardState[]
): string {
  if (rel.relatedPeerIndex != null) {
    const peer = allCards[rel.relatedPeerIndex];
    if (peer) return fullNameFromForm(peer.form).trim();
  }
  return rel.relatedNameExternal.trim();
}

function relatedPersonDisplayLabel(
  rel: RelationshipRow,
  allCards: PersonCardState[]
): string {
  if (rel.relatedPeerIndex != null) {
    const peer = allCards[rel.relatedPeerIndex];
    if (peer) return displayFirstLastFromForm(peer.form);
  }
  return rel.relatedNameExternal || "—";
}

/**
 * Must match <select> option values exactly: Male, Female, Unknown.
 * AI often returns lowercase or synonyms; normalize so the dropdown is controlled
 * correctly and localStorage matches what the user sees.
 */
function normalizeGenderForPendingReview(
  raw: string | null | undefined
): "Male" | "Female" | "Unknown" {
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

function toForm(p: AiPerson): PersonForm {
  return {
    first_name: p.first_name ?? "",
    middle_name: p.middle_name ?? "",
    last_name: p.last_name ?? "",
    birth_date: formatDateString(p.birth_date ?? ""),
    death_date: formatDateString(p.death_date ?? ""),
    gender: normalizeGenderForPendingReview(p.gender),
    notes: p.notes ?? "",
  };
}

function normalizeRelationshipType(raw: string): RelOption {
  const n = raw.trim().toLowerCase();
  if (RELATIONSHIP_OPTIONS.includes(n as RelOption)) return n as RelOption;
  if (n.includes("spouse")) return "spouse";
  if (n === "parent" || n.includes("father") || n.includes("mother"))
    return "parent";
  if (n === "child" || n.includes("son") || n.includes("daughter"))
    return "child";
  if (n.includes("sibling")) return "sibling";
  if (n.includes("grandparent") || n.includes("grandfather"))
    return "grandparent";
  if (n.includes("grandchild")) return "grandchild";
  if (n.includes("aunt") || n.includes("uncle")) return "aunt/uncle";
  if (n.includes("niece") || n.includes("nephew")) return "niece/nephew";
  return "other";
}

function perspectiveWhenPersonIsA(claudeType: string): RelOption {
  const n = claudeType.trim().toLowerCase();
  if (n.includes("spouse")) return "spouse";
  return normalizeRelationshipType(claudeType);
}

function perspectiveWhenPersonIsB(claudeType: string): RelOption {
  const n = claudeType.trim().toLowerCase();
  if (n.includes("spouse")) return "spouse";
  if (n === "parent") return "child";
  if (n === "child") return "parent";
  if (n.includes("grandparent") || n === "grandparent") return "grandchild";
  if (n.includes("grandchild") || n === "grandchild") return "grandparent";
  if (n.includes("aunt") || n.includes("uncle")) return "niece/nephew";
  if (n.includes("niece") || n.includes("nephew")) return "aunt/uncle";
  return normalizeRelationshipType(claudeType);
}

function relationshipRowForPerson(
  rel: AiRelationship,
  myName: string
): { relatedName: string; relType: RelOption } | null {
  const pa = String(rel.person_a ?? "").trim();
  const pb = String(rel.person_b ?? "").trim();
  const rt = String(rel.relationship_type ?? "");
  if (!pa || !pb) return null;

  if (namesMatch(myName, pa)) {
    return { relatedName: pb, relType: perspectiveWhenPersonIsA(rt) };
  }
  if (namesMatch(myName, pb)) {
    return { relatedName: pa, relType: perspectiveWhenPersonIsB(rt) };
  }
  return null;
}

function normalizeEventType(raw: string): EvOption {
  const n = raw.trim().toLowerCase();
  if (EVENT_TYPE_OPTIONS.includes(n as EvOption)) return n as EvOption;
  if (n.includes("birth")) return "birth";
  if (n.includes("death")) return "death";
  if (n.includes("marriage") || n.includes("married")) return "marriage";
  if (n.includes("census")) return "census appearance";
  if (n.includes("military")) return "military service";
  if (n.includes("immigration") || n.includes("immigrat")) return "immigration";
  if (n.includes("land")) return "land record";
  if (n.includes("court")) return "court record";
  return "other";
}

function newKey(prefix: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random()}`;
}

function buildInitialCards(parsed: AiResponseShape): PersonCardState[] {
  const people = parsed.people ?? [];
  const rels = parsed.relationships ?? [];
  const evs = parsed.events ?? [];

  return people.map((p, personIndex) => {
    const form = toForm(p);
    const myName = fullNameFromForm(form);

    const relationships: RelationshipRow[] = [];
    for (const r of rels) {
      const row = relationshipRowForPerson(r, myName);
      if (row) {
        let relatedPeerIndex: number | null = null;
        for (let j = 0; j < people.length; j++) {
          if (j === personIndex) continue;
          const otherName = fullNameFromForm(toForm(people[j]!));
          if (namesMatch(otherName, row.relatedName)) {
            relatedPeerIndex = j;
            break;
          }
        }
        relationships.push({
          key: newKey("rel"),
          fromExtracted: true,
          relatedPeerIndex,
          relatedNameExternal:
            relatedPeerIndex === null ? row.relatedName : "",
          relationshipType: row.relType,
        });
      }
    }

    const events: EventRow[] = [];
    for (const e of evs) {
      const pn = String(e.person_name ?? "").trim();
      if (namesMatch(pn, myName)) {
        events.push({
          key: newKey("ev"),
          eventType: normalizeEventType(String(e.event_type ?? "other")),
          eventDate: formatDateString(e.event_date ?? ""),
          eventPlace: e.event_place ?? "",
          eventNotes: (e.description ?? "").trim(),
          eventStoryShort: (e.story_short ?? "").trim(),
          eventStoryFull: (e.story_full ?? "").trim(),
        });
      }
    }

    return {
      key: newKey("p"),
      include: true,
      form,
      relationships,
      events,
    };
  });
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

function ZoomableDocumentImage({ src, alt }: { src: string; alt: string }) {
  const [scale, setScale] = useState(ZOOM_MIN);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  const atMin = scale <= ZOOM_MIN + 0.001;
  const atMax = scale >= ZOOM_MAX - 0.001;

  function zoomIn() {
    setScale((s) => Math.min(ZOOM_MAX, s + ZOOM_STEP));
  }

  function zoomOut() {
    setScale((s) => {
      const next = Math.max(ZOOM_MIN, s - ZOOM_STEP);
      if (next <= ZOOM_MIN + 0.001) setPan({ x: 0, y: 0 });
      return next;
    });
  }

  function resetZoom() {
    setScale(ZOOM_MIN);
    setPan({ x: 0, y: 0 });
  }

  function handleMouseDown(e: MouseEvent<HTMLDivElement>) {
    if (scale <= ZOOM_MIN + 0.001) return;
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const panStart = { ...pan };
    setDragging(true);

    function onMove(ev: globalThis.MouseEvent) {
      setPan({
        x: panStart.x + (ev.clientX - startX),
        y: panStart.y + (ev.clientY - startY),
      });
    }

    function onUp() {
      setDragging(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-col rounded-lg border border-zinc-200 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 px-3 py-2">
        <button
          type="button"
          onClick={zoomOut}
          disabled={atMin}
          aria-label="Zoom out"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 bg-zinc-50 text-base font-semibold text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          −
        </button>
        <button
          type="button"
          onClick={zoomIn}
          disabled={atMax}
          aria-label="Zoom in"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-300 bg-zinc-50 text-base font-semibold text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
        <button
          type="button"
          onClick={resetZoom}
          disabled={atMin && pan.x === 0 && pan.y === 0}
          className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Reset zoom
        </button>
        <span className="text-xs text-zinc-500">{Math.round(scale * 100)}%</span>
      </div>
      <div
        className="relative h-[min(70vh,720px)] min-h-[240px] w-full touch-none overflow-hidden bg-zinc-100"
        onMouseDown={handleMouseDown}
        style={{
          cursor:
            scale > ZOOM_MIN + 0.001
              ? dragging
                ? "grabbing"
                : "grab"
              : "default",
        }}
      >
        <div className="flex h-full w-full items-center justify-center p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="max-h-full max-w-full object-contain select-none"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: "center center",
            }}
          />
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600";

const textareaClass = `${inputClass} min-h-[5rem] resize-y`;

const labelClass = "mb-1 block text-xs font-medium text-zinc-600";

export default function ReviewRecordClient({
  recordId,
  signedDocumentUrl,
  fileType,
  recordTypeLabel,
  aiResponse,
}: {
  recordId: string;
  signedDocumentUrl: string | null;
  fileType: string | null;
  recordTypeLabel: string;
  aiResponse: unknown;
}) {
  const router = useRouter();
  const parsed = useMemo(() => {
    const r = aiResponse as AiResponseShape;
    return {
      people: Array.isArray(r?.people) ? r.people : [],
      relationships: Array.isArray(r?.relationships) ? r.relationships : [],
      events: Array.isArray(r?.events) ? r.events : [],
    };
  }, [aiResponse]);

  const [cards, setCards] = useState<PersonCardState[]>(() =>
    buildInitialCards(parsed as AiResponseShape)
  );

  const ft = (fileType ?? "").toLowerCase();
  const isImage = ft.startsWith("image/");

  function updateCard(key: string, next: PersonCardState) {
    setCards((prev) => prev.map((c) => (c.key === key ? next : c)));
  }

  function handleContinue() {
    const checked = cards.filter((c) => c.include);
    const payload: PendingReviewPayload = {
      recordId,
      recordTypeLabel,
      people: checked.map((c) => ({
        first_name: c.form.first_name.trim(),
        middle_name: c.form.middle_name.trim() || null,
        last_name: c.form.last_name.trim(),
        birth_date: c.form.birth_date.trim() || null,
        death_date: c.form.death_date.trim() || null,
        gender: normalizeGenderForPendingReview(c.form.gender),
        notes: c.form.notes.trim() || null,
        relationships: c.relationships
          .map((r) => ({
            related_name: resolveRelationshipExportName(r, cards),
            relationship_type: r.relationshipType,
          }))
          .filter((r) => r.related_name !== ""),
        events: c.events.map((e) => ({
          event_type: e.eventType,
          event_date: e.eventDate.trim() || null,
          event_place: e.eventPlace.trim() || null,
          notes: e.eventNotes.trim() || null,
          story_short: e.eventStoryShort.trim() || null,
          story_full: e.eventStoryFull.trim() || null,
        })),
      })),
    };

    console.log(
      "[review step1] pendingReview before localStorage:",
      JSON.parse(JSON.stringify(payload))
    );

    try {
      localStorage.setItem(PENDING_REVIEW_KEY, JSON.stringify(payload));
    } catch {
      // still navigate; step 2 may show empty if storage blocked
    }
    router.push(`/review/${recordId}/duplicates`);
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <header className="mb-8 border-b border-zinc-200 pb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Step 1 of 3 · Review extraction
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
            Edit extracted people
          </h1>
          <p className="mt-2 text-sm text-zinc-600">
            <span className="font-medium text-zinc-800">Record type:</span>{" "}
            {recordTypeLabel}
            <span className="mx-2 text-zinc-300">·</span>
            <span className="font-medium text-zinc-800">ID:</span> {recordId}
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-900">Document</h2>
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              {signedDocumentUrl ? (
                isImage ? (
                  <ZoomableDocumentImage
                    src={signedDocumentUrl}
                    alt="Uploaded record"
                  />
                ) : (
                  <div className="flex flex-col">
                    <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
                      Preview (no zoom for this file type)
                    </div>
                    <iframe
                      title="Document preview"
                      src={signedDocumentUrl}
                      className="h-[min(70vh,720px)] min-h-[240px] w-full bg-white"
                    />
                  </div>
                )
              ) : (
                <p className="p-6 text-sm text-amber-900">
                  Could not load a signed URL for this document. Check storage
                  and bucket configuration.
                </p>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-zinc-900">
              People ({cards.length})
            </h2>

            {cards.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-600">
                No people were extracted from this document.
              </p>
            ) : (
              <div className="space-y-5">
                {cards.map((item) => (
                  <article
                    key={item.key}
                    className={`rounded-xl border bg-white shadow-sm transition-opacity ${
                      item.include
                        ? "border-zinc-200"
                        : "border-zinc-200 opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3">
                      <h3 className="pt-0.5 text-sm font-semibold text-zinc-900">
                        Person
                      </h3>
                      <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                        <span className="text-xs font-medium text-zinc-500">
                          Include
                        </span>
                        <input
                          type="checkbox"
                          checked={item.include}
                          onChange={(e) =>
                            updateCard(item.key, {
                              ...item,
                              include: e.target.checked,
                            })
                          }
                          className="h-4 w-4 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600"
                        />
                      </label>
                    </div>

                    <div className="space-y-4 p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className={labelClass}>First name</label>
                          <input
                            className={inputClass}
                            value={item.form.first_name}
                            onChange={(e) =>
                              updateCard(item.key, {
                                ...item,
                                form: {
                                  ...item.form,
                                  first_name: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Middle name</label>
                          <input
                            className={inputClass}
                            value={item.form.middle_name}
                            onChange={(e) =>
                              updateCard(item.key, {
                                ...item,
                                form: {
                                  ...item.form,
                                  middle_name: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelClass}>Last name</label>
                          <input
                            className={inputClass}
                            value={item.form.last_name}
                            onChange={(e) =>
                              updateCard(item.key, {
                                ...item,
                                form: {
                                  ...item.form,
                                  last_name: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Birth date</label>
                          <input
                            className={inputClass}
                            value={item.form.birth_date}
                            onChange={(e) =>
                              updateCard(item.key, {
                                ...item,
                                form: {
                                  ...item.form,
                                  birth_date: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Death date</label>
                          <input
                            className={inputClass}
                            value={item.form.death_date}
                            onChange={(e) =>
                              updateCard(item.key, {
                                ...item,
                                form: {
                                  ...item.form,
                                  death_date: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelClass}>Gender</label>
                          <select
                            className={inputClass}
                            value={item.form.gender}
                            onChange={(e) =>
                              updateCard(item.key, {
                                ...item,
                                form: {
                                  ...item.form,
                                  gender: e.target.value,
                                },
                              })
                            }
                          >
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Unknown">Unknown</option>
                          </select>
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelClass}>Notes</label>
                          <textarea
                            className={`${inputClass} resize-y`}
                            rows={3}
                            value={item.form.notes}
                            onChange={(e) =>
                              updateCard(item.key, {
                                ...item,
                                form: { ...item.form, notes: e.target.value },
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="border-t border-zinc-100 pt-4">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Relationships
                          </h4>
                          <button
                            type="button"
                            onClick={() =>
                              updateCard(item.key, {
                                ...item,
                                relationships: [
                                  ...item.relationships,
                                  {
                                    key: newKey("rel"),
                                    fromExtracted: false,
                                    relatedPeerIndex: null,
                                    relatedNameExternal: "",
                                    relationshipType: "other",
                                  },
                                ],
                              })
                            }
                            className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                          >
                            Add relationship
                          </button>
                        </div>
                        {item.relationships.length === 0 ? (
                          <p className="text-xs text-zinc-500">
                            No relationships linked from the document.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {item.relationships.map((rel) => (
                              <li
                                key={rel.key}
                                className="flex flex-col gap-2 rounded-lg border border-zinc-100 bg-zinc-50/80 p-3 sm:flex-row sm:items-center"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                                    Related person
                                  </p>
                                  {rel.fromExtracted ? (
                                    <p className="text-sm text-zinc-900">
                                      {relatedPersonDisplayLabel(rel, cards)}
                                    </p>
                                  ) : (
                                    <input
                                      className={inputClass}
                                      placeholder="Full name"
                                      value={rel.relatedNameExternal}
                                      onChange={(e) =>
                                        updateCard(item.key, {
                                          ...item,
                                          relationships:
                                            item.relationships.map((r) =>
                                              r.key === rel.key
                                                ? {
                                                    ...r,
                                                    relatedNameExternal:
                                                      e.target.value,
                                                  }
                                                : r
                                            ),
                                        })
                                      }
                                    />
                                  )}
                                </div>
                                <select
                                  className={`${inputClass} sm:max-w-[11rem] sm:shrink-0`}
                                  value={rel.relationshipType}
                                  onChange={(e) =>
                                    updateCard(item.key, {
                                      ...item,
                                      relationships: item.relationships.map(
                                        (r) =>
                                          r.key === rel.key
                                            ? {
                                                ...r,
                                                relationshipType: e.target
                                                  .value as RelOption,
                                              }
                                            : r
                                      ),
                                    })
                                  }
                                >
                                  {RELATIONSHIP_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>
                                      {opt}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateCard(item.key, {
                                      ...item,
                                      relationships:
                                        item.relationships.filter(
                                          (r) => r.key !== rel.key
                                        ),
                                    })
                                  }
                                  className="text-xs text-red-600 hover:underline sm:shrink-0"
                                >
                                  Remove
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="border-t border-zinc-100 pt-4">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                            Events
                          </h4>
                          <button
                            type="button"
                            onClick={() =>
                              updateCard(item.key, {
                                ...item,
                                events: [
                                  ...item.events,
                                  {
                                    key: newKey("ev"),
                                    eventType: "other",
                                    eventDate: "",
                                    eventPlace: "",
                                    eventNotes: "",
                                    eventStoryShort: "",
                                    eventStoryFull: "",
                                  },
                                ],
                              })
                            }
                            className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                          >
                            Add event
                          </button>
                        </div>
                        {item.events.length === 0 ? (
                          <p className="text-xs text-zinc-500">
                            No events linked from the document.
                          </p>
                        ) : (
                          <ul className="space-y-3">
                            {item.events.map((ev) => (
                              <li
                                key={ev.key}
                                className="rounded-lg border border-zinc-100 bg-zinc-50/80 p-3"
                              >
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <div className="sm:col-span-2">
                                    <label className={labelClass}>
                                      Event type
                                    </label>
                                    <select
                                      className={inputClass}
                                      value={ev.eventType}
                                      onChange={(e) =>
                                        updateCard(item.key, {
                                          ...item,
                                          events: item.events.map((x) =>
                                            x.key === ev.key
                                              ? {
                                                  ...x,
                                                  eventType: e.target
                                                    .value as EvOption,
                                                }
                                              : x
                                          ),
                                        })
                                      }
                                    >
                                      {EVENT_TYPE_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className={labelClass}>Date</label>
                                    <input
                                      className={inputClass}
                                      value={ev.eventDate}
                                      onChange={(e) =>
                                        updateCard(item.key, {
                                          ...item,
                                          events: item.events.map((x) =>
                                            x.key === ev.key
                                              ? {
                                                  ...x,
                                                  eventDate: e.target.value,
                                                }
                                              : x
                                          ),
                                        })
                                      }
                                    />
                                  </div>
                                  <div>
                                    <label className={labelClass}>Place</label>
                                    <input
                                      className={inputClass}
                                      value={ev.eventPlace}
                                      onChange={(e) =>
                                        updateCard(item.key, {
                                          ...item,
                                          events: item.events.map((x) =>
                                            x.key === ev.key
                                              ? {
                                                  ...x,
                                                  eventPlace: e.target.value,
                                                }
                                              : x
                                          ),
                                        })
                                      }
                                    />
                                  </div>
                                  <div className="sm:col-span-2">
                                    <label className={labelClass}>Notes</label>
                                    <textarea
                                      className={textareaClass}
                                      value={ev.eventNotes}
                                      onChange={(e) =>
                                        updateCard(item.key, {
                                          ...item,
                                          events: item.events.map((x) =>
                                            x.key === ev.key
                                              ? {
                                                  ...x,
                                                  eventNotes: e.target.value,
                                                }
                                              : x
                                          ),
                                        })
                                      }
                                      rows={3}
                                      placeholder="Details from the document (saved as timeline notes)"
                                    />
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateCard(item.key, {
                                      ...item,
                                      events: item.events.filter(
                                        (x) => x.key !== ev.key
                                      ),
                                    })
                                  }
                                  className="mt-2 text-xs text-red-600 hover:underline"
                                >
                                  Remove event
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            <div className="sticky bottom-4 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg">
              <p className="mb-3 text-xs text-zinc-600">
                Uncheck <span className="font-medium">Include</span> to skip a
                person. Continue saves checked people to this device and opens
                duplicate review.
              </p>
              <button
                type="button"
                onClick={handleContinue}
                className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
              >
                Continue
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
