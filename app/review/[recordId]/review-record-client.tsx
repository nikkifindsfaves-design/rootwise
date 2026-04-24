"use client";

import { PlaceInput } from "@/components/ui/place-input";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { ALL_EVENT_TYPES } from "@/lib/events/event-types";
import { PENDING_REVIEW_KEY } from "@/lib/review/review-keys";
import {
  emptySharedEventDetails,
  eventUsesSharedDetails,
  extractionSkippedFromAi,
  migrateExtractedEventsToShared,
  resolveEventDatePlaceNotes,
  type SharedEventDetailsState,
} from "@/lib/review/shared-event-merge";
import { createClient } from "@/lib/supabase/client";
import { formatDateString } from "@/lib/utils/dates";
import { GENDER_OPTIONS, normalizeGender } from "@/lib/utils/gender";
import { formatPlace } from "@/lib/utils/places";
import {
  getIsBirthRecord,
  getIsBirthRecordChild,
  getIsDeathRecord,
  getIsMarriageRecord,
} from "@/lib/utils/review-visibility";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
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
  death_place?: PlaceFields | string | null;
  occupation?: string | null;
  marital_status?: string | null;
  cause_of_death?: string | null;
  surviving_spouse?: string | null;
  gender?: string | null;
  notes?: string | null;
  military_branch?: string | null;
  service_number?: string | null;
};

type AiEvent = {
  person_name?: string | null;
  event_type?: string | null;
  event_date?: string | null;
  event_place?: PlaceFields | string | null;
  description?: string | null;
  story_full?: string | null;
  land_data?: { acres: number | null; transaction_type: string | null } | null;
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

type RelOption = (typeof RELATIONSHIP_OPTIONS)[number];
type EvOption = typeof ALL_EVENT_TYPES[number];

type PersonForm = {
  first_name: string;
  middle_name: string;
  last_name: string;
  birth_date: string;
  death_date: string;
  birth_place_display: string;
  birth_place_id: string | null;
  birth_place_fields: PlaceFields | null;
  death_place_display: string;
  death_place_id: string | null;
  death_place_fields: PlaceFields | null;
  occupation: string;
  marital_status: string;
  cause_of_death: string;
  surviving_spouse: string;
  gender: string;
  notes: string;
  military_branch: string;
  service_number: string;
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
  landData: { acres: number | null; transaction_type: string | null } | null;
  /**
   * When true, date / place / notes for this row come from `sharedEventDetails`
   * in the parent review UI (one shared block for census, shared residence, etc.).
   */
   useSharedDetails?: boolean;
};

type PersonCardState = {
  key: string;
  include: boolean;
  generateStory: boolean;
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
  /** When set, post-save redirect returns to the upload origin page. */
  returnPath?: string | null;
  people: Array<{
    first_name: string;
    middle_name: string | null;
    last_name: string;
    birth_date: string | null;
    death_date: string | null;
    birth_place_id: string | null;
    birth_place_fields: PlaceFields | null;
    birth_place_display: string | null;
    death_place_id: string | null;
    death_place_fields: PlaceFields | null;
    death_place_display: string | null;
    occupation: string | null;
    marital_status: string | null;
    cause_of_death: string | null;
    surviving_spouse: string | null;
    gender: string | null;
    notes: string | null;
    military_branch?: string | null;
    service_number?: string | null;
    relationships: Array<{
      related_name: string;
      relationship_type: string;
    }>;
    /** When false, skip AI story generation for this person after add-to-tree. */
    generate_story?: boolean;
    events: Array<{
      event_type: string;
      event_date: string | null;
      event_place_id: string | null;
      event_place_fields: PlaceFields | null;
      /** Used by save-review when structured fields omit country (e.g. display-only UI). */
      event_place_display?: string | null;
      notes: string | null;
      story_full: string | null;
      land_data?: { acres: number | null; transaction_type: string | null } | null;
    }>;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeName(s: string): string {
  return s
    .trim()
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
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

function placeFieldsFromDisplay(display: string): PlaceFields | null {
  const parts = display
    .trim()
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;
  if (parts.length === 1) {
    return { township: null, county: null, state: null, country: parts[0]! };
  }
  if (parts.length === 2) {
    return { township: null, county: null, state: parts[0]!, country: parts[1]! };
  }
  if (parts.length === 3) {
    return {
      township: null,
      county: parts[0]!,
      state: parts[1]!,
      country: parts[2]!,
    };
  }
  const country = parts[parts.length - 1]!;
  const state = parts[parts.length - 2]!;
  const county = parts[parts.length - 3]!;
  const township = parts.slice(0, -3).join(", ");
  return { township, county, state, country };
}

function birthPlaceDisplayForPendingPayload(form: PersonForm): string | null {
  const raw = form.birth_place_fields as PlaceFields | string | null;
  if (raw == null) {
    const fallback = form.birth_place_display.trim();
    return fallback.length > 0 ? fallback : null;
  }
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t.length > 0) return t;
    const fallback = form.birth_place_display.trim();
    return fallback.length > 0 ? fallback : null;
  }
  const s = formatPlace(raw).trim();
  if (s.length > 0) return s;
  const fallback = form.birth_place_display.trim();
  return fallback.length > 0 ? fallback : null;
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
    death_place_display: placeFromAiField(p.death_place),
    death_place_id: null,
    death_place_fields: placeFieldsFromAi(p.death_place),
    occupation: p.occupation ?? "",
    marital_status: p.marital_status ?? "",
    cause_of_death: p.cause_of_death ?? "",
    surviving_spouse: p.surviving_spouse ?? "",
    gender: normalizeGender(p.gender),
    notes: p.notes ?? "",
    military_branch: p.military_branch ?? "",
    service_number: p.service_number ?? "",
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
  if ((ALL_EVENT_TYPES as readonly string[]).includes(n)) return n as EvOption;
  // Child birth events can arrive with freeform labels; normalize them before generic "birth".
  if (
    (n.includes("child") || n.includes("son") || n.includes("daughter")) &&
    (n.includes("born") || n.includes("birth"))
  ) {
    return "child born";
  }
  if (n.includes("birth")) return "birth";
  if (n.includes("baptism") || n.includes("baptized") || n.includes("christening")) return "baptism";
  if (n.includes("death")) return "death";
  if (n === "child born" || n.includes("child born")) return "child born";
  if (n.includes("burial") || n.includes("buried") || n.includes("interment")) return "burial";
  if (n === "child died" || n.includes("child died")) return "child died";
  if (n === "spouse died" || n.includes("spouse died")) return "spouse died";
  if (n.includes("marriage") || n.includes("married")) return "marriage";
  if (n.includes("census")) return "census";
  if (n === "enlistment") return "enlistment";
  if (n === "deployment") return "deployment";
  if (n === "military transfer") return "military transfer";
  if (n === "military award") return "military award";
  if (n === "discharge") return "discharge";
  if (n === "missing in action") return "missing in action";
  if (n === "killed in action") return "killed in action";
  if (n === "prisoner of war") return "prisoner of war";
  if (n.includes("military")) return "military service";
  if (n.includes("immigration") || n.includes("immigrat")) return "immigration";
  if (n.includes("land")) return "land";
  if (n.includes("court")) return "court";
  if (n === "census appearance") return "census";
  if (n === "land record") return "land";
  if (n === "court record") return "court";
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
          landData: (isRecord(e) && isRecord((e as Record<string, unknown>).land_data))
            ? {
                acres:
                  typeof ((e as Record<string, unknown>).land_data as Record<string, unknown>)
                    .acres === "number"
                    ? (((e as Record<string, unknown>).land_data as Record<string, unknown>)
                        .acres as number)
                    : null,
                transaction_type:
                  typeof ((e as Record<string, unknown>).land_data as Record<string, unknown>)
                    .transaction_type === "string"
                    ? (((e as Record<string, unknown>).land_data as Record<string, unknown>)
                        .transaction_type as string)
                    : null,
              }
            : null,
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
          landData: (isRecord(e) && isRecord((e as Record<string, unknown>).land_data))
            ? {
                acres:
                  typeof ((e as Record<string, unknown>).land_data as Record<string, unknown>)
                    .acres === "number"
                    ? (((e as Record<string, unknown>).land_data as Record<string, unknown>)
                        .acres as number)
                    : null,
                transaction_type:
                  typeof ((e as Record<string, unknown>).land_data as Record<string, unknown>)
                    .transaction_type === "string"
                    ? (((e as Record<string, unknown>).land_data as Record<string, unknown>)
                        .transaction_type as string)
                    : null,
              }
            : null,
        });
      }
    }

    const singleInstanceEventTypes = new Set<EvOption>(["birth"]);
    const seenSingleInstanceEventTypes = new Set<EvOption>();
    events = events.filter((row) => {
      if (!singleInstanceEventTypes.has(row.eventType)) return true;
      if (seenSingleInstanceEventTypes.has(row.eventType)) return false;
      seenSingleInstanceEventTypes.add(row.eventType);
      return true;
    });

    return {
      key: newKey("p"),
      include: true,
      form,
      relationships,
      events,
      // Post–add-to-tree story regen reads `generate_story` from the pending payload.
      // Default on for every extracted person (birth/death/etc.); only marriage had
      // spouse edges, so the old "spouse only" default skipped all birth stories.
      generateStory: true,
    };
  });
}

