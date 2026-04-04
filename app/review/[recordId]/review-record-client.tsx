"use client";

import { PlaceInput } from "@/components/ui/place-input";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { formatDateString } from "@/lib/utils/dates";
import { formatPlace } from "@/lib/utils/places";
import { useRouter } from "next/navigation";
import {
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";

type PlaceFields = {
  township: string | null;
  county: string | null;
  state: string | null;
  country: string;
};

type AiPerson = {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  birth_place?: PlaceFields | string | null;
  occupation?: string | null;
  gender?: string | null;
  notes?: string | null;
};

type AiEvent = {
  person_name?: string | null;
  event_type?: string | null;
  event_date?: string | null;
  event_place?: PlaceFields | string | null;
  description?: string | null;
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
  parent_events?: AiEvent[];
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
  birth_place_display: string;
  birth_place_id: string | null;
  birth_place_fields: PlaceFields | null;
  occupation: string;
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
  event_place_display: string;
  event_place_id: string | null;
  event_place_fields: PlaceFields | null;
  /** From AI `description`; saved to DB as `events.notes`. */
  eventNotes: string;
  eventStoryFull: string;
  stale: boolean;
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
  /** When set, duplicate matching and post-save redirect target this tree. */
  returnTreeId?: string | null;
  people: Array<{
    first_name: string;
    middle_name: string | null;
    last_name: string;
    birth_date: string | null;
    death_date: string | null;
    birth_place_id: string | null;
    birth_place_fields: PlaceFields | null;
    birth_place_display: string | null;
    occupation: string | null;
    gender: string | null;
    notes: string | null;
    relationships: Array<{
      related_name: string;
      relationship_type: string;
    }>;
    events: Array<{
      event_type: string;
      event_date: string | null;
      event_place_id: string | null;
      event_place_fields: PlaceFields | null;
      notes: string | null;
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

function markAllEventsStale(card: PersonCardState): PersonCardState {
  return {
    ...card,
    events: card.events.map((e) => ({ ...e, stale: true })),
  };
}

function markEveryCardEventsStale(allCards: PersonCardState[]): PersonCardState[] {
  return allCards.map((card) => markAllEventsStale(card));
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
function placeFromAiField(
  v: PlaceFields | string | null | undefined
): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  return formatPlace(v);
}

function placeFieldsFromAi(
  v: PlaceFields | string | null | undefined
): PlaceFields | null {
  if (v == null || typeof v === "string") return null;
  if (typeof v !== "object" || Array.isArray(v)) return null;
  return {
    township:
      typeof v.township === "string" || v.township === null
        ? v.township
        : null,
    county:
      typeof v.county === "string" || v.county === null ? v.county : null,
    state: typeof v.state === "string" || v.state === null ? v.state : null,
    country: typeof v.country === "string" ? v.country : "",
  };
}

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

function birthPlaceDisplayForPendingPayload(form: PersonForm): string | null {
  const raw = form.birth_place_fields as PlaceFields | string | null;
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    return t.length > 0 ? t : null;
  }
  const s = formatPlace(raw).trim();
  return s.length > 0 ? s : null;
}

function toForm(p: AiPerson): PersonForm {
  return {
    first_name: p.first_name ?? "",
    middle_name: p.middle_name ?? "",
    last_name: p.last_name ?? "",
    birth_date: formatDateString(p.birth_date ?? ""),
    death_date: formatDateString(p.death_date ?? ""),
    birth_place_display: placeFromAiField(p.birth_place),
    birth_place_id: null,
    birth_place_fields: placeFieldsFromAi(p.birth_place),
    occupation: p.occupation ?? "",
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
  const parentEvs = parsed.parent_events ?? [];

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

    let events: EventRow[] = [];
    for (const e of parentEvs) {
      const pn = String(e.person_name ?? "").trim();
      if (namesMatch(pn, myName)) {
        events.push({
          key: newKey("ev"),
          eventType: normalizeEventType(String(e.event_type ?? "other")),
          eventDate: formatDateString(e.event_date ?? ""),
          event_place_display: placeFromAiField(e.event_place),
          event_place_id: null,
          event_place_fields: placeFieldsFromAi(e.event_place),
          eventNotes: (e.description ?? "").trim(),
          eventStoryFull: (e.story_full ?? "").trim(),
          stale: false,
        });
      }
    }
    for (const e of evs) {
      const pn = String(e.person_name ?? "").trim();
      if (namesMatch(pn, myName)) {
        events.push({
          key: newKey("ev"),
          eventType: normalizeEventType(String(e.event_type ?? "other")),
          eventDate: formatDateString(e.event_date ?? ""),
          event_place_display: placeFromAiField(e.event_place),
          event_place_id: null,
          event_place_fields: placeFieldsFromAi(e.event_place),
          eventNotes: (e.description ?? "").trim(),
          eventStoryFull: (e.story_full ?? "").trim(),
          stale: false,
        });
      }
    }

    const seenEventTypes = new Set<EvOption>();
    events = events.filter((row) => {
      if (seenEventTypes.has(row.eventType)) return false;
      seenEventTypes.add(row.eventType);
      return true;
    });

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

  const zoomChromeStyle: CSSProperties = {
    borderColor: "var(--dg-brown-border)",
    backgroundColor: "var(--dg-cream)",
  };
  const zoomToolbarBorder: CSSProperties = {
    borderBottomColor: "var(--dg-brown-border)",
  };
  const zoomBtnStyle: CSSProperties = {
    borderColor: "var(--dg-brown-border)",
    backgroundColor: "var(--dg-parchment)",
    color: "var(--dg-brown-dark)",
  };

  return (
    <div
      className="flex min-h-0 min-w-0 flex-col rounded-lg border"
      style={zoomChromeStyle}
    >
      <div
        className="flex flex-wrap items-center gap-2 border-b px-3 py-2"
        style={zoomToolbarBorder}
      >
        <button
          type="button"
          onClick={zoomOut}
          disabled={atMin}
          aria-label="Zoom out"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border text-base font-semibold hover:bg-[var(--dg-parchment-deep)] disabled:cursor-not-allowed disabled:opacity-40"
          style={zoomBtnStyle}
        >
          −
        </button>
        <button
          type="button"
          onClick={zoomIn}
          disabled={atMax}
          aria-label="Zoom in"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border text-base font-semibold hover:bg-[var(--dg-parchment-deep)] disabled:cursor-not-allowed disabled:opacity-40"
          style={zoomBtnStyle}
        >
          +
        </button>
        <button
          type="button"
          onClick={resetZoom}
          disabled={atMin && pan.x === 0 && pan.y === 0}
          className="rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-[var(--dg-parchment-deep)] disabled:cursor-not-allowed disabled:opacity-40"
          style={zoomBtnStyle}
        >
          Reset zoom
        </button>
        <span className="text-xs" style={{ color: "var(--dg-brown-muted)" }}>
          {Math.round(scale * 100)}%
        </span>
      </div>
      <div
        className="relative h-[min(70vh,720px)] min-h-[240px] w-full touch-none overflow-hidden"
        style={{ backgroundColor: "var(--dg-parchment)" }}
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

const inputFieldClass =
  "w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 [&::placeholder]:text-[color:var(--dg-brown-muted)]";

const inputFieldStyle: CSSProperties = {
  backgroundColor: "var(--dg-cream)",
  color: "var(--dg-brown-dark)",
  borderColor: "var(--dg-brown-border)",
};

const labelFieldClass = "mb-1 block text-xs font-medium";

const labelFieldStyle: CSSProperties = {
  color: "var(--dg-brown-muted)",
};

export default function ReviewRecordClient({
  recordId,
  signedDocumentUrl,
  fileType,
  recordTypeLabel,
  aiResponse,
  recordTreeId = null,
}: {
  recordId: string;
  signedDocumentUrl: string | null;
  fileType: string | null;
  recordTypeLabel: string;
  aiResponse: unknown;
  recordTreeId?: string | null;
}) {
  const router = useRouter();
  const parsed = useMemo(() => {
    const r = aiResponse as AiResponseShape;
    return {
      record_type:
        typeof r?.record_type === "string" ? r.record_type.trim() : "",
      people: Array.isArray(r?.people) ? r.people : [],
      relationships: Array.isArray(r?.relationships) ? r.relationships : [],
      events: Array.isArray(r?.events) ? r.events : [],
      parent_events: Array.isArray(r?.parent_events) ? r.parent_events : [],
    };
  }, [aiResponse]);

  const [cards, setCards] = useState<PersonCardState[]>(() => {
    const p = parsed as AiResponseShape;
    console.log("[review] buildInitialCards input", {
      parsed: p,
      people: p.people,
      parent_events: p.parent_events,
    });
    return buildInitialCards(p);
  });
  const [isRegeneratingStories, setIsRegeneratingStories] = useState(false);

  const ft = (fileType ?? "").toLowerCase();
  const isImage = ft.startsWith("image/");

  function updateCard(key: string, next: PersonCardState) {
    setCards((prev) => prev.map((c) => (c.key === key ? next : c)));
  }

  async function handleContinue() {
    if (isRegeneratingStories) return;
    setIsRegeneratingStories(true);
    try {
      let workingCards = cards;
      const staleTargets = cards.flatMap((card) => {
        if (!card.include)
          return [] as Array<{ cardKey: string; eventKey: string }>;
        return card.events
          .filter((e) => e.stale)
          .map((e) => ({ cardKey: card.key, eventKey: e.key }));
      });

      console.log("[review continue] staleTargets", staleTargets);

      if (recordTreeId && staleTargets.length > 0) {
        const regenerated = await Promise.all(
          staleTargets.map(async (target) => {
            const card = cards.find((c) => c.key === target.cardKey);
            const event = card?.events.find((e) => e.key === target.eventKey);
            if (!card || !event) return null;

            try {
              const response = await fetch("/api/regenerate-story", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  tree_id: recordTreeId,
                  person_name: fullNameFromForm(card.form),
                  event_type: event.eventType,
                  event_date: event.eventDate.trim() || null,
                  event_place: event.event_place_display.trim() || null,
                  event_notes: event.eventNotes.trim() || null,
                  related_people: card.relationships
                    .map((rel) => {
                      if (rel.relatedPeerIndex != null) {
                        const peer = cards[rel.relatedPeerIndex];
                        if (!peer) return null;
                        return {
                          name: fullNameFromForm(peer.form).trim(),
                          relationship_type: rel.relationshipType,
                        };
                      }
                      const external = rel.relatedNameExternal.trim();
                      let name = external;
                      for (const c of cards) {
                        const fn = fullNameFromForm(c.form);
                        if (namesMatch(fn, external)) {
                          name = fn.trim();
                          break;
                        }
                      }
                      return {
                        name,
                        relationship_type: rel.relationshipType,
                      };
                    })
                    .filter(
                      (
                        rp
                      ): rp is { name: string; relationship_type: string } =>
                        rp !== null && rp.name !== ""
                    ),
                }),
              });
              if (!response.ok) return null;
              const data = (await response.json()) as {
                story_full?: unknown;
              };
              if (typeof data.story_full !== "string") {
                return null;
              }
              return {
                ...target,
                storyFull: data.story_full,
              };
            } catch {
              return null;
            }
          })
        );

        workingCards = cards.map((card) => ({
          ...card,
          events: card.events.map((event) => {
            const match = regenerated.find(
              (r) => r && r.cardKey === card.key && r.eventKey === event.key
            );
            if (!event.stale) return event;
            if (!match) return { ...event, stale: false };
            return {
              ...event,
              eventStoryFull: match.storyFull,
              stale: false,
            };
          }),
        }));
        setCards(workingCards);
        console.log(
          "[review continue] workingCards events after regenerate",
          workingCards.flatMap((card) =>
            card.events.map((e) => ({
              cardKey: card.key,
              eventType: e.eventType,
              stale: e.stale,
              eventStoryFull: e.eventStoryFull,
              eventDate: e.eventDate,
            }))
          )
        );
      }

      const checked = workingCards.filter((c) => c.include);
      const payload: PendingReviewPayload = {
        recordId,
        recordTypeLabel,
        ...(recordTreeId ? { returnTreeId: recordTreeId } : {}),
        people: checked.map((c) => ({
          first_name: c.form.first_name.trim(),
          middle_name: c.form.middle_name.trim() || null,
          last_name: c.form.last_name.trim(),
          birth_date: c.form.birth_date.trim() || null,
          death_date: c.form.death_date.trim() || null,
          birth_place_id: c.form.birth_place_id,
          birth_place_fields: c.form.birth_place_fields,
          birth_place_display: birthPlaceDisplayForPendingPayload(c.form),
          gender: normalizeGenderForPendingReview(c.form.gender),
          notes: c.form.notes.trim() || null,
          occupation: c.form.occupation.trim() || null,
          relationships: c.relationships
            .map((r) => ({
              related_name: resolveRelationshipExportName(r, workingCards),
              relationship_type: r.relationshipType,
              relatedPeerIndex: r.relatedPeerIndex,
            }))
            .filter((r) => {
              if (r.related_name === "") return false;
              if (r.relatedPeerIndex !== null) {
                const peer = workingCards[r.relatedPeerIndex];
                if (peer && !peer.include) return false;
              }
              return true;
            })
            .map(({ relatedPeerIndex: _rp, ...rest }) => rest),
          events: c.events.map((e) => ({
            event_type: e.eventType,
            event_date: e.eventDate.trim() || null,
            event_place_id: e.event_place_id,
            event_place_fields: e.event_place_fields,
            notes: e.eventNotes.trim() || null,
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
    } finally {
      setIsRegeneratingStories(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--dg-bg-main)" }}>
      <div className="mx-auto max-w-7xl px-4 py-8">
        <header
          className="mb-8 border-b pb-6"
          style={{ borderBottomColor: "var(--dg-brown-border)" }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Step 1 of 3 · Review extraction
          </p>
          <h1
            className="mt-1 text-2xl font-semibold tracking-tight"
            style={{ color: "var(--dg-brown-dark)" }}
          >
            Edit extracted people
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--dg-brown-muted)" }}>
            <span className="font-medium" style={{ color: "var(--dg-brown-dark)" }}>
              Record type:
            </span>{" "}
            {recordTypeLabel}
            <span
              className="mx-2"
              style={{ color: "var(--dg-brown-border)" }}
            >
              ·
            </span>
            <span className="font-medium" style={{ color: "var(--dg-brown-dark)" }}>
              ID:
            </span>{" "}
            {recordId}
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
          <section className="space-y-3 lg:sticky lg:top-8 lg:self-start">
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--dg-brown-dark)" }}
            >
              Document
            </h2>
            <div
              className="overflow-hidden rounded-xl border shadow-sm"
              style={{
                backgroundColor: "var(--dg-cream)",
                borderColor: "var(--dg-brown-border)",
              }}
            >
              {signedDocumentUrl ? (
                isImage ? (
                  <ZoomableDocumentImage
                    src={signedDocumentUrl}
                    alt="Uploaded record"
                  />
                ) : (
                  <div className="flex flex-col">
                    <div
                      className="border-b px-3 py-2 text-xs"
                      style={{
                        borderBottomColor: "var(--dg-brown-border)",
                        backgroundColor: "var(--dg-parchment)",
                        color: "var(--dg-brown-muted)",
                      }}
                    >
                      Preview (no zoom for this file type)
                    </div>
                    <iframe
                      title="Document preview"
                      src={signedDocumentUrl}
                      className="h-[min(70vh,720px)] min-h-[240px] w-full"
                      style={{ backgroundColor: "var(--dg-cream)" }}
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

          <section className="space-y-4 lg:max-h-[calc(100vh-10rem)] lg:overflow-y-auto lg:pr-2">
            <h2
              className="text-sm font-semibold"
              style={{ color: "var(--dg-brown-dark)" }}
            >
              People ({cards.length})
            </h2>
            {!!parsed.record_type && (
              <p
                className="rounded-lg border px-3 py-2 text-xs font-medium uppercase tracking-wide"
                style={{
                  borderColor: "var(--dg-brown-border)",
                  backgroundColor: "var(--dg-parchment)",
                  color: "var(--dg-brown-muted)",
                }}
              >
                {parsed.record_type}
              </p>
            )}

            {cards.length === 0 ? (
              <p
                className="rounded-xl border border-dashed p-8 text-center text-sm"
                style={{
                  borderColor: "var(--dg-brown-border)",
                  backgroundColor: "var(--dg-cream)",
                  color: "var(--dg-brown-muted)",
                }}
              >
                No people were extracted from this document.
              </p>
            ) : (
              <div className="space-y-5">
                {cards.map((item) => (
                  <article
                    key={item.key}
                    className={`rounded-xl border shadow-sm transition-opacity ${
                      item.include ? "" : "opacity-60"
                    }`}
                    style={{
                      backgroundColor: "var(--dg-cream)",
                      borderColor: "var(--dg-brown-border)",
                    }}
                  >
                    <div
                      className="flex items-start justify-between gap-3 border-b px-4 py-3"
                      style={{ borderBottomColor: "var(--dg-brown-border)" }}
                    >
                      <h3
                        className="pt-0.5 text-sm font-semibold"
                        style={{ color: "var(--dg-brown-dark)" }}
                      >
                        Person
                      </h3>
                      <label
                        className="flex cursor-pointer items-center gap-2 text-sm"
                        style={{ color: "var(--dg-brown-muted)" }}
                      >
                        <span
                          className="text-xs font-medium"
                          style={{ color: "var(--dg-brown-muted)" }}
                        >
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
                          className="h-4 w-4 rounded border text-emerald-700 focus:ring-emerald-600"
                          style={{ borderColor: "var(--dg-brown-border)" }}
                        />
                      </label>
                    </div>

                    <div className="space-y-4 p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className={labelFieldClass}
                            style={labelFieldStyle}>First name</label>
                          <input
                            className={inputFieldClass}
                            style={inputFieldStyle}
                            value={item.form.first_name}
                            onChange={(e) =>
                              setCards((prev) =>
                                markEveryCardEventsStale(prev).map((c) =>
                                  c.key === item.key
                                    ? {
                                        ...c,
                                        form: {
                                          ...c.form,
                                          first_name: e.target.value,
                                        },
                                      }
                                    : c
                                )
                              )
                            }
                          />
                        </div>
                        <div>
                          <label className={labelFieldClass}
                            style={labelFieldStyle}>Middle name</label>
                          <input
                            className={inputFieldClass}
                            style={inputFieldStyle}
                            value={item.form.middle_name}
                            onChange={(e) =>
                              setCards((prev) =>
                                markEveryCardEventsStale(prev).map((c) =>
                                  c.key === item.key
                                    ? {
                                        ...c,
                                        form: {
                                          ...c.form,
                                          middle_name: e.target.value,
                                        },
                                      }
                                    : c
                                )
                              )
                            }
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelFieldClass}
                            style={labelFieldStyle}>Last name</label>
                          <input
                            className={inputFieldClass}
                            style={inputFieldStyle}
                            value={item.form.last_name}
                            onChange={(e) =>
                              setCards((prev) =>
                                markEveryCardEventsStale(prev).map((c) =>
                                  c.key === item.key
                                    ? {
                                        ...c,
                                        form: {
                                          ...c.form,
                                          last_name: e.target.value,
                                        },
                                      }
                                    : c
                                )
                              )
                            }
                          />
                        </div>
                        <div>
                          <label className={labelFieldClass}
                            style={labelFieldStyle}>Birth date</label>
                          <SmartDateInput
                            className={inputFieldClass}
                            style={inputFieldStyle}
                            value={item.form.birth_date}
                            onChange={(nextDate) => {
                              setCards((prev) =>
                                markEveryCardEventsStale(prev).map((c) => ({
                                  ...c,
                                  form:
                                    c.key === item.key
                                      ? { ...c.form, birth_date: nextDate }
                                      : c.form,
                                  events: c.events.map((ev) => ({
                                    ...ev,
                                    eventDate: nextDate,
                                  })),
                                }))
                              );
                            }}
                          />
                        </div>
                        <div>
                          <label className={labelFieldClass}
                            style={labelFieldStyle}>Death date</label>
                          <SmartDateInput
                            className={inputFieldClass}
                            style={inputFieldStyle}
                            value={item.form.death_date}
                            onChange={(val) =>
                              updateCard(item.key, {
                                ...item,
                                form: { ...item.form, death_date: val },
                              })
                            }
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelFieldClass}
                            style={labelFieldStyle}>Birth place</label>
                          <PlaceInput
                            value={item.form.birth_place_display}
                            onChange={(v) => {
                              setCards((prev) =>
                                markEveryCardEventsStale(prev).map((c) => ({
                                  ...c,
                                  form:
                                    c.key === item.key
                                      ? {
                                          ...c.form,
                                          birth_place_display: v,
                                          birth_place_id: null,
                                        }
                                      : c.form,
                                  events: c.events.map((ev) => ({
                                    ...ev,
                                    event_place_display: v,
                                    event_place_id: null,
                                  })),
                                }))
                              );
                            }}
                            onPlaceSelect={(place) => {
                              setCards((prev) =>
                                markEveryCardEventsStale(prev).map((c) => ({
                                  ...c,
                                  form:
                                    c.key === item.key
                                      ? {
                                          ...c.form,
                                          birth_place_display: place.display,
                                          birth_place_id: place.id,
                                        }
                                      : c.form,
                                  events: c.events.map((ev) => ({
                                    ...ev,
                                    event_place_display: place.display,
                                    event_place_id: place.id,
                                  })),
                                }))
                              );
                            }}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelFieldClass}
                            style={labelFieldStyle}>Gender</label>
                          <select
                            className={inputFieldClass}
                            style={inputFieldStyle}
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
                        {item.relationships.some(
                          (rel) => rel.relationshipType === "parent"
                        ) && (
                          <div className="sm:col-span-2">
                            <label className={labelFieldClass}
                            style={labelFieldStyle}>Occupation</label>
                            <input
                              className={inputFieldClass}
                            style={inputFieldStyle}
                              value={item.form.occupation}
                              onChange={(e) =>
                                updateCard(item.key, {
                                  ...item,
                                  form: {
                                    ...item.form,
                                    occupation: e.target.value,
                                  },
                                })
                              }
                            />
                          </div>
                        )}
                      </div>

                      <div
                        className="border-t pt-4"
                        style={{ borderTopColor: "var(--dg-brown-border)" }}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <h4
                            className="text-xs font-semibold uppercase tracking-wide"
                            style={{ color: "var(--dg-brown-muted)" }}
                          >
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
                          <p
                            className="text-xs"
                            style={{ color: "var(--dg-brown-muted)" }}
                          >
                            No relationships linked from the document.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {item.relationships.map((rel) => (
                              <li
                                key={rel.key}
                                className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center"
                                style={{
                                  borderColor: "var(--dg-brown-border)",
                                  backgroundColor: "var(--dg-parchment)",
                                }}
                              >
                                <div className="min-w-0 flex-1">
                                  <p
                                    className="text-[10px] font-medium uppercase tracking-wide"
                                    style={{ color: "var(--dg-brown-muted)" }}
                                  >
                                    Related person
                                  </p>
                                  {rel.fromExtracted ? (
                                    <p
                                      className="text-sm"
                                      style={{ color: "var(--dg-brown-dark)" }}
                                    >
                                      {relatedPersonDisplayLabel(rel, cards)}
                                    </p>
                                  ) : (
                                    <input
                                      className={inputFieldClass}
                                      style={inputFieldStyle}
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
                                  className={`${inputFieldClass} sm:max-w-[11rem] sm:shrink-0`}
                                  style={inputFieldStyle}
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
                                  className="text-xs hover:underline sm:shrink-0"
                                  style={{ color: "var(--dg-danger)" }}
                                >
                                  Remove
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

            <div
              className="sticky bottom-4 rounded-xl border p-4 shadow-lg"
              style={{
                backgroundColor: "var(--dg-cream)",
                borderColor: "var(--dg-brown-border)",
              }}
            >
              <p
                className="mb-3 text-xs"
                style={{ color: "var(--dg-brown-muted)" }}
              >
                Uncheck <span className="font-medium">Include</span> to skip a
                person. Continue saves checked people to this device and opens
                duplicate review.
              </p>
              <button
                type="button"
                onClick={handleContinue}
                disabled={isRegeneratingStories}
                className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2"
              >
                {isRegeneratingStories ? "Updating stories…" : "Continue"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
