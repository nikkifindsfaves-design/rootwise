"use client";

import { PlaceInput } from "@/components/ui/place-input";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { buildEventTypeSelectOptions } from "@/lib/events/event-type-options";
import { RECORD_TYPES } from "@/lib/records/record-types";
import { createClient } from "@/lib/supabase/client";
import { formatDateString } from "@/lib/utils/dates";
import { formatPlace } from "@/lib/utils/places";
import DocumentUploadSection from "../../dashboard/document-upload";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

const serif =
  "var(--font-dg-display), 'Playfair Display', Georgia, serif";
const sans = "var(--font-dg-body), Lato, sans-serif";

const colors = {
  brownDark: "var(--dg-brown-dark)",
  brownMid: "var(--dg-brown-mid)",
  brownMuted: "var(--dg-brown-muted)",
  brownBorder: "var(--dg-brown-border)",
  brownOutline: "var(--dg-brown-outline)",
  parchment: "var(--dg-parchment)",
  cream: "var(--dg-cream)",
  avatarBg: "var(--dg-avatar-bg)",
  avatarInitials: "var(--dg-avatar-initials)",
  forest: "var(--dg-forest)",
};

type PersonRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  birth_date: string | null;
  death_date: string | null;
  birth_place_id: string | null;
  death_place_id?: string | null;
  photo_url: string | null;
  crop_x?: number | null;
  crop_y?: number | null;
  crop_zoom?: number | null;
  natural_width?: number | null;
  natural_height?: number | null;
  gender: string | null;
  notes: string | null;
  tree_id?: string | null;
  birth_place?: {
    township: string | null;
    county: string | null;
    state: string | null;
    country: string;
  } | null;
  death_place?: {
    township: string | null;
    county: string | null;
    state: string | null;
    country: string;
  } | null;
};

type FamilyRelationshipChoice = "parent" | "child" | "spouse" | "sibling";

type TreePersonSearchRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  birth_date: string | null;
};

/**
 * Maps UI relationship choice (how the other person relates to the profile) to
 * two directed rows matching `classifyRelationship` / tree canvas semantics.
 */
function bidirectionalRelationshipRows(
  choice: FamilyRelationshipChoice,
  profilePersonId: string,
  otherPersonId: string
): RelRow[] {
  switch (choice) {
    case "parent":
      return [
        {
          person_a_id: otherPersonId,
          person_b_id: profilePersonId,
          relationship_type: "parent",
        },
        {
          person_a_id: profilePersonId,
          person_b_id: otherPersonId,
          relationship_type: "child",
        },
      ];
    case "child":
      return [
        {
          person_a_id: profilePersonId,
          person_b_id: otherPersonId,
          relationship_type: "parent",
        },
        {
          person_a_id: otherPersonId,
          person_b_id: profilePersonId,
          relationship_type: "child",
        },
      ];
    case "spouse":
    case "sibling":
      return [
        {
          person_a_id: profilePersonId,
          person_b_id: otherPersonId,
          relationship_type: choice,
        },
        {
          person_a_id: otherPersonId,
          person_b_id: profilePersonId,
          relationship_type: choice,
        },
      ];
    default:
      return [];
  }
}

function birthYearLabel(dateStr: string | null | undefined): string | null {
  if (dateStr == null) return null;
  const s = String(dateStr).trim();
  if (!s) return null;
  const y = /^(\d{4})/.exec(s);
  if (y) return y[1]!;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return String(new Date(t).getFullYear());
}

function personMatchesNameTokens(
  p: TreePersonSearchRow,
  tokens: string[]
): boolean {
  if (tokens.length === 0) return true;
  const hay = [p.first_name, p.middle_name ?? "", p.last_name]
    .map((x) => String(x ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
  return tokens.every((t) => hay.includes(t));
}

type PhotoSetupTagPerson = {
  id: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
};

function photoSetupTagDisplayName(t: PhotoSetupTagPerson): string {
  return [t.first_name, t.middle_name ?? "", t.last_name]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

const MERGE_COMPARE_KEYS = [
  "first_name",
  "middle_name",
  "last_name",
  "birth_date",
  "death_date",
  "birth_place_id",
  "gender",
  "notes",
] as const;

type MergeCompareKey = (typeof MERGE_COMPARE_KEYS)[number];

const MERGE_FIELD_LABELS: Record<MergeCompareKey, string> = {
  first_name: "First name",
  middle_name: "Middle name",
  last_name: "Last name",
  birth_date: "Birth date",
  death_date: "Death date",
  birth_place_id: "Birth place",
  gender: "Gender",
  notes: "Notes",
};

function mergeFieldStr(
  p: PersonRow,
  key: MergeCompareKey
): string {
  const v = p[key as keyof PersonRow];
  if (v == null) return "";
  return String(v).trim();
}

function mergeFieldsConflict(
  primary: PersonRow,
  dup: PersonRow,
  key: MergeCompareKey
): boolean {
  const a = mergeFieldStr(primary, key);
  const b = mergeFieldStr(dup, key);
  return a !== "" && b !== "" && a !== b;
}

function formatMergeFieldForUi(key: MergeCompareKey, raw: string): string {
  if (!raw) return "—";
  if (key === "birth_date" || key === "death_date") {
    return formatDateString(raw);
  }
  if (key === "notes" && raw.length > 200) {
    return `${raw.slice(0, 200)}…`;
  }
  return raw;
}

type EventRow = {
  id: string;
  event_type: string;
  event_date: string | null;
  event_place_id: string | null;
  description: string | null;
  record_id: string | null;
  notes: string | null;
  research_notes: string | null;
  story_short: string | null;
  story_full: string | null;
  created_at: string | null;
};

type RelRow = {
  id?: string;
  person_a_id: string;
  person_b_id: string;
  relationship_type: string;
};

type RelationshipMeta = {
  otherPersonId: string;
  relationshipType: string;
  personAId: string;
  personBId: string;
};

type RecordRow = {
  id: string;
  record_type: string | null;
  file_type: string | null;
  file_url: string | null;
  created_at: string | null;
  ai_response: unknown;
};

type EventSourceRow = {
  id: string;
  event_id: string;
  record_id: string;
  notes: string | null;
  created_at: string;
};

const SIGNED_URL_EXPIRY_SEC = 3600;

type TabId = "details" | "documents" | "photos" | "notes";

type EventCluster = {
  displayType: string;
  events: EventRow[];
};

/** Resolve object path inside the `documents` bucket from a stored Storage URL. */
function documentsObjectPathFromFileUrl(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl);
    const publicMarker = "/object/public/documents/";
    const publicIdx = url.pathname.indexOf(publicMarker);
    if (publicIdx !== -1) {
      return decodeURIComponent(
        url.pathname.slice(publicIdx + publicMarker.length)
      );
    }
    const signMarker = "/object/sign/documents/";
    const signIdx = url.pathname.indexOf(signMarker);
    if (signIdx !== -1) {
      return decodeURIComponent(url.pathname.slice(signIdx + signMarker.length));
    }
    const loose = url.pathname.match(/\/documents\/(.+)$/);
    if (loose) {
      return decodeURIComponent(loose[1]);
    }
  } catch {
    return null;
  }
  return null;
}

function parseEventDateMs(s: string | null | undefined): number | null {
  if (s == null) return null;
  const t = Date.parse(s.trim());
  return Number.isNaN(t) ? null : t;
}

function recordTypeLabel(row: RecordRow): string {
  if (row.record_type && String(row.record_type).trim() !== "") {
    return String(row.record_type);
  }
  const ai = row.ai_response as { record_type?: string } | null;
  if (ai && typeof ai.record_type === "string" && ai.record_type.trim() !== "") {
    return ai.record_type;
  }
  return "Record";
}

function eventsSortedByDate(cluster: EventCluster): EventRow[] {
  return [...cluster.events].sort((a, b) => {
    const ma = parseEventDateMs(a.event_date);
    const mb = parseEventDateMs(b.event_date);
    if (ma == null && mb == null) return 0;
    if (ma == null) return 1;
    if (mb == null) return -1;
    return ma - mb;
  });
}

function clusterLinkedSources(
  cluster: EventCluster,
  sourcesByEventId: Map<string, EventSourceRow[]>,
  recordsById: Map<string, RecordRow>,
  signedDocUrls: Map<string, string>
): { id: string; label: string; url: string | null }[] {
  const seen = new Set<string>();
  const out: { id: string; label: string; url: string | null }[] = [];

  for (const ev of cluster.events) {
    for (const row of sourcesByEventId.get(ev.id) ?? []) {
      const rid = row.record_id;
      if (!rid || seen.has(rid) || !recordsById.has(rid)) continue;
      seen.add(rid);
      const rec = recordsById.get(rid)!;
      out.push({
        id: rid,
        label: recordTypeLabel(rec),
        url: signedDocUrls.get(rid) ?? null,
      });
    }
    const legacy = ev.record_id?.trim();
    if (legacy && !seen.has(legacy) && recordsById.has(legacy)) {
      seen.add(legacy);
      const rec = recordsById.get(legacy)!;
      out.push({
        id: legacy,
        label: recordTypeLabel(rec),
        url: signedDocUrls.get(legacy) ?? null,
      });
    }
  }

  return out;
}

function eventDateLabel(ev: EventRow): string {
  const d = ev.event_date?.trim();
  if (!d) return "Date unknown";
  try {
    const parsed = new Date(d.replace(/-/g, '/'));
    if (isNaN(parsed.getTime())) return formatDateString(d);
    const month = parsed.toLocaleDateString("en-US", { month: "long" });
    const day = parsed.getDate();
    const year = parsed.getFullYear();
    return `${month.charAt(0).toUpperCase()}${month.slice(1).toLowerCase()} ${day}, ${year}`;
  } catch {
    return formatDateString(d);
  }
}

function normalizeDateToMMDDYYYY(raw: string | null): string {
  const s = (raw ?? "").trim();
  if (!s) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  try {
    const parsed = new Date(s.replace(/-/g, "/"));
    if (isNaN(parsed.getTime())) return "";
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getDate()).padStart(2, "0");
    const yyyy = String(parsed.getFullYear());
    return `${mm}/${dd}/${yyyy}`;
  } catch {
    return "";
  }
}

function formatResearchNoteTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function classifyRelationship(
  personId: string,
  rel: RelRow
): { otherId: string; category: "parent" | "child" | "spouse" | "sibling" } | null {
  const t = rel.relationship_type.trim().toLowerCase();
  if (rel.person_a_id === personId) {
    const other = rel.person_b_id;
    if (t === "parent") return { otherId: other, category: "child" };
    if (t === "child") return { otherId: other, category: "parent" };
    if (t === "spouse") return { otherId: other, category: "spouse" };
    if (t === "sibling") return { otherId: other, category: "sibling" };
    return null;
  }
  if (rel.person_b_id === personId) {
    const other = rel.person_a_id;
    if (t === "parent") return { otherId: other, category: "parent" };
    if (t === "child") return { otherId: other, category: "child" };
    if (t === "spouse") return { otherId: other, category: "spouse" };
    if (t === "sibling") return { otherId: other, category: "sibling" };
    return null;
  }
  return null;
}

function photoUrlFromRow(row: Record<string, unknown>): string | null {
  const u =
    row.url ?? row.photo_url ?? row.public_url ?? row.file_url ?? row.storage_url;
  return typeof u === "string" && u.trim() !== "" ? u : null;
}

function rowIsPrimaryForDisplay(p: Record<string, unknown>): boolean {
  if (p.__crop_save_to_tag === true) {
    return p.__tag_is_primary === true;
  }
  return p.is_primary === true || p.primary === true;
}

function pickPrimaryPhotoUrl(
  photoRows: Record<string, unknown>[],
  personPhotoUrl: string | null
): string | null {
  const primary = photoRows.find((p) => rowIsPrimaryForDisplay(p));
  const fromPrimary = primary ? photoUrlFromRow(primary) : null;
  if (fromPrimary) return fromPrimary;
  for (const row of photoRows) {
    const u = photoUrlFromRow(row);
    if (u) return u;
  }
  return personPhotoUrl;
}

/** Same row order as `pickPrimaryPhotoUrl` uses for a gallery URL (not legacy person.photo_url). */
function pickHeaderPhotoCropRow(
  photoRows: Record<string, unknown>[]
): Record<string, unknown> | null {
  const primary = photoRows.find((p) => rowIsPrimaryForDisplay(p));
  if (primary && photoUrlFromRow(primary)) return primary;
  for (const row of photoRows) {
    if (photoUrlFromRow(row)) return row;
  }
  return null;
}

function cropPercentFromUnknown(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.min(100, Math.max(0, v));
  }
  return fallback;
}

function cropZoomFromUnknown(v: unknown, fallback: number): number {
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.min(3, Math.max(1, v));
  }
  return fallback;
}

/** Per-profile crop for display (from photo_tags when linked, else photos row). */
function personPhotoCropForRow(row: Record<string, unknown>): {
  x: number;
  y: number;
  zoom: number;
} {
  if (typeof row.__person_crop_x === "number") {
    return {
      x: row.__person_crop_x,
      y:
        typeof row.__person_crop_y === "number"
          ? row.__person_crop_y
          : cropPercentFromUnknown(row.crop_y, 50),
      zoom:
        typeof row.__person_crop_zoom === "number"
          ? row.__person_crop_zoom
          : cropZoomFromUnknown(row.crop_zoom, 1),
    };
  }
  return {
    x: cropPercentFromUnknown(row.crop_x, 50),
    y: cropPercentFromUnknown(row.crop_y, 50),
    zoom: cropZoomFromUnknown(row.crop_zoom, 1),
  };
}

const CROP_PREVIEW_PX = 280;

/** Cover-fit rendered size inside a square viewport; zoom scales both axes. */
function cropCoverRenderedSize(
  naturalW: number,
  naturalH: number,
  viewportPx: number,
  zoom: number
): { w: number; h: number } {
  const scale = Math.max(viewportPx / naturalW, viewportPx / naturalH);
  return {
    w: naturalW * scale * zoom,
    h: naturalH * scale * zoom,
  };
}

function clampCropOffsetCover(
  offset: { x: number; y: number },
  renderedW: number,
  renderedH: number,
  viewportPx: number
): { x: number; y: number } {
  const spanX = renderedW - viewportPx;
  const spanY = renderedH - viewportPx;
  return {
    x: spanX > 0 ? Math.min(0, Math.max(-spanX, offset.x)) : 0,
    y: spanY > 0 ? Math.min(0, Math.max(-spanY, offset.y)) : 0,
  };
}

/** Persisted crop_x / crop_y (0–100) from pixel offset (cover-fit rendered image). */
function offsetToCropPercentCover(
  offset: { x: number; y: number },
  renderedW: number,
  renderedH: number,
  viewportPx: number
): { x: number; y: number } {
  const spanX = renderedW - viewportPx;
  const spanY = renderedH - viewportPx;
  return {
    x:
      spanX > 0
        ? Math.min(100, Math.max(0, (-offset.x / spanX) * 100))
        : 50,
    y:
      spanY > 0
        ? Math.min(100, Math.max(0, (-offset.y / spanY) * 100))
        : 50,
  };
}

function cropPercentToOffsetCover(
  cropX: number,
  cropY: number,
  renderedW: number,
  renderedH: number,
  viewportPx: number
): { x: number; y: number } {
  const spanX = renderedW - viewportPx;
  const spanY = renderedH - viewportPx;
  return clampCropOffsetCover(
    {
      x: spanX > 0 ? -(cropX / 100) * spanX : 0,
      y: spanY > 0 ? -(cropY / 100) * spanY : 0,
    },
    renderedW,
    renderedH,
    viewportPx
  );
}

function initials(p: Pick<PersonRow, "first_name" | "last_name">): string {
  const f = p.first_name.trim();
  const l = p.last_name.trim();
  const fi = f[0];
  const li = l[0];
  if (fi && li) return (fi + li).toUpperCase();
  if (li) return li.toUpperCase();
  if (fi) return (fi + (f[1] ?? "")).slice(0, 2).toUpperCase();
  return "?";
}

/** "Male" / "Female" for header pill; Unknown or other values → hidden. */
function genderBadgeLabel(
  gender: string | null | undefined
): "Male" | "Female" | null {
  const n = (gender ?? "").trim().toLowerCase();
  if (n === "male") return "Male";
  if (n === "female") return "Female";
  return null;
}