function blankPersonCard(recordTypeLabel: string): PersonCardState {
  const t = defaultEventTypeForRecord(recordTypeLabel);
  /** Land rows need per-event acres / transaction fields in the card UI. */
  const linkShared = t !== "land";
  return {
    key: newKey("p"),
    include: true,
    form: toForm({}),
    relationships: [],
    events: [blankEventRow(t, linkShared)],
    generateStory: false,
  };
}

function defaultEventTypeForRecord(recordTypeLabel: string): EvOption {
  if (getIsMarriageRecord(recordTypeLabel)) return "marriage";
  if (getIsDeathRecord(recordTypeLabel)) return "death";
  if (getIsBirthRecord(recordTypeLabel)) return "birth";
  const lower = recordTypeLabel.toLowerCase();
  if (lower.includes("census")) return "residence";
  if (lower.includes("land")) return "land";
  return "other";
}

function blankEventRow(
  defaultType: EvOption,
  useSharedDetails = false
): EventRow {
  return {
    key: newKey("ev"),
    eventType: defaultType,
    eventDate: "",
    event_place_display: "",
    event_place_id: null,
    event_place_fields: null,
    eventNotes: "",
    eventStoryFull: "",
    landData: null,
    ...(useSharedDetails ? { useSharedDetails: true } : {}),
  };
}

