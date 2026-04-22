"use client";

import { PlaceInput } from "@/components/ui/place-input";
import { SmartDateInput } from "@/components/ui/smart-date-input";
import { buildEventTypeSelectOptions } from "@/lib/events/event-type-options";
import { RECORD_TYPES } from "@/lib/records/record-types";
import {
  CANVAS_THEME_ID,
  CANVAS_THEMES,
  DEFAULT_CANVAS_THEME_ID,
  isCanvasThemeId,
  type PhotoFrameStyle,
} from "@/lib/themes/canvas-themes";
import { createClient } from "@/lib/supabase/client";
import { formatDateString } from "@/lib/utils/dates";
import {
  GENDER_OPTIONS,
  GENDER_VALUES,
  normalizeGender,
} from "@/lib/utils/gender";
import { formatPlace } from "@/lib/utils/places";
import {
  RootsFramePortrait,
  ROOTS_PROFILE_HEADER_MOUNT_SCALE,
} from "@/components/profile/roots-frame-portrait";
import {
  clampCropOffsetCover,
  cropCoverRenderedSize,
  cropPercentToOffsetCover,
  getProfileHeaderCroppedPhotoImgStyle,
} from "@/lib/profile/photo-crop-cover";
import DocumentUploadSection from "../../dashboard/document-upload";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  createElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
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
  military_branch: string | null;
  service_number: string | null;
  cause_of_death: string | null;
  marital_status: string | null;
  surviving_spouse: string | null;
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

type PersonDeskPanel = "none" | "margin" | "file" | "receipts" | "occupation";

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