function IconPencil({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function IconStar({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

function IconTag({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

function formatUploadedAt(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function sortEventsChronologically(events: EventRow[]): EventRow[] {
  return [...events].sort((a, b) => {
    const da = (a.event_date ?? "").trim();
    const db = (b.event_date ?? "").trim();
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    const ma = parseEventDateMs(da);
    const mb = parseEventDateMs(db);
    if (ma != null && mb != null) return ma - mb;
    return da.localeCompare(db, undefined, { numeric: true });
  });
}

function parseCreatedAtMs(s: string | null | undefined): number {
  if (s == null || String(s).trim() === "") return 0;
  const t = Date.parse(String(s));
  return Number.isNaN(t) ? 0 : t;
}

/** Same bucket = one timeline row (after dedupe). */
function timelineDedupeKey(ev: EventRow): string {
  const typ = (ev.event_type || "other").trim().toLowerCase() || "other";
  const d = (ev.event_date ?? "").trim();
  return `${typ}\0${d}`;
}

function pickRepresentativeForTimelineGroup(group: EventRow[]): EventRow {
  const withShort = group.filter((e) => (e.story_short ?? "").trim() !== "");
  const pool = withShort.length > 0 ? withShort : group;
  return pool.reduce((best, cur) => {
    const bt = parseCreatedAtMs(best.created_at);
    const ct = parseCreatedAtMs(cur.created_at);
    if (ct > bt) return cur;
    if (ct < bt) return best;
    return cur.id > best.id ? cur : best;
  });
}

/** One row per (event_type, event_date); prefers story_short, else newest created_at. */
function dedupeTimelineEvents(list: EventRow[]): EventRow[] {
  const byKey = new Map<string, EventRow[]>();
  for (const ev of list) {
    const k = timelineDedupeKey(ev);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(ev);
  }
  const out: EventRow[] = [];
  for (const g of byKey.values()) {
    out.push(pickRepresentativeForTimelineGroup(g));
  }
  return out;
}

function eventsSharingTimelineDedupeKey(rep: EventRow, all: EventRow[]): EventRow[] {
  const k = timelineDedupeKey(rep);
  return all.filter((e) => timelineDedupeKey(e) === k);
}

function clusterPlacesLine(_cluster: EventCluster): string {
  return "";
}

function clusterDescriptionLines(cluster: EventCluster): string[] {
  return [
    ...new Set(
      cluster.events
        .map((e) => e.description?.trim())
        .filter(Boolean) as string[]
    ),
  ];
}

function firstStoryFullInCluster(cluster: EventCluster): {
  text: string;
  eventId: string;
} {
  for (const e of eventsSortedByDate(cluster)) {
    const s = e.story_full?.trim();
    if (s) return { text: s, eventId: e.id };
  }
  const sorted = eventsSortedByDate(cluster);
  return { text: "", eventId: sorted[0]?.id ?? "" };
}

const FAMILY_MEMBER_AVATAR_VP = 40;

function FamilyMemberCard({
  p,
  crop_x,
  crop_y,
  crop_zoom,
  natural_width,
  natural_height,
  onEditRelationship,
}: {
  p: PersonRow;
  crop_x?: number | null;
  crop_y?: number | null;
  crop_zoom?: number | null;
  natural_width?: number | null;
  natural_height?: number | null;
  onEditRelationship?: () => void;
}) {
  const last = p.last_name.trim() || "—";
  const firstMiddle = [p.first_name, p.middle_name ?? ""]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  const photo =
    (p as { photo_url?: string | null }).photo_url ?? null;

  const hasPixelCrop =
    typeof natural_width === "number" &&
    natural_width > 0 &&
    typeof natural_height === "number" &&
    natural_height > 0 &&
    typeof crop_x === "number" &&
    Number.isFinite(crop_x) &&
    typeof crop_y === "number" &&
    Number.isFinite(crop_y) &&
    typeof crop_zoom === "number" &&
    Number.isFinite(crop_zoom);

  let pixelAvatarStyle: CSSProperties | null = null;
  if (hasPixelCrop) {
    const { w: rw, h: rh } = cropCoverRenderedSize(
      natural_width,
      natural_height,
      FAMILY_MEMBER_AVATAR_VP,
      crop_zoom
    );
    const offset = cropPercentToOffsetCover(
      crop_x,
      crop_y,
      rw,
      rh,
      FAMILY_MEMBER_AVATAR_VP
    );
    pixelAvatarStyle = {
      position: "absolute",
      left: offset.x,
      top: offset.y,
      width: rw,
      height: rh,
      maxWidth: "none",
    };
  }

  return (
    <Link
      href={`/person/${p.id}`}
      className="relative flex gap-2 rounded-lg border p-2 transition hover:-translate-y-0.5"
      style={{
        borderColor: colors.brownBorder,
        backgroundColor: colors.cream,
        boxShadow: "0 1px 4px rgb(var(--dg-shadow-rgb) / 0.06)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      {onEditRelationship ? (
        <button
          type="button"
          className="absolute right-1.5 top-1.5 rounded px-1 text-xs"
          style={{ color: colors.brownMuted }}
          aria-label="Edit relationship"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onEditRelationship();
          }}
        >
          ✎
        </button>
      ) : null}
      <div
        className="h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1"
        style={{
          position: "relative",
          backgroundColor: colors.avatarBg,
          borderColor: colors.brownBorder,
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            className={hasPixelCrop ? undefined : "h-full w-full"}
            style={
              hasPixelCrop
                ? pixelAvatarStyle ?? undefined
                : {
                    objectFit: "cover",
                    objectPosition: `${p.crop_x ?? 50}% ${p.crop_y ?? 50}%`,
                    width: "100%",
                    height: "100%",
                  }
            }
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center text-xs font-bold"
            style={{ fontFamily: serif, color: colors.avatarInitials }}
          >
            {initials(p)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-bold leading-tight"
          style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}
        >
          {firstMiddle || last}
        </p>
        {firstMiddle ? (
          <p
            className="truncate text-xs leading-tight"
            style={{ fontFamily: serif, color: "var(--dg-brown-muted)" }}
          >
            {last}
          </p>
        ) : null}
        <p
          className="mt-0.5 text-xs italic leading-tight"
          style={{ fontFamily: sans, color: colors.brownMid }}
        >
          {p.birth_date
            ? `b. ${formatDateString(p.birth_date)}`
            : ""}
          {p.birth_date && p.death_date ? " · " : ""}
          {p.death_date ? `d. ${formatDateString(p.death_date)}` : ""}
        </p>
      </div>
    </Link>
  );
}

function FamilyGroup({
  title,
  members,
  relationshipMetaByPersonId,
  onEditRelationship,
}: {
  title: string;
  members: PersonRow[];
  relationshipMetaByPersonId: Record<string, RelationshipMeta | undefined>;
  onEditRelationship: (meta: RelationshipMeta) => void;
}) {
  if (members.length === 0) return null;
  return (
    <div className="mb-5">
      <h3
        className="mb-2 text-xs font-bold uppercase tracking-widest"
        style={{ fontFamily: sans, color: colors.brownMuted }}
      >
        {title}
      </h3>
      <ul className="space-y-2">
        {members.map((p) => (
          <li key={p.id}>
            {(() => {
              const relMeta = relationshipMetaByPersonId[p.id];
              return (
            <FamilyMemberCard
              p={p}
              crop_x={p.crop_x}
              crop_y={p.crop_y}
              crop_zoom={p.crop_zoom}
              natural_width={p.natural_width}
              natural_height={p.natural_height}
              onEditRelationship={
                relMeta ? () => onEditRelationship(relMeta) : undefined
              }
            />
              );
            })()}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimelineEventStoryBlock({
  storyText,
  typ,
  expanded,
  onToggleExpanded,
}: {
  storyText: string;
  typ: string;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const trimmed = storyText.trim();
  const isFallback = trimmed === "";

  useLayoutEffect(() => {
    if (isFallback) {
      setHasOverflow(false);
      return;
    }
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => {
      if (expanded) return;
      setHasOverflow(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [trimmed, expanded, isFallback]);

  if (isFallback) {
    return (
      <p
        className="text-xs font-semibold uppercase tracking-wider"
        style={{
          fontFamily: sans,
          color: colors.brownMuted,
        }}
      >
        {typ}
      </p>
    );
  }

  return (
    <>
      <div className="relative">
        <div
          ref={bodyRef}
          className="whitespace-pre-wrap text-sm leading-relaxed"
          style={{
            fontFamily: sans,
            color: colors.brownMid,
            maxHeight: expanded ? undefined : "6rem",
            overflow: expanded ? "visible" : "hidden",
          }}
        >
          {trimmed}
        </div>
        {!expanded && hasOverflow ? (
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-12"
            style={{
              background: `linear-gradient(to bottom, transparent, ${colors.cream})`,
            }}
            aria-hidden
          />
        ) : null}
      </div>
      {hasOverflow ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={onToggleExpanded}
            className="border-none bg-transparent p-0 text-left text-sm underline decoration-dotted underline-offset-2"
            style={{
              fontFamily: sans,
              color: colors.forest,
              fontWeight: 600,
              cursor: "pointer",
            }}
            aria-expanded={expanded}
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      ) : null}
    </>
  );
}

export default function PersonProfilePage() {
  const params = useParams();
  const router = useRouter();
  const raw = params as { id?: string; personId?: string; treeId?: string };
  const personId =
    typeof raw.id === "string"
      ? raw.id
      : typeof raw.personId === "string"
        ? raw.personId
        : "";
  const treeId =
    typeof raw.treeId === "string" && raw.treeId.trim() !== ""
      ? raw.treeId.trim()
      : "";
  const backToTreeHref = treeId !== "" ? `/dashboard/${treeId}` : "/dashboard";
  const backToTreeLabel = treeId !== "" ? "Back to tree" : "Back to My Trees";

  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = localStorage.getItem("dg-theme");
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      setTheme("dark");
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const next = theme === "light" ? "dark" : "light";
    localStorage.setItem("dg-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
    setTheme(next);
  }, [theme]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [person, setPerson] = useState<PersonRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [photoRows, setPhotoRows] = useState<Record<string, unknown>[]>([]);
  const [avatarNaturalSize, setAvatarNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [recordsById, setRecordsById] = useState<Map<string, RecordRow>>(
    new Map()
  );
  const [family, setFamily] = useState<{
    parents: PersonRow[];
    spouses: PersonRow[];
    siblings: PersonRow[];
    children: PersonRow[];
  }>({ parents: [], spouses: [], siblings: [], children: [] });
  const [relationshipMetaByPersonId, setRelationshipMetaByPersonId] = useState<
    Record<string, RelationshipMeta>
  >({});
  const [editRelModal, setEditRelModal] = useState<RelationshipMeta | null>(null);
  const [editRelType, setEditRelType] = useState("");
  const [editRelBusy, setEditRelBusy] = useState(false);
  const [editRelError, setEditRelError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("details");
  const [signedDocUrls, setSignedDocUrls] = useState<Map<string, string>>(
    new Map()
  );
  const [eventSources, setEventSources] = useState<EventSourceRow[]>([]);
  const [expandedTimelineNotesKeys, setExpandedTimelineNotesKeys] = useState<
    Set<string>
  >(() => new Set());
  const [expandedTimelineSourcesKeys, setExpandedTimelineSourcesKeys] =
    useState<Set<string>>(() => new Set());
  const [expandedTimelineStoryKeys, setExpandedTimelineStoryKeys] = useState<
    Set<string>
  >(() => new Set());
  const [researchNoteId, setResearchNoteId] = useState<string | null>(null);
  const [researchNoteText, setResearchNoteText] = useState("");
  const [researchNoteUpdatedAt, setResearchNoteUpdatedAt] = useState<
    string | null
  >(null);
  const [researchNoteSaving, setResearchNoteSaving] = useState(false);
  const [researchNoteSavedFlash, setResearchNoteSavedFlash] = useState(false);
  const [researchNoteSaveError, setResearchNoteSaveError] = useState<
    string | null
  >(null);

  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventEditDraft, setEventEditDraft] = useState<{
    event_type: string;
    event_date: string;
    event_place_id: string | null;
    story_short: string;
    story_full: string;
    notes: string;
  } | null>(null);
  const [eventEditSaving, setEventEditSaving] = useState(false);
  const [eventEditError, setEventEditError] = useState<string | null>(null);
  const [eventDeleteConfirmId, setEventDeleteConfirmId] = useState<
    string | null
  >(null);
  const [eventDeletingId, setEventDeletingId] = useState<string | null>(null);
  const [sourceDeleteConfirmKey, setSourceDeleteConfirmKey] = useState<string | null>(null);
  const [sourceDeletingKey, setSourceDeletingKey] = useState<string | null>(null);

  const [editPersonOpen, setEditPersonOpen] = useState(false);
  const [editPersonDraft, setEditPersonDraft] = useState<{
    first_name: string;
    middle_name: string;
    last_name: string;
    birth_date: string;
    death_date: string;
    birth_place_id: string | null;
    birth_place_display: string;
    death_place_id: string | null;
    death_place_display: string;
    gender: string;
    notes: string;
  } | null>(null);
  const [personEditSaving, setPersonEditSaving] = useState(false);
  const [personEditError, setPersonEditError] = useState<string | null>(null);

  const [deletePersonOpen, setDeletePersonOpen] = useState(false);
  const [deletePersonBusy, setDeletePersonBusy] = useState(false);

  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeSearchQuery, setMergeSearchQuery] = useState("");
  const [mergeSearchLoading, setMergeSearchLoading] = useState(false);
  const [mergeSearchResults, setMergeSearchResults] = useState<PersonRow[]>(
    []
  );
  const [mergeSearchError, setMergeSearchError] = useState<string | null>(
    null
  );
  const [mergeSelectedDup, setMergeSelectedDup] = useState<PersonRow | null>(
    null
  );
  /** Explicit step so the compare view always shows after picking a search result. */
  const [mergeUiStep, setMergeUiStep] = useState<"search" | "compare">("search");
  const [mergeFieldChoices, setMergeFieldChoices] = useState<
    Record<string, "primary" | "duplicate">
  >({});
  const [mergeSaving, setMergeSaving] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  const [addFamilyModalOpen, setAddFamilyModalOpen] = useState(false);
  const [addFamilyTab, setAddFamilyTab] = useState<"find" | "create">("find");
  const [addFamilyFindQuery, setAddFamilyFindQuery] = useState("");
  const [addFamilyTreePeople, setAddFamilyTreePeople] = useState<
    TreePersonSearchRow[]
  >([]);
  const [addFamilyTreePeopleLoading, setAddFamilyTreePeopleLoading] =
    useState(false);
  const [addFamilyTreePeopleError, setAddFamilyTreePeopleError] = useState<
    string | null
  >(null);
  const [addFamilySelectedOther, setAddFamilySelectedOther] =
    useState<TreePersonSearchRow | null>(null);
  const [addFamilyFindRel, setAddFamilyFindRel] =
    useState<FamilyRelationshipChoice>("parent");
  const [addFamilyFindBusy, setAddFamilyFindBusy] = useState(false);
  const [addFamilyFindError, setAddFamilyFindError] = useState<string | null>(
    null
  );
  const [addFamilyCreateFirst, setAddFamilyCreateFirst] = useState("");
  const [addFamilyCreateMiddle, setAddFamilyCreateMiddle] = useState("");
  const [addFamilyCreateLast, setAddFamilyCreateLast] = useState("");
  const [addFamilyCreateBirth, setAddFamilyCreateBirth] = useState("");
  const [addFamilyCreateDeath, setAddFamilyCreateDeath] = useState("");
  const [addFamilyCreateGender, setAddFamilyCreateGender] = useState("");
  const [addFamilyCreateRel, setAddFamilyCreateRel] =
    useState<FamilyRelationshipChoice>("parent");
  const [addFamilyCreateBusy, setAddFamilyCreateBusy] = useState(false);
  const [addFamilyCreateError, setAddFamilyCreateError] = useState<
    string | null
  >(null);

  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [recordUploadModalOpen, setRecordUploadModalOpen] = useState(false);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [addEventDraft, setAddEventDraft] = useState({
    event_type: "",
    event_date: "",
    description: "",
    notes: "",
    event_place_id: null as string | null,
    event_place_display: "",
    event_place_fields: null as {
      township: string | null;
      county: string | null;
      state: string | null;
      country: string;
    } | null,
  });
  const [addEventSaving, setAddEventSaving] = useState(false);
  const [addingSourceEventId, setAddingSourceEventId] = useState<string | null>(
    null
  );
  const [sourceUploading, setSourceUploading] = useState(false);
  const [pendingSourceFile, setPendingSourceFile] = useState<{
    eventId: string;
    file: File;
  } | null>(null);
  const [pendingSourceName, setPendingSourceName] = useState("");
  const [editingResearchNotesEventId, setEditingResearchNotesEventId] =
    useState<string | null>(null);
  const headerActionsDropdownRef = useRef<HTMLDivElement>(null);
  const headerPhotoFileInputRef = useRef<HTMLInputElement>(null);

  const [cropModalPhoto, setCropModalPhoto] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1.0);
  const [cropNaturalSize, setCropNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [cropDragging, setCropDragging] = useState(false);
  const cropMouseDragCleanupRef = useRef<(() => void) | null>(null);
  const cropTouchDragCleanupRef = useRef<(() => void) | null>(null);
  const cropOffsetHydratedRef = useRef(false);

  const [photoSetupModal, setPhotoSetupModal] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [photoSetupOffset, setPhotoSetupOffset] = useState({ x: 0, y: 0 });
  const [photoSetupNaturalSize, setPhotoSetupNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [photoSetupZoom, setPhotoSetupZoom] = useState(1.0);
  const [photoSetupDate, setPhotoSetupDate] = useState("");
  const [photoSetupTags, setPhotoSetupTags] = useState<PhotoSetupTagPerson[]>(
    []
  );
  const [photoSetupTagSearch, setPhotoSetupTagSearch] = useState("");
  const [photoSetupTagResults, setPhotoSetupTagResults] = useState<
    PhotoSetupTagPerson[]
  >([]);
  const [photoSetupTagSearching, setPhotoSetupTagSearching] = useState(false);
  const [photoSetupSaving, setPhotoSetupSaving] = useState(false);
  const [photoSetupError, setPhotoSetupError] = useState<string | null>(null);

  const [photoSetupDragging, setPhotoSetupDragging] = useState(false);
  const photoSetupMouseDragCleanupRef = useRef<(() => void) | null>(null);
  const photoSetupTouchDragCleanupRef = useRef<(() => void) | null>(null);
  const photoSetupTagsRef = useRef<PhotoSetupTagPerson[]>([]);
  photoSetupTagsRef.current = photoSetupTags;
  const photoSetupSearchSeqRef = useRef(0);
  const photoSetupOffsetHydratedRef = useRef(false);

  const [tagModalPhoto, setTagModalPhoto] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [tagModalTags, setTagModalTags] = useState<PhotoSetupTagPerson[]>([]);
  const [tagModalSearch, setTagModalSearch] = useState("");
  const [tagModalResults, setTagModalResults] = useState<PhotoSetupTagPerson[]>(
    []
  );
  const [tagModalSaving, setTagModalSaving] = useState(false);
  const [tagModalError, setTagModalError] = useState<string | null>(null);
  const tagModalTagsRef = useRef<PhotoSetupTagPerson[]>([]);
  tagModalTagsRef.current = tagModalTags;
  const tagModalSearchSeqRef = useRef(0);

  const cropModalPhotoId =
    cropModalPhoto && typeof cropModalPhoto.id === "string"
      ? cropModalPhoto.id
      : null;
  const photoSetupModalId =
    photoSetupModal && typeof photoSetupModal.id === "string"
      ? photoSetupModal.id
      : null;

  useEffect(() => {
    setExpandedTimelineNotesKeys(new Set());
    setExpandedTimelineSourcesKeys(new Set());
    setExpandedTimelineStoryKeys(new Set());
    setEditingEventId(null);
    setEventEditDraft(null);
    setEventDeleteConfirmId(null);
    setEventEditError(null);
    setEditPersonOpen(false);
    setEditPersonDraft(null);
    setDeletePersonOpen(false);
    setMergeModalOpen(false);
    setMergeSearchQuery("");
    setMergeSearchResults([]);
    setMergeSearchError(null);
    setMergeSelectedDup(null);
    setMergeFieldChoices({});
    setMergeError(null);
    setMergeSaving(false);
    setMergeSearchLoading(false);
    setMergeUiStep("search");
    setAddFamilyModalOpen(false);
    setAddFamilyTab("find");
    setAddFamilyFindQuery("");
    setAddFamilyTreePeople([]);
    setAddFamilyTreePeopleLoading(false);
    setAddFamilyTreePeopleError(null);
    setAddFamilySelectedOther(null);
    setAddFamilyFindRel("parent");
    setAddFamilyFindBusy(false);
    setAddFamilyFindError(null);
    setAddFamilyCreateFirst("");
    setAddFamilyCreateMiddle("");
    setAddFamilyCreateLast("");
    setAddFamilyCreateBirth("");
    setAddFamilyCreateDeath("");
    setAddFamilyCreateGender("");
    setAddFamilyCreateRel("parent");
    setAddFamilyCreateBusy(false);
    setAddFamilyCreateError(null);
    setCropModalPhoto(null);
    setRelationshipMetaByPersonId({});
    setEditRelModal(null);
    setEditRelType("");
    setEditRelBusy(false);
    setEditRelError(null);
    setPhotoSetupModal(null);
    setCropOffset({ x: 0, y: 0 });
    setCropNaturalSize(null);
    cropOffsetHydratedRef.current = false;
    setPhotoSetupOffset({ x: 0, y: 0 });
    setPhotoSetupNaturalSize(null);
    photoSetupOffsetHydratedRef.current = false;
    setPhotoSetupZoom(1.0);
    setPhotoSetupDate("");
    setPhotoSetupTags([]);
    setPhotoSetupTagSearch("");
    setPhotoSetupTagResults([]);
    setPhotoSetupTagSearching(false);
    setPhotoSetupSaving(false);
    setPhotoSetupError(null);
    setTagModalPhoto(null);
    setTagModalTags([]);
    setTagModalSearch("");
    setTagModalResults([]);
    setTagModalSaving(false);
    setTagModalError(null);
    setHeaderMenuOpen(false);
  }, [personId]);

  useEffect(() => {
    if (!headerMenuOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const root = headerActionsDropdownRef.current;
      if (!root || root.contains(e.target as Node)) return;
      setHeaderMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [headerMenuOpen]);

  useEffect(() => {
    if (cropModalPhoto) return;
    cropMouseDragCleanupRef.current?.();
    cropMouseDragCleanupRef.current = null;
    cropTouchDragCleanupRef.current?.();
    cropTouchDragCleanupRef.current = null;
    setCropDragging(false);
  }, [cropModalPhoto]);

  useEffect(() => {
    if (photoSetupModal) return;
    photoSetupMouseDragCleanupRef.current?.();
    photoSetupMouseDragCleanupRef.current = null;
    photoSetupTouchDragCleanupRef.current?.();
    photoSetupTouchDragCleanupRef.current = null;
    setPhotoSetupDragging(false);
  }, [photoSetupModal]);

  useEffect(() => {
    if (!cropModalPhotoId) {
      setCropNaturalSize(null);
      return;
    }
    setCropNaturalSize(null);
    setCropOffset({ x: 0, y: 0 });
    cropOffsetHydratedRef.current = false;
  }, [cropModalPhotoId]);

  useEffect(() => {
    if (!photoSetupModalId) {
      setPhotoSetupNaturalSize(null);
      return;
    }
    setPhotoSetupNaturalSize(null);
    setPhotoSetupOffset({ x: 0, y: 0 });
    photoSetupOffsetHydratedRef.current = false;
  }, [photoSetupModalId]);

  useEffect(() => {
    if (!cropModalPhoto || !cropNaturalSize || cropOffsetHydratedRef.current) {
      return;
    }
    const nw = cropNaturalSize.w;
    const nh = cropNaturalSize.h;
    if (nw <= 0 || nh <= 0) return;
    const thumb = personPhotoCropForRow(cropModalPhoto);
    const { w: rw, h: rh } = cropCoverRenderedSize(
      nw,
      nh,
      CROP_PREVIEW_PX,
      cropZoom
    );
    setCropOffset(
      cropPercentToOffsetCover(thumb.x, thumb.y, rw, rh, CROP_PREVIEW_PX)
    );
    cropOffsetHydratedRef.current = true;
  }, [cropModalPhoto, cropNaturalSize]);

  useEffect(() => {
    if (!photoSetupModal || !photoSetupNaturalSize) {
      return;
    }
    if (photoSetupOffsetHydratedRef.current) return;
    const nw = photoSetupNaturalSize.w;
    const nh = photoSetupNaturalSize.h;
    if (nw <= 0 || nh <= 0) return;
    const thumb = personPhotoCropForRow(photoSetupModal);
    const { w: rw, h: rh } = cropCoverRenderedSize(
      nw,
      nh,
      CROP_PREVIEW_PX,
      photoSetupZoom
    );
    setPhotoSetupOffset(
      cropPercentToOffsetCover(thumb.x, thumb.y, rw, rh, CROP_PREVIEW_PX)
    );
    photoSetupOffsetHydratedRef.current = true;
  }, [photoSetupModal, photoSetupNaturalSize]);

  useEffect(() => {
    if (!cropNaturalSize) return;
    const { w: rw, h: rh } = cropCoverRenderedSize(
      cropNaturalSize.w,
      cropNaturalSize.h,
      CROP_PREVIEW_PX,
      cropZoom
    );
    setCropOffset((o) => clampCropOffsetCover(o, rw, rh, CROP_PREVIEW_PX));
  }, [cropZoom, cropNaturalSize]);

  useEffect(() => {
    if (!photoSetupNaturalSize) return;
    const { w: rw, h: rh } = cropCoverRenderedSize(
      photoSetupNaturalSize.w,
      photoSetupNaturalSize.h,
      CROP_PREVIEW_PX,
      photoSetupZoom
    );
    setPhotoSetupOffset((o) =>
      clampCropOffsetCover(o, rw, rh, CROP_PREVIEW_PX)
    );
  }, [photoSetupZoom, photoSetupNaturalSize]);

  const load = useCallback(async () => {
    if (!personId) {
      setError("Invalid profile.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setResearchNoteId(null);
    setResearchNoteText("");
    setResearchNoteUpdatedAt(null);
    setResearchNoteSaveError(null);
    setResearchNoteSavedFlash(false);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const { data: personData, error: personErr } = await supabase
      .from("persons")
      .select(
        "id, first_name, middle_name, last_name, birth_date, death_date, birth_place_id, death_place_id, photo_url, gender, notes, tree_id, birth_place:places!birth_place_id(township, county, state, country), death_place:places!death_place_id(township, county, state, country)"
      )
      .eq("id", personId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (personErr) {
      setError(personErr.message);
      setLoading(false);
      return;
    }
    if (!personData) {
      setError("Person not found.");
      setLoading(false);
      return;
    }

    const raw = personData as PersonRow & {
      birth_place_id?: string | null;
      death_place_id?: string | null;
      tree_id?: string | null;
      birth_place?:
        | PersonRow["birth_place"]
        | NonNullable<PersonRow["birth_place"]>[]
        | null;
      death_place?:
        | PersonRow["death_place"]
        | NonNullable<PersonRow["death_place"]>[]
        | null;
    };
    const personTreeId =
      raw.tree_id != null && String(raw.tree_id).trim() !== ""
        ? String(raw.tree_id).trim()
        : "";
    const effectiveTreeForRels = treeId || personTreeId;

    const bpJoin = raw.birth_place;
    const birth_place: PersonRow["birth_place"] =
      bpJoin == null
        ? null
        : Array.isArray(bpJoin)
          ? (bpJoin[0] ?? null)
          : bpJoin;

    const dpJoin = raw.death_place;
    const death_place: PersonRow["death_place"] =
      dpJoin == null
        ? null
        : Array.isArray(dpJoin)
          ? (dpJoin[0] ?? null)
          : dpJoin;

    const p: PersonRow = {
      ...raw,
      birth_place_id: raw.birth_place_id ?? null,
      death_place_id: raw.death_place_id ?? null,
      tree_id: raw.tree_id ?? null,
      birth_place,
      death_place,
    };

    const { data: eventData, error: eventErr } = await supabase
      .from("events")
      .select(
        "id, event_type, event_date, event_place_id, description, record_id, notes, research_notes, story_short, story_full, created_at"
      )
      .eq("person_id", personId)
      .eq("user_id", user.id)
      .order("event_date", { ascending: true, nullsFirst: false });

    if (eventErr) {
      setError(eventErr.message);
      setLoading(false);
      return;
    }

    const evs: EventRow[] = (eventData ?? []).map((row) => {
      const e = row as EventRow & { created_at?: string | null };
      return {
        ...e,
        created_at: e.created_at ?? null,
      };
    });
    const sortedEvents = sortEventsChronologically(evs);

    let relQuery = supabase
      .from("relationships")
      .select("id, person_a_id, person_b_id, relationship_type")
      .eq("user_id", user.id)
      .or(`person_a_id.eq.${personId},person_b_id.eq.${personId}`);
    if (effectiveTreeForRels !== "") {
      relQuery = relQuery.eq("tree_id", effectiveTreeForRels);
    }
    const { data: relData, error: relErr } = await relQuery;

    if (relErr) {
      setError(relErr.message);
      setLoading(false);
      return;
    }

    const parents = new Set<string>();
    const children = new Set<string>();
    const spouses = new Set<string>();
    const siblings = new Set<string>();
    const relMetaByPersonId: Record<string, RelationshipMeta> = {};

    for (const rel of (relData ?? []) as RelRow[]) {
      const c = classifyRelationship(personId, rel);
      if (!c) continue;
      if (c.category === "parent") parents.add(c.otherId);
      else if (c.category === "child") children.add(c.otherId);
      else if (c.category === "spouse") spouses.add(c.otherId);
      else if (c.category === "sibling") siblings.add(c.otherId);
      if (!relMetaByPersonId[c.otherId]) {
        relMetaByPersonId[c.otherId] = {
          otherPersonId: c.otherId,
          relationshipType: c.category,
          personAId: rel.person_a_id,
          personBId: rel.person_b_id,
        };
      }
    }

    const relatedIds = [
      ...new Set([...parents, ...children, ...spouses, ...siblings]),
    ];

    let relativesMap = new Map<string, PersonRow>();
    if (relatedIds.length > 0) {
      const { data: relPeople, error: rpErr } = await supabase
        .from("persons")
        .select(
          "id, first_name, middle_name, last_name, birth_date, death_date, photo_url"
        )
        .eq("user_id", user.id)
        .in("id", relatedIds);

      if (rpErr) {
        setError(rpErr.message);
        setLoading(false);
        return;
      }

      type RelPrimaryPhotoPick = {
        file_url: string;
        crop_x?: number;
        crop_y?: number;
        crop_zoom?: number;
        natural_width?: number;
        natural_height?: number;
      };

      const { data: relPhotos, error: relPhErr } = await supabase
        .from("photo_tags")
        .select(
          "person_id, crop_x, crop_y, crop_zoom, photos(file_url, natural_width, natural_height)"
        )
        .eq("is_primary", true)
        .eq("user_id", user.id)
        .in("person_id", relatedIds);

      if (relPhErr) {
        setError(relPhErr.message);
        setLoading(false);
        return;
      }

      const preferredByPerson = new Map<string, RelPrimaryPhotoPick>();
      const firstByPerson = new Map<string, RelPrimaryPhotoPick>();
      for (const row of relPhotos ?? []) {
        const r = row as {
          person_id?: string;
          crop_x?: number | null;
          crop_y?: number | null;
          crop_zoom?: number | null;
          photos?:
            | {
                file_url?: string | null;
                natural_width?: number | null;
                natural_height?: number | null;
              }
            | null;
        };
        const pid = r.person_id;
        const photoObj =
          r.photos && typeof r.photos === "object"
            ? (r.photos as {
                file_url?: string | null;
                natural_width?: number | null;
                natural_height?: number | null;
              })
            : null;
        const url =
          photoObj && typeof photoObj.file_url === "string"
            ? photoObj.file_url.trim()
            : "";
        if (typeof pid !== "string" || pid === "" || url === "") continue;
        const pick: RelPrimaryPhotoPick = {
          file_url: url,
          ...(typeof r.crop_x === "number" ? { crop_x: r.crop_x } : {}),
          ...(typeof r.crop_y === "number" ? { crop_y: r.crop_y } : {}),
          ...(typeof r.crop_zoom === "number" ? { crop_zoom: r.crop_zoom } : {}),
          ...(typeof photoObj?.natural_width === "number" &&
          photoObj.natural_width > 0
            ? { natural_width: photoObj.natural_width }
            : {}),
          ...(typeof photoObj?.natural_height === "number" &&
          photoObj.natural_height > 0
            ? { natural_height: photoObj.natural_height }
            : {}),
        };
        if (!firstByPerson.has(pid)) firstByPerson.set(pid, pick);
        if (!preferredByPerson.has(pid)) {
          preferredByPerson.set(pid, pick);
        }
      }

      const idsNeedingTags = relatedIds.filter(
        (id) => !preferredByPerson.has(id)
      );

      const tagPrimaryByPerson = new Map<string, RelPrimaryPhotoPick>();
      const tagFirstByPerson = new Map<string, RelPrimaryPhotoPick>();

      if (idsNeedingTags.length > 0) {
        const { data: relTagRows, error: relTagErr } = await supabase
          .from("photo_tags")
          .select("person_id, photo_id, crop_x, crop_y, crop_zoom, is_primary")
          .eq("user_id", user.id)
          .in("person_id", idsNeedingTags)
          .order("person_id", { ascending: true })
          .order("photo_id", { ascending: true });

        if (relTagErr) {
          setError(relTagErr.message);
          setLoading(false);
          return;
        }

        const relTagPhotoIds = [
          ...new Set(
            (relTagRows ?? [])
              .map((r) => (r as { photo_id?: string }).photo_id)
              .filter(
                (id): id is string => typeof id === "string" && id !== ""
              )
          ),
        ];

        if (relTagPhotoIds.length > 0) {
          const { data: relTagPhotos, error: relTagPhErr } = await supabase
            .from("photos")
            .select("id, file_url, natural_width, natural_height")
            .eq("user_id", user.id)
            .in("id", relTagPhotoIds);

          if (relTagPhErr) {
            setError(relTagPhErr.message);
            setLoading(false);
            return;
          }

          const relPhotoMetaById = new Map<
            string,
            {
              file_url: string;
              natural_width?: number;
              natural_height?: number;
            }
          >();
          for (const pr of relTagPhotos ?? []) {
            const rec = pr as {
              id?: string;
              file_url?: string | null;
              natural_width?: number | null;
              natural_height?: number | null;
            };
            const id = rec.id;
            const u =
              typeof rec.file_url === "string" ? rec.file_url.trim() : "";
            if (typeof id === "string" && id !== "" && u !== "") {
              relPhotoMetaById.set(id, {
                file_url: u,
                ...(typeof rec.natural_width === "number" && rec.natural_width > 0
                  ? { natural_width: rec.natural_width }
                  : {}),
                ...(typeof rec.natural_height === "number" &&
                rec.natural_height > 0
                  ? { natural_height: rec.natural_height }
                  : {}),
              });
            }
          }

          for (const row of relTagRows ?? []) {
            const r = row as {
              person_id?: string;
              photo_id?: string;
              crop_x?: number | null;
              crop_y?: number | null;
              crop_zoom?: number | null;
              is_primary?: boolean | null;
            };
            const pid = r.person_id;
            const phid = r.photo_id;
            if (typeof pid !== "string" || pid === "") continue;
            if (typeof phid !== "string" || phid === "") continue;
            const meta = relPhotoMetaById.get(phid);
            if (!meta) continue;
            const pick: RelPrimaryPhotoPick = {
              file_url: meta.file_url,
              ...(typeof r.crop_x === "number" ? { crop_x: r.crop_x } : {}),
              ...(typeof r.crop_y === "number" ? { crop_y: r.crop_y } : {}),
              ...(typeof r.crop_zoom === "number"
                ? { crop_zoom: r.crop_zoom }
                : {}),
              ...(meta.natural_width !== undefined
                ? { natural_width: meta.natural_width }
                : {}),
              ...(meta.natural_height !== undefined
                ? { natural_height: meta.natural_height }
                : {}),
            };
            if (!tagFirstByPerson.has(pid)) tagFirstByPerson.set(pid, pick);
            if (r.is_primary === true && !tagPrimaryByPerson.has(pid)) {
              tagPrimaryByPerson.set(pid, pick);
            }
          }
        }
      }

      const primaryPhotoByPersonId = new Map<string, RelPrimaryPhotoPick>();
      for (const pid of relatedIds) {
        let pick: RelPrimaryPhotoPick | undefined;
        if (preferredByPerson.has(pid)) {
          pick = preferredByPerson.get(pid) ?? firstByPerson.get(pid);
        } else {
          pick =
            tagPrimaryByPerson.get(pid) ??
            firstByPerson.get(pid) ??
            tagFirstByPerson.get(pid);
        }
        if (pick) primaryPhotoByPersonId.set(pid, pick);
      }

      for (const row of (relPeople ?? []) as PersonRow[]) {
        const pick = primaryPhotoByPersonId.get(row.id);
        relativesMap.set(row.id, {
          ...row,
          photo_url: pick?.file_url ?? row.photo_url ?? null,
          crop_x: pick?.crop_x ?? null,
          crop_y: pick?.crop_y ?? null,
          crop_zoom: pick?.crop_zoom ?? null,
          natural_width: pick?.natural_width ?? null,
          natural_height: pick?.natural_height ?? null,
        });
      }
    }

    const pick = (ids: Set<string>) =>
      [...ids].map((id) => relativesMap.get(id)).filter(Boolean) as PersonRow[];

    let photosParsed: Record<string, unknown>[] = [];
    const { data: tagLinkRows, error: tagLinkErr } = await supabase
      .from("photo_tags")
      .select("photo_id, crop_x, crop_y, crop_zoom, is_primary")
      .eq("person_id", personId)
      .eq("user_id", user.id);

    if (tagLinkErr) {
      setError(tagLinkErr.message);
      setLoading(false);
      return;
    }

    const tagPhotoIds = [
      ...new Set(
        (tagLinkRows ?? [])
          .map((r) => (r as { photo_id?: string }).photo_id)
          .filter((id): id is string => typeof id === "string" && id !== "")
      ),
    ];

    let photosData: Record<string, unknown>[] = [];
    if (tagPhotoIds.length > 0) {
      const { data, error: photosErr } = await supabase
        .from("photos")
        .select("*")
        .eq("user_id", user.id)
        .in("id", tagPhotoIds)
        .order("created_at", { ascending: false });

      if (photosErr) {
        setError(photosErr.message);
        setLoading(false);
        return;
      }
      photosData = (data ?? []) as Record<string, unknown>[];
    }

    const photosById = new Map<string, Record<string, unknown>>();
    for (const row of photosData ?? []) {
      const rec = row as Record<string, unknown>;
      const pid = rec.id;
      if (typeof pid === "string") {
        photosById.set(pid, rec);
      }
    }

    const tagCropByPhotoId = new Map<
      string,
      {
        crop_x: unknown;
        crop_y: unknown;
        crop_zoom: unknown;
        is_primary: unknown;
      }
    >();
    for (const tr of tagLinkRows ?? []) {
      const r = tr as {
        photo_id?: string;
        crop_x?: unknown;
        crop_y?: unknown;
        crop_zoom?: unknown;
        is_primary?: unknown;
      };
      if (typeof r.photo_id === "string" && r.photo_id !== "") {
        tagCropByPhotoId.set(r.photo_id, {
          crop_x: r.crop_x,
          crop_y: r.crop_y,
          crop_zoom: r.crop_zoom,
          is_primary: r.is_primary,
        });
      }
    }

    photosParsed = [...photosById.values()]
      .map((rec): Record<string, unknown> => {
        const pid = rec.id;
        if (typeof pid !== "string") {
          return {
            ...rec,
            __crop_save_to_tag: true,
            __person_crop_x: cropPercentFromUnknown(rec.crop_x, 50),
            __person_crop_y: cropPercentFromUnknown(rec.crop_y, 50),
            __person_crop_zoom: cropZoomFromUnknown(rec.crop_zoom, 1),
          };
        }
        const tagCrop = tagCropByPhotoId.get(pid);
        if (tagCrop) {
          return {
            ...rec,
            __crop_save_to_tag: true,
            __tag_is_primary: tagCrop.is_primary === true,
            __person_crop_x: cropPercentFromUnknown(
              tagCrop.crop_x ?? rec.crop_x,
              50
            ),
            __person_crop_y: cropPercentFromUnknown(
              tagCrop.crop_y ?? rec.crop_y,
              50
            ),
            __person_crop_zoom: cropZoomFromUnknown(
              tagCrop.crop_zoom ?? rec.crop_zoom,
              1
            ),
          };
        }
        return {
          ...rec,
          __crop_save_to_tag: true,
          __person_crop_x: cropPercentFromUnknown(rec.crop_x, 50),
          __person_crop_y: cropPercentFromUnknown(rec.crop_y, 50),
          __person_crop_zoom: cropZoomFromUnknown(rec.crop_zoom, 1),
        };
      })
      .sort((a, b) => {
        const ca = a.created_at;
        const cb = b.created_at;
        const ta =
          typeof ca === "string" ? Date.parse(ca) : Number.NEGATIVE_INFINITY;
        const tb =
          typeof cb === "string" ? Date.parse(cb) : Number.NEGATIVE_INFINITY;
        return tb - ta;
      });

    let sourceRows: EventSourceRow[] = [];
    const eventIds = sortedEvents.map((e) => e.id);
    if (eventIds.length > 0) {
      const { data: esData, error: esErr } = await supabase
        .from("event_sources")
        .select("id, event_id, record_id, notes, created_at")
        .in("event_id", eventIds);

      if (esErr) {
        setError(esErr.message);
        setLoading(false);
        return;
      }
      sourceRows = (esData ?? []) as EventSourceRow[];
    }

    const recordIdSet = new Set<string>();
    for (const e of sortedEvents) {
      const rid = e.record_id?.trim();
      if (rid) recordIdSet.add(rid);
    }
    for (const s of sourceRows) {
      const rid = s.record_id?.trim();
      if (rid) recordIdSet.add(rid);
    }
    const recordIds = [...recordIdSet];

    let recMap = new Map<string, RecordRow>();
    if (recordIds.length > 0) {
      const { data: recData, error: recErr } = await supabase
        .from("records")
        .select("id, record_type, file_type, file_url, created_at, ai_response")
        .eq("user_id", user.id)
        .in("id", recordIds);

      if (!recErr && recData) {
        for (const r of recData as RecordRow[]) {
          recMap.set(r.id, r);
        }
      }
    }

    let pnId: string | null = null;
    let pnContent = "";
    let pnUpdated: string | null = null;
    const { data: pnData, error: pnErr } = await supabase
      .from("person_notes")
      .select("id, content, updated_at")
      .eq("person_id", personId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!pnErr && pnData) {
      const row = pnData as {
        id: string;
        content: string | null;
        updated_at: string | null;
      };
      pnId = row.id;
      pnContent = row.content ?? "";
      pnUpdated = row.updated_at ?? null;
    }

    setPerson(p);
    setEvents(sortedEvents);
    setEventSources(sourceRows);
    setPhotoRows(photosParsed);
    setRecordsById(recMap);
    setFamily({
      parents: pick(parents),
      spouses: pick(spouses),
      siblings: pick(siblings),
      children: pick(children),
    });
    setRelationshipMetaByPersonId(relMetaByPersonId);
    setResearchNoteId(pnId);
    setResearchNoteText(pnContent);
    setResearchNoteUpdatedAt(pnUpdated);
    setLoading(false);
  }, [personId, router, treeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const effectiveTreeIdForFamily = useMemo(() => {
    const fromPerson = (person?.tree_id ?? "").trim();
    return treeId || fromPerson;
  }, [treeId, person?.tree_id]);

  useEffect(() => {
    if (!addFamilyModalOpen || !personId || effectiveTreeIdForFamily === "") {
      return;
    }
    let cancelled = false;
    void (async () => {
      setAddFamilyTreePeopleLoading(true);
      setAddFamilyTreePeopleError(null);
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) {
            setAddFamilyTreePeopleError("Not signed in.");
            setAddFamilyTreePeople([]);
          }
          return;
        }
        const { data, error } = await supabase
          .from("persons")
          .select("id, first_name, middle_name, last_name, birth_date")
          .eq("user_id", user.id)
          .eq("tree_id", effectiveTreeIdForFamily)
          .neq("id", personId);
        if (cancelled) return;
        if (error) {
          setAddFamilyTreePeopleError(error.message);
          setAddFamilyTreePeople([]);
          return;
        }
        const rows = (data ?? []) as TreePersonSearchRow[];
        setAddFamilyTreePeople(rows);
      } catch (e) {
        if (!cancelled) {
          setAddFamilyTreePeopleError(
            e instanceof Error ? e.message : "Could not load people."
          );
          setAddFamilyTreePeople([]);
        }
      } finally {
        if (!cancelled) setAddFamilyTreePeopleLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addFamilyModalOpen, personId, effectiveTreeIdForFamily]);

  const addFamilyFindTokens = useMemo(() => {
    const q = addFamilyFindQuery.trim().toLowerCase();
    if (!q) return [] as string[];
    return q.split(/\s+/).filter(Boolean);
  }, [addFamilyFindQuery]);

  const addFamilyRelatedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of family.parents) ids.add(p.id);
    for (const p of family.spouses) ids.add(p.id);
    for (const p of family.siblings) ids.add(p.id);
    for (const p of family.children) ids.add(p.id);
    return ids;
  }, [family]);

  const addFamilyFilteredPeople = useMemo(() => {
    return addFamilyTreePeople.filter(
      (p) =>
        p.id !== personId &&
        !addFamilyRelatedIds.has(p.id) &&
        personMatchesNameTokens(p, addFamilyFindTokens)
    );
  }, [addFamilyTreePeople, addFamilyFindTokens, addFamilyRelatedIds, personId]);

  const editRelOtherName = useMemo(() => {
    if (!editRelModal) return "";
    const all = [
      ...family.parents,
      ...family.spouses,
      ...family.siblings,
      ...family.children,
    ];
    const other = all.find((p) => p.id === editRelModal.otherPersonId);
    if (!other) return "this person";
    return [other.first_name, other.middle_name ?? "", other.last_name]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
  }, [editRelModal, family]);

  useEffect(() => {
    if (!mergeModalOpen || !personId) return;
    const q = mergeSearchQuery.trim();
    if (q.length < 2) {
      setMergeSearchResults([]);
      setMergeSearchError(null);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        setMergeSearchLoading(true);
        setMergeSearchError(null);
        try {
          const r = await fetch(
            `/api/merge-persons?q=${encodeURIComponent(q)}&exclude=${encodeURIComponent(personId)}`,
            { credentials: "include" }
          );
          const j = (await r.json()) as {
            matches?: PersonRow[];
            error?: string;
          };
          if (!r.ok) {
            throw new Error(j.error ?? "Search failed");
          }
          setMergeSearchResults(j.matches ?? []);
        } catch (e) {
          setMergeSearchError(
            e instanceof Error ? e.message : "Search failed"
          );
          setMergeSearchResults([]);
        } finally {
          setMergeSearchLoading(false);
        }
      })();
    }, 320);
    return () => window.clearTimeout(handle);
  }, [mergeSearchQuery, mergeModalOpen, personId]);

  useEffect(() => {
    let cancelled = false;
    async function signRecords() {
      if (recordsById.size === 0) {
        setSignedDocUrls(new Map());
        return;
      }
      const supabase = createClient();
      const next = new Map<string, string>();
      for (const rec of recordsById.values()) {
        const url = rec.file_url?.trim();
        if (!url) continue;
        const path = documentsObjectPathFromFileUrl(url);
        if (!path) continue;
        const { data, error } = await supabase.storage
          .from("documents")
          .createSignedUrl(path, SIGNED_URL_EXPIRY_SEC);
        if (cancelled) return;
        if (!error && data?.signedUrl) {
          next.set(rec.id, data.signedUrl);
        }
      }
      if (!cancelled) setSignedDocUrls(next);
    }
    void signRecords();
    return () => {
      cancelled = true;
    };
  }, [recordsById]);

  const headerPhotoUrl = useMemo(
    () =>
      person
        ? pickPrimaryPhotoUrl(
            photoRows,
            (person as { photo_url?: string | null }).photo_url ?? null
          )
        : null,
    [person, photoRows]
  );

  const headerPhotoCrop = useMemo(() => {
    const row = pickHeaderPhotoCropRow(photoRows);
    if (!row) return { x: 50, y: 50, zoom: 1 };
    return personPhotoCropForRow(row);
  }, [photoRows]);

  const primaryPhotoRow = useMemo(
    () =>
      photoRows.find((r) => rowIsPrimaryForDisplay(r)) ?? photoRows[0] ?? null,
    [photoRows]
  );

  const avatarCropX = useMemo(() => {
    if (!primaryPhotoRow) return 50;
    if (primaryPhotoRow.__crop_save_to_tag === true) {
      return typeof primaryPhotoRow.__person_crop_x === "number"
        ? primaryPhotoRow.__person_crop_x
        : 50;
    }
    return typeof primaryPhotoRow.crop_x === "number"
      ? primaryPhotoRow.crop_x
      : 50;
  }, [primaryPhotoRow]);

  const avatarCropY = useMemo(() => {
    if (!primaryPhotoRow) return 50;
    if (primaryPhotoRow.__crop_save_to_tag === true) {
      return typeof primaryPhotoRow.__person_crop_y === "number"
        ? primaryPhotoRow.__person_crop_y
        : 50;
    }
    return typeof primaryPhotoRow.crop_y === "number"
      ? primaryPhotoRow.crop_y
      : 50;
  }, [primaryPhotoRow]);

  const avatarCropZoom = useMemo(() => {
    if (!primaryPhotoRow) return 1;
    if (primaryPhotoRow.__crop_save_to_tag === true) {
      return typeof primaryPhotoRow.__person_crop_zoom === "number"
        ? primaryPhotoRow.__person_crop_zoom
        : 1;
    }
    return typeof primaryPhotoRow.crop_zoom === "number"
      ? primaryPhotoRow.crop_zoom
      : 1;
  }, [primaryPhotoRow]);

  const eventTypeSelectOptions = useMemo(
    () => buildEventTypeSelectOptions(events),
    [events]
  );

  const eventSourcesByEventId = useMemo(() => {
    const m = new Map<string, EventSourceRow[]>();
    for (const row of eventSources) {
      if (!m.has(row.event_id)) m.set(row.event_id, []);
      m.get(row.event_id)!.push(row);
    }
    return m;
  }, [eventSources]);

  const timelineEvents = useMemo(
    () => sortEventsChronologically(dedupeTimelineEvents(events)),
    [events]
  );

  function extFromImageFile(file: File): string {
    const t = (file.type || "").toLowerCase();
    if (t === "image/jpeg" || t === "image/jpg") return "jpg";
    if (t === "image/png") return "png";
    if (t === "image/webp") return "webp";
    if (t === "image/gif") return "gif";
    const n = file.name.toLowerCase();
    if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "jpg";
    if (n.endsWith(".png")) return "png";
    if (n.endsWith(".webp")) return "webp";
    if (n.endsWith(".gif")) return "gif";
    return "jpg";
  }

  const getNaturalSize = (file: File): Promise<{ w: number; h: number }> => {
    return new Promise((resolve) => {
      try {
        const url = URL.createObjectURL(file);
        const img = new window.Image();
        img.onload = () => {
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          URL.revokeObjectURL(url);
          resolve({ w, h });
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve({ w: 0, h: 0 });
        };
        img.src = url;
      } catch {
        resolve({ w: 0, h: 0 });
      }
    });
  };

  function photosStoragePathFromFileUrl(fileUrl: string): string | null {
    try {
      const url = new URL(fileUrl);
      const pub = "/object/public/photos/";
      const pi = url.pathname.indexOf(pub);
      if (pi !== -1) {
        return decodeURIComponent(
          url.pathname.slice(pi + pub.length).split("?")[0] ?? ""
        );
      }
      const loose = url.pathname.indexOf("/photos/");
      if (loose !== -1) {
        return decodeURIComponent(
          url.pathname.slice(loose + "/photos/".length).split("?")[0] ?? ""
        );
      }
    } catch {
      return null;
    }
    return null;
  }

  async function uploadPhoto(file: File) {
    if (!personId) return;
    setPhotoUploadError(null);
    setPhotoUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setPhotoUploadError("Not signed in.");
        return;
      }
      const { w: naturalWidth, h: naturalHeight } = await getNaturalSize(file);
      const ext = extFromImageFile(file);
      const path = `${user.id}/${personId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("photos")
        .upload(path, file, {
          contentType: file.type || `image/${ext}`,
          upsert: false,
        });
      if (upErr) {
        setPhotoUploadError(upErr.message);
        return;
      }
      const { data: pub } = supabase.storage.from("photos").getPublicUrl(path);
      const file_url = pub.publicUrl;
      const { data: primaryTagSample } = await supabase
        .from("photo_tags")
        .select("id")
        .eq("person_id", personId)
        .eq("is_primary", true)
        .limit(1);
      const isPrimary = !primaryTagSample || primaryTagSample.length === 0;

      console.log(
        "photo insert isPrimary:",
        isPrimary,
        "existingPhotos:",
        { primaryTagSample }
      );

      console.log("photo upload user:", user?.id);

      const { data: newRow, error: insErr } = await supabase
        .from("photos")
        .insert({
          user_id: user.id,
          file_url,
          ...(naturalWidth > 0 && naturalHeight > 0
            ? { natural_width: naturalWidth, natural_height: naturalHeight }
            : {}),
        })
        .select("*")
        .single();
      if (insErr || !newRow) {
        setPhotoUploadError(insErr?.message ?? "Could not save photo.");
        return;
      }
      const { error: tagInsErr } = await supabase.from("photo_tags").insert({
        photo_id: String((newRow as Record<string, unknown>).id ?? ""),
        person_id: personId,
        user_id: user.id,
        is_primary: isPrimary,
        crop_x: 50,
        crop_y: 50,
        crop_zoom: 1.0,
      });
      if (tagInsErr) {
        setPhotoUploadError(tagInsErr.message);
        return;
      }
      const inserted = newRow as Record<string, unknown>;
      setPhotoSetupModal(inserted);
      setPhotoSetupZoom(1.0);
      setPhotoSetupDate("");
      setPhotoSetupTagSearch("");
      setPhotoSetupTagResults([]);
      setPhotoSetupError(null);
      setPhotoSetupTags(
        person
          ? [
              {
                id: person.id,
                first_name: person.first_name,
                last_name: person.last_name,
                middle_name: person.middle_name ?? null,
              },
            ]
          : []
      );
    } finally {
      setPhotoUploading(false);
    }
  }

  async function setPrimaryPhoto(photoRowId: string) {
    if (!personId) return;
    setPhotoUploadError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setPhotoUploadError("Not signed in.");
      return;
    }
    const { error: clearTagsErr } = await supabase
      .from("photo_tags")
      .update({ is_primary: false })
      .eq("person_id", personId)
      .eq("user_id", user.id);
    if (clearTagsErr) {
      setPhotoUploadError(clearTagsErr.message);
      return;
    }

    const { error: setTagErr } = await supabase
      .from("photo_tags")
      .update({ is_primary: true })
      .eq("person_id", personId)
      .eq("photo_id", photoRowId)
      .eq("user_id", user.id);
    if (setTagErr) {
      setPhotoUploadError(setTagErr.message);
      return;
    }
    await load();
  }

  async function deletePhoto(row: Record<string, unknown>) {
    const id = typeof row.id === "string" ? row.id : null;
    if (!id) return;
    setPhotoUploadError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setPhotoUploadError("Not signed in.");
      return;
    }
    const { error: delTagErr } = await supabase
      .from("photo_tags")
      .delete()
      .eq("photo_id", id)
      .eq("person_id", personId)
      .eq("user_id", user.id);
    if (delTagErr) {
      setPhotoUploadError(delTagErr.message);
      return;
    }
    const { count: tagCount, error: countErr } = await supabase
      .from("photo_tags")
      .select("id", { count: "exact", head: true })
      .eq("photo_id", id)
      .eq("user_id", user.id);
    if (countErr) {
      setPhotoUploadError(countErr.message);
      return;
    }
    if ((tagCount ?? 0) === 0) {
      const fileUrl = photoUrlFromRow(row);
      if (fileUrl) {
        const storagePath = photosStoragePathFromFileUrl(fileUrl);
        if (storagePath) {
          const { error: rmErr } = await supabase.storage
            .from("photos")
            .remove([storagePath]);
          if (rmErr) {
            setPhotoUploadError(rmErr.message);
            return;
          }
        }
      }
      const { error: delPhotoErr } = await supabase
        .from("photos")
        .delete()
        .eq("id", id)
        .eq("user_id", user.id);
      if (delPhotoErr) {
        setPhotoUploadError(delPhotoErr.message);
        return;
      }
    }
    await load();
  }

  async function saveCropPosition(
    photoRowId: string,
    x: number,
    y: number,
    zoom: number
  ) {
    // requires crop_zoom on photos; crop_x, crop_y, crop_zoom on photo_tags for tagged rows
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const cx = Math.min(100, Math.max(0, x));
    const cy = Math.min(100, Math.max(0, y));
    const cz = Math.min(3, Math.max(1, zoom));
    const rowForCropSave =
      photoRows.find(
        (r) => typeof r.id === "string" && r.id === photoRowId
      ) ??
      (cropModalPhoto &&
      typeof cropModalPhoto.id === "string" &&
      cropModalPhoto.id === photoRowId
        ? cropModalPhoto
        : null);
    const saveToPhotoTags = rowForCropSave?.__crop_save_to_tag === true;
    const { error } = saveToPhotoTags
      ? await supabase
          .from("photo_tags")
          .update({ crop_x: cx, crop_y: cy, crop_zoom: cz })
          .eq("photo_id", photoRowId)
          .eq("person_id", personId)
          .eq("user_id", user.id)
      : await supabase
          .from("photos")
          .update({ crop_x: cx, crop_y: cy, crop_zoom: cz })
          .eq("id", photoRowId)
          .eq("user_id", user.id);
    if (error) {
      setPhotoUploadError(error.message);
      return;
    }
    await load();
    setCropModalPhoto(null);
  }

  function attachCropMouseDrag(
    startClientX: number,
    startClientY: number,
    startOffset: { x: number; y: number },
    renderedW: number,
    renderedH: number
  ) {
    cropMouseDragCleanupRef.current?.();
    setCropDragging(true);
    const onMove = (ev: MouseEvent) => {
      const newX = startOffset.x + (ev.clientX - startClientX);
      const newY = startOffset.y + (ev.clientY - startClientY);
      setCropOffset(
        clampCropOffsetCover(
          { x: newX, y: newY },
          renderedW,
          renderedH,
          CROP_PREVIEW_PX
        )
      );
    };
    const onUp = () => {
      setCropDragging(false);
      cropMouseDragCleanupRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    cropMouseDragCleanupRef.current = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setCropDragging(false);
    };
  }

  function handleCropCircleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    if (!cropNaturalSize) return;
    const { w: rw, h: rh } = cropCoverRenderedSize(
      cropNaturalSize.w,
      cropNaturalSize.h,
      CROP_PREVIEW_PX,
      cropZoom
    );
    attachCropMouseDrag(e.clientX, e.clientY, { ...cropOffset }, rw, rh);
  }

  function attachCropTouchDrag(
    startClientX: number,
    startClientY: number,
    startOffset: { x: number; y: number },
    renderedW: number,
    renderedH: number
  ) {
    cropTouchDragCleanupRef.current?.();
    setCropDragging(true);
    const onMove = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      ev.preventDefault();
      const t = ev.touches[0]!;
      const newX = startOffset.x + (t.clientX - startClientX);
      const newY = startOffset.y + (t.clientY - startClientY);
      setCropOffset(
        clampCropOffsetCover(
          { x: newX, y: newY },
          renderedW,
          renderedH,
          CROP_PREVIEW_PX
        )
      );
    };
    const onEnd = () => {
      setCropDragging(false);
      cropTouchDragCleanupRef.current = null;
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    cropTouchDragCleanupRef.current = () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      setCropDragging(false);
    };
  }

  function handleCropCircleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    if (!cropNaturalSize) return;
    const { w: rw, h: rh } = cropCoverRenderedSize(
      cropNaturalSize.w,
      cropNaturalSize.h,
      CROP_PREVIEW_PX,
      cropZoom
    );
    const t = e.touches[0]!;
    attachCropTouchDrag(t.clientX, t.clientY, { ...cropOffset }, rw, rh);
  }

  function attachPhotoSetupMouseDrag(
    startClientX: number,
    startClientY: number,
    startOffset: { x: number; y: number },
    renderedW: number,
    renderedH: number
  ) {
    photoSetupMouseDragCleanupRef.current?.();
    setPhotoSetupDragging(true);
    const onMove = (ev: MouseEvent) => {
      const newX = startOffset.x + (ev.clientX - startClientX);
      const newY = startOffset.y + (ev.clientY - startClientY);
      setPhotoSetupOffset(
        clampCropOffsetCover(
          { x: newX, y: newY },
          renderedW,
          renderedH,
          CROP_PREVIEW_PX
        )
      );
    };
    const onUp = () => {
      setPhotoSetupDragging(false);
      photoSetupMouseDragCleanupRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    photoSetupMouseDragCleanupRef.current = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setPhotoSetupDragging(false);
    };
  }

  function handlePhotoSetupCircleMouseDown(
    e: React.MouseEvent<HTMLDivElement>
  ) {
    if (e.button !== 0) return;
    e.preventDefault();
    if (!photoSetupNaturalSize) return;
    const { w: rw, h: rh } = cropCoverRenderedSize(
      photoSetupNaturalSize.w,
      photoSetupNaturalSize.h,
      CROP_PREVIEW_PX,
      photoSetupZoom
    );
    attachPhotoSetupMouseDrag(
      e.clientX,
      e.clientY,
      { ...photoSetupOffset },
      rw,
      rh
    );
  }

  function attachPhotoSetupTouchDrag(
    startClientX: number,
    startClientY: number,
    startOffset: { x: number; y: number },
    renderedW: number,
    renderedH: number
  ) {
    photoSetupTouchDragCleanupRef.current?.();
    setPhotoSetupDragging(true);
    const onMove = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      ev.preventDefault();
      const t = ev.touches[0]!;
      const newX = startOffset.x + (t.clientX - startClientX);
      const newY = startOffset.y + (t.clientY - startClientY);
      setPhotoSetupOffset(
        clampCropOffsetCover(
          { x: newX, y: newY },
          renderedW,
          renderedH,
          CROP_PREVIEW_PX
        )
      );
    };
    const onEnd = () => {
      setPhotoSetupDragging(false);
      photoSetupTouchDragCleanupRef.current = null;
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    photoSetupTouchDragCleanupRef.current = () => {
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      setPhotoSetupDragging(false);
    };
  }

  function handlePhotoSetupCircleTouchStart(
    e: React.TouchEvent<HTMLDivElement>
  ) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    if (!photoSetupNaturalSize) return;
    const { w: rw, h: rh } = cropCoverRenderedSize(
      photoSetupNaturalSize.w,
      photoSetupNaturalSize.h,
      CROP_PREVIEW_PX,
      photoSetupZoom
    );
    const t = e.touches[0]!;
    attachPhotoSetupTouchDrag(
      t.clientX,
      t.clientY,
      { ...photoSetupOffset },
      rw,
      rh
    );
  }

  const searchPhotoTagPersons = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 2) {
      setPhotoSetupTagResults([]);
      return;
    }
    const seq = ++photoSetupSearchSeqRef.current;
    setPhotoSetupTagSearching(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (seq === photoSetupSearchSeqRef.current) {
          setPhotoSetupTagResults([]);
        }
        return;
      }
      const pattern = `%${q}%`;
      const { data: d1, error: e1 } = await supabase
        .from("persons")
        .select("id, first_name, middle_name, last_name")
        .eq("user_id", user.id)
        .eq("tree_id", effectiveTreeIdForFamily)
        .ilike("first_name", pattern)
        .limit(10);
      const { data: d2, error: e2 } = await supabase
        .from("persons")
        .select("id, first_name, middle_name, last_name")
        .eq("user_id", user.id)
        .eq("tree_id", effectiveTreeIdForFamily)
        .ilike("last_name", pattern)
        .limit(10);
      if (e1 || e2) {
        if (seq === photoSetupSearchSeqRef.current) {
          setPhotoSetupTagResults([]);
        }
        return;
      }
      if (seq !== photoSetupSearchSeqRef.current) return;
      const seen = new Set<string>();
      const merged: PhotoSetupTagPerson[] = [];
      for (const row of [...(d1 ?? []), ...(d2 ?? [])]) {
        const r = row as PhotoSetupTagPerson;
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        merged.push({
          id: r.id,
          first_name: r.first_name,
          last_name: r.last_name,
          middle_name: r.middle_name ?? null,
        });
      }
      const taggedIds = new Set(photoSetupTagsRef.current.map((t) => t.id));
      setPhotoSetupTagResults(
        merged.filter((p) => !taggedIds.has(p.id)).slice(0, 10)
      );
    } finally {
      if (seq === photoSetupSearchSeqRef.current) {
        setPhotoSetupTagSearching(false);
      }
    }
  }, [effectiveTreeIdForFamily]);

  useEffect(() => {
    if (!photoSetupModal) return;
    const q = photoSetupTagSearch.trim();
    if (q.length < 2) {
      setPhotoSetupTagResults([]);
      setPhotoSetupTagSearching(false);
      return;
    }
    const h = window.setTimeout(() => {
      void searchPhotoTagPersons(q);
    }, 300);
    return () => window.clearTimeout(h);
  }, [photoSetupTagSearch, photoSetupModal, searchPhotoTagPersons]);

  const searchTagPersons = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 2) {
      setTagModalResults([]);
      return;
    }
    const seq = ++tagModalSearchSeqRef.current;
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (seq === tagModalSearchSeqRef.current) {
          setTagModalResults([]);
        }
        return;
      }
      const pattern = `%${q}%`;
      const { data: d1, error: e1 } = await supabase
        .from("persons")
        .select("id, first_name, middle_name, last_name")
        .eq("user_id", user.id)
        .eq("tree_id", effectiveTreeIdForFamily)
        .ilike("first_name", pattern)
        .limit(10);
      const { data: d2, error: e2 } = await supabase
        .from("persons")
        .select("id, first_name, middle_name, last_name")
        .eq("user_id", user.id)
        .eq("tree_id", effectiveTreeIdForFamily)
        .ilike("last_name", pattern)
        .limit(10);
      if (e1 || e2) {
        if (seq === tagModalSearchSeqRef.current) {
          setTagModalResults([]);
        }
        return;
      }
      if (seq !== tagModalSearchSeqRef.current) return;
      const seen = new Set<string>();
      const merged: PhotoSetupTagPerson[] = [];
      for (const row of [...(d1 ?? []), ...(d2 ?? [])]) {
        const r = row as PhotoSetupTagPerson;
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        merged.push({
          id: r.id,
          first_name: r.first_name,
          last_name: r.last_name,
          middle_name: r.middle_name ?? null,
        });
      }
      const taggedIds = new Set(tagModalTagsRef.current.map((t) => t.id));
      setTagModalResults(
        merged.filter((p) => !taggedIds.has(p.id)).slice(0, 10)
      );
    } catch {
      if (seq === tagModalSearchSeqRef.current) {
        setTagModalResults([]);
      }
    }
  }, [effectiveTreeIdForFamily]);

  useEffect(() => {
    if (!tagModalPhoto) return;
    const q = tagModalSearch.trim();
    if (q.length < 2) {
      setTagModalResults([]);
      return;
    }
    const h = window.setTimeout(() => {
      void searchTagPersons(q);
    }, 300);
    return () => window.clearTimeout(h);
  }, [tagModalSearch, tagModalPhoto, searchTagPersons]);

  async function openTagModal(photoRow: Record<string, unknown>) {
    setTagModalError(null);
    tagModalSearchSeqRef.current += 1;
    const photoId = typeof photoRow.id === "string" ? photoRow.id : null;
    if (!photoId) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setTagModalError("Not signed in.");
      return;
    }
    const { data: tagRows, error: tagErr } = await supabase
      .from("photo_tags")
      .select("person_id")
      .eq("photo_id", photoId)
      .eq("user_id", user.id);
    if (tagErr) {
      setTagModalError(tagErr.message);
      return;
    }
    const personIds = [
      ...new Set(
        (tagRows ?? [])
          .map((r) => (r as { person_id?: string }).person_id)
          .filter((id): id is string => typeof id === "string" && id !== "")
      ),
    ];
    let tags: PhotoSetupTagPerson[] = [];
    if (personIds.length > 0) {
      const { data: people, error: pErr } = await supabase
        .from("persons")
        .select("id, first_name, middle_name, last_name")
        .eq("user_id", user.id)
        .in("id", personIds);
      if (pErr) {
        setTagModalError(pErr.message);
        return;
      }
      tags = (people ?? []).map((row) => {
        const r = row as PhotoSetupTagPerson;
        return {
          id: r.id,
          first_name: r.first_name,
          last_name: r.last_name,
          middle_name: r.middle_name ?? null,
        };
      });
    }
    setTagModalTags(tags);
    setTagModalPhoto(photoRow);
    setTagModalSearch("");
    setTagModalResults([]);
  }

  async function saveTagModal() {
    if (!tagModalPhoto) return;
    const photoId =
      typeof tagModalPhoto.id === "string" ? tagModalPhoto.id : null;
    if (!photoId) return;
    setTagModalSaving(true);
    setTagModalError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setTagModalError("Not signed in.");
        return;
      }
      const { data: existingTagRows, error: existingTagErr } = await supabase
        .from("photo_tags")
        .select("person_id")
        .eq("photo_id", photoId)
        .eq("user_id", user.id);
      if (existingTagErr) {
        setTagModalError(existingTagErr.message);
        return;
      }
      const existingPersonIds = new Set(
        (existingTagRows ?? [])
          .map((r) => (r as { person_id?: string }).person_id)
          .filter((id): id is string => typeof id === "string" && id !== "")
      );
      const newTagPerson = tagModalTags.find((t) => !existingPersonIds.has(t.id));
      if (newTagPerson) {
        const { data: personPrimaryTag } = await supabase
          .from("photo_tags")
          .select("id")
          .eq("person_id", newTagPerson.id)
          .eq("is_primary", true)
          .limit(1);
        const is_primary = !personPrimaryTag || personPrimaryTag.length === 0;
        const { error: insErr } = await supabase.from("photo_tags").insert({
          photo_id: photoId,
          person_id: newTagPerson.id,
          user_id: user.id,
          is_primary,
          crop_x: 50,
          crop_y: 50,
          crop_zoom: 1.0,
        });
        if (insErr) {
          setTagModalError(insErr.message);
          return;
        }
      }
      tagModalSearchSeqRef.current += 1;
      setTagModalPhoto(null);
      setTagModalSearch("");
      setTagModalResults([]);
      setTagModalTags([]);
      await load();
    } finally {
      setTagModalSaving(false);
    }
  }

  function closeTagModal() {
    if (tagModalSaving) return;
    tagModalSearchSeqRef.current += 1;
    setTagModalPhoto(null);
    setTagModalError(null);
    setTagModalSearch("");
    setTagModalResults([]);
    setTagModalTags([]);
  }

  async function savePhotoSetup() {
    if (!photoSetupModal) return;
    const photoId =
      typeof photoSetupModal.id === "string" ? photoSetupModal.id : null;
    if (!photoId) return;
    setPhotoSetupSaving(true);
    setPhotoSetupError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setPhotoSetupError("Not signed in.");
        return;
      }
      if (!photoSetupNaturalSize) {
        setPhotoSetupError("Photo is still loading.");
        return;
      }
      const { w: setupRw, h: setupRh } = cropCoverRenderedSize(
        photoSetupNaturalSize.w,
        photoSetupNaturalSize.h,
        CROP_PREVIEW_PX,
        photoSetupZoom
      );
      const { x: cx, y: cy } = offsetToCropPercentCover(
        photoSetupOffset,
        setupRw,
        setupRh,
        CROP_PREVIEW_PX
      );
      const cz = Math.min(3, Math.max(1, photoSetupZoom));
      const dateTrim = photoSetupDate.trim();
      const { error: upErr } = await supabase
        .from("photos")
        .update({
          photo_date: dateTrim === "" ? null : dateTrim,
        })
        .eq("id", photoId)
        .eq("user_id", user.id);
      if (upErr) {
        setPhotoSetupError(upErr.message);
        return;
      }
      const { error: cropErr } = await supabase
        .from("photo_tags")
        .update({ crop_x: cx, crop_y: cy, crop_zoom: cz })
        .eq("photo_id", photoId)
        .eq("person_id", personId)
        .eq("user_id", user.id);
      if (cropErr) {
        setPhotoSetupError(cropErr.message);
        return;
      }
      const setupTagPersonIds = photoSetupTags.map((t) => t.id);
      const setupWithPhotos = new Set<string>();
      const setupWithTags = new Set<string>();
      if (setupTagPersonIds.length > 0) {
        const { data: ph } = await supabase
          .from("photos")
          .select("person_id")
          .in("person_id", setupTagPersonIds);
        const { data: tg } = await supabase
          .from("photo_tags")
          .select("person_id")
          .in("person_id", setupTagPersonIds);
        for (const r of ph ?? []) {
          const pid = (r as { person_id?: string }).person_id;
          if (typeof pid === "string") setupWithPhotos.add(pid);
        }
        for (const r of tg ?? []) {
          const pid = (r as { person_id?: string }).person_id;
          if (typeof pid === "string") setupWithTags.add(pid);
        }
      }
      const tagRows = photoSetupTags.map((t) => {
        const is_primary =
          !setupWithPhotos.has(t.id) && !setupWithTags.has(t.id);
        return {
          photo_id: photoId,
          person_id: t.id,
          user_id: user.id,
          is_primary,
          ...(is_primary ? { crop_x: cx, crop_y: cy, crop_zoom: cz } : {}),
        };
      });
      if (tagRows.length > 0) {
        const { error: tagErr } = await supabase.from("photo_tags").upsert(
          tagRows,
          {
            onConflict: "photo_id,person_id",
            ignoreDuplicates: true,
          }
        );
        if (tagErr) {
          setPhotoSetupError(tagErr.message);
          return;
        }
      }
      photoSetupSearchSeqRef.current += 1;
      setPhotoSetupModal(null);
      await load();
    } finally {
      setPhotoSetupSaving(false);
    }
  }

  function skipPhotoSetup() {
    photoSetupSearchSeqRef.current += 1;
    setPhotoSetupModal(null);
    setPhotoSetupError(null);
    void load();
  }

  async function saveResearchNotes() {
    if (!personId) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    setResearchNoteSaving(true);
    setResearchNoteSaveError(null);
    const now = new Date().toISOString();
    const content = researchNoteText;

    try {
      if (researchNoteId) {
        const { data, error } = await supabase
          .from("person_notes")
          .update({ content, updated_at: now })
          .eq("id", researchNoteId)
          .eq("user_id", user.id)
          .select("updated_at")
          .single();

        if (error) {
          setResearchNoteSaveError(error.message);
          return;
        }
        if (data && typeof (data as { updated_at?: string }).updated_at === "string") {
          setResearchNoteUpdatedAt(
            (data as { updated_at: string }).updated_at
          );
        } else {
          setResearchNoteUpdatedAt(now);
        }
      } else {
        const { data, error } = await supabase
          .from("person_notes")
          .insert({
            user_id: user.id,
            person_id: personId,
            content,
            updated_at: now,
          })
          .select("id, updated_at")
          .single();

        if (error) {
          setResearchNoteSaveError(error.message);
          return;
        }
        if (data) {
          const row = data as { id: string; updated_at?: string | null };
          setResearchNoteId(row.id);
          setResearchNoteUpdatedAt(row.updated_at ?? now);
        }
      }

      setResearchNoteSavedFlash(true);
      window.setTimeout(() => setResearchNoteSavedFlash(false), 2000);
    } finally {
      setResearchNoteSaving(false);
    }
  }

  function openEditPersonModal() {
    if (!person) return;
    const gRaw = (person.gender ?? "").trim();
    const gLower = gRaw.toLowerCase();
    let genderVal = gRaw;
    if (gLower === "male") genderVal = "Male";
    else if (gLower === "female") genderVal = "Female";
    else if (gLower === "unknown") genderVal = "Unknown";

    setEditPersonDraft({
      first_name: person.first_name,
      middle_name: person.middle_name ?? "",
      last_name: person.last_name,
      birth_date: normalizeDateToMMDDYYYY(person.birth_date),
      death_date: normalizeDateToMMDDYYYY(person.death_date),
      birth_place_id: person.birth_place_id ?? null,
      birth_place_display: person.birth_place ? formatPlace(person.birth_place) : "",
      death_place_display: person.death_place ? formatPlace(person.death_place) : "",
      death_place_id: person.death_place_id ?? null,
      gender: genderVal,
      notes: person.notes ?? "",
    });
    setPersonEditError(null);
    setEditPersonOpen(true);
  }

  function closeEditPersonModal() {
    setEditPersonOpen(false);
    setEditPersonDraft(null);
    setPersonEditError(null);
  }

  async function savePersonFromModal() {
    async function resolvePlace(
      display: string,
      id: string | null
    ): Promise<string | null> {
      if (!display.trim()) return null;
      if (id) return id;
      try {
        const res = await fetch("/api/places/find-or-create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display: display.trim() }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { id?: string };
        return data.id ?? null;
      } catch {
        return null;
      }
    }

    if (!editPersonDraft || !personId) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    setPersonEditSaving(true);
    setPersonEditError(null);
    const d = editPersonDraft;
    const resolvedBirthPlaceId = await resolvePlace(
      d.birth_place_display,
      d.birth_place_id
    );
    const resolvedDeathPlaceId = await resolvePlace(
      d.death_place_display,
      d.death_place_id
    );
    const { data, error } = await supabase
      .from("persons")
      .update({
        first_name: d.first_name.trim(),
        middle_name: d.middle_name.trim() || null,
        last_name: d.last_name.trim(),
        birth_date: d.birth_date.trim() || null,
        death_date: d.death_date.trim() || null,
        birth_place_id: resolvedBirthPlaceId,
        death_place_id: resolvedDeathPlaceId,
        gender: d.gender.trim() || null,
        notes: d.notes.trim() || null,
      })
      .eq("id", personId)
      .eq("user_id", user.id)
      .select(
        "id, first_name, middle_name, last_name, birth_date, death_date, birth_place_id, death_place_id, photo_url, gender, notes, birth_place:places!birth_place_id(township, county, state, country), death_place:places!death_place_id(township, county, state, country)"
      )
      .single();

    setPersonEditSaving(false);
    if (error) {
      setPersonEditError(error.message);
      return;
    }
    if (data) {
      const row = data as PersonRow & {
        birth_place_id?: string | null;
        death_place_id?: string | null;
        birth_place?: { township: string | null; county: string | null; state: string | null; country: string } | { township: string | null; county: string | null; state: string | null; country: string }[] | null;
        death_place?: { township: string | null; county: string | null; state: string | null; country: string } | { township: string | null; county: string | null; state: string | null; country: string }[] | null;
      };
      const bp = row.birth_place;
      const dp = row.death_place;
      const normBp = bp == null ? null : Array.isArray(bp) ? (bp[0] ?? null) : bp;
      const normDp = dp == null ? null : Array.isArray(dp) ? (dp[0] ?? null) : dp;
      setPerson({
        ...row,
        birth_place_id: row.birth_place_id ?? null,
        death_place_id: row.death_place_id ?? null,
        birth_place: normBp,
        death_place: normDp,
      });
    }
    closeEditPersonModal();
  }

  async function confirmDeletePerson() {
    if (!person) return;
    const supabase = createClient();
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    if (!u) return;

    setDeletePersonBusy(true);
    const { error: delErr } = await supabase
      .from("persons")
      .delete()
      .eq("id", person.id)
      .eq("user_id", u.id);

    setDeletePersonBusy(false);
    if (delErr) {
      setError(delErr.message);
      setDeletePersonOpen(false);
      return;
    }
    setDeletePersonOpen(false);
    const deletedTreeId = (person.tree_id ?? "").trim();
    router.push(
      deletedTreeId !== "" ? `/dashboard/${deletedTreeId}` : "/dashboard"
    );
    router.refresh();
  }

  function resetMergeModalState() {
    setMergeSearchQuery("");
    setMergeSearchResults([]);
    setMergeSearchError(null);
    setMergeSelectedDup(null);
    setMergeUiStep("search");
    setMergeFieldChoices({});
    setMergeError(null);
    setMergeSaving(false);
    setMergeSearchLoading(false);
  }

  function openMergeModal() {
    resetMergeModalState();
    setMergeModalOpen(true);
  }

  function closeMergeModal() {
    setMergeModalOpen(false);
    resetMergeModalState();
  }

  function selectMergeDuplicate(dup: PersonRow) {
    if (!person) return;
    const id = String(dup?.id ?? "").trim();
    if (!id) return;
    const normalized: PersonRow = {
      ...dup,
      id,
      first_name: dup.first_name ?? "",
      last_name: dup.last_name ?? "",
      middle_name: dup.middle_name ?? null,
      birth_date: dup.birth_date ?? null,
      death_date: dup.death_date ?? null,
      birth_place_id: dup.birth_place_id ?? null,
      photo_url: dup.photo_url ?? null,
      gender: dup.gender ?? null,
      notes: dup.notes ?? null,
    };
    setMergeSelectedDup(normalized);
    setMergeUiStep("compare");
    const choices: Record<string, "primary" | "duplicate"> = {};
    for (const k of MERGE_COMPARE_KEYS) {
      if (mergeFieldsConflict(person, normalized, k)) choices[k] = "primary";
    }
    setMergeFieldChoices(choices);
  }

  function backToMergeSearch() {
    setMergeSelectedDup(null);
    setMergeFieldChoices({});
    setMergeUiStep("search");
  }

  async function confirmMerge() {
    if (!person || !mergeSelectedDup) return;
    setMergeSaving(true);
    setMergeError(null);
    try {
      const r = await fetch("/api/merge-persons", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryId: person.id,
          duplicateId: mergeSelectedDup.id,
          fieldChoices: mergeFieldChoices,
        }),
      });
      const j = (await r.json()) as { error?: string };
      if (!r.ok) {
        throw new Error(j.error ?? "Merge failed");
      }
      closeMergeModal();
      await load();
    } catch (e) {
      setMergeError(e instanceof Error ? e.message : "Merge failed");
    } finally {
      setMergeSaving(false);
    }
  }

  function resetAddFamilyModalFormState() {
    setAddFamilyTab("find");
    setAddFamilyFindQuery("");
    setAddFamilySelectedOther(null);
    setAddFamilyFindRel("parent");
    setAddFamilyFindBusy(false);
    setAddFamilyFindError(null);
    setAddFamilyCreateFirst("");
    setAddFamilyCreateMiddle("");
    setAddFamilyCreateLast("");
    setAddFamilyCreateBirth("");
    setAddFamilyCreateDeath("");
    setAddFamilyCreateGender("");
    setAddFamilyCreateRel("parent");
    setAddFamilyCreateBusy(false);
    setAddFamilyCreateError(null);
    setAddFamilyTreePeopleError(null);
  }

  function openAddFamilyModal() {
    resetAddFamilyModalFormState();
    setAddFamilyModalOpen(true);
  }

  function closeAddFamilyModal() {
    if (addFamilyFindBusy || addFamilyCreateBusy) return;
    setAddFamilyModalOpen(false);
    resetAddFamilyModalFormState();
  }

  async function submitEditRelationship() {
    if (!personId || !editRelModal || effectiveTreeIdForFamily === "") return;
    const nextType = editRelType.trim().toLowerCase();
    if (
      nextType !== "parent" &&
      nextType !== "child" &&
      nextType !== "spouse" &&
      nextType !== "sibling"
    ) {
      setEditRelError("Choose a valid relationship type.");
      return;
    }
    setEditRelBusy(true);
    setEditRelError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setEditRelError("Not signed in.");
        return;
      }
      const reverseType =
        editRelModal.relationshipType === "parent"
          ? "child"
          : editRelModal.relationshipType === "child"
            ? "parent"
            : editRelModal.relationshipType;
      const { error: delErr } = await supabase
        .from("relationships")
        .delete()
        .eq("user_id", user.id)
        .eq("tree_id", effectiveTreeIdForFamily)
        .or(
          `and(person_a_id.eq.${editRelModal.personAId},person_b_id.eq.${editRelModal.personBId},relationship_type.eq.${editRelModal.relationshipType}),and(person_a_id.eq.${editRelModal.personBId},person_b_id.eq.${editRelModal.personAId},relationship_type.eq.${reverseType})`
        );
      if (delErr) {
        setEditRelError(delErr.message);
        return;
      }
      const nextRows = bidirectionalRelationshipRows(
        nextType as FamilyRelationshipChoice,
        personId,
        editRelModal.otherPersonId
      );
      const base = {
        user_id: user.id,
        tree_id: effectiveTreeIdForFamily,
      };
      const { error: e1 } = await supabase.from("relationships").insert({
        ...base,
        person_a_id: nextRows[0]!.person_a_id,
        person_b_id: nextRows[0]!.person_b_id,
        relationship_type: nextRows[0]!.relationship_type,
      });
      if (e1) {
        setEditRelError(e1.message);
        return;
      }
      const { error: e2 } = await supabase.from("relationships").insert({
        ...base,
        person_a_id: nextRows[1]!.person_a_id,
        person_b_id: nextRows[1]!.person_b_id,
        relationship_type: nextRows[1]!.relationship_type,
      });
      if (e2) {
        setEditRelError(e2.message);
        return;
      }
      setEditRelModal(null);
      setEditRelType("");
      await load();
    } finally {
      setEditRelBusy(false);
    }
  }

  async function submitRemoveRelationship() {
    if (!personId || !editRelModal || effectiveTreeIdForFamily === "") return;
    setEditRelBusy(true);
    setEditRelError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setEditRelError("Not signed in.");
        return;
      }
      const reverseType =
        editRelModal.relationshipType === "parent"
          ? "child"
          : editRelModal.relationshipType === "child"
            ? "parent"
            : editRelModal.relationshipType;
      const { error: delErr } = await supabase
        .from("relationships")
        .delete()
        .eq("user_id", user.id)
        .eq("tree_id", effectiveTreeIdForFamily)
        .or(
          `and(person_a_id.eq.${editRelModal.personAId},person_b_id.eq.${editRelModal.personBId},relationship_type.eq.${editRelModal.relationshipType}),and(person_a_id.eq.${editRelModal.personBId},person_b_id.eq.${editRelModal.personAId},relationship_type.eq.${reverseType})`
        );
      if (delErr) {
        setEditRelError(delErr.message);
        return;
      }
      setEditRelModal(null);
      setEditRelType("");
      await load();
    } finally {
      setEditRelBusy(false);
    }
  }

  async function submitAddFamilyLinkExisting() {
    if (
      !personId ||
      !addFamilySelectedOther ||
      effectiveTreeIdForFamily === ""
    ) {
      return;
    }
    const otherId = addFamilySelectedOther.id.trim();
    if (!otherId || otherId === personId) {
      setAddFamilyFindError("Pick someone else in this tree.");
      return;
    }
    setAddFamilyFindBusy(true);
    setAddFamilyFindError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAddFamilyFindError("Not signed in.");
        return;
      }
      const rows = bidirectionalRelationshipRows(
        addFamilyFindRel,
        personId,
        otherId
      );
      const base = {
        user_id: user.id,
        tree_id: effectiveTreeIdForFamily,
      };
      const { error: e1 } = await supabase.from("relationships").insert({
        ...base,
        person_a_id: rows[0]!.person_a_id,
        person_b_id: rows[0]!.person_b_id,
        relationship_type: rows[0]!.relationship_type,
      });
      if (e1) {
        setAddFamilyFindError(e1.message);
        return;
      }
      const { error: e2 } = await supabase.from("relationships").insert({
        ...base,
        person_a_id: rows[1]!.person_a_id,
        person_b_id: rows[1]!.person_b_id,
        relationship_type: rows[1]!.relationship_type,
      });
      if (e2) {
        await supabase
          .from("relationships")
          .delete()
          .eq("user_id", user.id)
          .eq("tree_id", effectiveTreeIdForFamily)
          .eq("person_a_id", rows[0]!.person_a_id)
          .eq("person_b_id", rows[0]!.person_b_id)
          .eq("relationship_type", rows[0]!.relationship_type);
        setAddFamilyFindError(e2.message);
        return;
      }
      setAddFamilyModalOpen(false);
      resetAddFamilyModalFormState();
      await load();
    } finally {
      setAddFamilyFindBusy(false);
    }
  }

  async function submitAddFamilyCreateAndLink() {
    if (!personId || effectiveTreeIdForFamily === "") return;
    const first_name = addFamilyCreateFirst.trim();
    const last_name = addFamilyCreateLast.trim();
    if (!first_name || !last_name) {
      setAddFamilyCreateError("First and last name are required.");
      return;
    }
    setAddFamilyCreateBusy(true);
    setAddFamilyCreateError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAddFamilyCreateError("Not signed in.");
        return;
      }
      const middle_name =
        addFamilyCreateMiddle.trim() === ""
          ? null
          : addFamilyCreateMiddle.trim();
      const birth_date =
        addFamilyCreateBirth.trim() === ""
          ? null
          : addFamilyCreateBirth.trim();
      const death_date =
        addFamilyCreateDeath.trim() === ""
          ? null
          : addFamilyCreateDeath.trim();
      const genderTrim = addFamilyCreateGender.trim();
      const gender = genderTrim === "" ? "Unknown" : genderTrim;

      const { data: newPerson, error: insP } = await supabase
        .from("persons")
        .insert({
          user_id: user.id,
          tree_id: effectiveTreeIdForFamily,
          first_name,
          middle_name,
          last_name,
          birth_date,
          death_date,
          gender,
          notes: null,
          photo_url: null,
        })
        .select("id")
        .single();

      if (insP || !newPerson) {
        setAddFamilyCreateError(insP?.message ?? "Could not create person.");
        return;
      }
      const otherId = String((newPerson as { id: string }).id);

      const rows = bidirectionalRelationshipRows(
        addFamilyCreateRel,
        personId,
        otherId
      );
      const base = {
        user_id: user.id,
        tree_id: effectiveTreeIdForFamily,
      };
      const { error: e1 } = await supabase.from("relationships").insert({
        ...base,
        person_a_id: rows[0]!.person_a_id,
        person_b_id: rows[0]!.person_b_id,
        relationship_type: rows[0]!.relationship_type,
      });
      if (e1) {
        await supabase.from("persons").delete().eq("id", otherId).eq("user_id", user.id);
        setAddFamilyCreateError(e1.message);
        return;
      }
      const { error: e2 } = await supabase.from("relationships").insert({
        ...base,
        person_a_id: rows[1]!.person_a_id,
        person_b_id: rows[1]!.person_b_id,
        relationship_type: rows[1]!.relationship_type,
      });
      if (e2) {
        await supabase
          .from("relationships")
          .delete()
          .eq("user_id", user.id)
          .eq("tree_id", effectiveTreeIdForFamily)
          .eq("person_a_id", rows[0]!.person_a_id)
          .eq("person_b_id", rows[0]!.person_b_id)
          .eq("relationship_type", rows[0]!.relationship_type);
        await supabase.from("persons").delete().eq("id", otherId).eq("user_id", user.id);
        setAddFamilyCreateError(e2.message);
        return;
      }
      setAddFamilyModalOpen(false);
      resetAddFamilyModalFormState();
      await load();
    } finally {
      setAddFamilyCreateBusy(false);
    }
  }

  function startEditEvent(ev: EventRow) {
    setEventEditError(null);
    setEventDeleteConfirmId(null);
    setEditingEventId(ev.id);
    setEventEditDraft({
      event_type: ev.event_type?.trim() || "other",
      event_date: normalizeDateToMMDDYYYY(ev.event_date),
      event_place_id: ev.event_place_id ?? null,
      story_short: ev.story_short?.trim() ?? "",
      story_full: ev.story_full?.trim() ?? "",
      notes: ev.notes?.trim() ?? "",
    });
  }

  function cancelEditEvent() {
    setEditingEventId(null);
    setEventEditDraft(null);
    setEventEditError(null);
  }

  async function saveEditEvent() {
    const eventId = editingEventId;
    if (!eventId || !eventEditDraft) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    setEventEditSaving(true);
    setEventEditError(null);
    const d = eventEditDraft;
    // Existing row only — never insert/upsert here.
    const { data, error } = await supabase
      .from("events")
      .update({
        event_type: d.event_type.trim() || "other",
        event_date: d.event_date.trim() || null,
        event_place_id: d.event_place_id ?? null,
        story_short: d.story_short.trim() || null,
        story_full: d.story_full.trim() || null,
        notes: d.notes.trim() || null,
      })
      .eq("id", eventId)
      .eq("user_id", user.id)
      .select(
        "id, event_type, event_date, event_place_id, description, record_id, notes, research_notes, story_short, story_full, created_at"
      )
      .single();

    setEventEditSaving(false);
    if (error) {
      setEventEditError(error.message);
      return;
    }
    if (data) {
      const row = data as EventRow & { created_at?: string | null };
      const merged: EventRow = {
        ...row,
        created_at: row.created_at ?? null,
      };
      setEvents((prev) =>
        sortEventsChronologically(
          prev.map((e) => (e.id === eventId ? { ...e, ...merged } : e))
        )
      );
      if (d.event_type.trim() === "birth") {
        await supabase
          .from("persons")
          .update({ birth_date: d.event_date.trim() || null })
          .eq("id", personId);
        setPerson((prev) =>
          prev ? { ...prev, birth_date: d.event_date.trim() || null } : prev
        );
      }
    }
    cancelEditEvent();
  }

  async function deleteSourceLink(
    recordId: string,
    clusterEventIds: string[]
  ) {
    if (!clusterEventIds.length) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setSourceDeletingKey(recordId);
    try {
      await supabase
        .from("event_sources")
        .delete()
        .eq("record_id", recordId)
        .in("event_id", clusterEventIds);
      await supabase
        .from("events")
        .update({ record_id: null })
        .eq("record_id", recordId)
        .eq("user_id", user.id)
        .in("id", clusterEventIds);
      setEventSources((prev) =>
        prev.filter(
          (s) =>
            !(s.record_id === recordId && clusterEventIds.includes(s.event_id))
        )
      );
      setEvents((prev) =>
        prev.map((e) =>
          clusterEventIds.includes(e.id) && e.record_id === recordId
            ? { ...e, record_id: null }
            : e
        )
      );
      setSourceDeleteConfirmKey(null);
    } finally {
      setSourceDeletingKey(null);
    }
  }

  async function deleteEventById(eventId: string) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    setEventDeletingId(eventId);
    const { error } = await supabase
      .from("events")
      .delete()
      .eq("id", eventId)
      .eq("user_id", user.id);

    setEventDeletingId(null);
    setEventDeleteConfirmId(null);
    if (error) {
      setError(error.message);
      return;
    }
    if (editingEventId === eventId) cancelEditEvent();
    setEvents((prev) => prev.filter((e) => e.id !== eventId));
    setEventSources((prev) => prev.filter((s) => s.event_id !== eventId));
    setExpandedTimelineNotesKeys((prev) => {
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
    setExpandedTimelineSourcesKeys((prev) => {
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
    setExpandedTimelineStoryKeys((prev) => {
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
  }

  async function handleAddEventSave() {
    if (!addEventDraft.event_type.trim()) return;
    setAddEventSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      let placeId: string | null = addEventDraft.event_place_id;
      if (!placeId && addEventDraft.event_place_fields) {
        const res = await fetch("/api/places/find-or-create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(addEventDraft.event_place_fields),
        });
        if (res.ok) {
          const data = await res.json();
          placeId = data.id ?? null;
        }
      }

      const { data: insertedEvent, error } = await supabase
        .from("events")
        .insert({
          user_id: user.id,
          person_id: personId,
          event_type: addEventDraft.event_type.trim(),
          event_date: addEventDraft.event_date.trim() || null,
          event_place_id: placeId,
          notes: addEventDraft.notes.trim() || null,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Generate story in Dead Gossip voice
      if (person && insertedEvent?.id) {
        const personName = [
          person.first_name,
          person.middle_name,
          person.last_name,
        ]
          .filter(Boolean)
          .join(" ");

        const placeString = addEventDraft.event_place_fields
          ? [
              addEventDraft.event_place_fields.township,
              addEventDraft.event_place_fields.county,
              addEventDraft.event_place_fields.state,
              addEventDraft.event_place_fields.country,
            ]
              .filter(Boolean)
              .join(", ")
          : null;

        try {
          const storyRes = await fetch("/api/regenerate-story", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tree_id: person.tree_id,
              person_name: personName,
              event_type: addEventDraft.event_type.trim(),
              event_date: addEventDraft.event_date.trim() || null,
              event_place: placeString,
              event_notes: addEventDraft.notes.trim() || null,
              related_people: [],
            }),
          });

          if (storyRes.ok) {
            const storyData = await storyRes.json();
            if (storyData.story_full) {
              await supabase
                .from("events")
                .update({ story_full: storyData.story_full })
                .eq("id", insertedEvent.id);
            }
          }
        } catch {
          // Story generation failure is silent — event is already saved
        }
      }

      setAddEventOpen(false);
      setAddEventDraft({
        event_type: "",
        event_date: "",
        description: "",
        notes: "",
        event_place_id: null,
        event_place_fields: null,
        event_place_display: "",
      });
      await load();
    } finally {
      setAddEventSaving(false);
    }
  }

  async function handleAddSource(eventId: string, file: File) {
    setSourceUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const tempId = crypto.randomUUID();
      const path = `${user.id}/${tempId}/${file.name}`;

      const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage
        .from("documents")
        .getPublicUrl(path);

      const { data: recordRow, error: recordErr } = await supabase
        .from("records")
        .insert({
          user_id: user.id,
          tree_id: person?.tree_id ?? null,
          file_type: file.type,
          file_url: urlData.publicUrl,
          record_type: pendingSourceName.trim() || null,
        })
        .select("id")
        .single();

      if (recordErr || !recordRow) throw recordErr;

      await supabase.from("event_sources").insert({
        event_id: eventId,
        record_id: recordRow.id,
        notes: pendingSourceName.trim() || null,
        user_id: user.id,
      });

      setAddingSourceEventId(null);
      setPendingSourceFile(null);
      setPendingSourceName("");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error("Source upload failed:", msg);
      alert("Upload failed: " + msg);
    } finally {
      setSourceUploading(false);
    }
  }

  function toggleTimelineNotesForEvent(eventId: string) {
    setExpandedTimelineNotesKeys((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  function toggleTimelineSourcesForEvent(eventId: string) {
    setExpandedTimelineSourcesKeys((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  function toggleTimelineStoryExpanded(eventId: string) {
    setExpandedTimelineStoryKeys((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  const btnOutline: React.CSSProperties = {
    fontFamily: sans,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.brownOutline,
    color: colors.brownDark,
    backgroundColor: "transparent",
    padding: "0.5rem 1rem",
    borderRadius: 4,
    fontSize: "0.875rem",
    fontWeight: 600,
    cursor: "pointer",
  };

  const headerMenuItemBaseStyle: CSSProperties = {
    fontFamily: sans,
    fontSize: "0.875rem",
    padding: "0.5rem 1rem",
    width: "100%",
    textAlign: "left",
    border: "none",
    cursor: "pointer",
    backgroundColor: "transparent",
    boxSizing: "border-box",
  };

  if (loading) {
    return (
      <div className="min-h-[50vh]">
        <nav
          className="border-b px-4 py-3 sm:px-6"
          style={{
            backgroundColor: colors.cream,
            borderColor: `${colors.brownBorder}55`,
          }}
        >
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
              <div className="min-w-0 shrink-0">
                <p
                  className="text-xl font-bold tracking-tight sm:text-2xl"
                  style={{ fontFamily: serif, color: colors.brownDark }}
                >
                  Dead Gossip
                </p>
                <p
                  className="mt-0.5 text-xs sm:text-sm"
                  style={{
                    fontFamily: sans,
                    fontStyle: "italic",
                    fontSize: "1rem",
                    color: colors.brownMuted,
                  }}
                >
                  The good, the bad, the buried.
                </p>
              </div>
              <div
                className="min-w-0 border-l pl-3 sm:pl-4"
                style={{ borderColor: `${colors.brownBorder}99` }}
              >
                <Link
                  href={backToTreeHref}
                  className="mt-1 inline-block text-xs underline sm:text-sm"
                  style={{ color: "#C4A882" }}
                >
                  {backToTreeLabel}
                </Link>
              </div>
            </div>
            <button
              type="button"
              className="shrink-0"
              aria-label={
                theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
              }
              style={{
                fontFamily: sans,
                fontSize: "1.2rem",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "0.4rem 0.6rem",
                borderRadius: 4,
              }}
              onClick={toggleTheme}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          </div>
        </nav>
        <div className="flex items-center justify-center px-4 py-16">
          <p style={{ fontFamily: sans, color: colors.brownMuted }}>
            Opening profile…
          </p>
        </div>
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="min-h-[50vh]">
        <nav
          className="border-b px-4 py-3 sm:px-6"
          style={{
            backgroundColor: colors.cream,
            borderColor: `${colors.brownBorder}55`,
          }}
        >
          <div className="mx-auto flex w-full max-w-5xl flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
              <div className="min-w-0 shrink-0">
                <p
                  className="text-xl font-bold tracking-tight sm:text-2xl"
                  style={{ fontFamily: serif, color: colors.brownDark }}
                >
                  Dead Gossip
                </p>
                <p
                  className="mt-0.5 text-xs sm:text-sm"
                  style={{
                    fontFamily: sans,
                    fontStyle: "italic",
                    fontSize: "1rem",
                    color: colors.brownMuted,
                  }}
                >
                  The good, the bad, the buried.
                </p>
              </div>
              <div
                className="min-w-0 border-l pl-3 sm:pl-4"
                style={{ borderColor: `${colors.brownBorder}99` }}
              >
                <Link
                  href={backToTreeHref}
                  className="mt-1 inline-block text-xs underline sm:text-sm"
                  style={{ color: "#C4A882" }}
                >
                  {backToTreeLabel}
                </Link>
              </div>
            </div>
            <button
              type="button"
              className="shrink-0"
              aria-label={
                theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
              }
              style={{
                fontFamily: sans,
                fontSize: "1.2rem",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: "0.4rem 0.6rem",
                borderRadius: 4,
              }}
              onClick={toggleTheme}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
          </div>
        </nav>
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p style={{ fontFamily: sans, color: colors.brownDark }}>{error}</p>
          <Link
            href={backToTreeHref}
            className="mt-6 inline-block text-sm underline"
            style={{ color: "#C4A882" }}
          >
            {backToTreeLabel}
          </Link>
        </div>
      </div>
    );
  }

  const lastName = person.last_name.trim() || "—";
  const firstMiddle = [person.first_name, person.middle_name ?? ""]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");

  const headerGenderBadge = genderBadgeLabel(person.gender);
  const headerBirthPlaceStr = person.birth_place ? formatPlace(person.birth_place) : "";
  const headerHasBirthPlace = headerBirthPlaceStr.trim().length > 0;

  const birthLine = [
    person.birth_date ? `b. ${formatDateString(person.birth_date)}` : null,
    headerHasBirthPlace ? headerBirthPlaceStr : null,
  ].filter(Boolean).join("  ·  ");

  const headerDeathPlaceStr = person.death_place
    ? formatPlace(person.death_place)
    : "";
  const deathLine = [
    person.death_date ? `d. ${formatDateString(person.death_date)}` : null,
    headerDeathPlaceStr || null,
  ].filter(Boolean).join("  ·  ");

  const headerNoDates = !birthLine && !deathLine;

  const personFullName = [
    person.first_name,
    person.middle_name ?? "",
    person.last_name,
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");

  const modalInputStyle: React.CSSProperties = {
    fontFamily: sans,
    color: colors.brownDark,
    backgroundColor: colors.cream,
    borderColor: colors.brownBorder,
    borderWidth: 1,
    borderStyle: "solid",
    padding: "0.5rem 0.65rem",
    fontSize: "0.875rem",
    borderRadius: 2,
    width: "100%",
    boxSizing: "border-box",
    outlineColor: colors.brownOutline,
  };

  const documentRecordIds = new Set<string>();
  for (const e of events) {
    const id = e.record_id?.trim();
    if (id && recordsById.has(id)) documentRecordIds.add(id);
  }
  for (const s of eventSources) {
    const id = s.record_id?.trim();
    if (id && recordsById.has(id)) documentRecordIds.add(id);
  }
  const documentRecords = [...documentRecordIds].map(
    (id) => recordsById.get(id)!
  );

  function handleTabClick(tab: TabId) {
    setActiveTab(tab);
  }

  return (
    <div className="pb-16">
      <nav
        className="border-b px-4 py-3 sm:px-6"
        style={{
          backgroundColor: colors.cream,
          borderColor: `${colors.brownBorder}55`,
        }}
      >
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
            <div className="min-w-0 shrink-0">
              <p
                className="text-xl font-bold tracking-tight sm:text-2xl"
                style={{ fontFamily: serif, color: colors.brownDark }}
              >
                Dead Gossip
              </p>
              <p
                className="mt-0.5 text-xs sm:text-sm"
                style={{
                  fontFamily: sans,
                  fontStyle: "italic",
                  fontSize: "1rem",
                  color: colors.brownMuted,
                }}
              >
                The good, the bad, the buried.
              </p>
            </div>
            <div
              className="min-w-0 border-l pl-3 sm:pl-4"
              style={{ borderColor: `${colors.brownBorder}99` }}
            >
              <Link
                href={backToTreeHref}
                className="mt-1 inline-block text-xs underline sm:text-sm"
                style={{ color: "#C4A882" }}
              >
                {backToTreeLabel}
              </Link>
            </div>
          </div>
          <button
            type="button"
            className="shrink-0"
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            style={{
              fontFamily: sans,
              fontSize: "1.2rem",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "0.4rem 0.6rem",
              borderRadius: 4,
            }}
            onClick={toggleTheme}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </nav>

      {/* Header */}
      <header
        className="border-b px-4 py-10 sm:px-8"
        style={{
          backgroundColor: colors.parchment,
          borderColor: `${colors.brownBorder}44`,
        }}
      >
        <div className="relative mx-auto flex max-w-5xl flex-col items-center text-center sm:flex-row sm:items-start sm:gap-10 sm:text-left">
          <div
            className="relative h-48 w-48 shrink-0 overflow-hidden rounded-full ring-4"
            style={{
              position: "relative",
              overflow: "hidden",
              backgroundColor: colors.avatarBg,
              borderColor: colors.cream,
              boxShadow: "0 8px 28px rgb(var(--dg-shadow-rgb) / 0.12)",
            }}
          >
            {headerPhotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headerPhotoUrl}
                alt=""
                draggable={false}
                onLoad={(e) => {
                  const el = e.currentTarget;
                  setAvatarNaturalSize({
                    w: el.naturalWidth,
                    h: el.naturalHeight,
                  });
                }}
                style={(() => {
                  if (
                    !avatarNaturalSize ||
                    avatarNaturalSize.w <= 0 ||
                    avatarNaturalSize.h <= 0
                  ) {
                    return {
                      position: "absolute" as const,
                      left: 0,
                      top: 0,
                      width: "100%",
                      height: "100%",
                      opacity: 0,
                    };
                  }
                  const { w: avatarRenderedW, h: avatarRenderedH } =
                    cropCoverRenderedSize(
                      avatarNaturalSize.w,
                      avatarNaturalSize.h,
                      192,
                      avatarCropZoom
                    );
                  const avatarOffset = cropPercentToOffsetCover(
                    avatarCropX,
                    avatarCropY,
                    avatarRenderedW,
                    avatarRenderedH,
                    192
                  );
                  return {
                    position: "absolute" as const,
                    left: avatarOffset.x,
                    top: avatarOffset.y,
                    width: avatarRenderedW,
                    height: avatarRenderedH,
                    opacity: 1,
                    pointerEvents: "none" as const,
                    maxWidth: "none",
                  };
                })()}
              />
            ) : (
              <span
                className="flex h-full w-full items-center justify-center text-5xl font-bold"
                style={{ fontFamily: serif, color: colors.avatarInitials }}
              >
                {initials(person)}
              </span>
            )}
          </div>
          <div className="mt-6 min-w-0 w-full flex-1 sm:mt-0">
            <div className="mx-auto inline-block max-w-full text-left sm:mx-0 sm:block sm:w-full">
              <h1
                className="text-4xl font-bold leading-tight sm:text-5xl"
                style={{ fontFamily: serif, color: colors.brownDark }}
              >
                {lastName}
              </h1>
              {firstMiddle ? (
                <p
                  className="mt-2 text-xl sm:text-2xl"
                  style={{ fontFamily: serif, color: colors.brownMid }}
                >
                  {firstMiddle}
                </p>
              ) : null}
              {headerGenderBadge ? (
                <div className="mt-2">
                  <span
                    className="inline-block shrink-0 font-medium leading-none"
                    style={{
                      fontFamily: sans,
                      fontSize: 12,
                      padding: "2px 10px",
                      borderRadius: 12,
                      backgroundColor: "var(--dg-badge-tan-bg)",
                      color: "var(--dg-badge-tan-fg)",
                    }}
                  >
                    {headerGenderBadge}
                  </span>
                </div>
              ) : null}
            </div>
            <p
              className="mt-4 text-sm italic sm:text-base"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              {birthLine ? <span style={{ display: "block" }}>{birthLine}</span> : null}
              {deathLine ? <span style={{ display: "block" }}>{deathLine}</span> : null}
              {headerNoDates ? <span>Dates unknown</span> : null}
            </p>
          </div>
          <div
            ref={headerActionsDropdownRef}
            className="relative z-[100]"
            style={{
              position: "absolute",
              top: 0,
              right: 0,
            }}
          >
          <input
            ref={headerPhotoFileInputRef}
            id="person-profile-photo-upload-header"
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={photoUploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void uploadPhoto(f);
            }}
          />
          <button
            type="button"
            style={btnOutline}
            aria-expanded={headerMenuOpen}
            aria-haspopup="menu"
            aria-controls="person-header-actions-menu"
            id="person-header-actions-trigger"
            onClick={() => setHeaderMenuOpen((o) => !o)}
          >
            <span className="inline-flex items-center gap-1.5">
              Actions
              <span aria-hidden>▾</span>
            </span>
          </button>
          {headerMenuOpen ? (
            <div
              id="person-header-actions-menu"
              role="menu"
              aria-labelledby="person-header-actions-trigger"
              className="absolute left-0 top-full z-[100] mt-1"
              style={{
                minWidth: 200,
                backgroundColor: colors.cream,
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: colors.brownBorder,
                borderRadius: 6,
                boxShadow:
                  "0 4px 16px rgb(var(--dg-shadow-rgb) / 0.14)",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                role="menuitem"
                style={headerMenuItemBaseStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = colors.parchment;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                onClick={() => {
                  setHeaderMenuOpen(false);
                  openEditPersonModal();
                }}
              >
                Edit
              </button>
              <button
                type="button"
                role="menuitem"
                style={headerMenuItemBaseStyle}
                disabled={photoUploading}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.backgroundColor =
                      colors.parchment;
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                onClick={() => {
                  setHeaderMenuOpen(false);
                  headerPhotoFileInputRef.current?.click();
                }}
              >
                Upload photo
              </button>
              <button
                type="button"
                role="menuitem"
                style={headerMenuItemBaseStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = colors.parchment;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                onClick={() => {
                  setHeaderMenuOpen(false);
                  setRecordUploadModalOpen(true);
                }}
              >
                Upload record
              </button>
              <button
                type="button"
                role="menuitem"
                style={headerMenuItemBaseStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = colors.parchment;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                onClick={() => {
                  setHeaderMenuOpen(false);
                  openMergeModal();
                }}
              >
                Merge with another person
              </button>
              <button
                type="button"
                role="menuitem"
                style={{
                  ...headerMenuItemBaseStyle,
                  color: "var(--dg-danger)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = colors.parchment;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                onClick={() => {
                  setHeaderMenuOpen(false);
                  setDeletePersonOpen(true);
                }}
              >
                Delete
              </button>
            </div>
          ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
        <div
          role="tablist"
          aria-label="Profile sections"
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            borderBottom: `1px solid ${colors.brownBorder}`,
            marginBottom: 0,
          }}
        >
          {(
            [
              { id: "details" as const, label: "Details" },
              { id: "documents" as const, label: "Documents" },
              { id: "photos" as const, label: "Photos" },
              { id: "notes" as const, label: "Notes" },
            ] as const
          ).map(({ id, label }) => {
            const selected = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                id={`person-tab-${id}`}
                aria-controls={`person-tabpanel-${id}`}
                onClick={() => handleTabClick(id)}
                style={{
                  fontFamily: sans,
                  fontSize: "0.875rem",
                  letterSpacing: "0.01em",
                  padding: "0.65rem 1.2rem",
                  margin: 0,
                  cursor: "pointer",
                  borderRadius: 0,
                  boxShadow: "none",
                  outline: "none",
                  ...(selected
                    ? {
                        position: "relative" as const,
                        zIndex: 2,
                        backgroundColor: colors.cream,
                        color: colors.brownDark,
                        fontWeight: 700,
                        borderStyle: "solid",
                        borderColor: colors.brownBorder,
                        borderWidth: "1px 1px 0 1px",
                        borderBottom: `3px solid ${colors.brownOutline}`,
                        marginBottom: -1,
                      }
                    : {
                        backgroundColor: "transparent",
                        color: colors.brownMuted,
                        fontWeight: 500,
                        border: "none",
                        borderBottom: "1px solid transparent",
                        marginBottom: -1,
                      }),
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div
          id={`person-tabpanel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`person-tab-${activeTab}`}
          style={{
            backgroundColor: colors.cream,
            borderLeft: `1px solid ${colors.brownBorder}`,
            borderRight: `1px solid ${colors.brownBorder}`,
            borderBottom: `1px solid ${colors.brownBorder}`,
            borderTop: "none",
            padding: "1.5rem",
            marginTop: -1,
          }}
        >
        {activeTab === "details" ? (
          <div className="grid gap-10 lg:grid-cols-[1fr_280px] lg:gap-12">
            <section>
              <div
                className="mb-6 flex items-center justify-between border-b pb-2"
                style={{ borderColor: colors.brownBorder }}
              >
                <h2
                  className="text-2xl font-bold"
                  style={{ fontFamily: serif, color: colors.brownDark }}
                >
                  Life &amp; records
                </h2>
                <button
                  type="button"
                  onClick={() => setAddEventOpen(true)}
                  className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
                  style={{
                    fontFamily: sans,
                    backgroundColor: "var(--dg-parchment)",
                    color: colors.brownDark,
                    border: `1px solid ${colors.brownBorder}`,
                  }}
                >
                  + Add Event
                </button>
              </div>
              {timelineEvents.length === 0 ? (
                <p
                  className="text-sm italic"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  No events recorded yet.
                </p>
              ) : (
                <div className="relative pl-6">
                  <div
                    className="absolute bottom-0 left-[0.75rem] top-0 w-px"
                    style={{ backgroundColor: colors.brownBorder }}
                    aria-hidden
                  />
                  <ul className="space-y-0">
                    {timelineEvents.map((ev) => {
                      const mergeGroup = eventsSharingTimelineDedupeKey(
                        ev,
                        events
                      );
                      const mergeCluster: EventCluster = {
                        displayType: (ev.event_type || "Event").trim(),
                        events: mergeGroup,
                      };
                      const typ = (ev.event_type || "Event").trim();
                      const mergeClusterStoryFull =
                        firstStoryFullInCluster(mergeCluster);
                      const placesLine = clusterPlacesLine(mergeCluster);
                      const notesOpen = expandedTimelineNotesKeys.has(ev.id);
                      const linkedSources = clusterLinkedSources(
                        mergeCluster,
                        eventSourcesByEventId,
                        recordsById,
                        signedDocUrls
                      );
                      const sourcesOpen =
                        expandedTimelineSourcesKeys.has(ev.id);
                      const descLines =
                        clusterDescriptionLines(mergeCluster);
                      const listKey = ev.id;
                      const isEditing = editingEventId === ev.id;

                      return (
                        <li
                          key={listKey}
                          className="flex items-start gap-3 pb-8"
                        >
                          <div
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                            style={{
                              backgroundColor: colors.brownDark,
                            }}
                          />
                          <div
                            className="min-w-[7rem] shrink-0 sm:min-w-[8rem]"
                            style={{ fontFamily: serif }}
                          >
                            <span
                              className="block text-sm font-bold tracking-wide"
                              style={{ color: colors.brownMuted }}
                            >
                              {eventDateLabel(ev)}
                            </span>
                          </div>
                          <div
                            className="min-w-0 flex-1 pl-4 sm:pl-6"
                            style={{ borderColor: "transparent" }}
                          >
                            <div
                              className="group relative rounded-md border px-4 py-3"
                              style={{
                                backgroundColor: colors.cream,
                                borderColor: `${colors.brownBorder}99`,
                                boxShadow:
                                  "inset 0 1px 0 var(--dg-inset-highlight)",
                              }}
                            >
                              {!isEditing ? (
                                <div
                                  className="absolute right-2 top-2 z-20 flex gap-0.5 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                                  role="toolbar"
                                  aria-label="Event actions"
                                >
                                  <button
                                    type="button"
                                    title="Edit event"
                                    className="rounded border border-transparent p-1.5 hover:border-[color-mix(in_srgb,var(--dg-brown-border)_60%,transparent)] hover:bg-[var(--dg-parchment)]"
                                    style={{
                                      color: colors.brownMid,
                                      cursor: "pointer",
                                      backgroundColor: "transparent",
                                    }}
                                    onClick={() => {
                                      setEventDeleteConfirmId(null);
                                      startEditEvent(ev);
                                    }}
                                  >
                                    <IconPencil />
                                  </button>
                                  <button
                                    type="button"
                                    title="Delete event"
                                    className="rounded border border-transparent p-1.5 hover:border-[color-mix(in_srgb,var(--dg-brown-border)_60%,transparent)] hover:bg-[var(--dg-parchment)]"
                                    style={{
                                      color: "var(--dg-danger)",
                                      cursor: "pointer",
                                      backgroundColor: "transparent",
                                    }}
                                    onClick={() => {
                                      cancelEditEvent();
                                      setEventDeleteConfirmId(ev.id);
                                    }}
                                  >
                                    <IconTrash />
                                  </button>
                                </div>
                              ) : null}
                              {isEditing && eventEditDraft ? (
                                <div className="space-y-3">
                                  <div>
                                    <label
                                      className="mb-1 block text-xs font-bold uppercase tracking-wide"
                                      style={{
                                        fontFamily: sans,
                                        color: colors.brownMuted,
                                      }}
                                      htmlFor={`ev-type-${ev.id}`}
                                    >
                                      Event type
                                    </label>
                                    <select
                                      id={`ev-type-${ev.id}`}
                                      value={eventEditDraft.event_type}
                                      onChange={(e) =>
                                        setEventEditDraft((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                event_type: e.target.value,
                                              }
                                            : null
                                        )
                                      }
                                      style={modalInputStyle}
                                    >
                                      {eventTypeSelectOptions.map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                      {!eventTypeSelectOptions.includes(
                                        eventEditDraft.event_type
                                      ) &&
                                      eventEditDraft.event_type.trim() ? (
                                        <option
                                          value={eventEditDraft.event_type}
                                        >
                                          {eventEditDraft.event_type}
                                        </option>
                                      ) : null}
                                    </select>
                                  </div>
                                  <div>
                                    <label
                                      className="mb-1 block text-xs font-bold uppercase tracking-wide"
                                      style={{
                                        fontFamily: sans,
                                        color: colors.brownMuted,
                                      }}
                                      htmlFor={`ev-date-${ev.id}`}
                                    >
                                      Event date
                                    </label>
                                    <SmartDateInput
                                      id={`ev-date-${ev.id}`}
                                      value={eventEditDraft.event_date}
                                      onChange={(val) =>
                                        setEventEditDraft((prev) =>
                                          prev
                                            ? { ...prev, event_date: val }
                                            : null
                                        )
                                      }
                                      style={modalInputStyle}
                                      placeholder="MM/DD/YYYY"
                                    />
                                  </div>
                                  <div>
                                    <label
                                      className="mb-1 block text-xs font-bold uppercase tracking-wide"
                                      style={{
                                        fontFamily: sans,
                                        color: colors.brownMuted,
                                      }}
                                      htmlFor={`ev-place-${ev.id}`}
                                    >
                                      Event place
                                    </label>
                                    <input
                                      id={`ev-place-${ev.id}`}
                                      type="text"
                                      value=""
                                      readOnly
                                      style={modalInputStyle}
                                    />
                                  </div>
                                  <div>
                                    <label
                                      className="mb-1 block text-xs font-bold uppercase tracking-wide"
                                      style={{
                                        fontFamily: sans,
                                        color: colors.brownMuted,
                                      }}
                                      htmlFor={`ev-short-${ev.id}`}
                                    >
                                      Story (short)
                                    </label>
                                    <textarea
                                      id={`ev-short-${ev.id}`}
                                      rows={2}
                                      value={eventEditDraft.story_short}
                                      onChange={(e) =>
                                        setEventEditDraft((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                story_short: e.target.value,
                                              }
                                            : null
                                        )
                                      }
                                      className="resize-y"
                                      style={modalInputStyle}
                                    />
                                  </div>
                                  <div>
                                    <label
                                      className="mb-1 block text-xs font-bold uppercase tracking-wide"
                                      style={{
                                        fontFamily: sans,
                                        color: colors.brownMuted,
                                      }}
                                      htmlFor={`ev-full-${ev.id}`}
                                    >
                                      Story (full)
                                    </label>
                                    <textarea
                                      id={`ev-full-${ev.id}`}
                                      rows={4}
                                      value={eventEditDraft.story_full}
                                      onChange={(e) =>
                                        setEventEditDraft((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                story_full: e.target.value,
                                              }
                                            : null
                                        )
                                      }
                                      className="resize-y"
                                      style={modalInputStyle}
                                    />
                                  </div>
                                  <div>
                                    <label
                                      className="mb-1 block text-xs font-bold uppercase tracking-wide"
                                      style={{
                                        fontFamily: sans,
                                        color: colors.brownMuted,
                                      }}
                                      htmlFor={`ev-notes-${ev.id}`}
                                    >
                                      Notes
                                    </label>
                                    <textarea
                                      id={`ev-notes-${ev.id}`}
                                      rows={3}
                                      value={eventEditDraft.notes}
                                      onChange={(e) =>
                                        setEventEditDraft((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                notes: e.target.value,
                                              }
                                            : null
                                        )
                                      }
                                      className="resize-y"
                                      style={modalInputStyle}
                                    />
                                  </div>
                                  {eventEditError ? (
                                    <p
                                      className="text-sm"
                                      style={{
                                        fontFamily: sans,
                                        color: "var(--dg-danger)",
                                      }}
                                    >
                                      {eventEditError}
                                    </p>
                                  ) : null}
                                  <div className="flex flex-wrap gap-2 pt-1">
                                    <button
                                      type="button"
                                      disabled={eventEditSaving}
                                      onClick={() => void saveEditEvent()}
                                      style={{
                                        fontFamily: sans,
                                        backgroundColor: colors.brownOutline,
                                        color: colors.cream,
                                        border: "none",
                                        padding: "0.5rem 1rem",
                                        fontSize: "0.875rem",
                                        fontWeight: 700,
                                        cursor: eventEditSaving
                                          ? "wait"
                                          : "pointer",
                                        borderRadius: 2,
                                        opacity: eventEditSaving ? 0.8 : 1,
                                      }}
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      disabled={eventEditSaving}
                                      onClick={() => cancelEditEvent()}
                                      style={btnOutline}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="pr-12 md:pr-14">
                                  <TimelineEventStoryBlock
                                    storyText={mergeClusterStoryFull.text}
                                    typ={typ}
                                    expanded={expandedTimelineStoryKeys.has(
                                      ev.id
                                    )}
                                    onToggleExpanded={() =>
                                      toggleTimelineStoryExpanded(ev.id)
                                    }
                                  />
                                  <p
                                    className="mt-1 text-sm italic"
                                    style={{
                                      fontFamily: sans,
                                      color: colors.brownMuted,
                                    }}
                                  >
                                    {placesLine}
                                  </p>
                                  {descLines.map((line, di) => (
                                    <p
                                      key={`${listKey}-d-${di}`}
                                      className="mt-2 text-sm leading-relaxed"
                                      style={{
                                        fontFamily: sans,
                                        color: colors.brownMuted,
                                      }}
                                    >
                                      {line}
                                    </p>
                                  ))}
                                  <div className="mt-3">
                                    {ev.research_notes?.trim() ? (
                                      <>
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              toggleTimelineNotesForEvent(ev.id)
                                            }
                                            className="border-none bg-transparent p-0 text-left text-sm underline decoration-dotted underline-offset-2"
                                            style={{
                                              fontFamily: sans,
                                              color: colors.forest,
                                              fontWeight: 600,
                                              cursor: "pointer",
                                            }}
                                            aria-expanded={notesOpen}
                                          >
                                            {notesOpen
                                              ? "Hide research notes"
                                              : "Research notes"}
                                          </button>
                                          {notesOpen ? (
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setEditingResearchNotesEventId(
                                                  ev.id
                                                )
                                              }
                                              title="Edit research notes"
                                              className="border-none bg-transparent p-0 text-sm leading-none"
                                              style={{
                                                color: colors.brownMuted,
                                                cursor: "pointer",
                                              }}
                                            >
                                              ✎
                                            </button>
                                          ) : null}
                                        </div>
                                        {notesOpen ? (
                                          <div
                                            className="mt-2 pl-0.5 text-sm leading-relaxed"
                                            style={{
                                              fontFamily: sans,
                                              color: colors.brownMid,
                                            }}
                                          >
                                            <p className="whitespace-pre-wrap">
                                              {ev.research_notes.trim()}
                                            </p>
                                          </div>
                                        ) : null}
                                      </>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setEditingResearchNotesEventId(ev.id)
                                        }
                                        className="border-none bg-transparent p-0 text-left text-sm underline decoration-dotted underline-offset-2"
                                        style={{
                                          fontFamily: sans,
                                          color: colors.brownMuted,
                                          fontWeight: 600,
                                          cursor: "pointer",
                                        }}
                                      >
                                        + Add research notes
                                      </button>
                                    )}
                                    {editingResearchNotesEventId === ev.id ? (
                                      <div className="mt-2 space-y-2">
                                        <textarea
                                          rows={3}
                                          defaultValue={ev.research_notes ?? ""}
                                          id={`research-notes-${ev.id}`}
                                          className="w-full rounded-md border px-3 py-2 text-sm"
                                          style={{
                                            fontFamily: sans,
                                            backgroundColor: "var(--dg-cream)",
                                            color: colors.brownDark,
                                            borderColor: colors.brownBorder,
                                          }}
                                        />
                                        <div className="flex gap-3">
                                          <button
                                            type="button"
                                            onClick={async () => {
                                              const el =
                                                document.getElementById(
                                                  `research-notes-${ev.id}`
                                                ) as HTMLTextAreaElement;
                                              const val = el?.value ?? "";
                                              const supabase = createClient();
                                              await supabase
                                                .from("events")
                                                .update({
                                                  research_notes:
                                                    val.trim() || null,
                                                })
                                                .eq("id", ev.id);
                                              setEditingResearchNotesEventId(
                                                null
                                              );
                                              await load();
                                            }}
                                            className="rounded-md px-3 py-1.5 text-sm font-medium"
                                            style={{
                                              backgroundColor:
                                                "var(--dg-brown-mid, #8B6F4E)",
                                              color: "white",
                                              fontFamily: sans,
                                            }}
                                          >
                                            Save
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setEditingResearchNotesEventId(
                                                null
                                              )
                                            }
                                            className="rounded-md px-3 py-1.5 text-sm font-medium"
                                            style={{
                                              color: colors.brownMuted,
                                              fontFamily: sans,
                                            }}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                  <div className="mt-3">
                                    <div className="flex items-center gap-3">
                                      {linkedSources.length > 0 ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            toggleTimelineSourcesForEvent(
                                              ev.id
                                            )
                                          }
                                          className="border-none bg-transparent p-0 text-left text-sm underline decoration-dotted underline-offset-2"
                                          style={{
                                            fontFamily: sans,
                                            color: colors.forest,
                                            fontWeight: 600,
                                            cursor: "pointer",
                                          }}
                                          aria-expanded={sourcesOpen}
                                        >
                                          {sourcesOpen
                                            ? "Hide sources"
                                            : `Sources (${linkedSources.length})`}
                                        </button>
                                      ) : null}
                                      {linkedSources.length > 0 &&
                                      sourcesOpen &&
                                      !addingSourceEventId ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setAddingSourceEventId(ev.id)
                                          }
                                          title="Add source"
                                          className="border-none bg-transparent p-0 text-base leading-none font-bold"
                                          style={{
                                            color: colors.brownMuted,
                                            cursor: "pointer",
                                            fontSize: "1.1rem",
                                          }}
                                        >
                                          +
                                        </button>
                                      ) : null}
                                      {linkedSources.length === 0 &&
                                      addingSourceEventId !== ev.id ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setAddingSourceEventId(ev.id)
                                          }
                                          className="border-none bg-transparent p-0 text-left text-sm underline decoration-dotted underline-offset-2"
                                          style={{
                                            fontFamily: sans,
                                            color: colors.brownMuted,
                                            fontWeight: 600,
                                            cursor: "pointer",
                                          }}
                                        >
                                          + Add source
                                        </button>
                                      ) : null}
                                    </div>
                                    {addingSourceEventId === ev.id ? (
                                      <div className="mt-2">
                                        <div className="flex items-center gap-2">
                                          <label
                                            className="cursor-pointer text-sm underline decoration-dotted underline-offset-2"
                                            style={{
                                              fontFamily: sans,
                                              color: colors.forest,
                                              fontWeight: 600,
                                            }}
                                          >
                                            {sourceUploading
                                              ? "Uploading…"
                                              : "Choose file"}
                                            <input
                                              type="file"
                                              accept=".jpg,.jpeg,.png,.pdf"
                                              className="hidden"
                                              disabled={sourceUploading}
                                              onChange={(e) => {
                                                const file =
                                                  e.target.files?.[0];
                                                if (file) {
                                                  setPendingSourceFile({
                                                    eventId: ev.id,
                                                    file,
                                                  });
                                                  setPendingSourceName(
                                                    file.name.replace(
                                                      /\.[^/.]+$/,
                                                      ""
                                                    )
                                                  );
                                                }
                                              }}
                                            />
                                          </label>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setAddingSourceEventId(null)
                                            }
                                            className="text-xs"
                                            style={{
                                              fontFamily: sans,
                                              color: colors.brownMuted,
                                            }}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                        {pendingSourceFile?.eventId ===
                                        ev.id ? (
                                          <div className="mt-2 space-y-2">
                                            <select
                                              value={pendingSourceName}
                                              onChange={(e) =>
                                                setPendingSourceName(
                                                  e.target.value
                                                )
                                              }
                                              className="w-full rounded-md border px-3 py-2 text-sm"
                                              style={{
                                                fontFamily: sans,
                                                backgroundColor:
                                                  "var(--dg-cream)",
                                                color: colors.brownDark,
                                                borderColor: colors.brownBorder,
                                              }}
                                            >
                                              <option value="">
                                                Select record type…
                                              </option>
                                              {RECORD_TYPES.map((rt) => (
                                                <option key={rt} value={rt}>
                                                  {rt}
                                                </option>
                                              ))}
                                            </select>
                                            <div className="flex gap-2">
                                              <button
                                                type="button"
                                                disabled={sourceUploading}
                                                onClick={() => {
                                                  if (pendingSourceFile)
                                                    void handleAddSource(
                                                      ev.id,
                                                      pendingSourceFile.file
                                                    );
                                                }}
                                                className="rounded-md px-3 py-1.5 text-sm font-medium"
                                                style={{
                                                  backgroundColor:
                                                    "var(--dg-brown-mid, #8B6F4E)",
                                                  color: "white",
                                                  fontFamily: sans,
                                                }}
                                              >
                                                {sourceUploading
                                                  ? "Uploading…"
                                                  : "Upload"}
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setPendingSourceFile(null);
                                                  setPendingSourceName("");
                                                }}
                                                className="rounded-md px-3 py-1.5 text-sm font-medium"
                                                style={{
                                                  color: colors.brownMuted,
                                                  fontFamily: sans,
                                                }}
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : null}
                                    {sourcesOpen && linkedSources.length > 0 ? (
                                      <ul className="mt-1 w-full space-y-1.5 pl-0.5">
                                        {linkedSources.map((src) => (
                                          <li key={src.id}>
                                            <div className="flex items-center gap-2">
                                              {src.url ? (
                                                <a
                                                  href={src.url}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  className="text-sm underline decoration-dotted underline-offset-2 hover:opacity-80"
                                                  style={{
                                                    fontFamily: sans,
                                                    color: colors.forest,
                                                    fontWeight: 600,
                                                  }}
                                                >
                                                  {src.label}
                                                </a>
                                              ) : (
                                                <span
                                                  className="text-sm"
                                                  style={{
                                                    fontFamily: sans,
                                                    color: colors.brownMuted,
                                                  }}
                                                >
                                                  {src.label}
                                                  <span className="ml-1 text-xs italic">
                                                    (link unavailable)
                                                  </span>
                                                </span>
                                              )}
                                              {sourceDeleteConfirmKey !==
                                                src.id && (
                                                <button
                                                  type="button"
                                                  disabled={
                                                    sourceDeletingKey ===
                                                    src.id
                                                  }
                                                  onClick={() =>
                                                    setSourceDeleteConfirmKey(
                                                      src.id
                                                    )
                                                  }
                                                  className="border-none bg-transparent p-0 text-xs leading-none"
                                                  style={{
                                                    color: colors.brownMuted,
                                                    cursor: "pointer",
                                                    opacity: 0.6,
                                                    fontFamily: sans,
                                                  }}
                                                  aria-label="Remove source"
                                                  title="Remove source"
                                                >
                                                  ✕
                                                </button>
                                              )}
                                            </div>
                                            {sourceDeleteConfirmKey ===
                                              src.id && (
                                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                                <span
                                                  className="text-xs"
                                                  style={{
                                                    fontFamily: sans,
                                                    color: colors.brownDark,
                                                  }}
                                                >
                                                  Remove this source?
                                                </span>
                                                <button
                                                  type="button"
                                                  disabled={
                                                    sourceDeletingKey ===
                                                    src.id
                                                  }
                                                  onClick={() =>
                                                    void deleteSourceLink(
                                                      src.id,
                                                      mergeCluster.events.map(
                                                        (e) => e.id
                                                      )
                                                    )
                                                  }
                                                  className="rounded px-2 py-0.5 text-xs font-bold"
                                                  style={{
                                                    backgroundColor:
                                                      "var(--dg-danger)",
                                                    color: "var(--dg-cream)",
                                                    border: "none",
                                                    cursor:
                                                      sourceDeletingKey ===
                                                      src.id
                                                        ? "wait"
                                                        : "pointer",
                                                    fontFamily: sans,
                                                  }}
                                                >
                                                  {sourceDeletingKey === src.id
                                                    ? "Removing…"
                                                    : "Yes"}
                                                </button>
                                                <button
                                                  type="button"
                                                  disabled={
                                                    sourceDeletingKey ===
                                                    src.id
                                                  }
                                                  onClick={() =>
                                                    setSourceDeleteConfirmKey(
                                                      null
                                                    )
                                                  }
                                                  className="text-xs"
                                                  style={{
                                                    fontFamily: sans,
                                                    color: colors.brownMuted,
                                                    background: "none",
                                                    border: "none",
                                                    cursor: "pointer",
                                                  }}
                                                >
                                                  Cancel
                                                </button>
                                              </div>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </div>
                                  {eventDeleteConfirmId === ev.id ? (
                                    <div
                                      className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3"
                                      style={{
                                        borderColor: `${colors.brownBorder}99`,
                                      }}
                                    >
                                      <span
                                        className="text-sm font-medium"
                                        style={{
                                          fontFamily: sans,
                                          color: colors.brownDark,
                                        }}
                                      >
                                        Delete this event?
                                      </span>
                                      <button
                                        type="button"
                                        disabled={eventDeletingId === ev.id}
                                        onClick={() =>
                                          void deleteEventById(ev.id)
                                        }
                                        style={{
                                          fontFamily: sans,
                                          backgroundColor: "var(--dg-danger)",
                                          color: colors.cream,
                                          border: "none",
                                          padding: "0.35rem 0.85rem",
                                          fontSize: "0.8125rem",
                                          fontWeight: 700,
                                          cursor:
                                            eventDeletingId === ev.id
                                              ? "wait"
                                              : "pointer",
                                          borderRadius: 2,
                                        }}
                                      >
                                        Yes
                                      </button>
                                      <button
                                        type="button"
                                        disabled={eventDeletingId === ev.id}
                                        onClick={() =>
                                          setEventDeleteConfirmId(null)
                                        }
                                        style={btnOutline}
                                      >
                                        No
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </section>

            <aside
              className="rounded-xl border p-5 lg:sticky lg:top-6 lg:self-start"
              style={{
                backgroundColor: colors.cream,
                borderColor: colors.brownBorder,
                boxShadow: "0 4px 18px rgb(var(--dg-shadow-rgb) / 0.06)",
              }}
            >
              <h2
                className="mb-4 text-xl font-bold"
                style={{ fontFamily: serif, color: colors.brownDark }}
              >
                Immediate family
              </h2>
              <FamilyGroup
                title="Parents"
                members={family.parents}
                relationshipMetaByPersonId={relationshipMetaByPersonId}
                onEditRelationship={(meta) => {
                  setEditRelModal(meta);
                  setEditRelType(meta.relationshipType);
                  setEditRelError(null);
                }}
              />
              <FamilyGroup
                title="Spouses"
                members={family.spouses}
                relationshipMetaByPersonId={relationshipMetaByPersonId}
                onEditRelationship={(meta) => {
                  setEditRelModal(meta);
                  setEditRelType(meta.relationshipType);
                  setEditRelError(null);
                }}
              />
              <FamilyGroup
                title="Siblings"
                members={family.siblings}
                relationshipMetaByPersonId={relationshipMetaByPersonId}
                onEditRelationship={(meta) => {
                  setEditRelModal(meta);
                  setEditRelType(meta.relationshipType);
                  setEditRelError(null);
                }}
              />
              <FamilyGroup
                title="Children"
                members={family.children}
                relationshipMetaByPersonId={relationshipMetaByPersonId}
                onEditRelationship={(meta) => {
                  setEditRelModal(meta);
                  setEditRelType(meta.relationshipType);
                  setEditRelError(null);
                }}
              />
              {family.parents.length === 0 &&
              family.spouses.length === 0 &&
              family.siblings.length === 0 &&
              family.children.length === 0 ? (
                <p
                  className="text-sm italic"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  No relationships linked yet.
                </p>
              ) : null}
              <div
                className="mt-4 border-t pt-3"
                style={{ borderColor: `${colors.brownBorder}99` }}
              >
                <button
                  type="button"
                  onClick={() => openAddFamilyModal()}
                  disabled={effectiveTreeIdForFamily === ""}
                  className="border-none bg-transparent p-0 text-xs font-bold uppercase tracking-wide underline-offset-2 transition hover:underline disabled:cursor-not-allowed disabled:no-underline"
                  style={{
                    fontFamily: sans,
                    color:
                      effectiveTreeIdForFamily === ""
                        ? colors.brownMuted
                        : colors.forest,
                  }}
                >
                  + Add family member
                </button>
                {effectiveTreeIdForFamily === "" ? (
                  <p
                    className="mt-2 text-xs leading-snug"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                  >
                    Open this profile from your tree to add relatives here.
                  </p>
                ) : null}
              </div>
            </aside>
          </div>
        ) : activeTab === "documents" ? (
          <section>
            <h2
              className="mb-6 text-2xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Documents
            </h2>
            {documentRecords.length === 0 ? (
              <p
                className="text-sm italic"
                style={{ fontFamily: sans, color: colors.brownMuted }}
              >
                No documents linked through events yet.
              </p>
            ) : (
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {documentRecords.map((rec) => {
                  const href = signedDocUrls.get(rec.id);
                  const label = recordTypeLabel(rec);
                  return (
                    <li key={rec.id}>
                      <div
                        className="h-full rounded-lg border p-4"
                        style={{
                          backgroundColor: colors.cream,
                          borderColor: colors.brownBorder,
                          boxShadow: "0 2px 8px rgb(var(--dg-shadow-rgb) / 0.05)",
                        }}
                      >
                        {href ? (
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold leading-snug underline decoration-dotted underline-offset-2 hover:opacity-80"
                            style={{
                              fontFamily: serif,
                              color: colors.forest,
                            }}
                          >
                            {label}
                          </a>
                        ) : (
                          <p
                            className="font-bold leading-snug"
                            style={{
                              fontFamily: serif,
                              color: colors.brownDark,
                            }}
                          >
                            {label}
                          </p>
                        )}
                        <p
                          className="mt-2 text-xs italic"
                          style={{
                            fontFamily: sans,
                            color: colors.brownMuted,
                          }}
                        >
                          Uploaded {formatUploadedAt(rec.created_at)}
                        </p>
                        {rec.file_type ? (
                          <p
                            className="mt-1 text-[10px] uppercase tracking-wider"
                            style={{
                              fontFamily: sans,
                              color: colors.brownMuted,
                            }}
                          >
                            {rec.file_type}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : activeTab === "photos" ? (
          <section>
            <h2
              className="mb-6 text-2xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Photos
            </h2>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <input
                id="person-profile-photo-upload"
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={photoUploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void uploadPhoto(f);
                }}
              />
              <label
                htmlFor="person-profile-photo-upload"
                className="inline-block cursor-pointer rounded border-2 px-4 py-2 text-sm font-semibold transition-opacity"
                style={{
                  fontFamily: sans,
                  borderColor: colors.brownOutline,
                  color: colors.brownDark,
                  backgroundColor: colors.cream,
                  opacity: photoUploading ? 0.6 : 1,
                  pointerEvents: photoUploading ? "none" : "auto",
                }}
              >
                Upload photo
              </label>
              {photoUploading ? (
                <span
                  className="text-sm italic"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  Uploading…
                </span>
              ) : null}
            </div>
            {photoUploadError ? (
              <p
                className="mb-4 text-sm"
                style={{ fontFamily: sans, color: "var(--dg-danger)" }}
              >
                {photoUploadError}
              </p>
            ) : null}
            {photoRows.length === 0 ? (
              <p
                className="text-sm italic"
                style={{ fontFamily: sans, color: colors.brownMuted }}
              >
                No photos uploaded for this person yet.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-4">
                {photoRows.map((row, i) => {
                  const url = photoUrlFromRow(row);
                  const pid =
                    typeof row.id === "string" ? row.id : `photo-${i}`;
                  const rowId = typeof row.id === "string" ? row.id : null;
                  const isPrimary = rowIsPrimaryForDisplay(row);
                  if (!url) return null;
                  const thumbCrop = personPhotoCropForRow(row);
                  const openCropModal = () => {
                    setCropModalPhoto(row);
                    setCropZoom(thumbCrop.zoom);
                  };
                  return (
                    <li key={pid}>
                      <div
                        className="group relative h-40 w-40 overflow-hidden rounded-lg border shadow-sm"
                        style={{
                          borderColor: colors.brownBorder,
                          backgroundColor: colors.parchment,
                        }}
                      >
                        {rowId ? (
                          <button
                            type="button"
                            className="absolute inset-0 z-0 block h-full w-full border-none p-0"
                            style={{
                              cursor: "pointer",
                              backgroundColor: "transparent",
                            }}
                            aria-label="Adjust photo"
                            onClick={openCropModal}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt=""
                              className="pointer-events-none h-full w-full object-cover"
                            />
                          </button>
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        )}
                        {rowId ? (
                          <div
                            className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-transparent transition-colors group-hover:bg-[color-mix(in_srgb,var(--dg-image-dim)_45%,transparent)]"
                            aria-hidden
                          >
                            <span className="inline-flex scale-[2] opacity-0 transition-opacity group-hover:opacity-100">
                              <IconPencil className="block text-[var(--dg-cream)] drop-shadow-md" />
                            </span>
                          </div>
                        ) : null}
                        {isPrimary ? (
                          <span
                            className="pointer-events-none absolute left-1.5 top-1.5 z-[2] rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                            style={{
                              fontFamily: sans,
                              backgroundColor: colors.brownOutline,
                              color: colors.cream,
                            }}
                          >
                            Primary
                          </span>
                        ) : null}
                        {rowId ? (
                          <div
                            className="absolute inset-0 z-[3] flex items-end justify-center gap-2 pb-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                            style={{
                              pointerEvents: "none",
                              background:
                                "linear-gradient(to top, color-mix(in srgb, var(--dg-photo-scrim) 70%, transparent), transparent)",
                            }}
                          >
                            <button
                              type="button"
                              className="rounded-md border p-1.5 shadow-sm"
                              style={{
                                fontFamily: sans,
                                pointerEvents: "auto",
                                borderColor: colors.cream,
                                backgroundColor: colors.cream,
                                color: colors.brownDark,
                                cursor: "pointer",
                              }}
                              title="Set as primary"
                              aria-label="Set as primary photo"
                              onClick={(e) => {
                                e.stopPropagation();
                                void setPrimaryPhoto(rowId);
                              }}
                            >
                              <IconStar />
                            </button>
                            <button
                              type="button"
                              className="rounded-md border p-1.5 shadow-sm"
                              style={{
                                fontFamily: sans,
                                pointerEvents: "auto",
                                borderColor: colors.cream,
                                backgroundColor: colors.cream,
                                color: colors.brownDark,
                                cursor: "pointer",
                              }}
                              title="Tag people"
                              aria-label="Tag people"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openTagModal(row);
                              }}
                            >
                              <IconTag />
                            </button>
                            <button
                              type="button"
                              className="rounded-md border p-1.5 shadow-sm"
                              style={{
                                fontFamily: sans,
                                pointerEvents: "auto",
                                borderColor: colors.cream,
                                backgroundColor: colors.cream,
                                color: "var(--dg-danger)",
                                cursor: "pointer",
                              }}
                              title="Delete photo"
                              aria-label="Delete photo"
                              onClick={(e) => {
                                e.stopPropagation();
                                void deletePhoto(row);
                              }}
                            >
                              <IconTrash />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : (
          <section>
            <h2
              className="mb-6 text-2xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Research notes
            </h2>
            {researchNoteId != null && researchNoteUpdatedAt ? (
              <p
                className="mb-2 text-xs"
                style={{
                  fontFamily: sans,
                  color: colors.brownMuted,
                }}
              >
                Last updated{" "}
                {formatResearchNoteTimestamp(researchNoteUpdatedAt)}
              </p>
            ) : null}
            <textarea
              value={researchNoteText}
              onChange={(e) => setResearchNoteText(e.target.value)}
              rows={12}
              placeholder="Your research notes, theories, brick walls, leads to follow up..."
              className="w-full resize-y border px-4 py-3 text-base leading-relaxed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
              style={{
                fontFamily: sans,
                color: colors.brownDark,
                backgroundColor: colors.cream,
                borderColor: colors.brownBorder,
                minHeight: 400,
                boxSizing: "border-box",
                borderRadius: 0,
                boxShadow: "none",
                outlineColor: colors.brownOutline,
              }}
              aria-label="Research notes"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={researchNoteSaving}
                onClick={() => void saveResearchNotes()}
                style={{
                  fontFamily: sans,
                  backgroundColor: colors.brownOutline,
                  color: colors.cream,
                  border: "none",
                  padding: "0.65rem 1.35rem",
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  cursor: researchNoteSaving ? "wait" : "pointer",
                  opacity: researchNoteSaving ? 0.75 : 1,
                  borderRadius: 2,
                  boxShadow: "none",
                }}
              >
                Save notes
              </button>
              {researchNoteSavedFlash ? (
                <span
                  className="text-sm"
                  style={{ fontFamily: sans, color: colors.forest }}
                >
                  Saved
                </span>
              ) : null}
            </div>
            {researchNoteSaveError ? (
              <p
                className="mt-2 text-sm"
                style={{ fontFamily: sans, color: "var(--dg-danger)" }}
              >
                {researchNoteSaveError}
              </p>
            ) : null}
          </section>
        )}
        </div>
      </div>

      {editPersonOpen && editPersonDraft ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-person-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeEditPersonModal();
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border p-6 shadow-xl"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="edit-person-title"
              className="mb-5 text-2xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Edit person
            </h2>
            <div className="space-y-3">
              <div>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                  htmlFor="edit-fn"
                >
                  First name
                </label>
                <input
                  id="edit-fn"
                  type="text"
                  value={editPersonDraft.first_name}
                  onChange={(e) =>
                    setEditPersonDraft((d) =>
                      d ? { ...d, first_name: e.target.value } : null
                    )
                  }
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                  htmlFor="edit-mn"
                >
                  Middle name
                </label>
                <input
                  id="edit-mn"
                  type="text"
                  value={editPersonDraft.middle_name}
                  onChange={(e) =>
                    setEditPersonDraft((d) =>
                      d ? { ...d, middle_name: e.target.value } : null
                    )
                  }
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                  htmlFor="edit-ln"
                >
                  Last name
                </label>
                <input
                  id="edit-ln"
                  type="text"
                  value={editPersonDraft.last_name}
                  onChange={(e) =>
                    setEditPersonDraft((d) =>
                      d ? { ...d, last_name: e.target.value } : null
                    )
                  }
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                  htmlFor="edit-bd"
                >
                  Birth date
                </label>
                <SmartDateInput
                  id="edit-bd"
                  value={editPersonDraft.birth_date}
                  onChange={(val) =>
                    setEditPersonDraft((d) =>
                      d ? { ...d, birth_date: val } : null
                    )
                  }
                  style={modalInputStyle}
                  placeholder="MM/DD/YYYY"
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                  htmlFor="edit-dd"
                >
                  Death date
                </label>
                <SmartDateInput
                  id="edit-dd"
                  value={editPersonDraft.death_date}
                  onChange={(val) =>
                    setEditPersonDraft((d) =>
                      d ? { ...d, death_date: val } : null
                    )
                  }
                  style={modalInputStyle}
                  placeholder="MM/DD/YYYY"
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  Death place
                </label>
                <PlaceInput
                  value={editPersonDraft.death_place_display}
                  onChange={(v) =>
                    setEditPersonDraft((d) =>
                      d ? { ...d, death_place_display: v, death_place_id: null } : null
                    )
                  }
                  onPlaceSelect={(place) =>
                    setEditPersonDraft((d) =>
                      d
                        ? {
                            ...d,
                            death_place_display: place.display,
                            death_place_id: place.id,
                          }
                        : null
                    )
                  }
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  Birth place
                </label>
                <PlaceInput
                  value={editPersonDraft.birth_place_display}
                  onChange={(v) =>
                    setEditPersonDraft((d) =>
                      d ? { ...d, birth_place_display: v, birth_place_id: null } : null
                    )
                  }
                  onPlaceSelect={(place) =>
                    setEditPersonDraft((d) =>
                      d
                        ? {
                            ...d,
                            birth_place_display: place.display,
                            birth_place_id: place.id,
                          }
                        : null
                    )
                  }
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                  htmlFor="edit-gender"
                >
                  Gender
                </label>
                <select
                  id="edit-gender"
                  value={editPersonDraft.gender}
                  onChange={(e) =>
                    setEditPersonDraft((d) =>
                      d ? { ...d, gender: e.target.value } : null
                    )
                  }
                  style={modalInputStyle}
                >
                  <option value="">—</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Unknown">Unknown</option>
                  {editPersonDraft.gender &&
                  !["", "Male", "Female", "Unknown"].includes(
                    editPersonDraft.gender
                  ) ? (
                    <option value={editPersonDraft.gender}>
                      {editPersonDraft.gender}
                    </option>
                  ) : null}
                </select>
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                  htmlFor="edit-notes"
                >
                  Notes
                </label>
                <textarea
                  id="edit-notes"
                  rows={4}
                  value={editPersonDraft.notes}
                  onChange={(e) =>
                    setEditPersonDraft((d) =>
                      d ? { ...d, notes: e.target.value } : null
                    )
                  }
                  className="resize-y"
                  style={modalInputStyle}
                />
              </div>
            </div>
            {personEditError ? (
              <p
                className="mt-3 text-sm"
                style={{ fontFamily: sans, color: "var(--dg-danger)" }}
              >
                {personEditError}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={personEditSaving}
                onClick={() => void savePersonFromModal()}
                style={{
                  fontFamily: sans,
                  backgroundColor: colors.brownOutline,
                  color: colors.cream,
                  border: "none",
                  padding: "0.55rem 1.2rem",
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  cursor: personEditSaving ? "wait" : "pointer",
                  borderRadius: 2,
                  opacity: personEditSaving ? 0.85 : 1,
                }}
              >
                Save
              </button>
              <button
                type="button"
                disabled={personEditSaving}
                onClick={() => closeEditPersonModal()}
                style={btnOutline}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deletePersonOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-person-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deletePersonBusy) {
              setDeletePersonOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-lg border p-6 shadow-xl"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="delete-person-title"
              className="mb-3 text-xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Delete person
            </h2>
            <p
              className="text-sm leading-relaxed"
              style={{ fontFamily: sans, color: colors.brownMid }}
            >
              Are you sure you want to delete{" "}
              <strong style={{ color: colors.brownDark }}>
                {personFullName || "this person"}
              </strong>
              ? This will also delete all their events, relationships and
              sources.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={deletePersonBusy}
                onClick={() => void confirmDeletePerson()}
                style={{
                  fontFamily: sans,
                  backgroundColor: "var(--dg-danger)",
                  color: colors.cream,
                  border: "none",
                  padding: "0.55rem 1.2rem",
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  cursor: deletePersonBusy ? "wait" : "pointer",
                  borderRadius: 2,
                  opacity: deletePersonBusy ? 0.85 : 1,
                }}
              >
                Delete
              </button>
              <button
                type="button"
                disabled={deletePersonBusy}
                onClick={() => setDeletePersonOpen(false)}
                style={btnOutline}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editRelModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-relationship-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !editRelBusy) {
              setEditRelModal(null);
              setEditRelType("");
              setEditRelError(null);
            }
          }}
        >
          <div
            className="w-full max-w-md rounded-lg border p-6 shadow-xl"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="edit-relationship-modal-title"
              className="mb-1 text-2xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Edit relationship
            </h2>
            <p
              className="mb-4 text-sm"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              {editRelOtherName}
            </p>
            <label
              className="mb-1 block text-xs font-bold uppercase tracking-wide"
              style={{ fontFamily: sans, color: colors.brownMuted }}
              htmlFor="edit-family-rel-type"
            >
              Relationship type
            </label>
            <select
              id="edit-family-rel-type"
              value={editRelType}
              onChange={(e) => setEditRelType(e.target.value)}
              className="mb-4 w-full"
              style={modalInputStyle}
              disabled={editRelBusy}
            >
              <option value="parent">Parent</option>
              <option value="child">Child</option>
              <option value="spouse">Spouse</option>
              <option value="sibling">Sibling</option>
            </select>
            {editRelError ? (
              <p
                className="mb-3 text-sm"
                style={{ fontFamily: sans, color: "var(--dg-danger)" }}
              >
                {editRelError}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={editRelBusy}
                onClick={() => void submitEditRelationship()}
                style={{
                  fontFamily: sans,
                  backgroundColor: colors.brownOutline,
                  color: colors.cream,
                  border: "none",
                  padding: "0.55rem 1.2rem",
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  borderRadius: 2,
                  cursor: editRelBusy ? "wait" : "pointer",
                  opacity: editRelBusy ? 0.85 : 1,
                }}
              >
                {editRelBusy ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                disabled={editRelBusy}
                onClick={() => void submitRemoveRelationship()}
                style={{ ...btnOutline, color: "var(--dg-danger)" }}
              >
                Remove relationship
              </button>
              <button
                type="button"
                disabled={editRelBusy}
                onClick={() => {
                  setEditRelModal(null);
                  setEditRelType("");
                  setEditRelError(null);
                }}
                style={btnOutline}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addFamilyModalOpen && person ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-family-modal-title"
          onClick={(e) => {
            if (
              e.target === e.currentTarget &&
              !addFamilyFindBusy &&
              !addFamilyCreateBusy
            ) {
              closeAddFamilyModal();
            }
          }}
        >
          <div
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg border p-6 shadow-xl"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="add-family-modal-title"
              className="mb-1 text-2xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Add family member
            </h2>
            <p
              className="mb-4 text-sm"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              Link someone in this tree or create a new person and connect them.
            </p>

            <div
              className="mb-5 flex gap-1 rounded-md border p-1"
              style={{
                borderColor: colors.brownBorder,
                backgroundColor: colors.cream,
              }}
              role="tablist"
              aria-label="Add family source"
            >
              <button
                type="button"
                role="tab"
                aria-selected={addFamilyTab === "find"}
                className="min-w-0 flex-1 rounded px-3 py-2 text-sm font-semibold transition"
                style={{
                  fontFamily: sans,
                  backgroundColor:
                    addFamilyTab === "find" ? colors.parchment : "transparent",
                  color: colors.brownDark,
                  border:
                    addFamilyTab === "find"
                      ? `1px solid ${colors.brownBorder}`
                      : "1px solid transparent",
                  cursor: "pointer",
                }}
                onClick={() => {
                  setAddFamilyTab("find");
                  setAddFamilyFindError(null);
                  setAddFamilyCreateError(null);
                }}
              >
                Find existing
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={addFamilyTab === "create"}
                className="min-w-0 flex-1 rounded px-3 py-2 text-sm font-semibold transition"
                style={{
                  fontFamily: sans,
                  backgroundColor:
                    addFamilyTab === "create"
                      ? colors.parchment
                      : "transparent",
                  color: colors.brownDark,
                  border:
                    addFamilyTab === "create"
                      ? `1px solid ${colors.brownBorder}`
                      : "1px solid transparent",
                  cursor: "pointer",
                }}
                onClick={() => {
                  setAddFamilyTab("create");
                  setAddFamilyFindError(null);
                  setAddFamilyCreateError(null);
                }}
              >
                Create new
              </button>
            </div>

            {addFamilyTab === "find" ? (
              <div className="space-y-4">
                <div>
                  <label
                    className="mb-1 block text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                    htmlFor="add-family-find-search"
                  >
                    Search by name
                  </label>
                  <input
                    id="add-family-find-search"
                    type="search"
                    value={addFamilyFindQuery}
                    onChange={(e) => setAddFamilyFindQuery(e.target.value)}
                    placeholder="First, middle, or last name…"
                    autoComplete="off"
                    className="w-full"
                    style={modalInputStyle}
                  />
                </div>
                {addFamilyTreePeopleLoading ? (
                  <p
                    className="text-sm italic"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                  >
                    Loading people in this tree…
                  </p>
                ) : null}
                {addFamilyTreePeopleError ? (
                  <p
                    className="text-sm"
                    style={{ fontFamily: sans, color: "var(--dg-danger)" }}
                  >
                    {addFamilyTreePeopleError}
                  </p>
                ) : null}
                <ul className="max-h-[220px] space-y-2 overflow-y-auto pr-1">
                  {addFamilyFilteredPeople.map((c) => {
                    const line = [
                      c.first_name,
                      c.middle_name ?? "",
                      c.last_name,
                    ]
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .join(" ");
                    const y = birthYearLabel(c.birth_date);
                    const selected = addFamilySelectedOther?.id === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full rounded-lg border p-3 text-left transition hover:opacity-90"
                          style={{
                            fontFamily: sans,
                            borderColor: selected
                              ? colors.forest
                              : colors.brownBorder,
                            backgroundColor: selected
                              ? colors.parchment
                              : colors.cream,
                            color: colors.brownDark,
                            cursor: "pointer",
                            boxShadow: selected
                              ? `0 0 0 1px ${colors.forest}`
                              : undefined,
                          }}
                          onClick={() => setAddFamilySelectedOther(c)}
                        >
                          <span className="font-semibold">{line || "—"}</span>
                          {y ? (
                            <span
                              className="mt-1 block text-xs"
                              style={{ color: colors.brownMuted }}
                            >
                              Born {y}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {addFamilyFindQuery.trim() !== "" &&
                !addFamilyTreePeopleLoading &&
                !addFamilyTreePeopleError &&
                addFamilyFilteredPeople.length === 0 ? (
                  <p
                    className="text-sm italic"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                  >
                    No matches in this tree.
                  </p>
                ) : null}
                <div>
                  <label
                    className="mb-1 block text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                    htmlFor="add-family-find-rel"
                  >
                    Their relationship to {personFullName || "this person"}
                  </label>
                  <select
                    id="add-family-find-rel"
                    value={addFamilyFindRel}
                    onChange={(e) =>
                      setAddFamilyFindRel(
                        e.target.value as FamilyRelationshipChoice
                      )
                    }
                    style={modalInputStyle}
                  >
                    <option value="parent">Parent</option>
                    <option value="child">Child</option>
                    <option value="spouse">Spouse</option>
                    <option value="sibling">Sibling</option>
                  </select>
                </div>
                {addFamilyFindError ? (
                  <p
                    className="text-sm"
                    style={{ fontFamily: sans, color: "var(--dg-danger)" }}
                  >
                    {addFamilyFindError}
                  </p>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                  <button
                    type="button"
                    onClick={() => closeAddFamilyModal()}
                    disabled={addFamilyFindBusy}
                    style={btnOutline}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={
                      addFamilyFindBusy || !addFamilySelectedOther
                    }
                    onClick={() => void submitAddFamilyLinkExisting()}
                    style={{
                      fontFamily: sans,
                      backgroundColor: colors.brownOutline,
                      color: colors.cream,
                      border: "none",
                      padding: "0.55rem 1.2rem",
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      cursor:
                        addFamilyFindBusy || !addFamilySelectedOther
                          ? "not-allowed"
                          : "pointer",
                      borderRadius: 2,
                      opacity:
                        addFamilyFindBusy || !addFamilySelectedOther
                          ? 0.65
                          : 1,
                    }}
                  >
                    {addFamilyFindBusy ? "Linking…" : "Link"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label
                    className="mb-1 block text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                    htmlFor="add-family-fn"
                  >
                    First name <span style={{ color: "var(--dg-danger)" }}>*</span>
                  </label>
                  <input
                    id="add-family-fn"
                    value={addFamilyCreateFirst}
                    onChange={(e) => setAddFamilyCreateFirst(e.target.value)}
                    className="w-full"
                    style={modalInputStyle}
                  />
                </div>
                <div>
                  <label
                    className="mb-1 block text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                    htmlFor="add-family-mn"
                  >
                    Middle name
                  </label>
                  <input
                    id="add-family-mn"
                    value={addFamilyCreateMiddle}
                    onChange={(e) => setAddFamilyCreateMiddle(e.target.value)}
                    className="w-full"
                    style={modalInputStyle}
                  />
                </div>
                <div>
                  <label
                    className="mb-1 block text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                    htmlFor="add-family-ln"
                  >
                    Last name <span style={{ color: "var(--dg-danger)" }}>*</span>
                  </label>
                  <input
                    id="add-family-ln"
                    value={addFamilyCreateLast}
                    onChange={(e) => setAddFamilyCreateLast(e.target.value)}
                    className="w-full"
                    style={modalInputStyle}
                  />
                </div>
                <div>
                  <label
                    className="mb-1 block text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                    htmlFor="add-family-bd"
                  >
                    Birth date
                  </label>
                  <input
                    id="add-family-bd"
                    type="date"
                    value={addFamilyCreateBirth}
                    onChange={(e) => setAddFamilyCreateBirth(e.target.value)}
                    className="w-full"
                    style={modalInputStyle}
                  />
                </div>
                <div>
                  <label
                    className="mb-1 block text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                    htmlFor="add-family-dd"
                  >
                    Death date
                  </label>
                  <input
                    id="add-family-dd"
                    type="date"
                    value={addFamilyCreateDeath}
                    onChange={(e) => setAddFamilyCreateDeath(e.target.value)}
                    className="w-full"
                    style={modalInputStyle}
                  />
                </div>
                <div>
                  <label
                    className="mb-1 block text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                    htmlFor="add-family-gender"
                  >
                    Gender
                  </label>
                  <input
                    id="add-family-gender"
                    value={addFamilyCreateGender}
                    onChange={(e) => setAddFamilyCreateGender(e.target.value)}
                    placeholder="Optional"
                    className="w-full"
                    style={modalInputStyle}
                  />
                </div>
                <div>
                  <label
                    className="mb-1 block text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                    htmlFor="add-family-create-rel"
                  >
                    Their relationship to {personFullName || "this person"}
                  </label>
                  <select
                    id="add-family-create-rel"
                    value={addFamilyCreateRel}
                    onChange={(e) =>
                      setAddFamilyCreateRel(
                        e.target.value as FamilyRelationshipChoice
                      )
                    }
                    style={modalInputStyle}
                  >
                    <option value="parent">Parent</option>
                    <option value="child">Child</option>
                    <option value="spouse">Spouse</option>
                    <option value="sibling">Sibling</option>
                  </select>
                </div>
                {addFamilyCreateError ? (
                  <p
                    className="text-sm"
                    style={{ fontFamily: sans, color: "var(--dg-danger)" }}
                  >
                    {addFamilyCreateError}
                  </p>
                ) : null}
                <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                  <button
                    type="button"
                    onClick={() => closeAddFamilyModal()}
                    disabled={addFamilyCreateBusy}
                    style={btnOutline}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={addFamilyCreateBusy}
                    onClick={() => void submitAddFamilyCreateAndLink()}
                    style={{
                      fontFamily: sans,
                      backgroundColor: colors.brownOutline,
                      color: colors.cream,
                      border: "none",
                      padding: "0.55rem 1.2rem",
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      cursor: addFamilyCreateBusy ? "wait" : "pointer",
                      borderRadius: 2,
                      opacity: addFamilyCreateBusy ? 0.85 : 1,
                    }}
                  >
                    {addFamilyCreateBusy ? "Saving…" : "Create and link"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {recordUploadModalOpen && person ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="person-upload-record-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRecordUploadModalOpen(false);
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border p-6 shadow-xl"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2
                id="person-upload-record-title"
                className="text-2xl font-bold"
                style={{ fontFamily: serif, color: colors.brownDark }}
              >
                Upload a record
              </h2>
              <button
                type="button"
                className="shrink-0 rounded border-2 px-2.5 py-1 text-sm font-semibold"
                style={{
                  fontFamily: sans,
                  borderColor: colors.brownOutline,
                  color: colors.brownDark,
                  backgroundColor: "transparent",
                  cursor: "pointer",
                }}
                aria-label="Close"
                onClick={() => setRecordUploadModalOpen(false)}
              >
                ×
              </button>
            </div>
            <p
              className="mb-4 text-sm"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              Upload a document and we&apos;ll extract events and relationships
              for{" "}
              {[
                person.first_name,
                person.middle_name ?? "",
                person.last_name,
              ]
                .map((s) => s.trim())
                .filter(Boolean)
                .join(" ")}
              .
            </p>
            <DocumentUploadSection
              treeId={effectiveTreeIdForFamily}
              anchorPersonId={personId}
              embedded
            />
          </div>
        </div>
      ) : null}

      {mergeModalOpen && person ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="merge-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !mergeSaving) {
              closeMergeModal();
            }
          }}
        >
          <div
            className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg border p-6 shadow-xl"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="merge-modal-title"
              className="mb-1 text-2xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Merge with another person
            </h2>
            <p
              className="mb-5 text-sm"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              Search for a duplicate profile. You keep this record; the other
              is removed after merge.
            </p>

            {mergeUiStep === "search" ? (
              <>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                  htmlFor="merge-search"
                >
                  Search by name
                </label>
                <input
                  id="merge-search"
                  type="search"
                  value={mergeSearchQuery}
                  onChange={(e) => setMergeSearchQuery(e.target.value)}
                  placeholder="First and last name…"
                  autoComplete="off"
                  className="mb-3 w-full"
                  style={modalInputStyle}
                />
                {mergeSearchLoading ? (
                  <p
                    className="text-sm italic"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                  >
                    Searching…
                  </p>
                ) : null}
                {mergeSearchError ? (
                  <p
                    className="mb-3 text-sm"
                    style={{ fontFamily: sans, color: "var(--dg-danger)" }}
                  >
                    {mergeSearchError}
                  </p>
                ) : null}
                <ul className="max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                  {mergeSearchResults.map((c) => {
                    const line = [
                      c.first_name,
                      c.middle_name ?? "",
                      c.last_name,
                    ]
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .join(" ");
                    const dLine = [
                      c.birth_date
                        ? `b. ${formatDateString(c.birth_date)}`
                        : "",
                      c.death_date
                        ? `d. ${formatDateString(c.death_date)}`
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="w-full rounded-lg border p-3 text-left transition hover:opacity-90"
                          style={{
                            fontFamily: sans,
                            borderColor: colors.brownBorder,
                            backgroundColor: colors.cream,
                            color: colors.brownDark,
                            cursor: "pointer",
                          }}
                          onClick={() => selectMergeDuplicate(c)}
                        >
                          <span className="font-semibold">{line || "—"}</span>
                          {dLine ? (
                            <span
                              className="mt-1 block text-xs italic"
                              style={{ color: colors.brownMuted }}
                            >
                              {dLine}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {mergeSearchQuery.trim().length >= 2 &&
                !mergeSearchLoading &&
                mergeSearchResults.length === 0 &&
                !mergeSearchError ? (
                  <p
                    className="mt-2 text-sm italic"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                  >
                    No matches yet.
                  </p>
                ) : null}
                <div className="mt-6 flex justify-end border-t pt-4">
                  <button
                    type="button"
                    onClick={() => closeMergeModal()}
                    style={btnOutline}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : mergeSelectedDup ? (
              <>
                <button
                  type="button"
                  className="mb-4 border-none bg-transparent p-0 text-sm font-semibold underline"
                  style={{ fontFamily: sans, color: colors.forest }}
                  onClick={() => backToMergeSearch()}
                >
                  ← Choose a different person
                </button>
                <div
                  className="mb-4 grid grid-cols-2 gap-3 border-b pb-3"
                  style={{ borderColor: `${colors.brownBorder}99` }}
                >
                  <p
                    className="text-center text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.forest }}
                  >
                    Ancestor 1
                  </p>
                  <p
                    className="text-center text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: "var(--dg-danger)" }}
                  >
                    Ancestor 2
                  </p>
                </div>
                <div className="space-y-5">
                  {MERGE_COMPARE_KEYS.map((key) => {
                    const label = MERGE_FIELD_LABELS[key];
                    const dup = mergeSelectedDup;
                    const pv = mergeFieldStr(person, key);
                    const dv = mergeFieldStr(dup, key);
                    const hasConflict =
                      pv !== "" && dv !== "" && pv !== dv;
                    const cellBase: React.CSSProperties = {
                      backgroundColor: colors.cream,
                      borderColor: colors.brownBorder,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderRadius: 4,
                      padding: "0.65rem 0.75rem",
                      minHeight: "2.75rem",
                      fontFamily: sans,
                      fontSize: "0.875rem",
                      color: colors.brownDark,
                      alignItems: "flex-start",
                    };
                    const labelStyle: React.CSSProperties = {
                      fontFamily: serif,
                      fontWeight: 700,
                      color: colors.brownDark,
                      fontSize: "0.95rem",
                      marginBottom: "0.45rem",
                    };
                    const dash = (
                      <span style={{ color: colors.brownMuted }}>—</span>
                    );

                    if (hasConflict) {
                      const choice = mergeFieldChoices[key] ?? "primary";
                      return (
                        <div
                          key={key}
                          className="border-b pb-4 last:border-0 last:pb-0"
                          style={{
                            borderColor: `${colors.brownBorder}55`,
                          }}
                        >
                          <p style={labelStyle}>{label}</p>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <label
                              className="flex cursor-pointer gap-2"
                              style={{
                                ...cellBase,
                                borderColor:
                                  choice === "primary"
                                    ? colors.forest
                                    : colors.brownBorder,
                                boxShadow:
                                  choice === "primary"
                                    ? `0 0 0 1px ${colors.forest}`
                                    : "none",
                              }}
                            >
                              <input
                                type="radio"
                                className="mt-1 shrink-0"
                                name={`merge-field-${key}`}
                                checked={choice === "primary"}
                                onChange={() =>
                                  setMergeFieldChoices((prev) => ({
                                    ...prev,
                                    [key]: "primary",
                                  }))
                                }
                              />
                              <span className="leading-snug">
                                {formatMergeFieldForUi(key, pv)}
                              </span>
                            </label>
                            <label
                              className="flex cursor-pointer gap-2"
                              style={{
                                ...cellBase,
                                borderColor:
                                  choice === "duplicate"
                                    ? colors.brownOutline
                                    : colors.brownBorder,
                                boxShadow:
                                  choice === "duplicate"
                                    ? `0 0 0 1px ${colors.brownOutline}`
                                    : "none",
                              }}
                            >
                              <input
                                type="radio"
                                className="mt-1 shrink-0"
                                name={`merge-field-${key}`}
                                checked={choice === "duplicate"}
                                onChange={() =>
                                  setMergeFieldChoices((prev) => ({
                                    ...prev,
                                    [key]: "duplicate",
                                  }))
                                }
                              />
                              <span className="leading-snug">
                                {formatMergeFieldForUi(key, dv)}
                              </span>
                            </label>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={key}
                        className="border-b pb-4 last:border-0 last:pb-0"
                        style={{ borderColor: `${colors.brownBorder}55` }}
                      >
                        <p style={labelStyle}>{label}</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div
                            className="flex"
                            style={{
                              ...cellBase,
                              color: colors.brownMid,
                            }}
                          >
                            {pv
                              ? formatMergeFieldForUi(key, pv)
                              : dash}
                          </div>
                          <div
                            className="flex"
                            style={{
                              ...cellBase,
                              color: colors.brownMid,
                            }}
                          >
                            {dv
                              ? formatMergeFieldForUi(key, dv)
                              : dash}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {mergeError ? (
                  <p
                    className="mt-4 text-sm"
                    style={{ fontFamily: sans, color: "var(--dg-danger)" }}
                  >
                    {mergeError}
                  </p>
                ) : null}
                <div
                  className="mt-6 flex flex-wrap gap-2 border-t pt-4"
                  style={{ borderColor: `${colors.brownBorder}99` }}
                >
                  <button
                    type="button"
                    disabled={mergeSaving}
                    onClick={() => void confirmMerge()}
                    style={{
                      fontFamily: sans,
                      backgroundColor: colors.brownOutline,
                      color: colors.cream,
                      border: "none",
                      padding: "0.55rem 1.2rem",
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      cursor: mergeSaving ? "wait" : "pointer",
                      borderRadius: 2,
                      opacity: mergeSaving ? 0.85 : 1,
                    }}
                  >
                    Confirm merge
                  </button>
                  <button
                    type="button"
                    disabled={mergeSaving}
                    onClick={() => closeMergeModal()}
                    style={btnOutline}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {cropModalPhoto ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="crop-photo-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCropModalPhoto(null);
          }}
        >
          <div
            className="w-full max-w-md rounded-lg border p-6 shadow-xl"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="crop-photo-title"
              className="mb-6 text-2xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Adjust photo
            </h2>
            <div
              className="mx-auto flex justify-center"
              style={{
                padding: 10,
                borderRadius: "50%",
                backgroundColor: "var(--dg-modal-backdrop-deep)",
              }}
            >
              <div
                className="select-none"
                style={{
                  position: "relative",
                  width: CROP_PREVIEW_PX,
                  height: CROP_PREVIEW_PX,
                  borderRadius: "50%",
                  overflow: "hidden",
                  touchAction: "none",
                  cursor: cropDragging ? "grabbing" : "grab",
                  backgroundColor: colors.avatarBg,
                }}
                onMouseDown={handleCropCircleMouseDown}
                onTouchStart={handleCropCircleTouchStart}
              >
                {(() => {
                  const previewUrl = photoUrlFromRow(cropModalPhoto);
                  if (!previewUrl) return null;
                  const nw = cropNaturalSize?.w ?? 0;
                  const nh = cropNaturalSize?.h ?? 0;
                  const { w: cropRw, h: cropRh } =
                    nw > 0 && nh > 0
                      ? cropCoverRenderedSize(
                          nw,
                          nh,
                          CROP_PREVIEW_PX,
                          cropZoom
                        )
                      : { w: CROP_PREVIEW_PX * cropZoom, h: CROP_PREVIEW_PX * cropZoom };
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt=""
                      draggable={false}
                      onLoad={(e) => {
                        const el = e.currentTarget;
                        setCropNaturalSize({
                          w: el.naturalWidth,
                          h: el.naturalHeight,
                        });
                      }}
                      style={{
                        position: "absolute",
                        left: cropOffset.x,
                        top: cropOffset.y,
                        width: cropRw,
                        height: cropRh,
                        pointerEvents: "none",
                        maxWidth: "none",
                      }}
                    />
                  );
                })()}
              </div>
            </div>
            <div
              className="mx-auto mt-6 flex max-w-[320px] items-center gap-3"
              style={{ fontFamily: sans }}
            >
              <label
                htmlFor="crop-photo-zoom"
                className="shrink-0 text-sm font-semibold"
                style={{ color: colors.brownDark }}
              >
                Zoom
              </label>
              <input
                id="crop-photo-zoom"
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={cropZoom}
                onChange={(e) =>
                  setCropZoom(Number.parseFloat(e.target.value))
                }
                className="h-2 min-w-0 flex-1 cursor-pointer"
                style={{ accentColor: colors.brownOutline }}
              />
              <span
                className="shrink-0 text-sm tabular-nums"
                style={{ color: colors.brownMuted, minWidth: "2.75rem" }}
              >
                {Number(cropZoom.toFixed(2))}×
              </span>
            </div>
            <div className="mt-8 flex flex-wrap gap-2">
              <button
                type="button"
                style={{
                  fontFamily: sans,
                  backgroundColor: colors.brownOutline,
                  color: colors.cream,
                  border: "none",
                  padding: "0.55rem 1.2rem",
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  borderRadius: 2,
                }}
                onClick={() => {
                  const id =
                    typeof cropModalPhoto.id === "string"
                      ? cropModalPhoto.id
                      : null;
                  if (!id || !cropNaturalSize) return;
                  const { w: saveRw, h: saveRh } = cropCoverRenderedSize(
                    cropNaturalSize.w,
                    cropNaturalSize.h,
                    CROP_PREVIEW_PX,
                    cropZoom
                  );
                  const { x: cx, y: cy } = offsetToCropPercentCover(
                    cropOffset,
                    saveRw,
                    saveRh,
                    CROP_PREVIEW_PX
                  );
                  void saveCropPosition(id, cx, cy, cropZoom);
                }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setCropModalPhoto(null)}
                style={btnOutline}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {photoSetupModal ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="photo-setup-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !photoSetupSaving) {
              skipPhotoSetup();
            }
          }}
        >
          <div
            className="my-4 w-full max-w-4xl rounded-lg border p-6 shadow-xl"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="photo-setup-title"
              className="mb-6 text-2xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Set up photo
            </h2>
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              <div>
                <p
                  className="mb-3 text-sm"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  Drag to reposition · Zoom to fit
                </p>
                <div
                  className="mx-auto flex w-fit justify-center"
                  style={{
                    padding: 10,
                    borderRadius: "50%",
                    backgroundColor: "var(--dg-modal-backdrop-deep)",
                  }}
                >
                  <div
                    className="select-none"
                    style={{
                      position: "relative",
                      width: CROP_PREVIEW_PX,
                      height: CROP_PREVIEW_PX,
                      borderRadius: "50%",
                      overflow: "hidden",
                      touchAction: "none",
                      cursor: photoSetupDragging ? "grabbing" : "grab",
                      backgroundColor: colors.avatarBg,
                    }}
                    onMouseDown={handlePhotoSetupCircleMouseDown}
                    onTouchStart={handlePhotoSetupCircleTouchStart}
                  >
                    {(() => {
                      const previewUrl = photoUrlFromRow(photoSetupModal);
                      if (!previewUrl) return null;
                      const snw = photoSetupNaturalSize?.w ?? 0;
                      const snh = photoSetupNaturalSize?.h ?? 0;
                      const { w: setupImgRw, h: setupImgRh } =
                        snw > 0 && snh > 0
                          ? cropCoverRenderedSize(
                              snw,
                              snh,
                              CROP_PREVIEW_PX,
                              photoSetupZoom
                            )
                          : {
                              w: CROP_PREVIEW_PX * photoSetupZoom,
                              h: CROP_PREVIEW_PX * photoSetupZoom,
                            };
                      return (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewUrl}
                          alt=""
                          draggable={false}
                          onLoad={(e) => {
                            const el = e.currentTarget;
                            setPhotoSetupNaturalSize({
                              w: el.naturalWidth,
                              h: el.naturalHeight,
                            });
                          }}
                          style={{
                            position: "absolute",
                            left: photoSetupOffset.x,
                            top: photoSetupOffset.y,
                            width: setupImgRw,
                            height: setupImgRh,
                            pointerEvents: "none",
                            maxWidth: "none",
                          }}
                        />
                      );
                    })()}
                  </div>
                </div>
                <div
                  className="mx-auto mt-5 flex max-w-[320px] items-center gap-3"
                  style={{ fontFamily: sans }}
                >
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.05}
                    value={photoSetupZoom}
                    onChange={(e) =>
                      setPhotoSetupZoom(Number.parseFloat(e.target.value))
                    }
                    className="h-2 min-w-0 w-full flex-1 cursor-pointer"
                    style={{ accentColor: colors.brownOutline }}
                    aria-label="Zoom"
                  />
                  <span
                    className="shrink-0 text-sm tabular-nums"
                    style={{ color: colors.brownMuted, minWidth: "2.75rem" }}
                  >
                    {Number(photoSetupZoom.toFixed(2))}×
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-5">
                <div>
                  <label
                    className="mb-1 block text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                    htmlFor="photo-setup-date"
                  >
                    Date
                  </label>
                  <input
                    id="photo-setup-date"
                    type="text"
                    value={photoSetupDate}
                    onChange={(e) => {
                      const raw = e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 8);
                      let formatted = raw;
                      if (raw.length > 2) {
                        formatted = `${raw.slice(0, 2)}/${raw.slice(2)}`;
                      }
                      if (raw.length > 4) {
                        formatted = `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}`;
                      }
                      setPhotoSetupDate(formatted);
                    }}
                    placeholder="e.g. 1943 or 06/1943 or 06/15/1943"
                    autoComplete="off"
                    style={modalInputStyle}
                  />
                </div>
                <div>
                  <p
                    className="mb-1 text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                  >
                    Tag people
                  </p>
                  <input
                    type="search"
                    value={photoSetupTagSearch}
                    onChange={(e) => setPhotoSetupTagSearch(e.target.value)}
                    placeholder="Search by name…"
                    autoComplete="off"
                    className="mb-2 w-full"
                    style={modalInputStyle}
                  />
                  {photoSetupTagSearching ? (
                    <p
                      className="mb-2 text-sm italic"
                      style={{ fontFamily: sans, color: colors.brownMuted }}
                    >
                      Searching…
                    </p>
                  ) : null}
                  {photoSetupTagResults.length > 0 ? (
                    <ul className="mb-3 max-h-36 space-y-1 overflow-y-auto pr-1">
                      {photoSetupTagResults.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            className="w-full rounded border px-2 py-1.5 text-left text-sm transition hover:opacity-90"
                            style={{
                              fontFamily: sans,
                              borderColor: colors.brownBorder,
                              backgroundColor: colors.cream,
                              color: colors.brownDark,
                              cursor: "pointer",
                            }}
                            onClick={() => {
                              setPhotoSetupTags((prev) => [...prev, p]);
                              setPhotoSetupTagSearch("");
                              setPhotoSetupTagResults([]);
                            }}
                          >
                            {photoSetupTagDisplayName(p)}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    {photoSetupTags.map((t) => {
                      const locked = t.id === personId;
                      return (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                          style={{
                            fontFamily: sans,
                            borderColor: colors.brownBorder,
                            backgroundColor: colors.cream,
                            color: colors.brownDark,
                          }}
                        >
                          {photoSetupTagDisplayName(t)}
                          {locked ? null : (
                            <button
                              type="button"
                              className="border-none bg-transparent p-0 leading-none"
                              style={{
                                color: "var(--dg-danger)",
                                cursor: "pointer",
                                fontSize: "1rem",
                                lineHeight: 1,
                              }}
                              aria-label={`Remove ${photoSetupTagDisplayName(t)}`}
                              onClick={() =>
                                setPhotoSetupTags((prev) =>
                                  prev.filter((x) => x.id !== t.id)
                                )
                              }
                            >
                              ×
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            {photoSetupError ? (
              <p
                className="mt-4 text-sm"
                style={{ fontFamily: sans, color: "var(--dg-danger)" }}
              >
                {photoSetupError}
              </p>
            ) : null}
            <div className="mt-8 flex flex-wrap gap-2 border-t pt-4">
              <button
                type="button"
                disabled={photoSetupSaving}
                onClick={() => void savePhotoSetup()}
                style={{
                  fontFamily: sans,
                  backgroundColor: colors.brownOutline,
                  color: colors.cream,
                  border: "none",
                  padding: "0.55rem 1.2rem",
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  cursor: photoSetupSaving ? "wait" : "pointer",
                  borderRadius: 2,
                  opacity: photoSetupSaving ? 0.85 : 1,
                }}
              >
                {photoSetupSaving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={photoSetupSaving}
                onClick={() => skipPhotoSetup()}
                style={btnOutline}
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {tagModalPhoto ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tag-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !tagModalSaving) {
              closeTagModal();
            }
          }}
        >
          <div
            className="my-4 w-full max-w-lg rounded-lg border p-6 shadow-xl"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="tag-modal-title"
              className="mb-4 text-2xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Tag people
            </h2>
            <div
              className="mb-5 overflow-hidden rounded border shadow-sm"
              style={{
                width: 120,
                height: 120,
                borderColor: colors.brownBorder,
                backgroundColor: colors.avatarBg,
              }}
            >
              {(() => {
                const thumbUrl = photoUrlFromRow(tagModalPhoto);
                if (!thumbUrl) return null;
                return (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                );
              })()}
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              {tagModalTags.map((t) => {
                const locked = t.id === personId;
                return (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                    style={{
                      fontFamily: sans,
                      borderColor: colors.brownBorder,
                      backgroundColor: colors.cream,
                      color: colors.brownDark,
                    }}
                  >
                    {photoSetupTagDisplayName(t)}
                    {locked ? null : (
                      <button
                        type="button"
                        className="border-none bg-transparent p-0 leading-none"
                        style={{
                          color: "var(--dg-danger)",
                          cursor: "pointer",
                          fontSize: "1rem",
                          lineHeight: 1,
                        }}
                        aria-label={`Remove ${photoSetupTagDisplayName(t)}`}
                        onClick={() =>
                          setTagModalTags((prev) =>
                            prev.filter((x) => x.id !== t.id)
                          )
                        }
                      >
                        ×
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
            <div className="mb-1">
              <label
                className="mb-1 block text-xs font-bold uppercase tracking-wide"
                style={{ fontFamily: sans, color: colors.brownMuted }}
                htmlFor="tag-modal-search"
              >
                Add person
              </label>
              <input
                id="tag-modal-search"
                type="search"
                value={tagModalSearch}
                onChange={(e) => setTagModalSearch(e.target.value)}
                placeholder="Search by name…"
                autoComplete="off"
                className="mb-2 w-full"
                style={modalInputStyle}
              />
            </div>
            {tagModalResults.length > 0 ? (
              <ul className="mb-4 max-h-36 space-y-1 overflow-y-auto pr-1">
                {tagModalResults.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full rounded border px-2 py-1.5 text-left text-sm transition hover:opacity-90"
                      style={{
                        fontFamily: sans,
                        borderColor: colors.brownBorder,
                        backgroundColor: colors.cream,
                        color: colors.brownDark,
                        cursor: "pointer",
                      }}
                      onClick={() => {
                        setTagModalTags((prev) => [...prev, p]);
                        setTagModalSearch("");
                        setTagModalResults([]);
                      }}
                    >
                      {photoSetupTagDisplayName(p)}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {tagModalError ? (
              <p
                className="mb-4 text-sm"
                style={{ fontFamily: sans, color: "var(--dg-danger)" }}
              >
                {tagModalError}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2 border-t pt-4">
              <button
                type="button"
                disabled={tagModalSaving}
                onClick={() => void saveTagModal()}
                style={{
                  fontFamily: sans,
                  backgroundColor: colors.brownOutline,
                  color: colors.cream,
                  border: "none",
                  padding: "0.55rem 1.2rem",
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  cursor: tagModalSaving ? "wait" : "pointer",
                  borderRadius: 2,
                  opacity: tagModalSaving ? 0.85 : 1,
                }}
              >
                {tagModalSaving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={tagModalSaving}
                onClick={() => closeTagModal()}
                style={btnOutline}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {addEventOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
          <div
            className="w-full max-w-lg rounded-xl shadow-xl"
            style={{
              backgroundColor: "var(--dg-cream)",
              border: `1px solid ${colors.brownBorder}`,
            }}
          >
            <div
              className="flex items-center justify-between border-b px-6 py-4"
              style={{ borderColor: colors.brownBorder }}
            >
              <h3
                className="text-lg font-semibold"
                style={{ fontFamily: serif, color: colors.brownDark }}
              >
                Add Event
              </h3>
              <button
                type="button"
                onClick={() => setAddEventOpen(false)}
                className="text-xl leading-none"
                style={{ color: colors.brownMuted }}
              >
                ×
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  Event Type <span style={{ color: "red" }}>*</span>
                </label>
                <select
                  value={addEventDraft.event_type}
                  onChange={(e) =>
                    setAddEventDraft((d) => ({
                      ...d,
                      event_type: e.target.value,
                    }))
                  }
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{
                    fontFamily: sans,
                    backgroundColor: "var(--dg-cream)",
                    color: colors.brownDark,
                    borderColor: colors.brownBorder,
                  }}
                >
                  <option value="">Select an event type…</option>
                  {buildEventTypeSelectOptions([], false).map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  Date
                </label>
                <SmartDateInput
                  value={addEventDraft.event_date}
                  onChange={(val) =>
                    setAddEventDraft((d) => ({ ...d, event_date: val }))
                  }
                  style={modalInputStyle}
                  placeholder="MM/DD/YYYY"
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  Place
                </label>
                <PlaceInput
                  value={addEventDraft.event_place_display}
                  onChange={(v) =>
                    setAddEventDraft((d) => ({
                      ...d,
                      event_place_display: v,
                      event_place_id: null,
                      event_place_fields: null,
                    }))
                  }
                  onPlaceSelect={(place) =>
                    setAddEventDraft((d) => ({
                      ...d,
                      event_place_display: place.display,
                      event_place_id: place.id,
                      event_place_fields: {
                        township: place.township,
                        county: place.county,
                        state: place.state,
                        country: place.country,
                      },
                    }))
                  }
                  style={modalInputStyle}
                />
              </div>

              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase tracking-wider"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  Notes
                </label>
                <textarea
                  value={addEventDraft.notes}
                  onChange={(e) =>
                    setAddEventDraft((d) => ({ ...d, notes: e.target.value }))
                  }
                  rows={3}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  style={{
                    fontFamily: sans,
                    backgroundColor: "var(--dg-cream)",
                    color: colors.brownDark,
                    borderColor: colors.brownBorder,
                  }}
                  placeholder="What happened? Family story, oral history, or document summary…"
                />
              </div>
            </div>

            <div
              className="flex justify-end gap-3 border-t px-6 py-4"
              style={{ borderColor: colors.brownBorder }}
            >
              <button
                type="button"
                onClick={() => setAddEventOpen(false)}
                className="rounded-md px-4 py-2 text-sm font-medium"
                style={{ fontFamily: sans, color: colors.brownMuted }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleAddEventSave()}
                disabled={addEventSaving || !addEventDraft.event_type.trim()}
                className="rounded-md px-4 py-2 text-sm font-medium"
                style={{
                  fontFamily: sans,
                  backgroundColor: addEventDraft.event_type.trim()
                    ? "var(--dg-brown-mid, #8B6F4E)"
                    : "var(--dg-brown-border)",
                  color: "white",
                  opacity: addEventSaving ? 0.7 : 1,
                }}
              >
                {addEventSaving ? "Saving…" : "Save Event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