function parsedShapeFromAiResponse(aiResponse: unknown): AiResponseShape {
  const r = aiResponse as AiResponseShape;
  return {
    record_type:
      typeof r?.record_type === "string" ? r.record_type.trim() : "",
    people: Array.isArray(r?.people) ? r.people : [],
    relationships: Array.isArray(r?.relationships) ? r.relationships : [],
    events: Array.isArray(r?.events) ? r.events : [],
    parent_events: Array.isArray(r?.parent_events) ? r.parent_events : [],
  };
}

function createInitialCardsAndShared(
  aiResponse: unknown
): { cards: PersonCardState[]; shared: SharedEventDetailsState } {
  const parsed = parsedShapeFromAiResponse(aiResponse);
  const cards = buildInitialCards(parsed);

  if (extractionSkippedFromAi(aiResponse)) {
    return { cards, shared: emptySharedEventDetails() };
  }

  return migrateExtractedEventsToShared(cards);
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
        style={{
          backgroundColor: "var(--dg-parchment)",
          cursor:
            scale > ZOOM_MIN + 0.001
              ? dragging
                ? "grabbing"
                : "grab"
              : "default",
        }}
        onMouseDown={handleMouseDown}
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
  documentSubtype = null,
}: {
  recordId: string;
  signedDocumentUrl: string | null;
  fileType: string | null;
  recordTypeLabel: string;
  aiResponse: unknown;
  recordTreeId?: string | null;
  documentSubtype?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const parsed = useMemo(
    () => parsedShapeFromAiResponse(aiResponse),
    [aiResponse]
  );

  const manualEntryReview = useMemo(
    () => extractionSkippedFromAi(aiResponse),
    [aiResponse]
  );
  const returnPath = useMemo(() => {
    const raw = searchParams.get("returnTo");
    if (!raw) return null;
    const trimmed = raw.trim();
    // Keep redirects in-app only.
    if (!trimmed.startsWith("/")) return null;
    return trimmed;
  }, [searchParams]);

  const [cards, setCards] = useState<PersonCardState[]>(() => {
    const init = createInitialCardsAndShared(aiResponse);
    const p = parsedShapeFromAiResponse(aiResponse);
    console.log("[review] buildInitialCards input", {
      parsed: p,
      people: p.people,
      parent_events: p.parent_events,
      cardCount: init.cards.length,
    });
    return init.cards;
  });
  const [sharedEventDetails, setSharedEventDetails] =
    useState<SharedEventDetailsState>(() =>
      createInitialCardsAndShared(aiResponse).shared
    );
  const [treePersonNameSuggestions, setTreePersonNameSuggestions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadTreePersonNames() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      let personsQuery = supabase
        .from("persons")
        .select("first_name, middle_name, last_name")
        .eq("user_id", user.id);

      if (recordTreeId) {
        personsQuery = personsQuery.eq("tree_id", recordTreeId);
      }

      const { data, error } = await personsQuery;
      if (cancelled || error) return;

      const uniqueByNormalized = new Map<string, string>();
      for (const row of data ?? []) {
        const fullName = [row.first_name, row.middle_name, row.last_name]
          .map((v) => String(v ?? "").trim())
          .filter(Boolean)
          .join(" ");
        const normalized = normalizeName(fullName);
        if (!normalized || uniqueByNormalized.has(normalized)) continue;
        uniqueByNormalized.set(normalized, fullName);
      }

      setTreePersonNameSuggestions(Array.from(uniqueByNormalized.values()));
    }

    void loadTreePersonNames();
    return () => {
      cancelled = true;
    };
  }, [recordTreeId, supabase]);

  const ft = (fileType ?? "").toLowerCase();
  const isImage = ft.startsWith("image/");
  const isBirthRecord = getIsBirthRecord(recordTypeLabel);

  function updateCard(key: string, next: PersonCardState) {
    setCards((prev) => prev.map((c) => (c.key === key ? next : c)));
  }

  function handleContinue() {
    try {
      const isDeathRecord = getIsDeathRecord(recordTypeLabel);
      const primaryCard = cards.find((c) =>
        c.events.some((e) => e.eventType === "death")
      );
      const primaryName = primaryCard
        ? fullNameFromForm(primaryCard.form).trim()
        : "";
      const primaryDeathEv = primaryCard?.events.find(
        (e) => e.eventType === "death"
      );
      const primaryDeathDate = primaryDeathEv
        ? resolveEventDatePlaceNotes(
            primaryDeathEv,
            sharedEventDetails,
            manualEntryReview
          ).eventDate
        : "";

      const cardsWithSynthesized = cards.map((card) => {
        const isSecondary =
          isDeathRecord &&
          !card.events.some((e) => e.eventType === "death");
        if (!isSecondary || !card.include || !card.generateStory) return card;
        const isSpouse = card.relationships.some(
          (r) => r.relationshipType === "spouse"
        );
        const eventType = isSpouse ? "spouse died" : "child died";
        const description = isSpouse
          ? `Death of spouse ${primaryName}`
          : `Death of child ${primaryName}`;
        const synthesized: EventRow = {
          key: newKey("ev"),
          eventType: eventType as EvOption,
          eventDate: primaryDeathDate,
          event_place_display: "",
          event_place_id: null,
          event_place_fields: null,
          eventNotes: description,
          eventStoryFull: "",
          landData: null,
          useSharedDetails: false,
        };
        return {
          ...card,
          events: [...card.events, synthesized],
        };
      });

      const workingCards = cardsWithSynthesized;

      const checked = workingCards.filter((c) => c.include);
      const payload: PendingReviewPayload = {
        recordId,
        recordTypeLabel,
        ...(recordTreeId ? { returnTreeId: recordTreeId } : {}),
        ...(returnPath ? { returnPath } : {}),
        people: checked.map((c) => ({
          first_name: c.form.first_name.trim(),
          middle_name: c.form.middle_name.trim() || null,
          last_name: c.form.last_name.trim(),
          birth_date: c.form.birth_date.trim() || null,
          death_date: c.form.death_date.trim() || null,
          birth_place_id: c.form.birth_place_id,
          birth_place_fields: c.form.birth_place_fields,
          birth_place_display: birthPlaceDisplayForPendingPayload(c.form),
          death_place_id: c.form.death_place_id,
          death_place_fields: c.form.death_place_fields,
          death_place_display: c.form.death_place_display.trim() || null,
          gender: normalizeGender(c.form.gender),
          notes: c.form.notes.trim() || null,
          occupation: c.form.occupation.trim() || null,
          military_branch: c.form.military_branch.trim() || null,
          service_number: c.form.service_number.trim() || null,
          generate_story: c.generateStory,
          marital_status: c.form.marital_status.trim() || null,
          cause_of_death: c.form.cause_of_death.trim() || null,
          surviving_spouse: c.form.surviving_spouse.trim() || null,
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
            .map((r) => ({
              related_name: r.related_name,
              relationship_type: r.relationship_type,
            })),
          events: c.events.map((e) => {
            const r = resolveEventDatePlaceNotes(
              e,
              sharedEventDetails,
              manualEntryReview
            );
            return {
              event_type: e.eventType,
              event_date: r.eventDate.trim() || null,
              event_place_id: r.event_place_id,
              event_place_fields: r.event_place_fields,
              event_place_display: r.event_place_display.trim() || null,
              notes: r.eventNotes.trim() || null,
              story_full: e.eventStoryFull.trim() || null,
              land_data: e.landData ?? null,
            };
          }),
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
    } catch {
      // localStorage / navigation can throw in edge cases; ignore
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
                  <iframe
                    title="Document preview"
                    src={signedDocumentUrl}
                    className="h-[min(70vh,720px)] min-h-[240px] w-full"
                    style={{ backgroundColor: "var(--dg-cream)" }}
                  />
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

            <div
              className="rounded-xl border p-4 space-y-3"
              style={{
                backgroundColor: "var(--dg-cream)",
                borderColor: "var(--dg-brown-border)",
              }}
            >
              <h3
                className="text-xs font-semibold uppercase tracking-wide"
                style={{ color: "var(--dg-brown-muted)" }}
              >
                Shared event details
              </h3>
              <p className="text-xs" style={{ color: "var(--dg-brown-muted)" }}>
                {manualEntryReview ? (
                  <>
                    One date, place, and shared description for every{" "}
                    <span className="font-medium text-[var(--dg-brown-dark)]">
                      linked
                    </span>{" "}
                    event (for example the same birth as{" "}
                    <span className="font-medium text-[var(--dg-brown-dark)]">
                      birth
                    </span>{" "}
                    vs{" "}
                    <span className="font-medium text-[var(--dg-brown-dark)]">
                      child born
                    </span>
                    ). Change{" "}
                    <span className="font-medium text-[var(--dg-brown-dark)]">
                      event type
                    </span>{" "}
                    per person if needed; use{" "}
                    <span className="font-medium text-[var(--dg-brown-dark)]">
                      Different date or place for this person only
                    </span>{" "}
                    for an exception, or remove an event when someone should not
                    share this fact.
                  </>
                ) : (
                  <></>
                )}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelFieldClass} style={labelFieldStyle}>
                    Date
                  </label>
                  <SmartDateInput
                    className={inputFieldClass}
                    style={
                      isBirthRecord
                        ? {
                            ...inputFieldStyle,
                            backgroundColor: "var(--dg-parchment)",
                            color: "var(--dg-brown-muted)",
                            borderColor: "var(--dg-brown-border)",
                            opacity: 0.75,
                          }
                        : inputFieldStyle
                    }
                    disabled={isBirthRecord}
                    value={sharedEventDetails.eventDate}
                    onChange={(nextDate) =>
                      setSharedEventDetails((s) => ({
                        ...s,
                        eventDate: nextDate,
                      }))
                    }
                  />
                  {isBirthRecord ? (
                    <p
                      className="mt-1 text-xs"
                      style={{ color: "var(--dg-brown-muted)" }}
                    >
                      Derived from birth record below.
                    </p>
                  ) : null}
                </div>
                <div className="sm:col-span-2">
                  <label className={labelFieldClass} style={labelFieldStyle}>
                    Place
                  </label>
                  <PlaceInput
                    className={inputFieldClass}
                    style={
                      isBirthRecord
                        ? {
                            ...inputFieldStyle,
                            backgroundColor: "var(--dg-parchment)",
                            color: "var(--dg-brown-muted)",
                            borderColor: "var(--dg-brown-border)",
                            opacity: 0.75,
                          }
                        : inputFieldStyle
                    }
                    locked={isBirthRecord}
                    value={sharedEventDetails.event_place_display}
                    onChange={(v) =>
                      setSharedEventDetails((s) => ({
                        ...s,
                        event_place_display: v,
                        event_place_id: null,
                        event_place_fields: placeFieldsFromDisplay(v),
                      }))
                    }
                    onPlaceSelect={(place) =>
                      setSharedEventDetails((s) => ({
                        ...s,
                        event_place_display: place.display,
                        event_place_id: place.id,
                        event_place_fields: null,
                      }))
                    }
                  />
                  {isBirthRecord ? (
                    <p
                      className="mt-1 text-xs"
                      style={{ color: "var(--dg-brown-muted)" }}
                    >
                      Derived from birth record below.
                    </p>
                  ) : null}
                </div>
                {manualEntryReview ? (
                  <div className="sm:col-span-2">
                    <label className={labelFieldClass} style={labelFieldStyle}>
                      Description / notes (shared)
                    </label>
                    <textarea
                      className={inputFieldClass}
                      style={inputFieldStyle}
                      rows={2}
                      value={sharedEventDetails.eventNotes}
                      onChange={(e) =>
                        setSharedEventDetails((s) => ({
                          ...s,
                          eventNotes: e.target.value,
                        }))
                      }
                    />
                  </div>
                ) : null}
              </div>
            </div>

            {cards.length === 0 ? (
              <div
                className="rounded-xl border border-dashed p-8 text-center space-y-4"
                style={{
                  borderColor: "var(--dg-brown-border)",
                  backgroundColor: "var(--dg-cream)",
                  color: "var(--dg-brown-muted)",
                }}
              >
                <p className="text-sm">
                  No one is listed yet. You can add people and events manually
                  using the document preview.
                </p>
                <button
                  type="button"
                  onClick={() => setCards([blankPersonCard(recordTypeLabel)])}
                  className="rounded-md border-2 px-4 py-2 text-sm font-semibold transition hover:opacity-95"
                  style={{
                    borderColor: "var(--dg-brown-outline)",
                    color: "var(--dg-brown-dark)",
                    backgroundColor: "transparent",
                  }}
                >
                  Add person
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {cards.map((item) => {
                  const isDeathRecord = getIsDeathRecord(recordTypeLabel);
                  const isMarriageRecord = getIsMarriageRecord(recordTypeLabel);
                  const isBirthRecordChild = getIsBirthRecordChild(
                    item.events,
                    recordTypeLabel,
                  );
                  const isMilitaryRecord = recordTypeLabel
                    .toLowerCase()
                    .includes("military");
                  const hidePersonalDates =
                    isMilitaryRecord &&
                    (documentSubtype === "Report of Changes" ||
                      documentSubtype === "Muster Roll" ||
                      documentSubtype === "Personnel Roll" ||
                      documentSubtype === "Roster of Dead");
                  const isPrimaryPerson = item.events.some(
                    (e) => e.eventType === "death"
                  );
                  const isSecondaryPerson = isDeathRecord && !isPrimaryPerson;
                  return (
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
                      <div className="flex flex-col items-end gap-2">
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
                                generateStory: e.target.checked
                                  ? item.generateStory
                                  : false,
                              })
                            }
                            className="h-4 w-4 rounded border text-emerald-700 focus:ring-emerald-600"
                            style={{ borderColor: "var(--dg-brown-border)" }}
                          />
                        </label>
                        {isSecondaryPerson && (
                          <label
                            className="flex cursor-pointer items-center gap-2 text-sm"
                            style={{
                              color: item.include
                                ? "var(--dg-brown-muted)"
                                : "var(--dg-brown-border)",
                              pointerEvents: item.include ? "auto" : "none",
                            }}
                          >
                            <span className="text-xs font-medium">
                              Generate story
                            </span>
                            <input
                              type="checkbox"
                              checked={item.include ? item.generateStory : false}
                              onChange={(e) =>
                                updateCard(item.key, {
                                  ...item,
                                  generateStory: e.target.checked,
                                })
                              }
                              disabled={!item.include}
                              className="h-4 w-4 rounded border text-emerald-700 focus:ring-emerald-600"
                              style={{ borderColor: "var(--dg-brown-border)" }}
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4 p-4">
                      {(() => {
                        return (
                      <>
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
                                prev.map((c) =>
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
                                prev.map((c) =>
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
                                prev.map((c) =>
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
                        {!isSecondaryPerson &&
                        !isMarriageRecord &&
                        !hidePersonalDates && (
                        <div>
                          <label className={labelFieldClass}
                            style={labelFieldStyle}>Birth date</label>
                          <SmartDateInput
                            className={inputFieldClass}
                            style={inputFieldStyle}
                            value={item.form.birth_date}
                            onChange={(nextDate) => {
                              setCards((prev) =>
                                prev.map((c) => {
                                  if (c.key !== item.key) return c;
                                  return {
                                    ...c,
                                    form: { ...c.form, birth_date: nextDate },
                                    events: c.events.map((ev) => ({
                                      ...ev,
                                      eventDate: nextDate,
                                    })),
                                  };
                                })
                              );
                              if (isBirthRecord && isBirthRecordChild) {
                                setSharedEventDetails((s) => ({
                                  ...s,
                                  eventDate: nextDate,
                                }));
                              }
                            }}
                          />
                        </div>
                        )}
                        {!isSecondaryPerson &&
                        !isMarriageRecord &&
                        !hidePersonalDates && (
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
                        )}
                        {!isSecondaryPerson && !isMarriageRecord && (
                        <div className="sm:col-span-2">
                          <label className={labelFieldClass}
                            style={labelFieldStyle}>Birth place</label>
                          <PlaceInput
                            className={inputFieldClass}
                            style={inputFieldStyle}
                            value={item.form.birth_place_display}
                            onChange={(v) => {
                              setCards((prev) =>
                                prev.map((c) => {
                                  if (c.key !== item.key) return c;
                                  return {
                                    ...c,
                                    form: {
                                      ...c.form,
                                      birth_place_display: v,
                                      birth_place_id: null,
                                      birth_place_fields: placeFieldsFromDisplay(v),
                                    },
                                    events: c.events.map((ev) => ({
                                      ...ev,
                                      event_place_display: v,
                                      event_place_id: null,
                                      event_place_fields: placeFieldsFromDisplay(v),
                                    })),
                                  };
                                })
                              );
                              if (isBirthRecord && isBirthRecordChild) {
                                setSharedEventDetails((s) => ({
                                  ...s,
                                  event_place_display: v,
                                  event_place_id: null,
                                  event_place_fields: placeFieldsFromDisplay(v),
                                }));
                              }
                            }}
                            onPlaceSelect={(place) => {
                              setCards((prev) =>
                                prev.map((c) => {
                                  if (c.key !== item.key) return c;
                                  return {
                                    ...c,
                                    form: {
                                      ...c.form,
                                      birth_place_display: place.display,
                                      birth_place_id: place.id,
                                    },
                                    events: c.events.map((ev) => ({
                                      ...ev,
                                      event_place_display: place.display,
                                      event_place_id: place.id,
                                    })),
                                  };
                                })
                              );
                              if (isBirthRecord && isBirthRecordChild) {
                                setSharedEventDetails((s) => ({
                                  ...s,
                                  event_place_display: place.display,
                                  event_place_id: place.id,
                                  event_place_fields: null,
                                }));
                              }
                            }}
                          />
                        </div>
                        )}
                        {isDeathRecord && isPrimaryPerson && (
                          <div className="sm:col-span-2">
                            <label className={labelFieldClass} style={labelFieldStyle}>Death place</label>
                            <PlaceInput
                              value={item.form.death_place_display}
                              onChange={(v) =>
                                updateCard(item.key, {
                                  ...item,
                                  form: {
                                    ...item.form,
                                    death_place_display: v,
                                    death_place_id: null,
                                    death_place_fields: null,
                                  },
                                })
                              }
                              onPlaceSelect={(place) =>
                                updateCard(item.key, {
                                  ...item,
                                  form: {
                                    ...item.form,
                                    death_place_display: place.display,
                                    death_place_id: place.id,
                                    death_place_fields: null,
                                  },
                                })
                              }
                            />
                          </div>
                        )}
                        {!isSecondaryPerson && (
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
                            {GENDER_OPTIONS.map((gender) => (
                              <option key={gender} value={gender}>
                                {gender}
                              </option>
                            ))}
                          </select>
                        </div>
                        )}
                        {(!isDeathRecord || isPrimaryPerson) &&
                        !isMarriageRecord &&
                        !isBirthRecordChild &&
                        !hidePersonalDates && (
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
                        {isDeathRecord && isPrimaryPerson && (
                          <>
                            <div className="sm:col-span-2">
                              <label className={labelFieldClass}
                              style={labelFieldStyle}>Marital status</label>
                              <input
                                className={inputFieldClass}
                              style={inputFieldStyle}
                                value={item.form.marital_status}
                                onChange={(e) =>
                                  updateCard(item.key, {
                                    ...item,
                                    form: {
                                      ...item.form,
                                      marital_status: e.target.value,
                                    },
                                  })
                                }
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className={labelFieldClass}
                              style={labelFieldStyle}>Cause of death</label>
                              <input
                                className={inputFieldClass}
                              style={inputFieldStyle}
                                value={item.form.cause_of_death}
                                onChange={(e) =>
                                  updateCard(item.key, {
                                    ...item,
                                    form: {
                                      ...item.form,
                                      cause_of_death: e.target.value,
                                    },
                                  })
                                }
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className={labelFieldClass}
                              style={labelFieldStyle}>Surviving spouse</label>
                              <input
                                className={inputFieldClass}
                              style={inputFieldStyle}
                                value={item.form.surviving_spouse}
                                onChange={(e) =>
                                  updateCard(item.key, {
                                    ...item,
                                    form: {
                                      ...item.form,
                                      surviving_spouse: e.target.value,
                                    },
                                  })
                                }
                              />
                            </div>
                          </>
                        )}
                      </div>
                      {isMilitaryRecord && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="sm:col-span-2">
                            <label
                              className={labelFieldClass}
                              style={labelFieldStyle}
                            >
                              Military branch
                            </label>
                            <input
                              className={inputFieldClass}
                              style={inputFieldStyle}
                              value={item.form.military_branch}
                              onChange={(e) =>
                                updateCard(item.key, {
                                  ...item,
                                  form: {
                                    ...item.form,
                                    military_branch: e.target.value,
                                  },
                                })
                              }
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label
                              className={labelFieldClass}
                              style={labelFieldStyle}
                            >
                              Service number
                            </label>
                            <input
                              className={inputFieldClass}
                              style={inputFieldStyle}
                              value={item.form.service_number}
                              onChange={(e) =>
                                updateCard(item.key, {
                                  ...item,
                                  form: {
                                    ...item.form,
                                    service_number: e.target.value,
                                  },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}
                      </>
                        );
                      })()}

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
                                    <>
                                      <input
                                        className={inputFieldClass}
                                        style={inputFieldStyle}
                                        placeholder="Full name"
                                        list="tree-person-name-suggestions"
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
                                      <datalist id="tree-person-name-suggestions">
                                        {treePersonNameSuggestions.map((name) => (
                                          <option key={name} value={name} />
                                        ))}
                                      </datalist>
                                    </>
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

                      <div
                        className="border-t pt-4"
                        style={{ borderTopColor: "var(--dg-brown-border)" }}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <h4
                            className="text-xs font-semibold uppercase tracking-wide"
                            style={{ color: "var(--dg-brown-muted)" }}
                          >
                            Events
                          </h4>
                          <button
                            type="button"
                            onClick={() =>
                              updateCard(item.key, {
                                ...item,
                                events: [
                                  ...item.events,
                                  blankEventRow(
                                    defaultEventTypeForRecord(recordTypeLabel)
                                  ),
                                ],
                              })
                            }
                            className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                          >
                            Add event
                          </button>
                        </div>
                        {item.events.length === 0 ? (
                          <p
                            className="text-xs"
                            style={{ color: "var(--dg-brown-muted)" }}
                          >
                            No events for this person. Use{" "}
                            <span className="font-medium text-[var(--dg-brown-dark)]">
                              Add event
                            </span>{" "}
                            for a separate event with its own date and place, or
                            remove events on other people when they should not
                            share this record.
                          </p>
                        ) : (
                          <ul className="space-y-3">
                            {item.events.map((row) => (
                              <li
                                key={row.key}
                                className="relative rounded-lg border p-3"
                                style={{
                                  borderColor: "var(--dg-brown-border)",
                                  backgroundColor: "var(--dg-parchment)",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateCard(item.key, {
                                      ...item,
                                      events: item.events.filter(
                                        (ev) => ev.key !== row.key
                                      ),
                                    })
                                  }
                                  className="absolute top-3 right-3 z-10 text-xs font-medium hover:underline"
                                  style={{ color: "var(--dg-danger)" }}
                                >
                                  Remove event
                                </button>
                                <div className="space-y-3 pr-[6.5rem]">
                                  <div>
                                    <label
                                      className={labelFieldClass}
                                      style={labelFieldStyle}
                                    >
                                      Event type
                                    </label>
                                    <select
                                      className={inputFieldClass}
                                      style={inputFieldStyle}
                                      value={row.eventType}
                                      onChange={(e) =>
                                        updateCard(item.key, {
                                          ...item,
                                          events: item.events.map((ev) =>
                                            ev.key === row.key
                                              ? {
                                                  ...ev,
                                                  eventType: e.target
                                                    .value as EvOption,
                                                }
                                              : ev
                                          ),
                                        })
                                      }
                                    >
                                      {ALL_EVENT_TYPES.map((opt, idx) => (
                                        <option
                                          key={`${String(opt)}-${idx}`}
                                          value={opt}
                                        >
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  {eventUsesSharedDetails(row) ? (
                                    <>
                                      <p
                                        className="text-xs leading-relaxed"
                                        style={{
                                          color: "var(--dg-brown-muted)",
                                        }}
                                      >
                                        {manualEntryReview ? (
                                          <>
                                            Date, place, and notes use{" "}
                                            <span
                                              className="font-medium"
                                              style={{
                                                color: "var(--dg-brown-dark)",
                                              }}
                                            >
                                              Shared event details
                                            </span>{" "}
                                            at the top. Change them once for
                                            everyone linked this way.
                                          </>
                                        ) : (
                                          <>
                                            Date and place use{" "}
                                            <span
                                              className="font-medium"
                                              style={{
                                                color: "var(--dg-brown-dark)",
                                              }}
                                            >
                                              Shared event details
                                            </span>{" "}
                                            at the top. Row-specific description
                                            from extraction is unchanged and
                                            still used when you continue.
                                          </>
                                        )}
                                      </p>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const r = resolveEventDatePlaceNotes(
                                            row,
                                            sharedEventDetails,
                                            manualEntryReview
                                          );
                                          updateCard(item.key, {
                                            ...item,
                                            events: item.events.map((ev) =>
                                              ev.key === row.key
                                                ? {
                                                    ...ev,
                                                    useSharedDetails: false,
                                                    eventDate: r.eventDate,
                                                    event_place_display:
                                                      r.event_place_display,
                                                    event_place_id:
                                                      r.event_place_id,
                                                    event_place_fields:
                                                      r.event_place_fields,
                                                    eventNotes: r.eventNotes,
                                                  }
                                                : ev
                                            ),
                                          });
                                        }}
                                        className="text-left text-xs font-medium text-emerald-700 hover:text-emerald-800"
                                      >
                                        Different date or place for this person
                                        only
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <div>
                                        <label
                                          className={labelFieldClass}
                                          style={labelFieldStyle}
                                        >
                                          Date
                                        </label>
                                        <SmartDateInput
                                          className={inputFieldClass}
                                          style={inputFieldStyle}
                                          value={row.eventDate}
                                          onChange={(nextDate) =>
                                            updateCard(item.key, {
                                              ...item,
                                              events: item.events.map((ev) =>
                                                ev.key === row.key
                                                  ? {
                                                      ...ev,
                                                      eventDate: nextDate,
                                                    }
                                                  : ev
                                              ),
                                            })
                                          }
                                        />
                                      </div>
                                      <div>
                                        <label
                                          className={labelFieldClass}
                                          style={labelFieldStyle}
                                        >
                                          Place
                                        </label>
                                        <PlaceInput
                                          className={inputFieldClass}
                                          style={inputFieldStyle}
                                          value={row.event_place_display}
                                          onChange={(v) =>
                                            updateCard(item.key, {
                                              ...item,
                                              events: item.events.map((ev) =>
                                                ev.key === row.key
                                                  ? {
                                                      ...ev,
                                                      event_place_display: v,
                                                      event_place_id: null,
                                                    }
                                                  : ev
                                              ),
                                            })
                                          }
                                          onPlaceSelect={(place) =>
                                            updateCard(item.key, {
                                              ...item,
                                              events: item.events.map((ev) =>
                                                ev.key === row.key
                                                  ? {
                                                      ...ev,
                                                      event_place_display:
                                                        place.display,
                                                      event_place_id: place.id,
                                                    }
                                                  : ev
                                              ),
                                            })
                                          }
                                        />
                                      </div>
                                      {manualEntryReview ? (
                                        <div>
                                          <label
                                            className={labelFieldClass}
                                            style={labelFieldStyle}
                                          >
                                            Description / notes
                                          </label>
                                          <textarea
                                            className={inputFieldClass}
                                            style={inputFieldStyle}
                                            rows={2}
                                            value={row.eventNotes}
                                            onChange={(e) =>
                                              updateCard(item.key, {
                                                ...item,
                                                events: item.events.map(
                                                  (ev) =>
                                                    ev.key === row.key
                                                      ? {
                                                          ...ev,
                                                          eventNotes:
                                                            e.target.value,
                                                        }
                                                      : ev
                                                ),
                                              })
                                            }
                                          />
                                        </div>
                                      ) : null}
                                      {row.eventType === "land" ? (
                                        <div
                                          style={{
                                            display: "flex",
                                            gap: "1rem",
                                            marginTop: "0.5rem",
                                          }}
                                        >
                                          <div>
                                            <label
                                              className={labelFieldClass}
                                              style={labelFieldStyle}
                                            >
                                              Acres
                                            </label>
                                            <input
                                              type="number"
                                              step="0.01"
                                              min="0"
                                              value={row.landData?.acres ?? ""}
                                              onChange={(ev) => {
                                                const parsed =
                                                  ev.target.value === ""
                                                    ? null
                                                    : parseFloat(
                                                        ev.target.value
                                                      );
                                                updateCard(item.key, {
                                                  ...item,
                                                  events: item.events.map(
                                                    (e) =>
                                                      e.key === row.key
                                                        ? {
                                                            ...e,
                                                            landData: {
                                                              acres:
                                                                isNaN(
                                                                  parsed as number
                                                                )
                                                                  ? null
                                                                  : parsed,
                                                              transaction_type:
                                                                e.landData
                                                                  ?.transaction_type ??
                                                                null,
                                                            },
                                                          }
                                                        : e
                                                  ),
                                                });
                                              }}
                                              className={inputFieldClass}
                                              style={inputFieldStyle}
                                            />
                                          </div>
                                          <div>
                                            <label
                                              className={labelFieldClass}
                                              style={labelFieldStyle}
                                            >
                                              Transaction Type
                                            </label>
                                            <select
                                              value={
                                                row.landData
                                                  ?.transaction_type ?? ""
                                              }
                                              onChange={(ev) => {
                                                const val =
                                                  ev.target.value || null;
                                                updateCard(item.key, {
                                                  ...item,
                                                  events: item.events.map(
                                                    (e) =>
                                                      e.key === row.key
                                                        ? {
                                                            ...e,
                                                            landData: {
                                                              acres:
                                                                e.landData
                                                                  ?.acres ??
                                                                null,
                                                              transaction_type:
                                                                val,
                                                            },
                                                          }
                                                        : e
                                                  ),
                                                });
                                              }}
                                              className={inputFieldClass}
                                              style={inputFieldStyle}
                                            >
                                              <option value="">— Select —</option>
                                              <option value="Acquired">
                                                Acquired
                                              </option>
                                              <option value="Sold">Sold</option>
                                              <option value="Gifted">
                                                Gifted
                                              </option>
                                              <option value="Taxed">Taxed</option>
                                              <option value="Surveyed">
                                                Surveyed
                                              </option>
                                            </select>
                                          </div>
                                        </div>
                                      ) : null}
                                    </>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                    </div>
                  </article>
                  );
                })}
              </div>
            )}

            {cards.length > 0 ? (
              <button
                type="button"
                onClick={() =>
                  setCards((prev) => [
                    ...prev,
                    blankPersonCard(recordTypeLabel),
                  ])
                }
                className="w-full rounded-md border-2 px-4 py-2.5 text-sm font-semibold transition hover:opacity-95"
                style={{
                  borderColor: "var(--dg-brown-outline)",
                  color: "var(--dg-brown-dark)",
                  backgroundColor: "var(--dg-parchment)",
                }}
              >
                Add another person
              </button>
            ) : null}

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
                Uncheck{" "}
                <span
                  className="font-medium"
                  style={{ color: "var(--dg-brown-dark)" }}
                >
                  Include
                </span>{" "}
                to skip a
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