/** Display year for profile header (follows `formatDateString` conventions). */
function personProfileYearFromDate(
  d: string | null | undefined
): string | null {
  if (d == null) return null;
  const raw = String(d).trim();
  if (!raw) return null;
  const formatted = formatDateString(raw);
  if (/^\d{4}$/.test(formatted)) return formatted;
  const segs = formatted.split("/");
  const last = segs[segs.length - 1] ?? "";
  if (/^\d{4}$/.test(last)) return last;
  const m = raw.match(/(\d{4})/);
  return m?.[1] ?? null;
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
  event_place?: {
    township: string | null;
    county: string | null;
    state: string | null;
    country: string;
  } | null;
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

type OccupationRow = {
  id: string;
  person_id: string;
  user_id: string | null;
  job_title: string | null;
  year_observed: number | null;
  record_id?: string | null;
  document_id?: string | null;
};

type PhotoEventTagRow = {
  photo_id: string;
  event_id: string;
};

type LinkedSourceItem = {
  id: string;
  label: string;
  url: string | null;
  kind: "document" | "web";
  host: string | null;
};

const SIGNED_URL_EXPIRY_SEC = 3600;

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

function normalizeWebUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function resolveRecordHref(
  record: RecordRow,
  signedDocUrls: Map<string, string>
): string | null {
  const signed = signedDocUrls.get(record.id)?.trim();
  if (signed) return signed;
  const raw = record.file_url?.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return null;
}

function isWebRecord(record: RecordRow): boolean {
  const fileType = (record.file_type ?? "").trim().toLowerCase();
  if (fileType === "text/uri-list") return true;
  const raw = record.file_url?.trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return false;
  return documentsObjectPathFromFileUrl(raw) == null;
}

function sourceHostLabel(href: string | null): string | null {
  if (!href) return null;
  try {
    const host = new URL(href).hostname.trim().toLowerCase();
    if (!host) return null;
    return host.replace(/^www\./, "");
  } catch {
    return null;
  }
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

function occupationLinkedRecordId(row: OccupationRow): string | null {
  const candidates = [row.record_id, row.document_id];
  for (const raw of candidates) {
    const id = String(raw ?? "").trim();
    if (id) return id;
  }
  return null;
}

function occupationUiErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const msg = error.message.trim();
  if (!msg) return fallback;
  if (msg.toLowerCase().includes("column occupations.user_id does not exist")) {
    return fallback;
  }
  return fallback;
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
): LinkedSourceItem[] {
  const seen = new Set<string>();
  const out: LinkedSourceItem[] = [];

  for (const ev of cluster.events) {
    for (const row of sourcesByEventId.get(ev.id) ?? []) {
      const rid = row.record_id;
      if (!rid || seen.has(rid) || !recordsById.has(rid)) continue;
      seen.add(rid);
      const rec = recordsById.get(rid)!;
      const href = resolveRecordHref(rec, signedDocUrls);
      out.push({
        id: rid,
        label: recordTypeLabel(rec),
        url: href,
        kind: isWebRecord(rec) ? "web" : "document",
        host: sourceHostLabel(href),
      });
    }
    const legacy = ev.record_id?.trim();
    if (legacy && !seen.has(legacy) && recordsById.has(legacy)) {
      seen.add(legacy);
      const rec = recordsById.get(legacy)!;
      const href = resolveRecordHref(rec, signedDocUrls);
      out.push({
        id: legacy,
        label: recordTypeLabel(rec),
        url: href,
        kind: isWebRecord(rec) ? "web" : "document",
        host: sourceHostLabel(href),
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

/** Month and day only for the timeline column under the year (no repeated year). */
function eventTimelineMonthDayLabel(ev: EventRow): string {
  const d = ev.event_date?.trim();
  if (!d) return "Date unknown";
  try {
    const parsed = new Date(d.replace(/-/g, "/"));
    if (isNaN(parsed.getTime())) {
      const alt = formatDateString(d).trim();
      const noYear = alt.replace(/[,/\s-]*\d{4}\s*$/, "").trim();
      return noYear || alt || "Date unknown";
    }
    const month = parsed.toLocaleDateString("en-US", { month: "long" });
    const day = parsed.getDate();
    return `${month.charAt(0).toUpperCase()}${month.slice(1).toLowerCase()} ${day}`;
  } catch {
    return "Date unknown";
  }
}

/** Large year column for the life timeline (unknown dates → em dash). */
function eventTimelineYearDisplay(ev: EventRow): string {
  const d = ev.event_date?.trim();
  if (!d) return "—";
  const isoYear = /^(\d{4})/.exec(d);
  if (isoYear) return isoYear[1]!;
  try {
    const parsed = new Date(d.replace(/-/g, "/"));
    if (!isNaN(parsed.getTime())) return String(parsed.getFullYear());
  } catch {
    /* fall through */
  }
  const formatted = formatDateString(d);
  const y4 = /^(\d{4})$/.exec(formatted);
  if (y4) return y4[1]!;
  const m = /(\d{4})/.exec(formatted);
  if (m) return m[1]!;
  return "—";
}

/**
 * Timeline pill colors: only the badge uses accent; everything else stays neutral.
 * Uses color-mix with page cream so chips read in light and dark themes.
 */
function timelineEventTypePillStyle(eventTypeRaw: string): {
  background: string;
  color: string;
} {
  const neutral = {
    background:
      "color-mix(in srgb, var(--dg-brown-border) 45%, var(--dg-cream))",
    color: "var(--dg-brown-dark)",
  };
  const t = eventTypeRaw.trim().toLowerCase();
  if (!t) return neutral;

  const chip = (accent: string) => ({
    background: `color-mix(in srgb, ${accent} 34%, var(--dg-cream))`,
    color: "var(--dg-brown-dark)",
  });

  if (t === "marriage") return chip("rgb(196 90 120)");
  if (t === "birth" || t === "baptism" || t === "christening")
    return chip("rgb(70 130 185)");
  if (t === "death" || t === "child died" || t === "spouse died")
    return chip("rgb(95 85 125)");
  if (t === "burial") return chip("rgb(115 108 98)");
  if (t === "census") return chip("rgb(55 130 95)");
  if (t === "residence") return chip("rgb(155 120 55)");
  if (
    t === "military service" ||
    t === "enlistment" ||
    t === "deployment" ||
    t === "military transfer" ||
    t === "military award" ||
    t === "discharge" ||
    t === "missing in action" ||
    t === "killed in action" ||
    t === "prisoner of war" ||
    t.includes("military")
  ) {
    return chip("rgb(65 95 150)");
  }
  if (t === "land") return chip("rgb(130 105 60)");
  if (t === "immigration" || t === "emigration") return chip("rgb(45 125 140)");
  if (t === "child born") return chip("rgb(200 110 55)");
  if (t === "occupation") return chip("rgb(105 75 155)");
  return neutral;
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

/** Polaroid-style crop aperture (width × height) for adjust/setup modals and saved crop math. */
const POLAROID_CROP_VIEWPORT_W = 220;
const POLAROID_CROP_VIEWPORT_H = 275;

/** Image window inside header polaroids (same aspect as `POLAROID_CROP_VIEWPORT_*`). */
const HEADER_POLAROID_IMG_W = 128;
const HEADER_POLAROID_IMG_H = 160;

/** Built-in white margin on the print (scrapbook header); tabs meet this outer box. */
const HEADER_SCRAPBOOK_PRINT_BORDER_PX = 5;
const HEADER_SCRAPBOOK_IMG_INNER_W =
  HEADER_POLAROID_IMG_W - 2 * HEADER_SCRAPBOOK_PRINT_BORDER_PX;
const HEADER_SCRAPBOOK_IMG_INNER_H =
  HEADER_POLAROID_IMG_H - 2 * HEADER_SCRAPBOOK_PRINT_BORDER_PX;

/** Click target around stacked polaroids (includes rotation / stack offsets). */
const HEADER_POLAROID_BTN_W = 186;
const HEADER_POLAROID_BTN_H = 236;

/**
 * Roots / oval only: extra height on the outer shell (below the polaroid-sized slot) so the
 * SVG frame + drop-shadow are not clipped. This is intentionally obvious to tune — if you
 * change nothing else, change this number.
 */
const HEADER_ROOTS_OVAL_SHELL_EXTRA_HEIGHT_PX = 48;

/**
 * Header layout: shift entire Roots oval mount (SVG frame + circular hole + mat + photo)
 * as one unit. Negative x = left, negative y = up. This is the main lever for “frame cut
 * off at the bottom” when clipping comes from below the header row.
 */
const HEADER_ROOTS_OVAL_LAYOUT_OFFSET_STYLE: CSSProperties = {
  transform: "translate(-10px, -56px)",
};

/** Top and side mat; bottom “chin” is 2.5× the edge (polaroid proportions). */
const HEADER_POLAROID_FRAME_EDGE_PX = 8;
const HEADER_POLAROID_FRAME_CHIN_PX = HEADER_POLAROID_FRAME_EDGE_PX * 2.5;
const HEADER_POLAROID_FRAME_PAD =
  `${HEADER_POLAROID_FRAME_EDGE_PX}px ${HEADER_POLAROID_FRAME_EDGE_PX}px ${HEADER_POLAROID_FRAME_CHIN_PX}px` as const;

/** Front at 0°; back cards tilt with ~10px peek (center pivot). */
const HEADER_POLAROID_STACK_LAYERS = [
  { rot: 0, x: 0, y: 0 },
  { rot: -6, x: -10, y: 10 },
  { rot: 3, x: 10, y: -10 },
] as const;

/** Light mode only — do not use for dark (see `HEADER_POLAROID_PRINT_FILTER_DARK`). */
const HEADER_POLAROID_PRINT_FILTER_LIGHT =
  "contrast(1.1) sepia(0.15) brightness(1.05)" as const;

const HEADER_POLAROID_PRINT_FILTER_DARK =
  "contrast(1.15) sepia(0.2) brightness(0.95)" as const;

/** Dark-mode polaroid mat (replaces cream frame); chin uses same fill via padding + background. */
const HEADER_POLAROID_FRAME_DARK = "#b0a08a" as const;

const HEADER_POLAROID_DARK_DEPTH_INSET =
  "inset 0 0 8px rgba(0,0,0,0.4)" as const;

/**
 * Polaroid aperture when there is no photo (matches tree canvas). Warm dark fill;
 * initials use fixed light ink — `var(--dg-cream)` is dark in `.dark`.
 */
const POLAROID_NO_PHOTO_BG =
  "color-mix(in srgb, var(--dg-brown-mid) 38%, black)" as const;
const POLAROID_NO_PHOTO_INITIALS = "rgb(255 252 247)" as const;

function headerPolaroidFrameLayerStyle(
  isDark: boolean,
  stackIndex: number,
  totalLayers: number
): CSSProperties {
  const isFront = stackIndex === 0;
  const isRearmost = totalLayers > 1 && stackIndex === totalLayers - 1;

  let boxShadow: string;
  if (isDark) {
    if (isFront) {
      boxShadow =
        "0 4px 14px rgb(var(--dg-shadow-rgb) / 0.42), 0 1px 3px rgb(0 0 0 / 0.45), inset 0 1px 0 color-mix(in srgb, #fff 12%, transparent), " +
        HEADER_POLAROID_DARK_DEPTH_INSET;
    } else if (isRearmost) {
      boxShadow =
        "0 20px 52px rgb(var(--dg-shadow-rgb) / 0.32), 0 10px 28px rgb(0 0 0 / 0.32), 0 0 0 1px rgba(0,0,0,0.28), " +
        HEADER_POLAROID_DARK_DEPTH_INSET;
    } else {
      boxShadow =
        "0 12px 32px rgb(var(--dg-shadow-rgb) / 0.36), 0 4px 16px rgb(0 0 0 / 0.28), inset 0 1px 0 color-mix(in srgb, #fff 8%, transparent), " +
        HEADER_POLAROID_DARK_DEPTH_INSET;
    }
  } else if (isFront) {
    boxShadow =
      "0 3px 12px rgb(var(--dg-shadow-rgb) / 0.2), 0 1px 3px rgb(0 0 0 / 0.08), 0 0 0 1px rgb(0 0 0 / 0.04)";
  } else if (isRearmost) {
    boxShadow =
      "0 16px 42px rgb(var(--dg-shadow-rgb) / 0.13), 0 7px 20px rgb(0 0 0 / 0.07)";
  } else {
    boxShadow =
      "0 9px 26px rgb(var(--dg-shadow-rgb) / 0.15), 0 3px 10px rgb(0 0 0 / 0.07)";
  }

  return {
    backgroundColor: isDark ? HEADER_POLAROID_FRAME_DARK : colors.cream,
    padding: HEADER_POLAROID_FRAME_PAD,
    borderRadius: 3,
    border: isDark
      ? `1px solid ${HEADER_POLAROID_FRAME_DARK}`
      : `1px solid ${colors.brownBorder}`,
    boxShadow,
  };
}

/**
 * Dead Gossip — no plate behind the print: only the profile header / page background shows through.
 * Corner mounts and tilt provide the album look.
 */
function headerScrapbookAlbumPageStyle(): CSSProperties {
  return {
    position: "relative",
    backgroundColor: "transparent",
    padding: 0,
    border: "none",
    borderRadius: 0,
    boxShadow: "none",
  };
}

/** Deterministic 1–2° tilt per person so the print reads hand-placed, stable across reloads. */
function scrapbookHeaderPhotoTiltDeg(personId: string): number {
  if (!personId) return 1.35;
  let h = 2166136261;
  for (let i = 0; i < personId.length; i++) {
    h = Math.imul(h ^ personId.charCodeAt(i), 16777619);
  }
  const u = (h >>> 0) / 2 ** 32;
  const magnitude = 1 + u;
  const sign = h & 1 ? 1 : -1;
  return sign * magnitude;
}

/** Desk “Receipts” rail tab (idle) — defined in `app/globals.css` as `--dg-desk-receipts-tab-idle-bg`. */
const RECEIPTS_TAB_IDLE_BG = "var(--dg-desk-receipts-tab-idle-bg)" as const;

/** Desk “Margin” rail tab (idle) — defined in `app/globals.css` as `--dg-desk-margin-tab-idle-bg`. */
const MARGIN_DESK_TAB_IDLE_BG = "var(--dg-desk-margin-tab-idle-bg)" as const;

/** Scrapbook photo corner mounts (dark only): lighter than page bg / desk idle tabs so they stay readable. */
const SCRAPBOOK_CORNER_MOUNT_BG_DARK =
  "color-mix(in srgb, var(--dg-parchment) 58%, var(--dg-brown-mid) 42%)" as const;

const SCRAPBOOK_CORNER_SHADOW_LIGHT = [
  "inset 0 1px 1px rgba(255,255,255,0.38)",
  "inset 0 -2px 4px rgba(0,0,0,0.08)",
  "inset 0 0 12px rgba(0,0,0,0.05)",
  "0 3px 8px rgba(0,0,0,0.14)",
  "0 1px 3px rgba(0,0,0,0.1)",
].join(", ");

const SCRAPBOOK_CORNER_SHADOW_DARK =
  "0 2px 8px rgb(var(--dg-shadow-rgb) / 0.05)" as const;
const SCRAPBOOK_TAPE_BG = "rgba(246, 236, 184, 0.34)" as const;
const SCRAPBOOK_TAPE_STROKE = "rgba(186, 164, 106, 0.44)" as const;
const SCRAPBOOK_TAPE_HIGHLIGHT = "rgba(255, 253, 238, 0.16)" as const;
const HEADER_SCRAPBOOK_TAPE_H = 17;
const HEADER_SCRAPBOOK_TAPE_TOP_OFFSET = -8;
const HEADER_SCRAPBOOK_TAPE_BOTTOM_OFFSET = -9;

function subscribeHtmlDarkClass(cb: () => void) {
  const el = document.documentElement;
  const mo = new MutationObserver(() => cb());
  mo.observe(el, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
}

function snapshotHtmlHasDarkClass(): boolean {
  return document.documentElement.classList.contains("dark");
}

function snapshotHtmlHasDarkClassServer(): boolean {
  return false;
}

/** Diagonal shift outward from each print corner (px along both axes). */
const HEADER_SCRAPBOOK_TAB_OUTWARD = 2.5;

const HEADER_SCRAPBOOK_TAB_PX = 30;

/** Lift + ambient under the whole print (white margin + image) in scrapbook header. */
function scrapbookHeaderPhotoLiftFilter(isDark: boolean): string {
  return isDark
    ? "drop-shadow(0 0 14px rgba(255, 248, 237, 0.095)) drop-shadow(0 0 6px rgba(255, 252, 245, 0.13)) drop-shadow(0 0 2px rgba(255, 255, 250, 0.16))"
    : "drop-shadow(0 6px 14px rgba(0,0,0,0.14)) drop-shadow(0 2px 6px rgba(0,0,0,0.09)) drop-shadow(0 1px 2px rgba(0,0,0,0.06))";
}

/** Outer cast + inset edge on the white bordered print (works with `filter` lift). */
function scrapbookPrintWrapperBoxShadow(isDark: boolean): string {
  return isDark
    ? [
        "0 4px 14px rgba(0,0,0,0.34)",
        "0 1px 4px rgba(0,0,0,0.28)",
        "inset 0 1px 0 rgba(255,255,255,0.14)",
        "inset 0 -2px 5px rgba(0,0,0,0.14)",
      ].join(", ")
    : [
        "0 4px 14px rgba(0,0,0,0.1)",
        "0 1px 4px rgba(0,0,0,0.06)",
        "inset 0 1px 0 rgba(255,255,255,0.95)",
        "inset 0 -2px 5px rgba(0,0,0,0.06)",
      ].join(", ");
}

/** Slight recess / emulsion depth inside the image window (scrapbook only). */
function scrapbookPhotoInnerInsetShadow(isDark: boolean): string {
  return isDark
    ? "inset 0 0 10px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.1)"
    : "inset 0 0 10px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.14)";
}

function HeaderScrapbookCornerTabs() {
  const htmlDark = useSyncExternalStore(
    subscribeHtmlDarkClass,
    snapshotHtmlHasDarkClass,
    snapshotHtmlHasDarkClassServer
  );
  const t = HEADER_SCRAPBOOK_TAB_PX;
  const o = HEADER_SCRAPBOOK_TAB_OUTWARD;
  const fold: CSSProperties = {
    position: "absolute",
    width: t,
    height: t,
    pointerEvents: "none",
    zIndex: 25,
    backgroundColor: htmlDark
      ? SCRAPBOOK_CORNER_MOUNT_BG_DARK
      : RECEIPTS_TAB_IDLE_BG,
    boxShadow: htmlDark ? SCRAPBOOK_CORNER_SHADOW_DARK : SCRAPBOOK_CORNER_SHADOW_LIGHT,
  };
  return (
    <>
      <span
        data-dg-scrapbook-corner-mount=""
        style={{
          ...fold,
          left: -o,
          top: -o,
          clipPath: "polygon(0 0, 100% 0, 0 100%)",
        }}
        aria-hidden
      />
      <span
        data-dg-scrapbook-corner-mount=""
        style={{
          ...fold,
          right: -o,
          top: -o,
          clipPath: "polygon(100% 0, 100% 100%, 0 0)",
        }}
        aria-hidden
      />
      <span
        data-dg-scrapbook-corner-mount=""
        style={{
          ...fold,
          left: -o,
          bottom: -o,
          clipPath: "polygon(0 100%, 100% 100%, 0 0)",
        }}
        aria-hidden
      />
      <span
        data-dg-scrapbook-corner-mount=""
        style={{
          ...fold,
          right: -o,
          bottom: -o,
          clipPath: "polygon(100% 100%, 100% 0, 0 100%)",
        }}
        aria-hidden
      />
    </>
  );
}

function scrapbookTapePath(
  width: number,
  height: number,
  toothDepth = 1.2,
  teethPerEdge = 4
): string {
  const halfW = width / 2;
  const halfH = height / 2;
  const step = height / (teethPerEdge * 2);
  const left: string[] = [];
  const right: string[] = [];
  for (let i = 1; i < teethPerEdge * 2; i += 1) {
    const y = -halfH + step * i;
    left.push(`${i % 2 === 0 ? -halfW : -halfW + toothDepth} ${y}`);
    right.push(`${i % 2 === 0 ? halfW : halfW - toothDepth} ${y}`);
  }
  return [
    `M ${-halfW} ${-halfH}`,
    `L ${halfW} ${-halfH}`,
    ...right.map((pt) => `L ${pt}`),
    `L ${halfW} ${halfH}`,
    `L ${-halfW} ${halfH}`,
    ...left.reverse().map((pt) => `L ${pt}`),
    "Z",
  ].join(" ");
}

function HeaderScrapbookTapeStrips() {
  const tapeW = Math.round(HEADER_POLAROID_IMG_W * 0.75);
  const outer = scrapbookTapePath(tapeW, HEADER_SCRAPBOOK_TAPE_H);
  const inner = scrapbookTapePath(tapeW - 2, HEADER_SCRAPBOOK_TAPE_H - 2, 0.9);
  return (
    <>
      <svg
        width={tapeW}
        height={HEADER_SCRAPBOOK_TAPE_H}
        viewBox={`${-tapeW / 2} ${-HEADER_SCRAPBOOK_TAPE_H / 2} ${tapeW} ${HEADER_SCRAPBOOK_TAPE_H}`}
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          top: HEADER_SCRAPBOOK_TAPE_TOP_OFFSET,
          transform: "translateX(-50%)",
          overflow: "visible",
          pointerEvents: "none",
          zIndex: 25,
        }}
      >
        <path d={outer} fill={SCRAPBOOK_TAPE_BG} stroke={SCRAPBOOK_TAPE_STROKE} strokeWidth={0.9} />
        <path d={inner} fill={SCRAPBOOK_TAPE_HIGHLIGHT} />
      </svg>
      <svg
        width={tapeW}
        height={HEADER_SCRAPBOOK_TAPE_H}
        viewBox={`${-tapeW / 2} ${-HEADER_SCRAPBOOK_TAPE_H / 2} ${tapeW} ${HEADER_SCRAPBOOK_TAPE_H}`}
        aria-hidden
        style={{
          position: "absolute",
          left: "50%",
          bottom: HEADER_SCRAPBOOK_TAPE_BOTTOM_OFFSET,
          transform: "translateX(-50%)",
          overflow: "visible",
          pointerEvents: "none",
          zIndex: 25,
        }}
      >
        <path d={outer} fill={SCRAPBOOK_TAPE_BG} stroke={SCRAPBOOK_TAPE_STROKE} strokeWidth={0.9} />
        <path d={inner} fill={SCRAPBOOK_TAPE_HIGHLIGHT} />
      </svg>
    </>
  );
}

/** Roots — `public/Roots Frame.svg` only (no polaroid mat behind it). */
function headerRootsPortraitMountStyle(): CSSProperties {
  return {
    position: "relative",
    backgroundColor: "transparent",
    padding: 0,
    border: "none",
    borderRadius: 0,
    boxShadow: "none",
  };
}

/** Header profile photo mat; scrapbook = tilted print + corner mounts (no under-plate); Roots = SVG frame. */
function profileHeaderPhotoFrameLayerStyle(
  photoFrameStyle: PhotoFrameStyle,
  isDark: boolean,
  stackIndex: number,
  totalLayers: number
): CSSProperties {
  switch (photoFrameStyle) {
    case "scrapbook":
      return headerScrapbookAlbumPageStyle();
    case "oval":
      return headerRootsPortraitMountStyle();
    case "polaroid":
      return headerPolaroidFrameLayerStyle(isDark, stackIndex, totalLayers);
  }
}

type HeaderPolaroidLayer =
  | { kind: "row"; row: Record<string, unknown> }
  | { kind: "legacy"; url: string; person: PersonRow };

function headerPolaroidLayerKey(layer: HeaderPolaroidLayer): string {
  if (layer.kind === "row") {
    return typeof layer.row.id === "string" ? layer.row.id : "row-unknown";
  }
  return "__legacy_header__";
}

function polaroidInitialsFromLayer(layer: HeaderPolaroidLayer): string {
  if (layer.kind === "row") {
    const row = layer.row as Record<string, unknown>;
    return initials({
      first_name: String(row.first_name ?? ""),
      last_name: String(row.last_name ?? ""),
    });
  }
  return initials(layer.person);
}

function headerPolaroidLayerVisual(
  layer: HeaderPolaroidLayer
): {
  url: string;
  crop: { x: number; y: number; zoom: number };
  naturalW: number | null;
  naturalH: number | null;
} {
  if (layer.kind === "row") {
    const row = layer.row;
    return {
      url: photoUrlFromRow(row) ?? "",
      crop: personPhotoCropForRow(row),
      naturalW:
        typeof row.natural_width === "number" ? row.natural_width : null,
      naturalH:
        typeof row.natural_height === "number" ? row.natural_height : null,
    };
  }
  return {
    url: layer.url,
    crop: {
      x: cropPercentFromUnknown(layer.person.crop_x, 50),
      y: cropPercentFromUnknown(layer.person.crop_y, 50),
      zoom: cropZoomFromUnknown(layer.person.crop_zoom, 1),
    },
    naturalW:
      typeof layer.person.natural_width === "number"
        ? layer.person.natural_width
        : null,
    naturalH:
      typeof layer.person.natural_height === "number"
        ? layer.person.natural_height
        : null,
  };
}

/** Persisted crop_x / crop_y (0–100) from pixel offset (cover-fit rendered image). */
function offsetToCropPercentCover(
  offset: { x: number; y: number },
  renderedW: number,
  renderedH: number,
  viewportW: number,
  viewportH: number
): { x: number; y: number } {
  const spanX = renderedW - viewportW;
  const spanY = renderedH - viewportH;
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

function IconPhoto({ className }: { className?: string }) {
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
      <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="M21 16l-5-5L5 19" />
    </svg>
  );
}

function IconBriefcase({ className }: { className?: string }) {
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
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <path d="M2 12h20" />
    </svg>
  );
}

function IconDocument({ className }: { className?: string }) {
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
      <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9z" />
      <path d="M14 2v7h7" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}

function photoYearLabel(photoDateRaw: unknown): string {
  if (typeof photoDateRaw !== "string") return "—";
  const s = photoDateRaw.trim();
  if (!s) return "—";
  const y = s.match(/(\d{4})/);
  return y?.[1] ?? "—";
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

function personBirthSortMs(raw: string | null | undefined): number | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return t;
  const y = s.match(/(\d{4})/);
  if (!y) return null;
  const byYear = Date.parse(`${y[1]}-01-01`);
  return Number.isNaN(byYear) ? null : byYear;
}

function personNameSortKey(p: PersonRow): string {
  return [p.first_name, p.middle_name ?? "", p.last_name]
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function sortPeopleOldestToYoungest(rows: PersonRow[]): PersonRow[] {
  return [...rows].sort((a, b) => {
    const am = personBirthSortMs(a.birth_date);
    const bm = personBirthSortMs(b.birth_date);
    if (am == null && bm == null) {
      return personNameSortKey(a).localeCompare(personNameSortKey(b));
    }
    if (am == null) return 1;
    if (bm == null) return -1;
    if (am !== bm) return am - bm;
    return personNameSortKey(a).localeCompare(personNameSortKey(b));
  });
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

function clusterPlacesLine(): string {
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

const FAMILY_MEMBER_DOSSIER_SQUARE = 44;

/** Profile-centric relationship label for the family sidebar (e.g. Father, Sister). */
function relationshipUiLabelForProfile(
  relationshipType: string,
  person: PersonRow
): string {
  const g = (person.gender ?? "").trim().toLowerCase();
  const t = relationshipType.trim().toLowerCase();
  if (t === "parent") {
    if (g === "male") return "Father";
    if (g === "female") return "Mother";
    return "Parent";
  }
  if (t === "child") {
    if (g === "male") return "Son";
    if (g === "female") return "Daughter";
    return "Child";
  }
  if (t === "spouse") return "Spouse";
  if (t === "sibling") {
    if (g === "male") return "Brother";
    if (g === "female") return "Sister";
    return "Sibling";
  }
  return relationshipType;
}

/** Assign linked parents to father / mother slots using gender when possible. */
function partitionParentsIntoSlots(parents: PersonRow[]): {
  father: PersonRow | null;
  mother: PersonRow | null;
  overflow: PersonRow[];
} {
  const used = new Set<string>();
  let father: PersonRow | null = null;
  let mother: PersonRow | null = null;

  for (const p of parents) {
    const g = (p.gender ?? "").trim().toLowerCase();
    if (g === "male" && !father) {
      father = p;
      used.add(p.id);
    } else if (g === "female" && !mother) {
      mother = p;
      used.add(p.id);
    }
  }
  for (const p of parents) {
    if (used.has(p.id)) continue;
    if (!father) {
      father = p;
      used.add(p.id);
    } else if (!mother) {
      mother = p;
      used.add(p.id);
    }
  }
  const overflow = parents.filter((p) => !used.has(p.id));
  return { father, mother, overflow };
}

function UnknownParentSlot({
  roleLabel,
  disabled,
  onAdd,
}: {
  roleLabel: "Father" | "Mother";
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="group relative flex w-full max-w-full cursor-pointer items-start gap-3 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-55"
      style={{
        backgroundColor: "transparent",
        border: "none",
        color: "inherit",
      }}
      aria-label={`Add ${roleLabel.toLowerCase()} — link existing or create new`}
      onClick={onAdd}
    >
      <div
        className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed"
        style={{
          position: "relative",
          width: FAMILY_MEMBER_DOSSIER_SQUARE,
          height: FAMILY_MEMBER_DOSSIER_SQUARE,
          backgroundColor: colors.avatarBg,
          borderColor: `${colors.brownBorder}aa`,
          color: colors.avatarInitials,
        }}
      >
        <span
          className="text-sm font-bold opacity-70"
          style={{ fontFamily: serif }}
          aria-hidden
        >
          ?
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="break-words text-[15px] font-semibold leading-snug"
          style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}
        >
          Unknown
        </p>
        <p
          className="mt-0.5 text-[11px] leading-snug"
          style={{ fontFamily: sans, color: colors.brownMuted }}
        >
          {disabled
            ? "Open this profile from your tree to add."
            : "Click to link or create…"}
        </p>
      </div>
      <span
        className="shrink-0 self-start pt-0.5 text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ fontFamily: sans, color: colors.brownMuted }}
      >
        {roleLabel}
      </span>
    </button>
  );
}

function FamilyMemberCard({
  p,
  crop_x,
  crop_y,
  crop_zoom,
  natural_width,
  natural_height,
  relationshipLabel,
  nameMeta,
  hideRelationshipLabel = false,
  onEditRelationship,
}: {
  p: PersonRow;
  crop_x?: number | null;
  crop_y?: number | null;
  crop_zoom?: number | null;
  natural_width?: number | null;
  natural_height?: number | null;
  relationshipLabel: string;
  nameMeta?: string | null;
  hideRelationshipLabel?: boolean;
  onEditRelationship?: () => void;
}) {
  const familyCardParams = useParams() as { treeId?: string };
  const familyCardTreeId =
    typeof familyCardParams.treeId === "string" && familyCardParams.treeId.trim() !== ""
      ? familyCardParams.treeId.trim()
      : "";
  const displayName = [p.first_name, p.middle_name ?? "", p.last_name]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  const nameLine = displayName.trim() || "—";
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
      FAMILY_MEMBER_DOSSIER_SQUARE,
      FAMILY_MEMBER_DOSSIER_SQUARE,
      crop_zoom
    );
    const offset = cropPercentToOffsetCover(
      crop_x,
      crop_y,
      rw,
      rh,
      FAMILY_MEMBER_DOSSIER_SQUARE,
      FAMILY_MEMBER_DOSSIER_SQUARE
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

  const dateDetail = [
    p.birth_date ? `b. ${formatDateString(p.birth_date)}` : "",
    p.death_date ? `d. ${formatDateString(p.death_date)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const familyCardHref =
    familyCardTreeId !== ""
      ? `/dashboard/${familyCardTreeId}/person/${p.id}`
      : `/person/${p.id}`;

  return (
    <Link
      href={familyCardHref}
      className="flex min-w-0 items-start gap-3 py-3"
      style={{
        textDecoration: "none",
        color: "inherit",
        backgroundColor: "transparent",
      }}
    >
      <div
        className="shrink-0 overflow-hidden rounded-md"
        style={{
          position: "relative",
          width: FAMILY_MEMBER_DOSSIER_SQUARE,
          height: FAMILY_MEMBER_DOSSIER_SQUARE,
          backgroundColor: colors.avatarBg,
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
            className="flex h-full w-full items-center justify-center text-sm font-bold"
            style={{ fontFamily: serif, color: colors.avatarInitials }}
          >
            {initials(p)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-baseline gap-1.5">
          <p
            className="break-words text-[15px] font-semibold leading-snug"
            style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}
          >
            {nameLine}
          </p>
          {nameMeta ? (
            <span
              className="shrink-0 text-[11px] font-semibold"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              {nameMeta}
            </span>
          ) : null}
        </div>
        {dateDetail ? (
          <p
            className="mt-0.5 break-words text-[11px] leading-snug"
            style={{ fontFamily: sans, color: colors.brownMuted }}
          >
            {dateDetail}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-start justify-end gap-1.5 self-start pt-0.5">
        {onEditRelationship ? (
          <button
            type="button"
            className="rounded px-0.5 text-xs leading-none"
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
        {!hideRelationshipLabel ? (
          <span
            className="max-w-[5.5rem] text-right text-[10px] font-bold uppercase leading-snug tracking-[0.14em]"
            style={{ fontFamily: sans, color: colors.brownMuted, wordBreak: "break-word" }}
          >
            {relationshipLabel}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function CollapsibleFamilyGroup({
  title,
  members,
  relationshipMetaByPersonId,
  onEditRelationship,
  defaultExpanded = false,
  defaultRelationshipType = "sibling",
  containerClassName = "mb-3",
}: {
  title: string;
  members: PersonRow[];
  relationshipMetaByPersonId: Record<string, RelationshipMeta | undefined>;
  onEditRelationship: (meta: RelationshipMeta) => void;
  defaultExpanded?: boolean;
  /** Used when `relationshipMetaByPersonId` has no row for a member. */
  defaultRelationshipType?: string;
  containerClassName?: string;
}) {
  const baseId = useId();
  const headerId = `${baseId}-hdr`;
  const listId = `${baseId}-list`;
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (members.length === 0) return null;

  return (
    <div className={containerClassName}>
      <button
        type="button"
        id={headerId}
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((v) => !v)}
        className="mb-2 flex w-full items-center justify-between gap-2 rounded-md border border-transparent px-0 py-1 text-left transition hover:border-[color-mix(in_srgb,var(--dg-brown-border)_55%,transparent)]"
        style={{ fontFamily: sans }}
      >
        <span
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: colors.brownMuted }}
        >
          {title}
        </span>
        <span
          className="flex shrink-0 items-center gap-2 text-xs font-semibold tabular-nums"
          style={{ color: colors.brownMuted }}
        >
          <span>({members.length})</span>
          <span aria-hidden className="inline-block w-3 text-center">
            {expanded ? "−" : "+"}
          </span>
        </span>
      </button>
      {expanded ? (
        <ul
          id={listId}
          className="m-0 list-none p-0"
          role="region"
          aria-labelledby={headerId}
        >
          {members.map((p) => (
            <li
              key={p.id}
              className="border-0 border-b border-solid last:border-b-0"
              style={{ borderBottomColor: colors.brownBorder }}
            >
              {(() => {
                const relMeta = relationshipMetaByPersonId[p.id];
                const relType =
                  relMeta?.relationshipType ?? defaultRelationshipType;
                return (
                  <FamilyMemberCard
                    p={p}
                    crop_x={p.crop_x}
                    crop_y={p.crop_y}
                    crop_zoom={p.crop_zoom}
                    natural_width={p.natural_width}
                    natural_height={p.natural_height}
                    relationshipLabel={relationshipUiLabelForProfile(
                      relType,
                      p
                    )}
                    onEditRelationship={
                      relMeta ? () => onEditRelationship(relMeta) : undefined
                    }
                  />
                );
              })()}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function SpouseWithChildrenCollapsible({
  spouse,
  children: kids,
  marriageYear,
  relationshipMetaByPersonId,
  onEditRelationship,
  onAddChildWithSpouse,
  defaultExpanded = false,
}: {
  spouse: PersonRow;
  children: PersonRow[];
  marriageYear?: string | null;
  relationshipMetaByPersonId: Record<string, RelationshipMeta | undefined>;
  onEditRelationship: (meta: RelationshipMeta) => void;
  onAddChildWithSpouse: (spouse: PersonRow) => void;
  defaultExpanded?: boolean;
}) {
  const baseId = useId();
  const panelId = `${baseId}-panel`;
  const toggleId = `${baseId}-toggle`;
  const [expanded, setExpanded] = useState(defaultExpanded);

  const childCountLabel = kids.length === 1 ? "1 child" : `${kids.length} children`;
  const spouseRelMeta = relationshipMetaByPersonId[spouse.id];
  return (
    <div
      className="mb-3 rounded-md border p-2.5"
      style={{
        borderColor: colors.brownBorder,
        borderLeftWidth: 3,
        borderLeftColor: "color-mix(in srgb, var(--dg-forest) 60%, var(--dg-brown-border))",
        backgroundColor: "color-mix(in srgb, var(--dg-parchment) 82%, var(--dg-cream))",
      }}
    >
      <p
        className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em]"
        style={{ fontFamily: sans, color: colors.brownMuted }}
      >
        Spouse
      </p>
      <div
        className="border-0 border-b border-solid"
        style={{ borderBottomColor: colors.brownBorder }}
      >
        <FamilyMemberCard
          p={spouse}
          crop_x={spouse.crop_x}
          crop_y={spouse.crop_y}
          crop_zoom={spouse.crop_zoom}
          natural_width={spouse.natural_width}
          natural_height={spouse.natural_height}
          relationshipLabel=""
          nameMeta={marriageYear ? `m. ${marriageYear}` : null}
          hideRelationshipLabel
          onEditRelationship={
            spouseRelMeta ? () => onEditRelationship(spouseRelMeta) : undefined
          }
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <button
          type="button"
          id={toggleId}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-2 border-none bg-transparent p-0 text-left text-xs font-bold uppercase tracking-wide underline-offset-2 transition hover:underline"
          style={{ fontFamily: sans, color: colors.brownMuted }}
        >
          <span
            className="inline-flex h-4 w-4 items-center justify-center text-[11px] leading-none"
            aria-hidden
          >
            {expanded ? "−" : "+"}
          </span>
          <span>{expanded ? `Hide ${childCountLabel}` : `Show ${childCountLabel}`}</span>
        </button>
        <button
          type="button"
          onClick={() => onAddChildWithSpouse(spouse)}
          className="border-none bg-transparent p-0 text-xs font-bold uppercase tracking-wide underline-offset-2 transition hover:underline"
          style={{ fontFamily: sans, color: colors.forest }}
        >
          + Add child
        </button>
      </div>
      {expanded ? (
        <div
          id={panelId}
          className="mt-2 space-y-3"
          role="region"
          aria-labelledby={toggleId}
        >
          {kids.length > 0 ? (
            <div>
              <ul className="m-0 list-none p-0">
                {kids.map((p, i) => {
                  const relMeta = relationshipMetaByPersonId[p.id];
                  return (
                    <li
                      key={p.id}
                      className={
                        i < kids.length - 1
                          ? "border-0 border-b border-solid"
                          : undefined
                      }
                      style={
                        i < kids.length - 1
                          ? { borderBottomColor: colors.brownBorder }
                          : undefined
                      }
                    >
                      <FamilyMemberCard
                        p={p}
                        crop_x={p.crop_x}
                        crop_y={p.crop_y}
                        crop_zoom={p.crop_zoom}
                        natural_width={p.natural_width}
                        natural_height={p.natural_height}
                        relationshipLabel={relationshipUiLabelForProfile(
                          relMeta?.relationshipType ?? "child",
                          p
                        )}
                        onEditRelationship={
                          relMeta
                            ? () => onEditRelationship(relMeta)
                            : undefined
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p
              className="text-sm italic"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              No children linked with this spouse in your tree.
            </p>
          )}
        </div>
      ) : null}
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
              background:
                "linear-gradient(to bottom, transparent, var(--dg-cream))",
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

type PersonProfilePageBodyProps = {
  /**
   * Resolved from `trees.canvas_theme` for the person row’s `tree_id`,
   * or the shared default when missing.
   */
  canvasTheme: string;
  children: ReactNode;
};

/**
 * Client shell for the loaded profile; receives the tree’s canvas theme for upcoming themed copy.
 */
function PersonProfilePageBody({
  canvasTheme,
  children,
}: PersonProfilePageBodyProps) {
  return (
    <div className="contents" data-person-canvas-theme={canvasTheme}>
      {children}
    </div>
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
  const [person, setPerson] = useState<PersonRow | null>(null);
  const personTreeId = (person?.tree_id ?? "").trim();
  const effectiveBackTreeId = treeId !== "" ? treeId : personTreeId;
  const backToTreeHref =
    effectiveBackTreeId !== "" ? `/dashboard/${effectiveBackTreeId}` : "/dashboard";
  const backToTreeLabel = "Return to tree";

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
  const [canvasTheme, setCanvasTheme] = useState(DEFAULT_CANVAS_THEME_ID);
  const profileCanvasTheme = useMemo(() => {
    const id = isCanvasThemeId(canvasTheme)
      ? canvasTheme
      : DEFAULT_CANVAS_THEME_ID;
    return CANVAS_THEMES[id];
  }, [canvasTheme]);
  const scrapbookPhotoTiltDeg = useMemo(
    () => scrapbookHeaderPhotoTiltDeg(personId),
    [personId]
  );
  const [events, setEvents] = useState<EventRow[]>([]);
  const [photoRows, setPhotoRows] = useState<Record<string, unknown>[]>([]);
  const [photoEventTags, setPhotoEventTags] = useState<PhotoEventTagRow[]>([]);
  const [polaroidNaturalByKey, setPolaroidNaturalByKey] = useState<
    Record<string, { w: number; h: number }>
  >({});
  const [portraitsGalleryOpen, setPortraitsGalleryOpen] = useState(false);
  const [eventPhotoGalleryEventId, setEventPhotoGalleryEventId] = useState<
    string | null
  >(null);
  const [recordsById, setRecordsById] = useState<Map<string, RecordRow>>(
    new Map()
  );
  const [family, setFamily] = useState<{
    parents: PersonRow[];
    spouses: PersonRow[];
    siblings: PersonRow[];
    children: PersonRow[];
    spouseWithChildrenGroups: { spouse: PersonRow; children: PersonRow[] }[];
    otherChildren: PersonRow[];
  }>({
    parents: [],
    spouses: [],
    siblings: [],
    children: [],
    spouseWithChildrenGroups: [],
    otherChildren: [],
  });
  const [relationshipMetaByPersonId, setRelationshipMetaByPersonId] = useState<
    Record<string, RelationshipMeta>
  >({});
  const [editRelModal, setEditRelModal] = useState<RelationshipMeta | null>(null);
  const [editRelType, setEditRelType] = useState("");
  const [editRelBusy, setEditRelBusy] = useState(false);
  const [editRelError, setEditRelError] = useState<string | null>(null);
  const [deskPanelOpen, setDeskPanelOpen] = useState<PersonDeskPanel>("none");
  const [occupations, setOccupations] = useState<OccupationRow[]>([]);
  const [occupationLoading, setOccupationLoading] = useState(false);
  const [occupationError, setOccupationError] = useState<string | null>(null);
  const [editingOccupationId, setEditingOccupationId] = useState<string | null>(null);
  const [occupationEditDraft, setOccupationEditDraft] = useState<{
    job_title: string;
    year_observed: string;
  } | null>(null);
  const [occupationSaving, setOccupationSaving] = useState(false);
  const [occupationDeletingId, setOccupationDeletingId] = useState<string | null>(
    null
  );
  const [addingOccupation, setAddingOccupation] = useState(false);
  const [occupationAddDraft, setOccupationAddDraft] = useState({
    job_title: "",
    year_observed: "",
  });
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
  const [, setResearchNoteUpdatedAt] = useState<string | null>(null);
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
    event_place_display: string;
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
    marital_status: string;
    surviving_spouse: string;
    military_branch: string;
    service_number: string;
    cause_of_death: string;
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
  const [addFamilyCoParentId, setAddFamilyCoParentId] = useState<string | null>(null);
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
  const [pendingSourceMode, setPendingSourceMode] = useState<"file" | "link">(
    "file"
  );
  const [pendingSourceFile, setPendingSourceFile] = useState<{
    eventId: string;
    file: File;
  } | null>(null);
  const [pendingSourceName, setPendingSourceName] = useState("");
  const [pendingSourceUrl, setPendingSourceUrl] = useState("");
  const [editingResearchNotesEventId, setEditingResearchNotesEventId] =
    useState<string | null>(null);
  const headerActionsDropdownRef = useRef<HTMLDivElement>(null);
  const occupationPanelRef = useRef<HTMLDivElement>(null);
  const occupationToggleRef = useRef<HTMLButtonElement>(null);
  const headerPhotoFileInputRef = useRef<HTMLInputElement>(null);

  const [cropModalPhoto, setCropModalPhoto] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [photoPreviewModal, setPhotoPreviewModal] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1.0);
  const [cropModalDate, setCropModalDate] = useState("");
  const [cropModalCaption, setCropModalCaption] = useState("");
  const [cropModalEventId, setCropModalEventId] = useState<string | null>(null);
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
  const [photoSetupCaption, setPhotoSetupCaption] = useState("");
  const [photoSetupEventId, setPhotoSetupEventId] = useState<string | null>(null);
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
  const eventIds = useMemo(() => events.map((e) => e.id), [events]);

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
    setAddFamilyCoParentId(null);
    setAddFamilyCreateBusy(false);
    setAddFamilyCreateError(null);
    setCropModalPhoto(null);
    setPhotoPreviewModal(null);
    setCropModalDate("");
    setCropModalCaption("");
    setCropModalEventId(null);
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
    setPhotoSetupCaption("");
    setPhotoSetupEventId(null);
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
    setPhotoEventTags([]);
    setHeaderMenuOpen(false);
    setPortraitsGalleryOpen(false);
    setEventPhotoGalleryEventId(null);
    setPolaroidNaturalByKey({});
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
    if (deskPanelOpen !== "occupation") return;
    const onDocMouseDown = (e: MouseEvent) => {
      const panel = occupationPanelRef.current;
      const toggle = occupationToggleRef.current;
      const target = e.target as Node;
      if (panel?.contains(target) || toggle?.contains(target)) return;
      setDeskPanelOpen("none");
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [deskPanelOpen]);

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
      setPhotoSetupDate("");
      setPhotoSetupCaption("");
      setPhotoSetupEventId(null);
      return;
    }
    setPhotoSetupNaturalSize(null);
    setPhotoSetupOffset({ x: 0, y: 0 });
    photoSetupOffsetHydratedRef.current = false;
    const photoDate =
      photoSetupModal && typeof photoSetupModal.photo_date === "string"
        ? photoSetupModal.photo_date
        : "";
    const caption =
      photoSetupModal && typeof photoSetupModal.caption === "string"
        ? photoSetupModal.caption
        : "";
    setPhotoSetupDate(photoDate);
    setPhotoSetupCaption(caption);
    const linked = photoEventTags.find((t) => t.photo_id === photoSetupModalId);
    setPhotoSetupEventId(linked?.event_id ?? null);
  }, [photoSetupModalId, photoSetupModal, photoEventTags]);

  useEffect(() => {
    if (!cropModalPhotoId) {
      setCropModalDate("");
      setCropModalCaption("");
      setCropModalEventId(null);
      return;
    }
    const row = photoRows.find((r) => r.id === cropModalPhotoId) ?? null;
    const photoDate =
      row && typeof row.photo_date === "string" ? row.photo_date : "";
    const caption = row && typeof row.caption === "string" ? row.caption : "";
    setCropModalDate(photoDate);
    setCropModalCaption(caption);
    const linked = photoEventTags.find((t) => t.photo_id === cropModalPhotoId);
    setCropModalEventId(linked?.event_id ?? null);
  }, [cropModalPhotoId, photoRows, photoEventTags]);

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
      POLAROID_CROP_VIEWPORT_W,
      POLAROID_CROP_VIEWPORT_H,
      cropZoom
    );
    setCropOffset(
      cropPercentToOffsetCover(
        thumb.x,
        thumb.y,
        rw,
        rh,
        POLAROID_CROP_VIEWPORT_W,
        POLAROID_CROP_VIEWPORT_H
      )
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
      POLAROID_CROP_VIEWPORT_W,
      POLAROID_CROP_VIEWPORT_H,
      photoSetupZoom
    );
    setPhotoSetupOffset(
      cropPercentToOffsetCover(
        thumb.x,
        thumb.y,
        rw,
        rh,
        POLAROID_CROP_VIEWPORT_W,
        POLAROID_CROP_VIEWPORT_H
      )
    );
    photoSetupOffsetHydratedRef.current = true;
  }, [photoSetupModal, photoSetupNaturalSize]);

  useEffect(() => {
    if (!cropNaturalSize) return;
    const { w: rw, h: rh } = cropCoverRenderedSize(
      cropNaturalSize.w,
      cropNaturalSize.h,
      POLAROID_CROP_VIEWPORT_W,
      POLAROID_CROP_VIEWPORT_H,
      cropZoom
    );
    setCropOffset((o) =>
      clampCropOffsetCover(
        o,
        rw,
        rh,
        POLAROID_CROP_VIEWPORT_W,
        POLAROID_CROP_VIEWPORT_H
      )
    );
  }, [cropZoom, cropNaturalSize]);

  useEffect(() => {
    if (!photoSetupNaturalSize) return;
    const { w: rw, h: rh } = cropCoverRenderedSize(
      photoSetupNaturalSize.w,
      photoSetupNaturalSize.h,
      POLAROID_CROP_VIEWPORT_W,
      POLAROID_CROP_VIEWPORT_H,
      photoSetupZoom
    );
    setPhotoSetupOffset((o) =>
      clampCropOffsetCover(
        o,
        rw,
        rh,
        POLAROID_CROP_VIEWPORT_W,
        POLAROID_CROP_VIEWPORT_H
      )
    );
  }, [photoSetupZoom, photoSetupNaturalSize]);

  const loadOccupations = useCallback(async () => {
    if (!personId) return;
    setOccupationLoading(true);
    setOccupationError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setOccupationLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("occupations")
      .select("*")
      .eq("person_id", personId)
      .order("year_observed", { ascending: true, nullsFirst: false });
    if (error) {
      setOccupationError(
        occupationUiErrorMessage(error, "Could not load occupations.")
      );
      setOccupationLoading(false);
      return;
    }
    const occupationRows = (data ?? []) as OccupationRow[];
    setOccupations(occupationRows);

    const linkedRecordIds = [
      ...new Set(
        occupationRows
          .map((row) => occupationLinkedRecordId(row))
          .filter((id): id is string => typeof id === "string" && id.trim() !== "")
      ),
    ];
    if (linkedRecordIds.length > 0) {
      const { data: occRecData, error: occRecErr } = await supabase
        .from("records")
        .select("id, record_type, file_type, file_url, created_at, ai_response")
        .in("id", linkedRecordIds);
      if (!occRecErr && occRecData) {
        setRecordsById((prev) => {
          const next = new Map(prev);
          for (const rec of occRecData as RecordRow[]) {
            next.set(rec.id, rec);
          }
          return next;
        });
      }
    }
    setOccupationLoading(false);
  }, [personId]);

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
    setOccupationError(null);
    setEditingOccupationId(null);
    setOccupationEditDraft(null);
    setAddingOccupation(false);
    setOccupationAddDraft({ job_title: "", year_observed: "" });

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    const [personRes, eventRes] = await Promise.all([
      supabase
        .from("persons")
        .select(
          "id, first_name, middle_name, last_name, birth_date, death_date, birth_place_id, death_place_id, photo_url, gender, military_branch, service_number, cause_of_death, marital_status, surviving_spouse, notes, tree_id, birth_place:places!birth_place_id(township, county, state, country), death_place:places!death_place_id(township, county, state, country)"
        )
        .eq("id", personId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("events")
        .select(
          "id, event_type, event_date, event_place_id, description, record_id, notes, research_notes, story_short, story_full, created_at, event_place:places!event_place_id(township, county, state, country)"
        )
        .eq("person_id", personId)
        .eq("user_id", user.id)
        .order("event_date", { ascending: true, nullsFirst: false }),
    ]);
    const personData = personRes.data;
    const personErr = personRes.error;

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
      military_branch: raw.military_branch ?? null,
      service_number: raw.service_number ?? null,
      cause_of_death: raw.cause_of_death ?? null,
      marital_status: raw.marital_status ?? null,
      surviving_spouse: raw.surviving_spouse ?? null,
    };

    /**
     * Theme must follow the tree you opened the profile from (`/dashboard/{treeId}/person/...`),
     * not only `person.tree_id` (can be missing or a different tree). That mismatch made Roots
     * oval header/CSS look like it “never changed” while polaroid rules still applied.
     */
    const themeTreeId = treeId !== "" ? treeId : personTreeId;

    let resolvedCanvasTheme = DEFAULT_CANVAS_THEME_ID;
    if (themeTreeId !== "") {
      const { data: treeThemeRow, error: treeThemeErr } = await supabase
        .from("trees")
        .select("canvas_theme")
        .eq("id", themeTreeId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!treeThemeErr && treeThemeRow) {
        const ct = (treeThemeRow as { canvas_theme?: string | null })
          .canvas_theme;
        if (typeof ct === "string" && ct.trim() !== "") {
          const normalized = ct.trim().toLowerCase();
          resolvedCanvasTheme = isCanvasThemeId(normalized)
            ? normalized
            : DEFAULT_CANVAS_THEME_ID;
        }
      }
    }

    const eventData = eventRes.data;
    const eventErr = eventRes.error;
    if (eventErr) {
      setError(eventErr.message);
      setLoading(false);
      return;
    }

    const evs: EventRow[] = (eventData ?? []).map((row) => {
      const e = row as EventRow & {
        created_at?: string | null;
        event_place?:
          | {
              township: string | null;
              county: string | null;
              state: string | null;
              country: string;
            }
          | {
              township: string | null;
              county: string | null;
              state: string | null;
              country: string;
            }[]
          | null;
      };
      const ep = e.event_place;
      const normalizedEventPlace =
        ep == null ? null : Array.isArray(ep) ? (ep[0] ?? null) : ep;
      return {
        ...e,
        event_place: normalizedEventPlace,
        created_at: e.created_at ?? null,
      };
    });
    const sortedEvents = sortEventsChronologically(evs);

    // Phase 1 perf: paint core profile content first, then hydrate secondary panels.
    setPerson(p);
    setCanvasTheme(resolvedCanvasTheme);
    setEvents(sortedEvents);
    setLoading(false);

    let relQuery = supabase
      .from("relationships")
      .select("id, person_a_id, person_b_id, relationship_type")
      .eq("user_id", user.id)
      .or(`person_a_id.eq.${personId},person_b_id.eq.${personId}`);
    if (effectiveTreeForRels !== "") {
      relQuery = relQuery.eq("tree_id", effectiveTreeForRels);
    }
    const eventIds = sortedEvents.map((e) => e.id);
    const [relRes, tagLinkRes, sourceRes, personNotesRes] = await Promise.all([
      relQuery,
      supabase
        .from("photo_tags")
        .select("photo_id, crop_x, crop_y, crop_zoom, is_primary")
        .eq("person_id", personId)
        .eq("user_id", user.id),
      eventIds.length > 0
        ? supabase
            .from("event_sources")
            .select("id, event_id, record_id, notes, created_at")
            .in("event_id", eventIds)
        : Promise.resolve({
            data: [] as EventSourceRow[],
            error: null,
          }),
      supabase
        .from("person_notes")
        .select("id, content, updated_at")
        .eq("person_id", personId)
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);
    const relData = relRes.data;
    const relErr = relRes.error;

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

    const relativesMap = new Map<string, PersonRow>();
    if (relatedIds.length > 0) {
      const [relPeopleRes, relPhotosRes] = await Promise.all([
        supabase
          .from("persons")
          .select(
            "id, first_name, middle_name, last_name, birth_date, death_date, photo_url, gender"
          )
          .eq("user_id", user.id)
          .in("id", relatedIds),
        supabase
          .from("photo_tags")
          .select(
            "person_id, crop_x, crop_y, crop_zoom, photos(file_url, natural_width, natural_height)"
          )
          .eq("is_primary", true)
          .eq("user_id", user.id)
          .in("person_id", relatedIds),
      ]);
      const relPeople = relPeopleRes.data;
      const rpErr = relPeopleRes.error;

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

      const relPhotos = relPhotosRes.data;
      const relPhErr = relPhotosRes.error;

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

    let spouseWithChildrenGroups: { spouse: PersonRow; children: PersonRow[] }[] =
      [];
    let otherChildrenRows: PersonRow[] = [];

    const childIdArr = [...children];
    if (spouses.size === 0) {
      spouseWithChildrenGroups = [];
      otherChildrenRows = sortPeopleOldestToYoungest(pick(children));
    } else if (childIdArr.length === 0) {
      spouseWithChildrenGroups = pick(spouses).map((s) => ({
        spouse: s,
        children: [] as PersonRow[],
      }));
      otherChildrenRows = [];
    } else {
      let parentRelsQuery = supabase
        .from("relationships")
        .select("person_a_id, person_b_id")
        .eq("user_id", user.id)
        .eq("relationship_type", "parent")
        .in("person_b_id", childIdArr);
      if (effectiveTreeForRels !== "") {
        parentRelsQuery = parentRelsQuery.eq("tree_id", effectiveTreeForRels);
      }
      const { data: parentRelRows, error: prelErr } = await parentRelsQuery;
      if (prelErr) {
        setError(prelErr.message);
        setLoading(false);
        return;
      }

      const coParentsByChild = new Map<string, string[]>();
      for (const row of (parentRelRows ?? []) as {
        person_a_id: string;
        person_b_id: string;
      }[]) {
        const parentA = row.person_a_id;
        const childB = row.person_b_id;
        if (parentA === personId) continue;
        const arr = coParentsByChild.get(childB) ?? [];
        arr.push(parentA);
        coParentsByChild.set(childB, arr);
      }

      const childrenBySpouseId = new Map<string, string[]>();
      for (const sid of spouses) {
        childrenBySpouseId.set(sid, []);
      }
      const ungroupedChildIds: string[] = [];

      for (const cid of childIdArr) {
        const others = coParentsByChild.get(cid) ?? [];
        let matchedSpouse: string | null = null;
        for (const oid of others) {
          if (spouses.has(oid)) {
            matchedSpouse = oid;
            break;
          }
        }
        if (matchedSpouse !== null) {
          childrenBySpouseId.get(matchedSpouse)!.push(cid);
        } else {
          ungroupedChildIds.push(cid);
        }
      }

      const spouseRows = pick(spouses);
      const groups = spouseRows.map((s) => ({
        spouse: s,
        children: sortPeopleOldestToYoungest(
          pick(new Set(childrenBySpouseId.get(s.id) ?? []))
        ),
      }));

      const birthSortKey = (iso: string | null): string => {
        const t = (iso ?? "").trim();
        return t === "" ? "9999-99-99" : t;
      };
      const minChildBirth = (ch: PersonRow[]): string => {
        let min = "9999-99-99";
        for (const c of ch) {
          const k = birthSortKey(c.birth_date);
          if (k < min) min = k;
        }
        return min;
      };
      const spouseNameKey = (s: PersonRow): string =>
        [s.first_name, s.middle_name ?? "", s.last_name]
          .map((x) => x.trim())
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

      groups.sort((a, b) => {
        const aHas = a.children.length > 0;
        const bHas = b.children.length > 0;
        if (aHas !== bHas) return aHas ? -1 : 1;
        const cmp = minChildBirth(a.children).localeCompare(
          minChildBirth(b.children),
        );
        if (cmp !== 0) return cmp;
        const bc = birthSortKey(a.spouse.birth_date).localeCompare(
          birthSortKey(b.spouse.birth_date),
        );
        if (bc !== 0) return bc;
        return spouseNameKey(a.spouse).localeCompare(spouseNameKey(b.spouse));
      });

      spouseWithChildrenGroups = groups;
      otherChildrenRows = sortPeopleOldestToYoungest(
        pick(new Set(ungroupedChildIds))
      );
    }

    let photosParsed: Record<string, unknown>[] = [];
    const tagLinkRows = tagLinkRes.data;
    const tagLinkErr = tagLinkRes.error;

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

    const sortedEventIds = sortedEvents.map((e) => e.id);
    let photosData: Record<string, unknown>[] = [];
    let photoEventTagRows: PhotoEventTagRow[] = [];
    if (tagPhotoIds.length > 0) {
      const [photosRes, photoEventTagsRes] = await Promise.all([
        supabase
          .from("photos")
          .select("*")
          .eq("user_id", user.id)
          .in("id", tagPhotoIds)
          .order("created_at", { ascending: false }),
        sortedEventIds.length > 0
          ? supabase
              .from("photo_event_tags")
              .select("photo_id, event_id")
              .eq("user_id", user.id)
              .in("photo_id", tagPhotoIds)
              .in("event_id", sortedEventIds)
          : Promise.resolve({
              data: [] as PhotoEventTagRow[],
              error: null,
            }),
      ]);

      const photosErr = photosRes.error;
      if (photosErr) {
        setError(photosErr.message);
        setLoading(false);
        return;
      }
      photosData = (photosRes.data ?? []) as Record<string, unknown>[];

      const petErr = photoEventTagsRes.error;
      if (petErr) {
        setError(petErr.message);
        setLoading(false);
        return;
      }
      photoEventTagRows = (photoEventTagsRes.data ?? []) as PhotoEventTagRow[];
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

    const esErr = sourceRes.error;
    if (esErr) {
      setError(esErr.message);
      setLoading(false);
      return;
    }
    const sourceRows = (sourceRes.data ?? []) as EventSourceRow[];

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

    const recMap = new Map<string, RecordRow>();
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
    const pnData = personNotesRes.data;
    const pnErr = personNotesRes.error;

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

    setEventSources(sourceRows);
    setPhotoRows(photosParsed);
    setPhotoEventTags(photoEventTagRows);
    setRecordsById(recMap);
    setFamily({
      parents: pick(parents),
      spouses: pick(spouses),
      siblings: sortPeopleOldestToYoungest(pick(siblings)),
      children: sortPeopleOldestToYoungest(pick(children)),
      spouseWithChildrenGroups,
      otherChildren: otherChildrenRows,
    });
    setRelationshipMetaByPersonId(relMetaByPersonId);
    setResearchNoteId(pnId);
    setResearchNoteText(pnContent);
    setResearchNoteUpdatedAt(pnUpdated);
    // Phase 1 perf: render the profile first; occupations can hydrate right after.
    void loadOccupations();
  }, [loadOccupations, personId, router, treeId]);

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

  const addFamilyCoParentName = useMemo(() => {
    if (!addFamilyCoParentId) return "";
    const all = [
      ...family.parents,
      ...family.spouses,
      ...family.siblings,
      ...family.children,
    ];
    const personRow = all.find((p) => p.id === addFamilyCoParentId);
    if (!personRow) return "";
    return [personRow.first_name, personRow.middle_name ?? "", personRow.last_name]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");
  }, [addFamilyCoParentId, family]);

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

  const headerPolaroidLayers = useMemo((): HeaderPolaroidLayer[] => {
    const withUrl = photoRows.filter((r) => photoUrlFromRow(r));
    if (withUrl.length > 0) {
      const primary = withUrl.find((r) => rowIsPrimaryForDisplay(r));
      const rest = withUrl.filter((r) => !rowIsPrimaryForDisplay(r));
      const ordered = primary ? [primary, ...rest] : [...withUrl];
      return ordered
        .slice(0, 3)
        .map((row) => ({ kind: "row" as const, row }));
    }
    if (person && headerPhotoUrl) {
      return [{ kind: "legacy" as const, url: headerPhotoUrl, person }];
    }
    return [];
  }, [photoRows, person, headerPhotoUrl]);

  /**
   * Dead Gossip (scrapbook) and Roots (oval): primary photo only in the header.
   * String theme keeps the polaroid stack.
   */
  const headerProfilePhotoStackLayers = useMemo(() => {
    const style = profileCanvasTheme.photoFrameStyle;
    if (style === "scrapbook" || style === "oval") {
      return headerPolaroidLayers.slice(0, 1);
    }
    return headerPolaroidLayers;
  }, [profileCanvasTheme.photoFrameStyle, headerPolaroidLayers]);

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

  const photoRowById = useMemo(() => {
    const m = new Map<string, Record<string, unknown>>();
    for (const row of photoRows) {
      if (typeof row.id === "string") m.set(row.id, row);
    }
    return m;
  }, [photoRows]);

  const eventPhotosByEventId = useMemo(() => {
    const m = new Map<string, Record<string, unknown>[]>();
    for (const link of photoEventTags) {
      const row = photoRowById.get(link.photo_id);
      if (!row) continue;
      if (!m.has(link.event_id)) m.set(link.event_id, []);
      m.get(link.event_id)!.push(row);
    }
    return m;
  }, [photoEventTags, photoRowById]);

  const timelineEvents = useMemo(
    () => sortEventsChronologically(dedupeTimelineEvents(events)),
    [events]
  );

  const marriageEventYears = useMemo(() => {
    const years: string[] = [];
    for (const ev of events) {
      if ((ev.event_type ?? "").trim().toLowerCase() !== "marriage") continue;
      const d = (ev.event_date ?? "").trim();
      if (!d) continue;
      const m = d.match(/(\d{4})/);
      if (m?.[1]) years.push(m[1]);
    }
    return years;
  }, [events]);

  const marriageYearBySpouseId = useMemo(() => {
    const out = new Map<string, string>();
    const spouseGroups = family.spouseWithChildrenGroups;
    if (spouseGroups.length === 0 || marriageEventYears.length === 0) return out;
    if (spouseGroups.length === 1) {
      out.set(spouseGroups[0]!.spouse.id, marriageEventYears[0]!);
      return out;
    }
    if (spouseGroups.length !== marriageEventYears.length) return out;
    for (let i = 0; i < spouseGroups.length; i++) {
      out.set(spouseGroups[i]!.spouse.id, marriageEventYears[i]!);
    }
    return out;
  }, [family.spouseWithChildrenGroups, marriageEventYears]);

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
        .maybeSingle();
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
      setPhotoSetupCaption("");
      setPhotoSetupEventId(null);
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

  async function savePhotoEventLink(
    supabase: ReturnType<typeof createClient>,
    userId: string,
    photoId: string,
    selectedEventId: string | null
  ): Promise<string | null> {
    if (!eventIds.length) return null;
    const { error: delErr } = await supabase
      .from("photo_event_tags")
      .delete()
      .eq("photo_id", photoId)
      .eq("user_id", userId)
      .in("event_id", eventIds);
    if (delErr) return delErr.message;
    if (!selectedEventId) return null;
    const { error: insErr } = await supabase.from("photo_event_tags").insert({
      photo_id: photoId,
      event_id: selectedEventId,
      user_id: userId,
    });
    if (insErr) return insErr.message;
    return null;
  }

  async function saveCropPosition(
    photoRowId: string,
    x: number,
    y: number,
    zoom: number,
    photoDate: string,
    caption: string,
    eventId: string | null
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
    const { error: metaErr } = await supabase
      .from("photos")
      .update({
        photo_date: photoDate.trim() || null,
        caption: caption.trim() || null,
      })
      .eq("id", photoRowId)
      .eq("user_id", user.id);
    if (metaErr) {
      setPhotoUploadError(metaErr.message);
      return;
    }
    const eventLinkErr = await savePhotoEventLink(
      supabase,
      user.id,
      photoRowId,
      eventId
    );
    if (eventLinkErr) {
      setPhotoUploadError(eventLinkErr);
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
          POLAROID_CROP_VIEWPORT_W,
          POLAROID_CROP_VIEWPORT_H
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
      POLAROID_CROP_VIEWPORT_W,
      POLAROID_CROP_VIEWPORT_H,
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
          POLAROID_CROP_VIEWPORT_W,
          POLAROID_CROP_VIEWPORT_H
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
      POLAROID_CROP_VIEWPORT_W,
      POLAROID_CROP_VIEWPORT_H,
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
          POLAROID_CROP_VIEWPORT_W,
          POLAROID_CROP_VIEWPORT_H
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
      POLAROID_CROP_VIEWPORT_W,
      POLAROID_CROP_VIEWPORT_H,
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
          POLAROID_CROP_VIEWPORT_W,
          POLAROID_CROP_VIEWPORT_H
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
      POLAROID_CROP_VIEWPORT_W,
      POLAROID_CROP_VIEWPORT_H,
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

  async function openPhotoSetupForExisting(row: Record<string, unknown>) {
    const photoId = typeof row.id === "string" ? row.id : "";
    const thumbCrop = personPhotoCropForRow(row);

    setPhotoSetupModal(row);
    setPhotoSetupZoom(thumbCrop.zoom);
    setPhotoSetupDate(typeof row.photo_date === "string" ? row.photo_date : "");
    setPhotoSetupCaption(typeof row.caption === "string" ? row.caption : "");
    const linked = photoEventTags.find((t) => t.photo_id === photoId);
    setPhotoSetupEventId(linked?.event_id ?? null);
    setPhotoSetupTagSearch("");
    setPhotoSetupTagResults([]);
    setPhotoSetupError(null);

    const fallbackTags: PhotoSetupTagPerson[] = person
      ? [
          {
            id: person.id,
            first_name: person.first_name,
            last_name: person.last_name,
            middle_name: person.middle_name ?? null,
          },
        ]
      : [];
    setPhotoSetupTags(fallbackTags);

    if (!photoId) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: tagRows, error: tagErr } = await supabase
      .from("photo_tags")
      .select("person_id")
      .eq("photo_id", photoId)
      .eq("user_id", user.id);
    if (tagErr) {
      setPhotoSetupError(tagErr.message);
      return;
    }
    const personIds = [...new Set((tagRows ?? []).map((r) => (r as { person_id?: string }).person_id))]
      .filter((id): id is string => typeof id === "string" && id.trim() !== "");
    if (personIds.length === 0) return;

    const { data: personsRows, error: personsErr } = await supabase
      .from("persons")
      .select("id, first_name, middle_name, last_name")
      .in("id", personIds)
      .eq("user_id", user.id);
    if (personsErr) {
      setPhotoSetupError(personsErr.message);
      return;
    }
    const tags = (personsRows ?? [])
      .map((r) => r as { id?: string; first_name?: string; middle_name?: string | null; last_name?: string })
      .filter((r): r is { id: string; first_name: string; middle_name: string | null; last_name: string } =>
        typeof r.id === "string" &&
        typeof r.first_name === "string" &&
        typeof r.last_name === "string"
      )
      .map((r) => ({
        id: r.id,
        first_name: r.first_name,
        middle_name: r.middle_name ?? null,
        last_name: r.last_name,
      }));
    if (tags.length > 0) {
      setPhotoSetupTags(tags);
    }
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
        POLAROID_CROP_VIEWPORT_W,
        POLAROID_CROP_VIEWPORT_H,
        photoSetupZoom
      );
      const { x: cx, y: cy } = offsetToCropPercentCover(
        photoSetupOffset,
        setupRw,
        setupRh,
        POLAROID_CROP_VIEWPORT_W,
        POLAROID_CROP_VIEWPORT_H
      );
      const cz = Math.min(3, Math.max(1, photoSetupZoom));
      const dateTrim = photoSetupDate.trim();
      const captionTrim = photoSetupCaption.trim();
      const { error: upErr } = await supabase
        .from("photos")
        .update({
          photo_date: dateTrim === "" ? null : dateTrim,
          caption: captionTrim === "" ? null : captionTrim,
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
      const eventLinkErr = await savePhotoEventLink(
        supabase,
        user.id,
        photoId,
        photoSetupEventId
      );
      if (eventLinkErr) {
        setPhotoSetupError(eventLinkErr);
        return;
      }
      photoSetupSearchSeqRef.current += 1;
      setPhotoSetupModal(null);
      setPhotoSetupCaption("");
      setPhotoSetupEventId(null);
      await load();
    } finally {
      setPhotoSetupSaving(false);
    }
  }

  function skipPhotoSetup() {
    photoSetupSearchSeqRef.current += 1;
    setPhotoSetupModal(null);
    setPhotoSetupError(null);
    setPhotoSetupCaption("");
    setPhotoSetupEventId(null);
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
          .maybeSingle();

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
          .maybeSingle();

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
    if (gLower === "male") genderVal = GENDER_VALUES.MALE;
    else if (gLower === "female") genderVal = GENDER_VALUES.FEMALE;
    else if (gLower === "unknown") genderVal = GENDER_VALUES.UNKNOWN;

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
      marital_status: person.marital_status ?? "",
      surviving_spouse: person.surviving_spouse ?? "",
      military_branch: person.military_branch ?? "",
      service_number: person.service_number ?? "",
      cause_of_death: person.cause_of_death ?? "",
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
        marital_status: d.marital_status.trim() || null,
        surviving_spouse: d.surviving_spouse.trim() || null,
        military_branch: d.military_branch.trim() || null,
        service_number: d.service_number.trim() || null,
        cause_of_death: d.cause_of_death.trim() || null,
        notes: d.notes.trim() || null,
      })
      .eq("id", personId)
      .eq("user_id", user.id)
      .select(
        "id, first_name, middle_name, last_name, birth_date, death_date, birth_place_id, death_place_id, photo_url, gender, military_branch, service_number, cause_of_death, marital_status, surviving_spouse, notes, birth_place:places!birth_place_id(township, county, state, country), death_place:places!death_place_id(township, county, state, country)"
      )
      .maybeSingle();

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
      military_branch: dup.military_branch ?? null,
      service_number: dup.service_number ?? null,
      cause_of_death: dup.cause_of_death ?? null,
      marital_status: dup.marital_status ?? null,
      surviving_spouse: dup.surviving_spouse ?? null,
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
    setAddFamilyCoParentId(null);
    setAddFamilyCreateBusy(false);
    setAddFamilyCreateError(null);
    setAddFamilyTreePeopleError(null);
  }

  function openAddFamilyModal(opts?: {
    tab?: "find" | "create";
    relationship?: FamilyRelationshipChoice;
    coParentId?: string | null;
    /** Prefills create form when user switches to Create tab. */
    createGenderDefault?: "male" | "female";
  }) {
    resetAddFamilyModalFormState();
    if (opts?.tab) setAddFamilyTab(opts.tab);
    if (opts?.relationship) {
      setAddFamilyFindRel(opts.relationship);
      setAddFamilyCreateRel(opts.relationship);
    }
    if (opts?.coParentId) {
      setAddFamilyCoParentId(opts.coParentId);
    }
    if (opts?.createGenderDefault === "male") {
      setAddFamilyCreateGender(GENDER_VALUES.MALE);
    } else if (opts?.createGenderDefault === "female") {
      setAddFamilyCreateGender(GENDER_VALUES.FEMALE);
    }
    setAddFamilyModalOpen(true);
  }

  function closeAddFamilyModal() {
    if (addFamilyFindBusy || addFamilyCreateBusy) return;
    setAddFamilyModalOpen(false);
    resetAddFamilyModalFormState();
  }

  async function linkProfileAndOtherAsParentChild(
    supabase: ReturnType<typeof createClient>,
    userId: string,
    profileId: string,
    otherId: string,
    treeIdForRels: string,
    choice: FamilyRelationshipChoice
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const rows = bidirectionalRelationshipRows(choice, profileId, otherId);
    const base = {
      user_id: userId,
      tree_id: treeIdForRels,
    };
    const { error: e1 } = await supabase.from("relationships").insert({
      ...base,
      person_a_id: rows[0]!.person_a_id,
      person_b_id: rows[0]!.person_b_id,
      relationship_type: rows[0]!.relationship_type,
    });
    if (e1) return { ok: false, error: e1.message };

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
        .eq("user_id", userId)
        .eq("tree_id", treeIdForRels)
        .eq("person_a_id", rows[0]!.person_a_id)
        .eq("person_b_id", rows[0]!.person_b_id)
        .eq("relationship_type", rows[0]!.relationship_type);
      return { ok: false, error: e2.message };
    }
    return { ok: true };
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
      const primaryLink = await linkProfileAndOtherAsParentChild(
        supabase,
        user.id,
        personId,
        otherId,
        effectiveTreeIdForFamily,
        addFamilyFindRel
      );
      if (!primaryLink.ok) {
        setAddFamilyFindError(primaryLink.error);
        return;
      }

      if (addFamilyFindRel === "child" && addFamilyCoParentId) {
        const secondLink = await linkProfileAndOtherAsParentChild(
          supabase,
          user.id,
          addFamilyCoParentId,
          otherId,
          effectiveTreeIdForFamily,
          "child"
        );
        if (!secondLink.ok) {
          setAddFamilyFindError(secondLink.error);
          return;
        }
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
      const gender = normalizeGender(addFamilyCreateGender);

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
        .maybeSingle();

      if (insP || !newPerson) {
        setAddFamilyCreateError(insP?.message ?? "Could not create person.");
        return;
      }
      const otherId = String((newPerson as { id: string }).id);

      const primaryLink = await linkProfileAndOtherAsParentChild(
        supabase,
        user.id,
        personId,
        otherId,
        effectiveTreeIdForFamily,
        addFamilyCreateRel
      );
      if (!primaryLink.ok) {
        await supabase.from("persons").delete().eq("id", otherId).eq("user_id", user.id);
        setAddFamilyCreateError(primaryLink.error);
        return;
      }

      if (addFamilyCreateRel === "child" && addFamilyCoParentId) {
        const secondLink = await linkProfileAndOtherAsParentChild(
          supabase,
          user.id,
          addFamilyCoParentId,
          otherId,
          effectiveTreeIdForFamily,
          "child"
        );
        if (!secondLink.ok) {
          await supabase.from("persons").delete().eq("id", otherId).eq("user_id", user.id);
          setAddFamilyCreateError(secondLink.error);
          return;
        }
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
      event_place_display: ev.event_place ? formatPlace(ev.event_place) : "",
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
    let resolvedEventPlaceId: string | null = d.event_place_id ?? null;
    if (!resolvedEventPlaceId && d.event_place_display.trim() !== "") {
      try {
        const res = await fetch("/api/places/find-or-create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display: d.event_place_display.trim() }),
        });
        if (res.ok) {
          const placeData = (await res.json()) as { id?: string };
          resolvedEventPlaceId = placeData.id ?? null;
        }
      } catch {
        // If place resolution fails, keep existing null behavior.
      }
    }
    // Existing row only — never insert/upsert here.
    const { data, error } = await supabase
      .from("events")
      .update({
        event_type: d.event_type.trim() || "other",
        event_date: d.event_date.trim() || null,
        event_place_id: resolvedEventPlaceId,
        story_short: d.story_short.trim() || null,
        story_full: d.story_full.trim() || null,
        notes: d.notes.trim() || null,
      })
      .eq("id", eventId)
      .eq("user_id", user.id)
      .select(
        "id, event_type, event_date, event_place_id, description, record_id, notes, research_notes, story_short, story_full, created_at"
      )
      .maybeSingle();

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
        .maybeSingle();

      if (error) throw error;
      if (!insertedEvent) throw new Error("No event returned after insert");

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
              anchor_person_id: personId,
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
        .maybeSingle();

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
      setPendingSourceUrl("");
      setPendingSourceMode("file");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error("Source upload failed:", msg);
      alert("Upload failed: " + msg);
    } finally {
      setSourceUploading(false);
    }
  }

  async function handleAddSourceLink(eventId: string, rawUrl: string) {
    const normalized = normalizeWebUrl(rawUrl);
    if (!normalized) {
      alert("Please enter a valid web link.");
      return;
    }
    setSourceUploading(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: recordRow, error: recordErr } = await supabase
        .from("records")
        .insert({
          user_id: user.id,
          tree_id: person?.tree_id ?? null,
          file_type: "text/uri-list",
          file_url: normalized,
          record_type: pendingSourceName.trim() || "Web link",
        })
        .select("id")
        .maybeSingle();

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
      setPendingSourceUrl("");
      setPendingSourceMode("file");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      console.error("Source link save failed:", msg);
      alert("Could not save link: " + msg);
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

  async function saveNewOccupation() {
    if (!personId || occupationSaving) return;
    const title = occupationAddDraft.job_title.trim();
    if (!title) {
      setOccupationError("Job title is required.");
      return;
    }
    const yearRaw = occupationAddDraft.year_observed.trim();
    const yearValue =
      yearRaw === ""
        ? null
        : /^\d{4}$/.test(yearRaw)
          ? Number.parseInt(yearRaw, 10)
          : Number.NaN;
    if (Number.isNaN(yearValue)) {
      setOccupationError("Year observed must be a four digit year.");
      return;
    }
    setOccupationSaving(true);
    setOccupationError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const { error } = await supabase.from("occupations").insert({
        person_id: personId,
        job_title: title,
        year_observed: yearValue,
      });
      if (error) throw error;
      setOccupationAddDraft({ job_title: "", year_observed: "" });
      setAddingOccupation(false);
      await loadOccupations();
    } catch (e) {
      setOccupationError(occupationUiErrorMessage(e, "Could not add occupation."));
    } finally {
      setOccupationSaving(false);
    }
  }

  async function saveEditedOccupation(row: OccupationRow) {
    if (!occupationEditDraft || occupationSaving) return;
    const title = occupationEditDraft.job_title.trim();
    if (!title) {
      setOccupationError("Job title is required.");
      return;
    }
    const yearRaw = occupationEditDraft.year_observed.trim();
    const yearValue =
      yearRaw === ""
        ? null
        : /^\d{4}$/.test(yearRaw)
          ? Number.parseInt(yearRaw, 10)
          : Number.NaN;
    if (Number.isNaN(yearValue)) {
      setOccupationError("Year observed must be a four digit year.");
      return;
    }
    setOccupationSaving(true);
    setOccupationError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const { error } = await supabase
        .from("occupations")
        .update({
          job_title: title,
          year_observed: yearValue,
        })
        .eq("id", row.id)
        .eq("person_id", personId);
      if (error) throw error;
      setEditingOccupationId(null);
      setOccupationEditDraft(null);
      await loadOccupations();
    } catch (e) {
      setOccupationError(
        occupationUiErrorMessage(e, "Could not update occupation.")
      );
    } finally {
      setOccupationSaving(false);
    }
  }

  async function deleteOccupation(row: OccupationRow) {
    if (!personId || occupationDeletingId) return;
    setOccupationDeletingId(row.id);
    setOccupationError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");
      const { error } = await supabase
        .from("occupations")
        .delete()
        .eq("id", row.id)
        .eq("person_id", personId);
      if (error) throw error;
      if (editingOccupationId === row.id) {
        setEditingOccupationId(null);
        setOccupationEditDraft(null);
      }
      await loadOccupations();
    } catch (e) {
      setOccupationError(
        occupationUiErrorMessage(e, "Could not delete occupation.")
      );
    } finally {
      setOccupationDeletingId(null);
    }
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

  const fileChips = useMemo(() => {
    if (!person) return [] as { label: string; value: string }[];
    const out: { label: string; value: string }[] = [];
    const add = (label: string, raw: string | null | undefined) => {
      if (raw == null) return;
      const v = String(raw).trim();
      if (!v) return;
      out.push({ label, value: v });
    };
    if (person.birth_date) {
      const raw = String(person.birth_date).trim();
      if (raw) {
        out.push({ label: "DATE OF BIRTH", value: formatDateString(raw) });
      }
    }
    if (person.birth_place) {
      const place = formatPlace(person.birth_place).trim();
      if (place) out.push({ label: "PLACE OF BIRTH", value: place });
    }
    add("GENDER", person.gender);
    if (person.death_date) {
      const raw = String(person.death_date).trim();
      if (raw) {
        out.push({ label: "DATE OF DEATH", value: formatDateString(raw) });
      }
    }
    if (person.death_place) {
      const place = formatPlace(person.death_place).trim();
      if (place) out.push({ label: "PLACE OF DEATH", value: place });
    }
    add("MARITAL STATUS", person.marital_status);
    add("SURVIVING SPOUSE", person.surviving_spouse);
    add("CAUSE OF DEATH", person.cause_of_death);
    add("MILITARY BRANCH", person.military_branch);
    add("SERVICE NUMBER", person.service_number);
    return out;
  }, [person]);

  const parentSlots = useMemo(
    () => partitionParentsIntoSlots(family.parents),
    [family.parents]
  );

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
  const eventDateByEventId = new Map<string, string | null>();
  const documentEventDatesByRecordId = new Map<string, string[]>();
  const pushDocumentEventDate = (recordId: string, rawDate: string | null | undefined) => {
    const normalized = (rawDate ?? "").trim();
    if (!documentEventDatesByRecordId.has(recordId)) {
      documentEventDatesByRecordId.set(recordId, []);
    }
    if (!normalized) return;
    const list = documentEventDatesByRecordId.get(recordId)!;
    if (!list.includes(normalized)) list.push(normalized);
  };
  for (const e of events) {
    eventDateByEventId.set(e.id, e.event_date);
    const id = e.record_id?.trim();
    if (id && recordsById.has(id)) {
      documentRecordIds.add(id);
      pushDocumentEventDate(id, e.event_date);
    }
  }
  for (const s of eventSources) {
    const id = s.record_id?.trim();
    if (id && recordsById.has(id)) {
      documentRecordIds.add(id);
      pushDocumentEventDate(id, eventDateByEventId.get(s.event_id) ?? null);
    }
  }
  const documentRecords: {
    record: RecordRow;
    eventDateLabel: string;
    eventDateMs: number | null;
  }[] = [];
  for (const id of documentRecordIds) {
    const record = recordsById.get(id);
    if (!record) continue;
    const eventDates = documentEventDatesByRecordId.get(id) ?? [];
    const earliestKnown = eventDates
      .map((raw) => ({ raw, ms: parseEventDateMs(raw) }))
      .filter((d): d is { raw: string; ms: number } => d.ms != null)
      .sort((a, b) => a.ms - b.ms)[0];
    documentRecords.push({
      record,
      eventDateLabel: earliestKnown
        ? formatDateString(earliestKnown.raw)
        : "Date unknown",
      eventDateMs: earliestKnown?.ms ?? null,
    });
  }
  documentRecords.sort((a, b) => {
    if (a.eventDateMs == null && b.eventDateMs == null) {
      return recordTypeLabel(a.record).localeCompare(recordTypeLabel(b.record));
    }
    if (a.eventDateMs == null) return 1;
    if (b.eventDateMs == null) return -1;
    if (a.eventDateMs !== b.eventDateMs) return a.eventDateMs - b.eventDateMs;
    return recordTypeLabel(a.record).localeCompare(recordTypeLabel(b.record));
  });

  const yearsLived = (() => {
    const birthYear = personProfileYearFromDate(person.birth_date);
    const deathYear = personProfileYearFromDate(person.death_date);
    if (!birthYear || !deathYear) return null;
    const birthNum = Number.parseInt(birthYear, 10);
    const deathNum = Number.parseInt(deathYear, 10);
    if (!Number.isFinite(birthNum) || !Number.isFinite(deathNum)) return null;
    const diff = deathNum - birthNum;
    return diff >= 0 ? diff : null;
  })();

  const marriageCount = events.reduce((count, ev) => {
    return ev.event_type.trim().toLowerCase() === "marriage" ? count + 1 : count;
  }, 0);

  const childrenCount = Object.values(relationshipMetaByPersonId).reduce(
    (count, relMeta) =>
      relMeta.relationshipType === "child" ? count + 1 : count,
    0
  );

  const recordsCount = documentRecordIds.size;

  const heroStats: { label: string; value: string }[] = [
    {
      label: "YEARS LIVED",
      value: yearsLived == null ? "-" : String(yearsLived),
    },
    { label: "MARRIAGES", value: marriageCount > 0 ? String(marriageCount) : "-" },
    { label: "CHILDREN", value: childrenCount > 0 ? String(childrenCount) : "-" },
    { label: "RECORDS", value: recordsCount > 0 ? String(recordsCount) : "-" },
  ];

  const isOvalProfileHeader = profileCanvasTheme.photoFrameStyle === "oval";
  const headerPolaroidOverflowVisible =
    profileCanvasTheme.photoFrameStyle === "scrapbook" || isOvalProfileHeader;
  const openHeaderPortraitsGallery = () => setPortraitsGalleryOpen(true);

  return (
    <PersonProfilePageBody canvasTheme={canvasTheme}>
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

      {/* Header — same horizontal inset as body (`px-4 lg:px-8`) so Actions lines up with desk tabs */}
      <header
        className="pb-3 pt-5 lg:pb-4 lg:pt-6"
        style={{
          backgroundColor: "transparent",
          ...(isOvalProfileHeader
            ? { overflow: "visible" as const }
            : {}),
        }}
      >
        <div
          className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 lg:px-8"
          style={isOvalProfileHeader ? { overflow: "visible" } : undefined}
        >
          <div className="shrink-0 self-start">
            {createElement(
              isOvalProfileHeader ? "div" : "button",
              isOvalProfileHeader
                ? {
                    role: "presentation",
                    className: "relative shrink-0 border-none bg-transparent p-0",
                    style: {
                      width:
                        HEADER_POLAROID_BTN_W * ROOTS_PROFILE_HEADER_MOUNT_SCALE,
                      height:
                        HEADER_POLAROID_BTN_H * ROOTS_PROFILE_HEADER_MOUNT_SCALE +
                        HEADER_ROOTS_OVAL_SHELL_EXTRA_HEIGHT_PX,
                      cursor: "default",
                      overflow: headerPolaroidOverflowVisible
                        ? "visible"
                        : undefined,
                      pointerEvents: "none",
                    },
                  }
                : {
                    type: "button",
                    className: "relative shrink-0 border-none bg-transparent p-0",
                    style: {
                      width: HEADER_POLAROID_BTN_W,
                      height: HEADER_POLAROID_BTN_H,
                      cursor: "pointer",
                      overflow: headerPolaroidOverflowVisible
                        ? "visible"
                        : undefined,
                    },
                    "aria-label":
                      "Open photo gallery — manage photos, crop, tags, and primary",
                    onClick: openHeaderPortraitsGallery,
                  },
              headerPolaroidLayers.length === 0 ? (
              <div
                className="absolute left-1/2 top-1/2"
                style={{
                  transform: "translate(-50%, -50%)",
                  transformOrigin: "center center",
                  overflow:
                    profileCanvasTheme.photoFrameStyle === "scrapbook" ||
                    profileCanvasTheme.photoFrameStyle === "oval"
                      ? "visible"
                      : undefined,
                }}
              >
                <div
                  style={profileHeaderPhotoFrameLayerStyle(
                    profileCanvasTheme.photoFrameStyle,
                    theme === "dark",
                    0,
                    1
                  )}
                >
                  {profileCanvasTheme.photoFrameStyle === "scrapbook" ? (
                    <div
                      style={{
                        transform: `rotate(${scrapbookPhotoTiltDeg}deg)`,
                        transformOrigin: "center center",
                      }}
                    >
                      <div
                        style={{
                          position: "relative",
                          width: HEADER_POLAROID_IMG_W,
                          height: HEADER_POLAROID_IMG_H,
                        }}
                      >
                        <div
                          style={{
                            position: "relative",
                            zIndex: 0,
                            width: "100%",
                            height: "100%",
                            isolation: "isolate",
                          }}
                        >
                          <div
                            style={{
                              position: "relative",
                              zIndex: 1,
                              width: HEADER_POLAROID_IMG_W,
                              height: HEADER_POLAROID_IMG_H,
                              padding: HEADER_SCRAPBOOK_PRINT_BORDER_PX,
                              boxSizing: "border-box",
                              backgroundColor: "#fff",
                              borderRadius: 1,
                              boxShadow: scrapbookPrintWrapperBoxShadow(
                                theme === "dark"
                              ),
                              filter: scrapbookHeaderPhotoLiftFilter(
                                theme === "dark"
                              ),
                            }}
                          >
                            <div
                              className="flex h-full w-full items-center justify-center text-4xl font-bold"
                              style={{
                                backgroundColor: POLAROID_NO_PHOTO_BG,
                                borderRadius: 1,
                                fontFamily: serif,
                                color: POLAROID_NO_PHOTO_INITIALS,
                                boxShadow: scrapbookPhotoInnerInsetShadow(
                                  theme === "dark"
                                ),
                              }}
                            >
                              {person ? initials(person) : "?"}
                            </div>
                          </div>
                        </div>
                        {profileCanvasTheme.id === CANVAS_THEME_ID.DEAD_GOSSIP ? (
                          <HeaderScrapbookTapeStrips />
                        ) : (
                          <HeaderScrapbookCornerTabs />
                        )}
                      </div>
                    </div>
                  ) : profileCanvasTheme.photoFrameStyle === "oval" ? (
                    <div style={HEADER_ROOTS_OVAL_LAYOUT_OFFSET_STYLE}>
                      <RootsFramePortrait isDark={theme === "dark"}>
                        <button
                          type="button"
                          className="box-border block h-full w-full border-none bg-transparent p-0"
                          style={{ cursor: "pointer", font: "inherit" }}
                          aria-label="Open photo gallery — manage photos, crop, tags, and primary"
                          onClick={openHeaderPortraitsGallery}
                        >
                          <div
                            className="flex h-full w-full items-center justify-center text-4xl font-bold"
                            style={{
                              width: HEADER_POLAROID_IMG_W,
                              height: HEADER_POLAROID_IMG_H,
                              backgroundColor: POLAROID_NO_PHOTO_BG,
                              borderRadius: 1,
                              fontFamily: serif,
                              color: POLAROID_NO_PHOTO_INITIALS,
                            }}
                          >
                            {person ? initials(person) : "?"}
                          </div>
                        </button>
                      </RootsFramePortrait>
                    </div>
                  ) : (
                    <div
                      className="flex items-center justify-center text-4xl font-bold"
                      style={{
                        width: HEADER_POLAROID_IMG_W,
                        height: HEADER_POLAROID_IMG_H,
                        backgroundColor: POLAROID_NO_PHOTO_BG,
                        borderRadius: 1,
                        fontFamily: serif,
                        color: POLAROID_NO_PHOTO_INITIALS,
                      }}
                    >
                      {person ? initials(person) : "?"}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              [...headerProfilePhotoStackLayers]
                .map((layer, stackIndex) => ({ layer, stackIndex }))
                .map(({ layer, stackIndex }) => {
                  const key = headerPolaroidLayerKey(layer);
                  const { url, crop, naturalW, naturalH } =
                    headerPolaroidLayerVisual(layer);
                  const nat = polaroidNaturalByKey[key];
                  const nw =
                    nat?.w ??
                    (typeof naturalW === "number" && naturalW > 0
                      ? naturalW
                      : 0);
                  const nh =
                    nat?.h ??
                    (typeof naturalH === "number" && naturalH > 0
                      ? naturalH
                      : 0);
                  const stackStyle =
                    profileCanvasTheme.photoFrameStyle === "scrapbook" ||
                    profileCanvasTheme.photoFrameStyle === "oval"
                      ? { rot: 0, x: 0, y: 0 }
                      : HEADER_POLAROID_STACK_LAYERS[stackIndex] ??
                        HEADER_POLAROID_STACK_LAYERS[0];
                  /** Layer 0 is primary (front); higher indices sit underneath. */
                  const stackDepth =
                    headerProfilePhotoStackLayers.length - 1 - stackIndex;
                  const z = 12 + stackDepth * 10;
                  const nLayers = headerProfilePhotoStackLayers.length;
                  return (
                    <div
                      key={key}
                      className="absolute left-1/2 top-1/2"
                      style={{
                        zIndex: z,
                        transform: `translate(calc(-50% + ${stackStyle.x}px), calc(-50% + ${stackStyle.y}px)) rotate(${stackStyle.rot}deg)`,
                        transformOrigin: "center center",
                        overflow:
                          profileCanvasTheme.photoFrameStyle === "scrapbook" ||
                          profileCanvasTheme.photoFrameStyle === "oval"
                            ? "visible"
                            : undefined,
                      }}
                    >
                      <div
                        style={profileHeaderPhotoFrameLayerStyle(
                          profileCanvasTheme.photoFrameStyle,
                          theme === "dark",
                          stackIndex,
                          nLayers
                        )}
                      >
                        {profileCanvasTheme.photoFrameStyle === "scrapbook" ? (
                          <div
                            style={{
                              transform: `rotate(${scrapbookPhotoTiltDeg}deg)`,
                              transformOrigin: "center center",
                            }}
                          >
                            <div
                              style={{
                                position: "relative",
                                width: HEADER_POLAROID_IMG_W,
                                height: HEADER_POLAROID_IMG_H,
                              }}
                            >
                              <div
                                style={{
                                  position: "relative",
                                  zIndex: 0,
                                  width: "100%",
                                  height: "100%",
                                  isolation: "isolate",
                                }}
                              >
                                <div
                                  style={{
                                    position: "relative",
                                    zIndex: 1,
                                    width: HEADER_POLAROID_IMG_W,
                                    height: HEADER_POLAROID_IMG_H,
                                    padding: HEADER_SCRAPBOOK_PRINT_BORDER_PX,
                                    boxSizing: "border-box",
                                    backgroundColor: "#fff",
                                    borderRadius: 1,
                                    boxShadow: scrapbookPrintWrapperBoxShadow(
                                      theme === "dark"
                                    ),
                                    filter: scrapbookHeaderPhotoLiftFilter(
                                      theme === "dark"
                                    ),
                                  }}
                                >
                                  <div
                                    style={{
                                      position: "relative",
                                      width: "100%",
                                      height: "100%",
                                      overflow: "hidden",
                                      backgroundColor: url
                                        ? colors.avatarBg
                                        : POLAROID_NO_PHOTO_BG,
                                      boxShadow: scrapbookPhotoInnerInsetShadow(
                                        theme === "dark"
                                      ),
                                    }}
                                  >
                                    {url ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img
                                        src={url}
                                        alt=""
                                        draggable={false}
                                        onLoad={(e) => {
                                          const el = e.currentTarget;
                                          setPolaroidNaturalByKey((prev) => ({
                                            ...prev,
                                            [key]: {
                                              w: el.naturalWidth,
                                              h: el.naturalHeight,
                                            },
                                          }));
                                        }}
                                        style={getProfileHeaderCroppedPhotoImgStyle(
                                          {
                                            naturalW: nw,
                                            naturalH: nh,
                                            crop,
                                            apertureW:
                                              HEADER_SCRAPBOOK_IMG_INNER_W,
                                            apertureH:
                                              HEADER_SCRAPBOOK_IMG_INNER_H,
                                            printFilter:
                                              theme === "dark"
                                                ? HEADER_POLAROID_PRINT_FILTER_DARK
                                                : HEADER_POLAROID_PRINT_FILTER_LIGHT,
                                          }
                                        )}
                                      />
                                    ) : (
                                      <div
                                        className="flex h-full w-full items-center justify-center text-4xl font-bold"
                                        style={{
                                          fontFamily: serif,
                                          color: POLAROID_NO_PHOTO_INITIALS,
                                        }}
                                      >
                                        {polaroidInitialsFromLayer(layer)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {profileCanvasTheme.id === CANVAS_THEME_ID.DEAD_GOSSIP ? (
                                <HeaderScrapbookTapeStrips />
                              ) : (
                                <HeaderScrapbookCornerTabs />
                              )}
                            </div>
                          </div>
                        ) : profileCanvasTheme.photoFrameStyle === "oval" ? (
                          <div style={HEADER_ROOTS_OVAL_LAYOUT_OFFSET_STYLE}>
                            <RootsFramePortrait isDark={theme === "dark"}>
                              <button
                                type="button"
                                className="box-border block h-full w-full border-none bg-transparent p-0"
                                style={{ cursor: "pointer", font: "inherit" }}
                                aria-label="Open photo gallery — manage photos, crop, tags, and primary"
                                onClick={openHeaderPortraitsGallery}
                              >
                                <div
                                  style={{
                                    position: "relative",
                                    width: HEADER_POLAROID_IMG_W,
                                    height: HEADER_POLAROID_IMG_H,
                                    overflow: "hidden",
                                    backgroundColor: url
                                      ? colors.avatarBg
                                      : POLAROID_NO_PHOTO_BG,
                                    borderRadius: 1,
                                  }}
                                >
                                  {url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={url}
                                      alt=""
                                      draggable={false}
                                      onLoad={(e) => {
                                        const el = e.currentTarget;
                                        setPolaroidNaturalByKey((prev) => ({
                                          ...prev,
                                          [key]: {
                                            w: el.naturalWidth,
                                            h: el.naturalHeight,
                                          },
                                        }));
                                      }}
                                      style={getProfileHeaderCroppedPhotoImgStyle(
                                        {
                                          naturalW: nw,
                                          naturalH: nh,
                                          crop,
                                          apertureW: HEADER_POLAROID_IMG_W,
                                          apertureH: HEADER_POLAROID_IMG_H,
                                          printFilter:
                                            theme === "dark"
                                              ? HEADER_POLAROID_PRINT_FILTER_DARK
                                              : HEADER_POLAROID_PRINT_FILTER_LIGHT,
                                        }
                                      )}
                                    />
                                  ) : (
                                    <div
                                      className="flex h-full w-full items-center justify-center text-4xl font-bold"
                                      style={{
                                        fontFamily: serif,
                                        color: POLAROID_NO_PHOTO_INITIALS,
                                      }}
                                    >
                                      {polaroidInitialsFromLayer(layer)}
                                    </div>
                                  )}
                                </div>
                              </button>
                            </RootsFramePortrait>
                          </div>
                        ) : (
                          <div
                            style={{
                              position: "relative",
                              width: HEADER_POLAROID_IMG_W,
                              height: HEADER_POLAROID_IMG_H,
                              overflow: "hidden",
                              backgroundColor: url
                                ? colors.avatarBg
                                : POLAROID_NO_PHOTO_BG,
                              borderRadius: 1,
                            }}
                          >
                            {url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={url}
                                alt=""
                                draggable={false}
                                onLoad={(e) => {
                                  const el = e.currentTarget;
                                  setPolaroidNaturalByKey((prev) => ({
                                    ...prev,
                                    [key]: {
                                      w: el.naturalWidth,
                                      h: el.naturalHeight,
                                    },
                                  }));
                                }}
                                style={getProfileHeaderCroppedPhotoImgStyle({
                                  naturalW: nw,
                                  naturalH: nh,
                                  crop,
                                  apertureW: HEADER_POLAROID_IMG_W,
                                  apertureH: HEADER_POLAROID_IMG_H,
                                  printFilter:
                                    theme === "dark"
                                      ? HEADER_POLAROID_PRINT_FILTER_DARK
                                      : HEADER_POLAROID_PRINT_FILTER_LIGHT,
                                })}
                              />
                            ) : (
                              <div
                                className="flex h-full w-full items-center justify-center text-4xl font-bold"
                                style={{
                                  fontFamily: serif,
                                  color: POLAROID_NO_PHOTO_INITIALS,
                                }}
                              >
                                {polaroidInitialsFromLayer(layer)}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
            )
            )}
          </div>
          <div className="min-w-0 w-full flex-1 self-start sm:self-center">
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0 text-left">
                <h1
                  className="text-3xl font-bold leading-tight sm:text-4xl sm:leading-[1.08]"
                  style={{
                    fontFamily: serif,
                    color: `color-mix(in srgb, var(--dg-brown-dark) 88%, var(--dg-brown-outline) 12%)`,
                  }}
                >
                  {personFullName || "—"}
                </h1>
                <div
                  className="mt-2.5 grid w-full max-w-md grid-cols-2 gap-x-10 gap-y-1 text-left sm:gap-x-14"
                  style={{ fontFamily: sans }}
                >
                  <div
                    className="text-[10px] font-semibold tracking-[0.12em] sm:text-[11px]"
                    style={{
                      color: `color-mix(in srgb, var(--dg-brown-dark) 55%, var(--dg-brown-muted) 45%)`,
                    }}
                  >
                    {profileCanvasTheme.bornLabel}
                  </div>
                  <div
                    className="text-[10px] font-semibold tracking-[0.12em] sm:text-[11px]"
                    style={{
                      color: `color-mix(in srgb, var(--dg-brown-dark) 55%, var(--dg-brown-muted) 45%)`,
                    }}
                  >
                    {profileCanvasTheme.diedLabel}
                  </div>
                  <div
                    className="text-base font-semibold tabular-nums leading-snug sm:text-lg"
                    style={{
                      color: `color-mix(in srgb, var(--dg-brown-dark) 82%, var(--dg-brown-outline) 18%)`,
                    }}
                  >
                    {personProfileYearFromDate(person.birth_date) ?? "—"}
                  </div>
                  <div
                    className="text-base font-semibold tabular-nums leading-snug sm:text-lg"
                    style={{
                      color: `color-mix(in srgb, var(--dg-brown-dark) 82%, var(--dg-brown-outline) 18%)`,
                    }}
                  >
                    {personProfileYearFromDate(person.death_date) ?? "—"}
                  </div>
                </div>
              </div>
              <div
                ref={headerActionsDropdownRef}
                className="relative z-[100] flex shrink-0 flex-col items-stretch gap-2 self-end sm:self-start sm:items-end"
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
          <div className="relative shrink-0">
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
              className="absolute right-0 top-full z-[100] mt-1"
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
            </div>
            <div
              className="mt-[25px] grid w-full max-w-[24rem] grid-cols-4 sm:max-w-[27.5rem] lg:max-w-[31rem]"
              style={{
                borderTop:
                  "1px solid color-mix(in srgb, var(--dg-brown-border) 28%, transparent)",
              }}
            >
              {heroStats.map((stat, idx) => (
                <div
                  key={stat.label}
                  className="flex min-w-0 flex-col items-center justify-center px-1.5 py-2 text-center sm:px-2 sm:py-2.5"
                  style={{
                    borderRight:
                      idx < heroStats.length - 1
                        ? "1px solid color-mix(in srgb, var(--dg-brown-border) 24%, transparent)"
                        : undefined,
                  }}
                >
                  <span
                    className="text-lg font-semibold leading-tight tabular-nums sm:text-xl"
                    style={{
                      fontFamily: serif,
                      color: colors.brownDark,
                    }}
                  >
                    {stat.value}
                  </span>
                  <span
                    className="mt-0.5 text-[9px] font-semibold tracking-[0.15em] sm:text-[9.5px]"
                    style={{
                      fontFamily: sans,
                      color: colors.brownMuted,
                    }}
                  >
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pb-8 pt-0 lg:px-8">
        <div id="section-details">
          <div className="grid gap-5 lg:grid-cols-[1fr_340px] lg:gap-7">
            <section>
              <div
                className="mb-6 flex items-center justify-between border-b pb-2"
                style={{ borderColor: colors.brownBorder }}
              >
                <h2
                  className="text-2xl font-bold"
                  style={{ fontFamily: serif, color: colors.brownDark }}
                >
                  {profileCanvasTheme.timelineHeader}
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
                  {profileCanvasTheme.newEventButton}
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
                <ul className="flex flex-col">
                  {timelineEvents.map((ev, timelineIndex) => {
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
                      const placesLine = clusterPlacesLine();
                      const notesOpen = expandedTimelineNotesKeys.has(ev.id);
                      const linkedSources = clusterLinkedSources(
                        mergeCluster,
                        eventSourcesByEventId,
                        recordsById,
                        signedDocUrls
                      );
                      const sourcesOpen =
                        expandedTimelineSourcesKeys.has(ev.id);
                      const eventPhotoCount =
                        eventPhotosByEventId.get(ev.id)?.length ?? 0;
                      const descLines =
                        clusterDescriptionLines(mergeCluster);
                      const listKey = ev.id;
                      const isEditing = editingEventId === ev.id;

                      return (
                        <li
                          key={listKey}
                          className="flex"
                          style={{
                            paddingTop: timelineIndex > 0 ? "2rem" : undefined,
                            borderTopWidth: timelineIndex > 0 ? 1 : undefined,
                            borderTopStyle:
                              timelineIndex > 0 ? "solid" : undefined,
                            borderTopColor:
                              timelineIndex > 0
                                ? colors.brownBorder
                                : undefined,
                          }}
                        >
                          <div
                            className="shrink-0"
                            style={{ width: 120, fontFamily: serif }}
                          >
                            <span
                              className="block text-[2rem] font-bold leading-[1.05] tracking-tight tabular-nums sm:text-[2.35rem]"
                              style={{ color: colors.brownDark }}
                            >
                              {eventTimelineYearDisplay(ev)}
                            </span>
                            <span
                              className="mt-2 block text-[11px] font-medium leading-snug sm:text-xs"
                              style={{
                                fontFamily: sans,
                                color: colors.brownMuted,
                              }}
                            >
                              {eventTimelineMonthDayLabel(ev)}
                            </span>
                            <span
                              className="mt-2.5 inline-block max-w-full rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize leading-snug tracking-wide"
                              style={{
                                fontFamily: sans,
                                ...timelineEventTypePillStyle(typ),
                                wordBreak: "break-word",
                              }}
                            >
                              {typ}
                            </span>
                          </div>
                          <div
                            className="mx-4 shrink-0 self-stretch sm:mx-5"
                            style={{
                              width: 1,
                              backgroundColor: colors.brownBorder,
                            }}
                            aria-hidden
                          />
                          <div className="min-w-0 flex-1">
                            <div className="group relative">
                              {!isEditing ? (
                                <>
                                  <div
                                    className="absolute right-0 top-0 z-20 flex items-center gap-1 opacity-100 md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100"
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
                                </>
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
                                    <PlaceInput
                                      value={eventEditDraft.event_place_display}
                                      onChange={(v) =>
                                        setEventEditDraft((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                event_place_display: v,
                                                event_place_id: null,
                                              }
                                            : null
                                        )
                                      }
                                      onPlaceSelect={(place) =>
                                        setEventEditDraft((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                event_place_display: place.display,
                                                event_place_id: place.id,
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
                                  <div className="mt-4 px-0.5 pb-3 pt-3">
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
                                            color: colors.brownMuted,
                                            fontWeight: 600,
                                            cursor: "pointer",
                                          }}
                                          aria-expanded={sourcesOpen}
                                        >
                                          {sourcesOpen
                                            ? "Hide receipts"
                                            : `Receipts (${linkedSources.length})`}
                                        </button>
                                      ) : null}
                                      {!sourcesOpen && eventPhotoCount > 0 ? (
                                        <span
                                          className="inline-flex items-center gap-1 text-[11px]"
                                          style={{
                                            fontFamily: sans,
                                            color: colors.brownMuted,
                                          }}
                                        >
                                          <IconPhoto className="h-3.5 w-3.5" />
                                          {eventPhotoCount}
                                        </span>
                                      ) : null}
                                      {sourcesOpen ? (
                                        <button
                                          type="button"
                                          title="View event photos"
                                          className="ml-auto inline-flex items-center gap-1 rounded border border-transparent p-0.5 hover:border-[color-mix(in_srgb,var(--dg-brown-border)_60%,transparent)] hover:bg-[var(--dg-parchment)]"
                                          style={{
                                            color: colors.brownMid,
                                            cursor: "pointer",
                                            backgroundColor: "transparent",
                                          }}
                                          onClick={() =>
                                            setEventPhotoGalleryEventId(ev.id)
                                          }
                                        >
                                          <IconPhoto />
                                          <span className="text-[10px] leading-none">
                                            {eventPhotoCount}
                                          </span>
                                        </button>
                                      ) : null}
                                      {linkedSources.length > 0 &&
                                      sourcesOpen &&
                                      !addingSourceEventId ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setAddingSourceEventId(ev.id);
                                            setPendingSourceMode("file");
                                            setPendingSourceFile(null);
                                            setPendingSourceName("");
                                            setPendingSourceUrl("");
                                          }}
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
                                          onClick={() => {
                                            setAddingSourceEventId(ev.id);
                                            setPendingSourceMode("file");
                                            setPendingSourceFile(null);
                                            setPendingSourceName("");
                                            setPendingSourceUrl("");
                                          }}
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
                                        <div className="mb-2 flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setPendingSourceMode("file")
                                            }
                                            className="rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                                            style={{
                                              fontFamily: sans,
                                              borderColor: colors.brownBorder,
                                              color:
                                                pendingSourceMode === "file"
                                                  ? colors.cream
                                                  : colors.brownDark,
                                              backgroundColor:
                                                pendingSourceMode === "file"
                                                  ? colors.brownMid
                                                  : "transparent",
                                            }}
                                          >
                                            File
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setPendingSourceMode("link")
                                            }
                                            className="rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                                            style={{
                                              fontFamily: sans,
                                              borderColor: colors.brownBorder,
                                              color:
                                                pendingSourceMode === "link"
                                                  ? colors.cream
                                                  : colors.brownDark,
                                              backgroundColor:
                                                pendingSourceMode === "link"
                                                  ? colors.brownMid
                                                  : "transparent",
                                            }}
                                          >
                                            Web link
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setAddingSourceEventId(null)
                                              setPendingSourceFile(null);
                                              setPendingSourceName("");
                                              setPendingSourceUrl("");
                                              setPendingSourceMode("file");
                                            }}
                                            className="text-xs"
                                            style={{
                                              fontFamily: sans,
                                              color: colors.brownMuted,
                                            }}
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                        {pendingSourceMode === "file" ? (
                                          <>
                                            <label
                                              className="cursor-pointer text-sm underline decoration-dotted underline-offset-2"
                                              style={{
                                                fontFamily: sans,
                                                color: colors.forest,
                                                fontWeight: 600,
                                              }}
                                            >
                                              {sourceUploading
                                                ? "Uploading..."
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
                                                    borderColor:
                                                      colors.brownBorder,
                                                  }}
                                                >
                                                  <option value="">
                                                    Select record type...
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
                                                      ? "Uploading..."
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
                                          </>
                                        ) : (
                                          <div className="mt-2 space-y-2">
                                            <input
                                              type="url"
                                              value={pendingSourceUrl}
                                              onChange={(e) =>
                                                setPendingSourceUrl(
                                                  e.target.value
                                                )
                                              }
                                              placeholder="https://..."
                                              className="w-full rounded-md border px-3 py-2 text-sm"
                                              style={{
                                                fontFamily: sans,
                                                backgroundColor:
                                                  "var(--dg-cream)",
                                                color: colors.brownDark,
                                                borderColor: colors.brownBorder,
                                              }}
                                            />
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
                                                Select record type...
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
                                                  void handleAddSourceLink(
                                                    ev.id,
                                                    pendingSourceUrl
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
                                                  ? "Saving..."
                                                  : "Save link"}
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setPendingSourceUrl("");
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
                                        )}
                                      </div>
                                    ) : null}
                                    {sourcesOpen && linkedSources.length > 0 ? (
                                      <ul className="mt-2.5 w-full space-y-1.5 pl-0.5">
                                        {linkedSources.map((src) => (
                                          <li key={src.id}>
                                            <div className="flex items-center gap-2">
                                              {src.url ? (
                                                <div className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
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
                                                  <span
                                                    className="rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                                                    style={{
                                                      fontFamily: sans,
                                                      borderColor: `${colors.brownBorder}88`,
                                                      color: colors.brownMuted,
                                                      backgroundColor:
                                                        src.kind === "web"
                                                          ? `${colors.forest}14`
                                                          : `${colors.brownBorder}14`,
                                                    }}
                                                  >
                                                    {src.kind === "web"
                                                      ? "Web link"
                                                      : "Document"}
                                                  </span>
                                                  {src.kind === "web" &&
                                                  src.host ? (
                                                    <span
                                                      className="text-xs italic"
                                                      style={{
                                                        fontFamily: sans,
                                                        color: colors.brownMuted,
                                                      }}
                                                    >
                                                      {src.host}
                                                    </span>
                                                  ) : null}
                                                </div>
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
                                      className="mt-8 flex flex-wrap items-center gap-2 border-t pt-4"
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
              )}
            </section>

            {/* Grid ties both columns to one row; negative margin lifts this column toward the profile name (h1) — tuned so the card top meets the name cap height, not above it */}
            <div className="flex w-full min-w-0 flex-row items-stretch gap-2 lg:z-10 lg:-mt-[9rem] lg:sticky lg:top-2 lg:self-start xl:-mt-[9.5rem]">
              <div
                className="relative flex min-h-0 min-w-0 flex-1 flex-col self-stretch overflow-hidden rounded-lg"
                style={{
                  border: `1px solid ${colors.brownBorder}`,
                }}
              >
                <aside className="relative z-0 flex min-h-0 flex-1 flex-col border-0 px-3 py-2 shadow-none sm:px-3">
                <h2
                  className="mb-3 whitespace-nowrap text-base font-bold leading-tight tracking-tight sm:text-lg lg:text-xl"
                  style={{ fontFamily: serif, color: colors.brownDark }}
                >
                  {profileCanvasTheme.familyPanelTitle}
                </h2>
              <div className="mb-2">
                <h3
                  className="mb-2 text-xs font-bold uppercase tracking-widest"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  Parents
                </h3>
                <ul className="m-0 list-none p-0">
                  <li
                    className="border-0 border-b border-solid last:border-b-0"
                    style={{ borderBottomColor: colors.brownBorder }}
                  >
                    {parentSlots.father ? (
                      <FamilyMemberCard
                        p={parentSlots.father}
                        crop_x={parentSlots.father.crop_x}
                        crop_y={parentSlots.father.crop_y}
                        crop_zoom={parentSlots.father.crop_zoom}
                        natural_width={parentSlots.father.natural_width}
                        natural_height={parentSlots.father.natural_height}
                        relationshipLabel="Father"
                        onEditRelationship={
                          relationshipMetaByPersonId[parentSlots.father.id]
                            ? () => {
                                const m =
                                  relationshipMetaByPersonId[
                                    parentSlots.father!.id
                                  ];
                                if (m) {
                                  setEditRelModal(m);
                                  setEditRelType(m.relationshipType);
                                  setEditRelError(null);
                                }
                              }
                            : undefined
                        }
                      />
                    ) : (
                      <UnknownParentSlot
                        roleLabel="Father"
                        disabled={effectiveTreeIdForFamily === ""}
                        onAdd={() =>
                          openAddFamilyModal({
                            relationship: "parent",
                            createGenderDefault: "male",
                          })
                        }
                      />
                    )}
                  </li>
                  <li
                    className="border-0 border-b border-solid last:border-b-0"
                    style={{ borderBottomColor: colors.brownBorder }}
                  >
                    {parentSlots.mother ? (
                      <FamilyMemberCard
                        p={parentSlots.mother}
                        crop_x={parentSlots.mother.crop_x}
                        crop_y={parentSlots.mother.crop_y}
                        crop_zoom={parentSlots.mother.crop_zoom}
                        natural_width={parentSlots.mother.natural_width}
                        natural_height={parentSlots.mother.natural_height}
                        relationshipLabel="Mother"
                        onEditRelationship={
                          relationshipMetaByPersonId[parentSlots.mother.id]
                            ? () => {
                                const m =
                                  relationshipMetaByPersonId[
                                    parentSlots.mother!.id
                                  ];
                                if (m) {
                                  setEditRelModal(m);
                                  setEditRelType(m.relationshipType);
                                  setEditRelError(null);
                                }
                              }
                            : undefined
                        }
                      />
                    ) : (
                      <UnknownParentSlot
                        roleLabel="Mother"
                        disabled={effectiveTreeIdForFamily === ""}
                        onAdd={() =>
                          openAddFamilyModal({
                            relationship: "parent",
                            createGenderDefault: "female",
                          })
                        }
                      />
                    )}
                  </li>
                  {parentSlots.overflow.map((p) => (
                    <li
                      key={p.id}
                      className="border-0 border-b border-solid last:border-b-0"
                      style={{ borderBottomColor: colors.brownBorder }}
                    >
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
                            relationshipLabel={relationshipUiLabelForProfile(
                              relMeta?.relationshipType ?? "parent",
                              p
                            )}
                            onEditRelationship={
                              relMeta
                                ? () => {
                                    setEditRelModal(relMeta);
                                    setEditRelType(relMeta.relationshipType);
                                    setEditRelError(null);
                                  }
                                : undefined
                            }
                          />
                        );
                      })()}
                    </li>
                  ))}
                </ul>
                {family.siblings.length > 0 ? (
                  <div
                    className="mt-2 border-t pt-2"
                    style={{ borderTopColor: colors.brownBorder }}
                  >
                    <CollapsibleFamilyGroup
                      title="Siblings"
                      members={family.siblings}
                      relationshipMetaByPersonId={relationshipMetaByPersonId}
                      defaultExpanded={false}
                      containerClassName="mb-0"
                      onEditRelationship={(meta) => {
                        setEditRelModal(meta);
                        setEditRelType(meta.relationshipType);
                        setEditRelError(null);
                      }}
                    />
                  </div>
                ) : null}
              </div>
              {family.spouseWithChildrenGroups.map((group, idx) => (
                <SpouseWithChildrenCollapsible
                  key={group.spouse.id}
                  spouse={group.spouse}
                  children={group.children}
                  marriageYear={marriageYearBySpouseId.get(group.spouse.id) ?? null}
                  relationshipMetaByPersonId={relationshipMetaByPersonId}
                  onAddChildWithSpouse={(spouse) =>
                    openAddFamilyModal({
                      relationship: "child",
                      coParentId: spouse.id,
                    })
                  }
                  defaultExpanded={idx === 0}
                  onEditRelationship={(meta) => {
                    setEditRelModal(meta);
                    setEditRelType(meta.relationshipType);
                    setEditRelError(null);
                  }}
                />
              ))}
              {family.otherChildren.length > 0 ? (
                <CollapsibleFamilyGroup
                  title="Other children"
                  members={family.otherChildren}
                  relationshipMetaByPersonId={relationshipMetaByPersonId}
                  defaultRelationshipType="child"
                  defaultExpanded={family.spouseWithChildrenGroups.length === 0}
                  onEditRelationship={(meta) => {
                    setEditRelModal(meta);
                    setEditRelType(meta.relationshipType);
                    setEditRelError(null);
                  }}
                />
              ) : null}
              <div
                className="mt-auto border-t pt-3"
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

                <div
                  id="person-desk-file-panel"
                  className="absolute inset-0 z-[30] flex min-h-full min-w-0 flex-col overflow-hidden rounded-xl transition-[transform] duration-[250ms] ease-out"
                  style={{
                    backgroundColor: colors.parchment,
                    backgroundImage:
                      "repeating-linear-gradient(to bottom, transparent 0, transparent 26px, color-mix(in srgb, var(--dg-brown-border) 26%, transparent) 26px, color-mix(in srgb, var(--dg-brown-border) 26%, transparent) 27px)",
                    boxShadow: "0 4px 18px rgb(var(--dg-shadow-rgb) / 0.08)",
                    transform:
                      deskPanelOpen === "file" || deskPanelOpen === "occupation"
                        ? "translateX(0)"
                        : "translateX(100%)",
                    pointerEvents:
                      deskPanelOpen === "file" || deskPanelOpen === "occupation"
                        ? "auto"
                        : "none",
                  }}
                  role="dialog"
                  {...(deskPanelOpen === "file" || deskPanelOpen === "occupation"
                    ? { "aria-modal": true }
                    : {})}
                  aria-hidden={
                    deskPanelOpen !== "file" && deskPanelOpen !== "occupation"
                  }
                  aria-labelledby="person-desk-file-title"
                >
                  <div className="flex shrink-0 items-center gap-2 px-2 pb-1 pt-2 sm:px-3 sm:pt-2.5">
                    <button
                      type="button"
                      className="flex min-h-[2.75rem] min-w-[2.75rem] shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-xl leading-none opacity-75 transition hover:opacity-100"
                      style={{
                        fontFamily: sans,
                        color: colors.brownMuted,
                        cursor: "pointer",
                      }}
                      aria-label="Close Vitals"
                      title="Close"
                      onClick={() => setDeskPanelOpen("none")}
                    >
                      ×
                    </button>
                    <p
                      id="person-desk-file-title"
                      className="min-w-0 flex-1 text-left text-xs font-bold uppercase tracking-[0.12em]"
                      style={{ fontFamily: sans, color: colors.brownMid }}
                    >
                      Vitals
                    </p>
                    <button
                      ref={occupationToggleRef}
                      type="button"
                      className="flex min-h-[2.75rem] min-w-[2.75rem] shrink-0 items-center justify-center rounded-md border-0 bg-transparent opacity-75 transition hover:opacity-100"
                      style={{
                        fontFamily: sans,
                        color:
                          deskPanelOpen === "occupation"
                            ? colors.forest
                            : colors.brownMuted,
                        cursor: "pointer",
                      }}
                      aria-label="Open occupation history"
                      title="Occupation history"
                      aria-expanded={deskPanelOpen === "occupation"}
                      aria-controls="person-vitals-occupation-panel"
                      onClick={() =>
                        setDeskPanelOpen((curr) =>
                          curr === "occupation" ? "none" : "occupation"
                        )
                      }
                    >
                      <IconBriefcase className="shrink-0" />
                    </button>
                    <button
                      type="button"
                      className="flex min-h-[2.75rem] min-w-[2.75rem] shrink-0 items-center justify-center rounded-md border-0 bg-transparent opacity-75 transition hover:opacity-100"
                      style={{
                        fontFamily: sans,
                        color: colors.brownMuted,
                        cursor: "pointer",
                      }}
                      aria-label="Edit person — vitals are saved from Edit person"
                      title="Edit vitals (opens Edit person)"
                      onClick={() => {
                        setDeskPanelOpen("none");
                        openEditPersonModal();
                      }}
                    >
                      <IconPencil className="shrink-0" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-1">
                    {fileChips.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {fileChips.map(({ label, value }) => (
                          <div
                            key={label}
                            className="inline-flex min-w-0 max-w-full flex-col gap-0.5 rounded-md px-2.5 py-1.5"
                            style={{ backgroundColor: colors.cream }}
                          >
                            <span
                              className="font-medium uppercase tracking-wide"
                              style={{
                                fontFamily: sans,
                                fontSize: 10,
                                letterSpacing: "0.06em",
                                color: colors.brownMuted,
                              }}
                            >
                              {label}
                            </span>
                            <span
                              className="break-words text-sm leading-snug"
                              style={{
                                fontFamily: serif,
                                color: colors.brownDark,
                              }}
                            >
                              {value}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p
                        className="text-sm italic"
                        style={{ fontFamily: sans, color: colors.brownMuted }}
                      >
                        Nothing on file yet.
                      </p>
                    )}
                  </div>
                  {deskPanelOpen === "occupation" ? (
                    <div
                      className="absolute inset-0 z-[35] flex items-start justify-end bg-[rgb(var(--dg-shadow-rgb)/0.14)] p-2 sm:p-3"
                      role="presentation"
                    >
                      <div
                        id="person-vitals-occupation-panel"
                        ref={occupationPanelRef}
                        className="flex max-h-full w-full max-w-[28rem] flex-col overflow-hidden rounded-lg border"
                        style={{
                          borderColor: colors.brownBorder,
                          backgroundColor: colors.parchment,
                          boxShadow: "0 10px 26px rgb(var(--dg-shadow-rgb) / 0.15)",
                        }}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Occupation history"
                      >
                        <div
                          className="flex items-center justify-between border-b px-3 py-2"
                          style={{ borderColor: `${colors.brownBorder}88` }}
                        >
                          <p
                            className="text-xs font-bold uppercase tracking-[0.12em]"
                            style={{ fontFamily: sans, color: colors.brownMid }}
                          >
                            Occupation History
                          </p>
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-[11px] font-bold uppercase tracking-wide"
                            style={{
                              fontFamily: sans,
                              borderColor: colors.brownBorder,
                              color: colors.forest,
                              backgroundColor: "transparent",
                            }}
                            onClick={() => {
                              setAddingOccupation((v) => !v);
                              setOccupationError(null);
                            }}
                          >
                            {addingOccupation ? "Cancel" : "Add"}
                          </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                          {occupationLoading ? (
                            <p
                              className="text-sm italic"
                              style={{ fontFamily: sans, color: colors.brownMuted }}
                            >
                              Loading occupations...
                            </p>
                          ) : null}
                          {addingOccupation ? (
                            <div
                              className="mb-2 rounded-md border p-2"
                              style={{
                                borderColor: `${colors.brownBorder}88`,
                                backgroundColor: colors.cream,
                              }}
                            >
                              <input
                                value={occupationAddDraft.job_title}
                                onChange={(e) =>
                                  setOccupationAddDraft((d) => ({
                                    ...d,
                                    job_title: e.target.value,
                                  }))
                                }
                                placeholder="Job title"
                                className="mb-1.5 w-full rounded border px-2 py-1.5 text-sm"
                                style={{
                                  fontFamily: sans,
                                  borderColor: colors.brownBorder,
                                  backgroundColor: colors.parchment,
                                  color: colors.brownDark,
                                }}
                              />
                              <input
                                value={occupationAddDraft.year_observed}
                                onChange={(e) =>
                                  setOccupationAddDraft((d) => ({
                                    ...d,
                                    year_observed: e.target.value,
                                  }))
                                }
                                placeholder="Year observed (optional)"
                                inputMode="numeric"
                                maxLength={4}
                                className="w-full rounded border px-2 py-1.5 text-sm"
                                style={{
                                  fontFamily: sans,
                                  borderColor: colors.brownBorder,
                                  backgroundColor: colors.parchment,
                                  color: colors.brownDark,
                                }}
                              />
                              <div className="mt-2 flex justify-end gap-2">
                                <button
                                  type="button"
                                  className="rounded border px-2 py-1 text-xs font-bold uppercase tracking-wide"
                                  style={{
                                    fontFamily: sans,
                                    borderColor: colors.brownBorder,
                                    color: colors.brownMuted,
                                    backgroundColor: "transparent",
                                  }}
                                  onClick={() => setAddingOccupation(false)}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={occupationSaving}
                                  className="rounded border px-2 py-1 text-xs font-bold uppercase tracking-wide"
                                  style={{
                                    fontFamily: sans,
                                    borderColor: colors.forest,
                                    color: colors.forest,
                                    backgroundColor: "transparent",
                                  }}
                                  onClick={() => void saveNewOccupation()}
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : null}
                          {occupations.length === 0 && !occupationLoading ? (
                            <p
                              className="text-sm italic"
                              style={{ fontFamily: sans, color: colors.brownMuted }}
                            >
                              No occupation entries yet.
                            </p>
                          ) : (
                            <ul className="m-0 list-none p-0">
                              {occupations.map((row) => {
                                const yearText =
                                  row.year_observed == null ? "—" : String(row.year_observed);
                                const linkedRecordId = occupationLinkedRecordId(row);
                                const linkedRecord = linkedRecordId
                                  ? recordsById.get(linkedRecordId) ?? null
                                  : null;
                                const linkedHrefFromRecord = linkedRecord
                                  ? resolveRecordHref(linkedRecord, signedDocUrls)
                                  : null;
                                const linkedHref =
                                  linkedHrefFromRecord ??
                                  (linkedRecordId ? `/review/${linkedRecordId}` : null);
                                const isEditing = editingOccupationId === row.id;
                                return (
                                  <li
                                    key={row.id}
                                    className="border-0 border-b border-solid py-1.5"
                                    style={{ borderBottomColor: `${colors.brownBorder}88` }}
                                  >
                                    {isEditing ? (
                                      <div
                                        className="rounded-md p-2"
                                        style={{ backgroundColor: colors.cream }}
                                      >
                                        <input
                                          value={occupationEditDraft?.job_title ?? ""}
                                          onChange={(e) =>
                                            setOccupationEditDraft((d) =>
                                              d
                                                ? { ...d, job_title: e.target.value }
                                                : { job_title: e.target.value, year_observed: "" }
                                            )
                                          }
                                          className="mb-1.5 w-full rounded border px-2 py-1.5 text-sm"
                                          style={{
                                            fontFamily: sans,
                                            borderColor: colors.brownBorder,
                                            backgroundColor: colors.parchment,
                                            color: colors.brownDark,
                                          }}
                                        />
                                        <input
                                          value={occupationEditDraft?.year_observed ?? ""}
                                          onChange={(e) =>
                                            setOccupationEditDraft((d) =>
                                              d
                                                ? { ...d, year_observed: e.target.value }
                                                : { job_title: "", year_observed: e.target.value }
                                            )
                                          }
                                          inputMode="numeric"
                                          maxLength={4}
                                          className="w-full rounded border px-2 py-1.5 text-sm"
                                          style={{
                                            fontFamily: sans,
                                            borderColor: colors.brownBorder,
                                            backgroundColor: colors.parchment,
                                            color: colors.brownDark,
                                          }}
                                        />
                                        <div className="mt-2 flex items-center justify-end gap-2">
                                          <button
                                            type="button"
                                            className="rounded border px-2 py-1 text-xs font-bold uppercase tracking-wide"
                                            style={{
                                              fontFamily: sans,
                                              borderColor: colors.brownBorder,
                                              color: colors.brownMuted,
                                            }}
                                            onClick={() => {
                                              setEditingOccupationId(null);
                                              setOccupationEditDraft(null);
                                            }}
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            type="button"
                                            disabled={occupationSaving}
                                            className="rounded border px-2 py-1 text-xs font-bold uppercase tracking-wide"
                                            style={{
                                              fontFamily: sans,
                                              borderColor: colors.forest,
                                              color: colors.forest,
                                            }}
                                            onClick={() => void saveEditedOccupation(row)}
                                          >
                                            Save
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div
                                        className="flex w-full cursor-pointer items-center gap-2"
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => {
                                          setEditingOccupationId(row.id);
                                          setOccupationEditDraft({
                                            job_title: (row.job_title ?? "").trim(),
                                            year_observed:
                                              row.year_observed == null
                                                ? ""
                                                : String(row.year_observed),
                                          });
                                          setOccupationError(null);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setEditingOccupationId(row.id);
                                            setOccupationEditDraft({
                                              job_title: (row.job_title ?? "").trim(),
                                              year_observed:
                                                row.year_observed == null
                                                  ? ""
                                                  : String(row.year_observed),
                                            });
                                            setOccupationError(null);
                                          }
                                        }}
                                      >
                                        <span
                                          className="min-w-0 flex-1 truncate text-sm"
                                          style={{ fontFamily: serif, color: colors.brownDark }}
                                        >
                                          {row.job_title?.trim() || "Untitled occupation"}
                                        </span>
                                        <span
                                          className="text-xs"
                                          style={{ fontFamily: sans, color: colors.brownMuted }}
                                        >
                                          {yearText}
                                        </span>
                                        {linkedHref ? (
                                          <a
                                            href={linkedHref}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex h-6 w-6 items-center justify-center rounded border"
                                            style={{
                                              borderColor: `${colors.brownBorder}88`,
                                              color: colors.brownMuted,
                                            }}
                                            title="Open linked document"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <IconDocument className="h-3.5 w-3.5" />
                                          </a>
                                        ) : null}
                                        <button
                                          type="button"
                                          className="inline-flex h-6 w-6 items-center justify-center rounded border"
                                          style={{
                                            borderColor: `${colors.brownBorder}88`,
                                            color: "var(--dg-danger)",
                                            backgroundColor: "transparent",
                                          }}
                                          title="Delete occupation"
                                          disabled={occupationDeletingId === row.id}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void deleteOccupation(row);
                                          }}
                                        >
                                          <IconTrash className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div
                  id="person-desk-receipts-panel"
                  className="absolute inset-0 z-[30] flex min-h-full min-w-0 flex-col overflow-hidden rounded-xl transition-[transform] duration-[250ms] ease-out"
                  style={{
                    backgroundColor: colors.parchment,
                    backgroundImage:
                      "repeating-linear-gradient(to bottom, transparent 0, transparent 26px, color-mix(in srgb, var(--dg-brown-border) 26%, transparent) 26px, color-mix(in srgb, var(--dg-brown-border) 26%, transparent) 27px)",
                    boxShadow: "0 4px 18px rgb(var(--dg-shadow-rgb) / 0.08)",
                    transform:
                      deskPanelOpen === "receipts"
                        ? "translateX(0)"
                        : "translateX(100%)",
                    pointerEvents:
                      deskPanelOpen === "receipts" ? "auto" : "none",
                  }}
                  role="dialog"
                  {...(deskPanelOpen === "receipts"
                    ? { "aria-modal": true }
                    : {})}
                  aria-hidden={deskPanelOpen !== "receipts"}
                  aria-labelledby="person-desk-receipts-title"
                >
                  <div className="flex shrink-0 justify-start px-2 pb-1 pt-2 sm:px-3 sm:pt-2.5">
                    <button
                      type="button"
                      className="flex min-h-[2.75rem] min-w-[2.75rem] shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-xl leading-none opacity-75 transition hover:opacity-100"
                      style={{
                        fontFamily: sans,
                        color: colors.brownMuted,
                        cursor: "pointer",
                      }}
                      aria-label="Close Receipts"
                      title="Close"
                      onClick={() => setDeskPanelOpen("none")}
                    >
                      ×
                    </button>
                    <span id="person-desk-receipts-title" className="sr-only">
                      Receipts
                    </span>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-1">
                    <div
                      className="rounded-lg border px-4 py-4 sm:px-5 sm:py-5"
                      style={{
                        backgroundColor: colors.cream,
                        borderColor: colors.brownBorder,
                        boxShadow:
                          "inset 0 2px 6px rgb(var(--dg-shadow-rgb) / 0.06), 0 6px 20px rgb(var(--dg-shadow-rgb) / 0.08)",
                      }}
                    >
                      <h3
                        className="mb-4 text-xl font-bold"
                        style={{ fontFamily: serif, color: colors.brownDark }}
                      >
                        Receipts
                      </h3>
                      {documentRecords.length === 0 ? (
                        <p
                          className="text-sm italic"
                          style={{
                            fontFamily: sans,
                            color: colors.brownMuted,
                          }}
                        >
                          No documents linked through events yet.
                        </p>
                      ) : (
                        <ul
                          className="m-0 list-none border-t p-0"
                          style={{ borderColor: `${colors.brownBorder}88` }}
                        >
                          {documentRecords.map((item) => {
                            const rec = item.record;
                            const href = resolveRecordHref(rec, signedDocUrls);
                            const label = recordTypeLabel(rec);
                            const kind: "web" | "document" = isWebRecord(rec)
                              ? "web"
                              : "document";
                            const host = sourceHostLabel(href);
                            return (
                              <li
                                key={rec.id}
                                className="border-b py-3"
                                style={{ borderColor: `${colors.brownBorder}88` }}
                              >
                                {href ? (
                                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
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
                                    <span
                                      className="rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                                      style={{
                                        fontFamily: sans,
                                        borderColor: `${colors.brownBorder}88`,
                                        color: colors.brownMuted,
                                        backgroundColor:
                                          kind === "web"
                                            ? `${colors.forest}14`
                                            : `${colors.brownBorder}14`,
                                      }}
                                    >
                                      {kind === "web" ? "Web link" : "Document"}
                                    </span>
                                    {kind === "web" && host ? (
                                      <span
                                        className="text-xs italic"
                                        style={{
                                          fontFamily: sans,
                                          color: colors.brownMuted,
                                        }}
                                      >
                                        {host}
                                      </span>
                                    ) : null}
                                  </div>
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
                                  className="mt-1 text-xs italic"
                                  style={{
                                    fontFamily: sans,
                                    color: colors.brownMuted,
                                  }}
                                >
                                  Event date {item.eventDateLabel}
                                </p>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>

                <div
                id="person-margin-notes-panel"
                className="absolute inset-0 z-[30] flex min-h-full min-w-0 flex-col overflow-hidden rounded-xl transition-[transform] duration-[250ms] ease-out"
                style={{
                  backgroundColor: colors.parchment,
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, transparent 0, transparent 26px, color-mix(in srgb, var(--dg-brown-border) 26%, transparent) 26px, color-mix(in srgb, var(--dg-brown-border) 26%, transparent) 27px)",
                  boxShadow: "0 4px 18px rgb(var(--dg-shadow-rgb) / 0.08)",
                  transform:
                    deskPanelOpen === "margin"
                      ? "translateX(0)"
                      : "translateX(100%)",
                  pointerEvents: deskPanelOpen === "margin" ? "auto" : "none",
                }}
                role="dialog"
                {...(deskPanelOpen === "margin" ? { "aria-modal": true } : {})}
                aria-hidden={deskPanelOpen !== "margin"}
                aria-labelledby="person-margin-notes-title"
              >
                <div className="flex shrink-0 justify-start px-2 pb-1 pt-2 sm:px-3 sm:pt-2.5">
                  <button
                    type="button"
                    className="flex min-h-[2.75rem] min-w-[2.75rem] shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-xl leading-none opacity-75 transition hover:opacity-100"
                    style={{
                      fontFamily: sans,
                      color: colors.brownMuted,
                      cursor: "pointer",
                    }}
                    aria-label="Close The Margin"
                    title="Close"
                    onClick={() => setDeskPanelOpen("none")}
                  >
                    ×
                  </button>
                  <span id="person-margin-notes-title" className="sr-only">
                    The Margin — research notes
                  </span>
                </div>
                <textarea
                  value={researchNoteText}
                  onChange={(e) => setResearchNoteText(e.target.value)}
                  placeholder="Your research notes, theories, brick walls, leads to follow up..."
                  className="min-h-0 w-full flex-1 resize-none border-0 px-3 py-2 leading-relaxed focus-visible:outline-none"
                  style={{
                    fontFamily: serif,
                    fontSize: "1.0625rem",
                    color: colors.brownDark,
                    backgroundColor: "transparent",
                    boxSizing: "border-box",
                  }}
                  aria-label="The Margin research notes"
                />
                <div
                  className="flex shrink-0 flex-col gap-2 border-t px-3 py-3"
                  style={{ borderColor: `${colors.brownBorder}66` }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={researchNoteSaving}
                      onClick={() => void saveResearchNotes()}
                      style={{
                        fontFamily: sans,
                        backgroundColor: colors.brownOutline,
                        color: colors.cream,
                        border: "none",
                        padding: "0.45rem 1rem",
                        fontSize: "0.8125rem",
                        fontWeight: 700,
                        cursor: researchNoteSaving ? "wait" : "pointer",
                        opacity: researchNoteSaving ? 0.75 : 1,
                        borderRadius: 2,
                        boxShadow: "none",
                      }}
                    >
                      Save
                    </button>
                    {researchNoteSavedFlash ? (
                      <span
                        className="text-xs"
                        style={{ fontFamily: sans, color: colors.forest }}
                      >
                        Saved
                      </span>
                    ) : null}
                  </div>
                  {researchNoteSaveError ? (
                    <p
                      className="text-xs leading-snug"
                      style={{
                        fontFamily: sans,
                        color: "var(--dg-danger)",
                      }}
                    >
                      {researchNoteSaveError}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
              <div className="flex w-12 shrink-0 flex-col gap-2 self-start">
                {(
                  [
                    {
                      panel: "margin" as const,
                      label: "Margin",
                      controlsId: "person-margin-notes-panel",
                      idleBg: MARGIN_DESK_TAB_IDLE_BG,
                      idleText: colors.brownMuted,
                    },
                    {
                      panel: "file" as const,
                      label: "Vitals",
                      controlsId: "person-desk-file-panel",
                      idleBg:
                        "color-mix(in srgb, var(--dg-cream) 58%, var(--dg-parchment) 42%)",
                      idleText: colors.brownMid,
                    },
                    {
                      panel: "receipts" as const,
                      label: "Receipts",
                      controlsId: "person-desk-receipts-panel",
                      idleBg: RECEIPTS_TAB_IDLE_BG,
                      idleText: colors.brownDark,
                    },
                  ] as const
                ).map((t) => {
                  const open = deskPanelOpen === t.panel;
                  return (
                    <button
                      key={t.panel}
                      type="button"
                      className="relative flex h-[6.25rem] w-full min-w-0 shrink-0 cursor-pointer flex-col items-center justify-center rounded-r-lg border-2 py-2 pl-1.5 pr-2 shadow-md sm:h-28"
                      style={{
                        backgroundColor: open ? colors.cream : t.idleBg,
                        borderColor: open
                          ? colors.brownOutline
                          : colors.brownBorder,
                        boxShadow: open
                          ? "0 2px 14px rgb(var(--dg-shadow-rgb) / 0.12), inset 0 1px 0 var(--dg-inset-highlight)"
                          : "0 2px 8px rgb(var(--dg-shadow-rgb) / 0.05)",
                      }}
                      aria-expanded={open}
                      aria-controls={t.controlsId}
                      title={t.label}
                      onClick={() =>
                        setDeskPanelOpen((c) =>
                          c === t.panel ? "none" : t.panel
                        )
                      }
                    >
                      <span
                        className="max-h-full px-0.5 text-center text-[10px] font-semibold uppercase tracking-[0.16em] sm:text-[11px]"
                        style={{
                          fontFamily: sans,
                          writingMode: "vertical-rl",
                          transform: "rotate(180deg)",
                          textOrientation: "mixed",
                          color: open ? colors.brownDark : t.idleText,
                          lineHeight: 1.35,
                        }}
                      >
                        {t.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {portraitsGalleryOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="portraits-gallery-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPortraitsGalleryOpen(false);
          }}
        >
          <div
            className="my-4 w-full max-w-3xl rounded-lg border p-6 shadow-xl"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-start justify-between gap-3">
              <h2
                id="portraits-gallery-title"
                className="text-2xl font-bold"
                style={{ fontFamily: serif, color: colors.brownDark }}
              >
                Portraits
              </h2>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-0 text-2xl leading-none opacity-80 transition hover:opacity-100"
                style={{
                  fontFamily: sans,
                  color: colors.brownMuted,
                  cursor: "pointer",
                  backgroundColor: "transparent",
                }}
                aria-label="Close portraits"
                onClick={() => setPortraitsGalleryOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <input
                id="person-profile-photo-upload-gallery"
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
                htmlFor="person-profile-photo-upload-gallery"
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
                  const caption =
                    typeof row.caption === "string" ? row.caption.trim() : "";
                  const yearLabel = photoYearLabel(row.photo_date);
                  if (!url) return null;
                  const thumbCrop = personPhotoCropForRow(row);
                  const openCropModal = () => {
                    void openPhotoSetupForExisting(row);
                  };
                  const openPreviewModal = () => {
                    setPhotoPreviewModal(row);
                  };
                  return (
                    <li key={pid} className="w-40">
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
                            aria-label="Open photo preview"
                            onClick={openPreviewModal}
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
                            className="absolute right-2 top-2 z-[7] flex gap-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                            style={{
                              pointerEvents: "none",
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
                              title="Edit photo"
                              aria-label="Edit photo"
                              onClick={(e) => {
                                e.stopPropagation();
                                openCropModal();
                              }}
                            >
                              <IconPencil />
                            </button>
                            {!isPrimary ? (
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
                            ) : null}
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
                        {caption ? (
                          <div
                            className="pointer-events-none absolute inset-x-0 bottom-0 z-[6] px-2 pb-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                            aria-hidden
                            style={{
                              background:
                                "linear-gradient(to top, color-mix(in srgb, var(--dg-photo-scrim) 84%, transparent), transparent)",
                            }}
                          >
                            <p
                              className="line-clamp-2 text-xs leading-snug"
                              style={{
                                fontFamily: sans,
                                color: "#ffffff",
                                backgroundColor: "rgb(20 16 12 / 0.78)",
                                borderRadius: 6,
                                padding: "0.3rem 0.45rem",
                                boxShadow: "0 2px 8px rgb(var(--dg-shadow-rgb) / 0.35)",
                              }}
                            >
                              {caption}
                            </p>
                          </div>
                        ) : null}
                      </div>
                      <p
                        className="mt-1.5 text-[11px]"
                        style={{ fontFamily: sans, color: colors.brownMuted }}
                      >
                        {yearLabel}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {eventPhotoGalleryEventId ? (
        <div
          className="fixed inset-0 z-[220] overflow-y-auto"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-photo-gallery-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEventPhotoGalleryEventId(null);
          }}
        >
          <div
            className="mx-auto my-8 w-full max-w-5xl rounded-lg border p-6 shadow-xl"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const ev = events.find((row) => row.id === eventPhotoGalleryEventId) ?? null;
              const eventPhotos =
                eventPhotosByEventId.get(eventPhotoGalleryEventId) ?? [];
              return (
                <>
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <h2
                        id="event-photo-gallery-title"
                        className="text-2xl font-bold"
                        style={{ fontFamily: serif, color: colors.brownDark }}
                      >
                        Event Photos
                      </h2>
                      {ev ? (
                        <p
                          className="mt-1 text-sm"
                          style={{ fontFamily: sans, color: colors.brownMuted }}
                        >
                          {(ev.event_type || "Event").trim()} - {eventDateLabel(ev)}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="text-2xl leading-none"
                      style={{
                        fontFamily: sans,
                        color: colors.brownMuted,
                        cursor: "pointer",
                        backgroundColor: "transparent",
                      }}
                      aria-label="Close event photos"
                      onClick={() => setEventPhotoGalleryEventId(null)}
                    >
                      ×
                    </button>
                  </div>
                  {eventPhotos.length === 0 ? (
                    <p
                      className="text-sm italic"
                      style={{ fontFamily: sans, color: colors.brownMuted }}
                    >
                      No photos are tagged to this event yet.
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-4">
                      {eventPhotos.map((row, i) => {
                        const url = photoUrlFromRow(row);
                        if (!url) return null;
                        const key =
                          typeof row.id === "string" ? row.id : `event-photo-${i}`;
                        const caption =
                          typeof row.caption === "string" ? row.caption.trim() : "";
                        const yearLabel = photoYearLabel(row.photo_date);
                        return (
                          <li key={key} className="w-40">
                            <div
                              className="group relative h-40 w-40 overflow-hidden rounded-lg border shadow-sm"
                              style={{
                                borderColor: colors.brownBorder,
                                backgroundColor: colors.parchment,
                              }}
                            >
                              <button
                                type="button"
                                className="block h-full w-full border-none p-0"
                                style={{ backgroundColor: "transparent", cursor: "zoom-in" }}
                                aria-label="Open photo preview"
                                onClick={() => setPhotoPreviewModal(row)}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={url}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              </button>
                              {caption ? (
                                <div
                                  className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] px-2 pb-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                                  aria-hidden
                                  style={{
                                    background:
                                      "linear-gradient(to top, color-mix(in srgb, var(--dg-photo-scrim) 84%, transparent), transparent)",
                                  }}
                                >
                                  <p
                                    className="line-clamp-2 text-xs leading-snug"
                                    style={{
                                      fontFamily: sans,
                                      color: "#ffffff",
                                      backgroundColor: "rgb(20 16 12 / 0.78)",
                                      borderRadius: 6,
                                      padding: "0.3rem 0.45rem",
                                      boxShadow:
                                        "0 2px 8px rgb(var(--dg-shadow-rgb) / 0.35)",
                                    }}
                                  >
                                    {caption}
                                  </p>
                                </div>
                              ) : null}
                            </div>
                            <p
                              className="mt-1.5 text-[11px]"
                              style={{ fontFamily: sans, color: colors.brownMuted }}
                            >
                              {yearLabel}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

      {photoPreviewModal ? (
        <div
          className="fixed inset-0 z-[230] flex items-center justify-center overflow-y-auto p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="photo-preview-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPhotoPreviewModal(null);
          }}
        >
          <div
            className="my-4 w-full max-w-5xl rounded-lg border p-4 shadow-xl sm:p-6"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2
                id="photo-preview-title"
                className="text-2xl font-bold"
                style={{ fontFamily: serif, color: colors.brownDark }}
              >
                Photo
              </h2>
              <button
                type="button"
                className="text-2xl leading-none"
                style={{
                  fontFamily: sans,
                  color: colors.brownMuted,
                  cursor: "pointer",
                  backgroundColor: "transparent",
                }}
                aria-label="Close photo preview"
                onClick={() => setPhotoPreviewModal(null)}
              >
                ×
              </button>
            </div>
            {(() => {
              const url = photoUrlFromRow(photoPreviewModal);
              if (!url) return null;
              const caption =
                typeof photoPreviewModal.caption === "string"
                  ? photoPreviewModal.caption.trim()
                  : "";
              const yearLabel = photoYearLabel(photoPreviewModal.photo_date);
              return (
                <>
                  <div className="flex justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt=""
                      className="max-h-[72vh] w-auto max-w-full rounded-md border object-contain"
                      style={{ borderColor: colors.brownBorder }}
                    />
                  </div>
                  <div className="mt-3">
                    <p
                      className="text-sm"
                      style={{ fontFamily: sans, color: colors.brownMuted }}
                    >
                      {yearLabel}
                    </p>
                    {caption ? (
                      <p
                        className="mt-1 text-sm leading-relaxed"
                        style={{ fontFamily: sans, color: colors.brownDark }}
                      >
                        {caption}
                      </p>
                    ) : null}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      ) : null}

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
            className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border p-6 shadow-xl"
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
            <p
              className="-mt-3 mb-5 text-xs leading-snug"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              All fields stored on this profile. Leave blank when unknown.
            </p>
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
                  {GENDER_OPTIONS.map((gender) => (
                    <option key={gender} value={gender}>
                      {gender}
                    </option>
                  ))}
                  {editPersonDraft.gender &&
                  !(["", ...GENDER_OPTIONS] as readonly string[]).includes(
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
                  htmlFor="edit-marital"
                >
                  Marital status
                </label>
                <input
                  id="edit-marital"
                  type="text"
                  value={editPersonDraft.marital_status}
                  onChange={(e) =>
                    setEditPersonDraft((d) =>
                      d ? { ...d, marital_status: e.target.value } : null
                    )
                  }
                  style={modalInputStyle}
                  placeholder="e.g. Married, Widowed"
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                  htmlFor="edit-surviving-spouse"
                >
                  Surviving spouse
                </label>
                <input
                  id="edit-surviving-spouse"
                  type="text"
                  value={editPersonDraft.surviving_spouse}
                  onChange={(e) =>
                    setEditPersonDraft((d) =>
                      d ? { ...d, surviving_spouse: e.target.value } : null
                    )
                  }
                  style={modalInputStyle}
                  placeholder="Full name as on the record"
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                  htmlFor="edit-military-branch"
                >
                  Military branch
                </label>
                <input
                  id="edit-military-branch"
                  type="text"
                  value={editPersonDraft.military_branch}
                  onChange={(e) =>
                    setEditPersonDraft((d) =>
                      d ? { ...d, military_branch: e.target.value } : null
                    )
                  }
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                  htmlFor="edit-service-number"
                >
                  Service number
                </label>
                <input
                  id="edit-service-number"
                  type="text"
                  value={editPersonDraft.service_number}
                  onChange={(e) =>
                    setEditPersonDraft((d) =>
                      d ? { ...d, service_number: e.target.value } : null
                    )
                  }
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                  htmlFor="edit-cause-of-death"
                >
                  Cause of death
                </label>
                <textarea
                  id="edit-cause-of-death"
                  rows={2}
                  value={editPersonDraft.cause_of_death}
                  onChange={(e) =>
                    setEditPersonDraft((d) =>
                      d ? { ...d, cause_of_death: e.target.value } : null
                    )
                  }
                  className="resize-y"
                  style={modalInputStyle}
                />
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
            {addFamilyCoParentId ? (
              <p
                className="mb-4 rounded-md border px-3 py-2 text-sm"
                style={{
                  fontFamily: sans,
                  borderColor: colors.brownBorder,
                  backgroundColor: colors.cream,
                  color: colors.brownDark,
                }}
              >
                Adding a child for{" "}
                <strong>{personFullName || "this person"}</strong>
                {addFamilyCoParentName ? (
                  <>
                    {" "}
                    and <strong>{addFamilyCoParentName}</strong>
                  </>
                ) : null}
                . The child will be linked to both parents.
              </p>
            ) : null}

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
                    {addFamilyCoParentId
                      ? "Relationship (fixed for child under selected spouse)"
                      : `Their relationship to ${personFullName || "this person"}`}
                  </label>
                  <select
                    id="add-family-find-rel"
                    value={addFamilyFindRel}
                    disabled={addFamilyCoParentId != null}
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
                    {addFamilyCoParentId
                      ? "Relationship (fixed for child under selected spouse)"
                      : `Their relationship to ${personFullName || "this person"}`}
                  </label>
                  <select
                    id="add-family-create-rel"
                    value={addFamilyCreateRel}
                    disabled={addFamilyCoParentId != null}
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
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="crop-photo-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setCropModalPhoto(null);
          }}
        >
          <div
            className="my-4 w-full max-w-md rounded-lg border p-6 shadow-xl"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
              maxHeight: "min(92vh, 920px)",
              overflowY: "auto",
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
                padding: 18,
                borderRadius: 14,
                backgroundColor: "var(--dg-modal-backdrop-deep)",
              }}
            >
              <div
                style={{
                  backgroundColor: colors.cream,
                  padding: "12px 14px 40px",
                  boxShadow:
                    "0 8px 24px rgb(var(--dg-shadow-rgb) / 0.12)",
                  borderRadius: 3,
                  border: `1px solid ${colors.brownBorder}`,
                }}
              >
                <div
                  className="select-none"
                  style={{
                    position: "relative",
                    width: POLAROID_CROP_VIEWPORT_W,
                    height: POLAROID_CROP_VIEWPORT_H,
                    borderRadius: 2,
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
                          POLAROID_CROP_VIEWPORT_W,
                          POLAROID_CROP_VIEWPORT_H,
                          cropZoom
                        )
                      : {
                          w: POLAROID_CROP_VIEWPORT_W * cropZoom,
                          h: POLAROID_CROP_VIEWPORT_H * cropZoom,
                        };
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
            <div className="mt-5 space-y-3">
              <div>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                  htmlFor="crop-photo-date"
                >
                  Date
                </label>
                <input
                  id="crop-photo-date"
                  type="text"
                  value={cropModalDate}
                  onChange={(e) => setCropModalDate(e.target.value)}
                  placeholder="e.g. 1943 or 06/1943"
                  autoComplete="off"
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                  htmlFor="crop-photo-caption"
                >
                  Caption
                </label>
                <textarea
                  id="crop-photo-caption"
                  rows={2}
                  value={cropModalCaption}
                  onChange={(e) => setCropModalCaption(e.target.value)}
                  className="resize-y"
                  style={modalInputStyle}
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                  htmlFor="crop-photo-event"
                >
                  Event
                </label>
                <select
                  id="crop-photo-event"
                  value={cropModalEventId ?? ""}
                  onChange={(e) => setCropModalEventId(e.target.value || null)}
                  style={modalInputStyle}
                >
                  <option value="">No event tag</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {(ev.event_type || "Event").trim()} — {eventDateLabel(ev)}
                    </option>
                  ))}
                </select>
              </div>
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
                    POLAROID_CROP_VIEWPORT_W,
                    POLAROID_CROP_VIEWPORT_H,
                    cropZoom
                  );
                  const { x: cx, y: cy } = offsetToCropPercentCover(
                    cropOffset,
                    saveRw,
                    saveRh,
                    POLAROID_CROP_VIEWPORT_W,
                    POLAROID_CROP_VIEWPORT_H
                  );
                  void saveCropPosition(
                    id,
                    cx,
                    cy,
                    cropZoom,
                    cropModalDate,
                    cropModalCaption,
                    cropModalEventId
                  );
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
                    padding: 18,
                    borderRadius: 14,
                    backgroundColor: "var(--dg-modal-backdrop-deep)",
                  }}
                >
                  <div
                    style={{
                      backgroundColor: colors.cream,
                      padding: "12px 14px 40px",
                      boxShadow:
                        "0 8px 24px rgb(var(--dg-shadow-rgb) / 0.12)",
                      borderRadius: 3,
                      border: `1px solid ${colors.brownBorder}`,
                    }}
                  >
                    <div
                      className="select-none"
                      style={{
                        position: "relative",
                        width: POLAROID_CROP_VIEWPORT_W,
                        height: POLAROID_CROP_VIEWPORT_H,
                        borderRadius: 2,
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
                                POLAROID_CROP_VIEWPORT_W,
                                POLAROID_CROP_VIEWPORT_H,
                                photoSetupZoom
                              )
                            : {
                                w: POLAROID_CROP_VIEWPORT_W * photoSetupZoom,
                                h: POLAROID_CROP_VIEWPORT_H * photoSetupZoom,
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
                  <label
                    className="mb-1 block text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                    htmlFor="photo-setup-caption"
                  >
                    Caption
                  </label>
                  <textarea
                    id="photo-setup-caption"
                    rows={2}
                    value={photoSetupCaption}
                    onChange={(e) => setPhotoSetupCaption(e.target.value)}
                    placeholder="Add a caption"
                    className="resize-y"
                    style={modalInputStyle}
                  />
                </div>
                <div>
                  <label
                    className="mb-1 block text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                    htmlFor="photo-setup-event"
                  >
                    Event
                  </label>
                  <select
                    id="photo-setup-event"
                    value={photoSetupEventId ?? ""}
                    onChange={(e) =>
                      setPhotoSetupEventId(e.target.value || null)
                    }
                    style={modalInputStyle}
                  >
                    <option value="">No event tag</option>
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {(ev.event_type || "Event").trim()} — {eventDateLabel(ev)}
                      </option>
                    ))}
                  </select>
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
                New Intel
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
    </PersonProfilePageBody>
  );
}
