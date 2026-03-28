"use client";

import { buildEventTypeSelectOptions } from "@/lib/events/event-type-options";
import { createClient } from "@/lib/supabase/client";
import { formatDateString } from "@/lib/utils/dates";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const serif =
  "var(--font-dg-display), 'Playfair Display', Georgia, serif";
const sans = "var(--font-dg-body), Lato, sans-serif";

const colors = {
  brownDark: "#3D2914",
  brownMid: "#5C3D2E",
  brownMuted: "#7A6654",
  brownBorder: "#A08060",
  brownOutline: "#6B4423",
  parchment: "#F3EBE0",
  cream: "#FFFCF7",
  avatarBg: "#D4C4B0",
  forest: "#2C4A3E",
};

type PersonRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  birth_date: string | null;
  death_date: string | null;
  birth_place: string | null;
  photo_url: string | null;
  gender: string | null;
  notes: string | null;
};

const MERGE_COMPARE_KEYS = [
  "first_name",
  "middle_name",
  "last_name",
  "birth_date",
  "death_date",
  "birth_place",
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
  birth_place: "Birth place",
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
  event_place: string | null;
  description: string | null;
  record_id: string | null;
  notes: string | null;
  story_short: string | null;
  story_full: string | null;
  created_at: string | null;
};

type RelRow = {
  person_a_id: string;
  person_b_id: string;
  relationship_type: string;
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

/**
 * One expandable Notes block: all `event_sources.notes` for every `event_id` in
 * this cluster, ordered by `created_at`. If none, falls back to legacy `events.notes`
 * (chronological) so older rows still show something.
 */
function clusterNotesSegmentsForTimeline(
  cluster: EventCluster,
  sourcesByEventId: Map<string, EventSourceRow[]>
): string[] {
  type Item = { t: number; text: string };
  const items: Item[] = [];
  for (const ev of eventsSortedByDate(cluster)) {
    for (const s of sourcesByEventId.get(ev.id) ?? []) {
      const text = s.notes?.trim();
      if (!text) continue;
      items.push({
        t: new Date(s.created_at).getTime(),
        text,
      });
    }
  }
  items.sort((a, b) => a.t - b.t);
  if (items.length > 0) return items.map((i) => i.text);

  const legacy: string[] = [];
  for (const ev of eventsSortedByDate(cluster)) {
    if (ev.notes?.trim()) legacy.push(ev.notes.trim());
  }
  return legacy;
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
  return formatDateString(d);
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

function pickPrimaryPhotoUrl(
  photoRows: Record<string, unknown>[],
  personPhotoUrl: string | null
): string | null {
  const primary = photoRows.find(
    (p) => p.is_primary === true || p.primary === true
  );
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
  const primary = photoRows.find(
    (p) => p.is_primary === true || p.primary === true
  );
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

const CROP_PREVIEW_PX = 280;
/** Pixel delta → % change: (delta / 1.5) / 280 * 100 */
function cropDragDeltaToPercent(deltaPx: number): number {
  return ((deltaPx / 1.5) / CROP_PREVIEW_PX) * 100;
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

function clusterPlacesLine(cluster: EventCluster): string {
  const parts = [
    ...new Set(
      cluster.events
        .map((e) => e.event_place?.trim())
        .filter(Boolean) as string[]
    ),
  ];
  return parts.join(" · ");
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

function FamilyMemberCard({ p }: { p: PersonRow }) {
  const last = p.last_name.trim() || "—";
  const rest = [p.first_name, p.middle_name ?? ""]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
  const photo =
    (p as { photo_url?: string | null }).photo_url ?? null;

  return (
    <Link
      href={`/person/${p.id}`}
      className="flex gap-2 rounded-lg border p-2 transition hover:-translate-y-0.5"
      style={{
        borderColor: colors.brownBorder,
        backgroundColor: colors.cream,
        boxShadow: "0 1px 4px rgba(61, 41, 20, 0.06)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div
        className="h-10 w-10 shrink-0 overflow-hidden rounded-full ring-1"
        style={{
          backgroundColor: colors.avatarBg,
          borderColor: colors.brownBorder,
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="h-full w-full object-cover" />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center text-xs font-bold"
            style={{ fontFamily: serif, color: colors.brownMid }}
          >
            {initials(p)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-sm font-bold leading-tight"
          style={{ fontFamily: serif, color: colors.brownDark }}
        >
          {last}
        </p>
        {rest ? (
          <p
            className="truncate text-xs"
            style={{ fontFamily: serif, color: colors.brownMid }}
          >
            {rest}
          </p>
        ) : null}
        <p
          className="mt-0.5 text-[10px] italic leading-tight"
          style={{ fontFamily: sans, color: colors.brownMuted }}
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
}: {
  title: string;
  members: PersonRow[];
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
            <FamilyMemberCard p={p} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PersonProfilePage() {
  const params = useParams();
  const router = useRouter();
  const personId = typeof params.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [person, setPerson] = useState<PersonRow | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [photoRows, setPhotoRows] = useState<Record<string, unknown>[]>([]);
  const [recordsById, setRecordsById] = useState<Map<string, RecordRow>>(
    new Map()
  );
  const [family, setFamily] = useState<{
    parents: PersonRow[];
    spouses: PersonRow[];
    siblings: PersonRow[];
    children: PersonRow[];
  }>({ parents: [], spouses: [], siblings: [], children: [] });
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
  const [expandedStoryFullIds, setExpandedStoryFullIds] = useState<
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
    event_place: string;
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

  const [editPersonOpen, setEditPersonOpen] = useState(false);
  const [editPersonDraft, setEditPersonDraft] = useState<{
    first_name: string;
    middle_name: string;
    last_name: string;
    birth_date: string;
    death_date: string;
    birth_place: string;
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

  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);

  const [cropModalPhoto, setCropModalPhoto] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [cropPos, setCropPos] = useState({ x: 50, y: 50 });
  const [cropZoom, setCropZoom] = useState(1.0);
  const [cropDragging, setCropDragging] = useState(false);
  const cropMouseDragCleanupRef = useRef<(() => void) | null>(null);
  const cropTouchDragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setExpandedTimelineNotesKeys(new Set());
    setExpandedTimelineSourcesKeys(new Set());
    setExpandedStoryFullIds(new Set());
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
    setCropModalPhoto(null);
  }, [personId]);

  useEffect(() => {
    if (cropModalPhoto) return;
    cropMouseDragCleanupRef.current?.();
    cropMouseDragCleanupRef.current = null;
    cropTouchDragCleanupRef.current?.();
    cropTouchDragCleanupRef.current = null;
    setCropDragging(false);
  }, [cropModalPhoto]);

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
        "id, first_name, middle_name, last_name, birth_date, death_date, birth_place, photo_url, gender, notes"
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

    const raw = personData as PersonRow & { birth_place?: string | null };
    const p: PersonRow = {
      ...raw,
      birth_place: raw.birth_place ?? null,
    };

    const { data: eventData, error: eventErr } = await supabase
      .from("events")
      .select(
        "id, event_type, event_date, event_place, description, record_id, notes, story_short, story_full, created_at"
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

    const { data: relData, error: relErr } = await supabase
      .from("relationships")
      .select("person_a_id, person_b_id, relationship_type")
      .eq("user_id", user.id)
      .or(`person_a_id.eq.${personId},person_b_id.eq.${personId}`);

    if (relErr) {
      setError(relErr.message);
      setLoading(false);
      return;
    }

    const parents = new Set<string>();
    const children = new Set<string>();
    const spouses = new Set<string>();
    const siblings = new Set<string>();

    for (const rel of (relData ?? []) as RelRow[]) {
      const c = classifyRelationship(personId, rel);
      if (!c) continue;
      if (c.category === "parent") parents.add(c.otherId);
      else if (c.category === "child") children.add(c.otherId);
      else if (c.category === "spouse") spouses.add(c.otherId);
      else if (c.category === "sibling") siblings.add(c.otherId);
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
      for (const row of (relPeople ?? []) as PersonRow[]) {
        relativesMap.set(row.id, row);
      }
    }

    const pick = (ids: Set<string>) =>
      [...ids].map((id) => relativesMap.get(id)).filter(Boolean) as PersonRow[];

    let photosParsed: Record<string, unknown>[] = [];
    const { data: photosData, error: photosErr } = await supabase
      .from("photos")
      .select("*")
      .eq("person_id", personId)
      .order("created_at", { ascending: false });

    if (!photosErr && photosData) {
      photosParsed = photosData as Record<string, unknown>[];
    }

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
    setResearchNoteId(pnId);
    setResearchNoteText(pnContent);
    setResearchNoteUpdatedAt(pnUpdated);
    setLoading(false);
  }, [personId, router]);

  useEffect(() => {
    void load();
  }, [load]);

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
    return {
      x: cropPercentFromUnknown(row.crop_x, 50),
      y: cropPercentFromUnknown(row.crop_y, 50),
      zoom: cropZoomFromUnknown(row.crop_zoom, 1),
    };
  }, [photoRows]);

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

  function toggleStoryFullExpanded(eventId: string) {
    setExpandedStoryFullIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

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
      const { error: insErr } = await supabase.from("photos").insert({
        user_id: user.id,
        person_id: personId,
        file_url,
        is_primary: false,
      });
      if (insErr) {
        setPhotoUploadError(insErr.message);
        return;
      }
      await load();
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
    const { error: e1 } = await supabase
      .from("photos")
      .update({ is_primary: false })
      .eq("person_id", personId)
      .eq("user_id", user.id);
    if (e1) {
      setPhotoUploadError(e1.message);
      return;
    }
    const { error: e2 } = await supabase
      .from("photos")
      .update({ is_primary: true })
      .eq("id", photoRowId)
      .eq("user_id", user.id);
    if (e2) {
      setPhotoUploadError(e2.message);
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
    const { error: delErr } = await supabase
      .from("photos")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (delErr) {
      setPhotoUploadError(delErr.message);
      return;
    }
    await load();
  }

  async function saveCropPosition(
    photoRowId: string,
    x: number,
    y: number,
    zoom: number
  ) {
    // requires crop_zoom column on photos table
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const cx = Math.min(100, Math.max(0, x));
    const cy = Math.min(100, Math.max(0, y));
    const cz = Math.min(3, Math.max(1, zoom));
    const { error } = await supabase
      .from("photos")
      .update({ crop_x: cx, crop_y: cy, crop_zoom: cz })
      .eq("id", photoRowId)
      .eq("user_id", user.id);
    if (error) {
      setPhotoUploadError(error.message);
      return;
    }
    setCropModalPhoto(null);
    await load();
  }

  function attachCropMouseDrag(startX: number, startY: number) {
    cropMouseDragCleanupRef.current?.();
    setCropDragging(true);
    let lastX = startX;
    let lastY = startY;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - lastX;
      const dy = ev.clientY - lastY;
      lastX = ev.clientX;
      lastY = ev.clientY;
      const dxp = cropDragDeltaToPercent(dx);
      const dyp = cropDragDeltaToPercent(dy);
      setCropPos((p) => ({
        x: Math.min(100, Math.max(0, p.x + dxp)),
        y: Math.min(100, Math.max(0, p.y + dyp)),
      }));
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
    attachCropMouseDrag(e.clientX, e.clientY);
  }

  function attachCropTouchDrag(startClientX: number, startClientY: number) {
    cropTouchDragCleanupRef.current?.();
    setCropDragging(true);
    let lastX = startClientX;
    let lastY = startClientY;
    const onMove = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      ev.preventDefault();
      const t = ev.touches[0]!;
      const dx = t.clientX - lastX;
      const dy = t.clientY - lastY;
      lastX = t.clientX;
      lastY = t.clientY;
      const dxp = cropDragDeltaToPercent(dx);
      const dyp = cropDragDeltaToPercent(dy);
      setCropPos((p) => ({
        x: Math.min(100, Math.max(0, p.x + dxp)),
        y: Math.min(100, Math.max(0, p.y + dyp)),
      }));
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
    const t = e.touches[0]!;
    attachCropTouchDrag(t.clientX, t.clientY);
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
      birth_date: person.birth_date ?? "",
      death_date: person.death_date ?? "",
      birth_place: person.birth_place ?? "",
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
    if (!editPersonDraft || !personId) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    setPersonEditSaving(true);
    setPersonEditError(null);
    const d = editPersonDraft;
    const { data, error } = await supabase
      .from("persons")
      .update({
        first_name: d.first_name.trim(),
        middle_name: d.middle_name.trim() || null,
        last_name: d.last_name.trim(),
        birth_date: d.birth_date.trim() || null,
        death_date: d.death_date.trim() || null,
        birth_place: d.birth_place.trim() || null,
        gender: d.gender.trim() || null,
        notes: d.notes.trim() || null,
      })
      .eq("id", personId)
      .eq("user_id", user.id)
      .select(
        "id, first_name, middle_name, last_name, birth_date, death_date, birth_place, photo_url, gender, notes"
      )
      .single();

    setPersonEditSaving(false);
    if (error) {
      setPersonEditError(error.message);
      return;
    }
    if (data) {
      const row = data as PersonRow & { birth_place?: string | null };
      setPerson({
        ...row,
        birth_place: row.birth_place ?? null,
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
    router.push("/dashboard");
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
      birth_place: dup.birth_place ?? null,
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

  function startEditEvent(ev: EventRow) {
    setEventEditError(null);
    setEventDeleteConfirmId(null);
    setEditingEventId(ev.id);
    setEventEditDraft({
      event_type: ev.event_type?.trim() || "other",
      event_date: ev.event_date?.trim() ?? "",
      event_place: ev.event_place?.trim() ?? "",
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
        event_place: d.event_place.trim() || null,
        story_short: d.story_short.trim() || null,
        story_full: d.story_full.trim() || null,
        notes: d.notes.trim() || null,
      })
      .eq("id", eventId)
      .eq("user_id", user.id)
      .select(
        "id, event_type, event_date, event_place, description, record_id, notes, story_short, story_full, created_at"
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
    }
    cancelEditEvent();
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
    setExpandedStoryFullIds((prev) => {
      const next = new Set(prev);
      next.delete(eventId);
      return next;
    });
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

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center px-4">
        <p style={{ fontFamily: sans, color: colors.brownMuted }}>
          Opening profile…
        </p>
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p style={{ fontFamily: sans, color: colors.brownDark }}>{error}</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block text-sm font-semibold underline"
          style={{ color: colors.forest }}
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  const lastName = person.last_name.trim() || "—";
  const firstMiddle = [person.first_name, person.middle_name ?? ""]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");

  const headerGenderBadge = genderBadgeLabel(person.gender);
  const headerDateBits: string[] = [];
  if (person.birth_date) {
    headerDateBits.push(`b. ${formatDateString(person.birth_date)}`);
  }
  if (person.death_date) {
    headerDateBits.push(`d. ${formatDateString(person.death_date)}`);
  }
  const headerDateSegment = headerDateBits.join("  ·  ");
  const headerNoDates = headerDateBits.length === 0;

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
        <Link
          href="/dashboard"
          className="text-sm font-semibold"
          style={{ fontFamily: sans, color: colors.forest }}
        >
          ← Dashboard
        </Link>
      </nav>

      {/* Header */}
      <header
        className="border-b px-4 py-10 sm:px-8"
        style={{
          backgroundColor: colors.parchment,
          borderColor: `${colors.brownBorder}44`,
        }}
      >
        <div className="mx-auto flex max-w-5xl flex-col items-center text-center sm:flex-row sm:items-start sm:gap-10 sm:text-left">
          <div
            className="relative h-36 w-36 shrink-0 overflow-hidden rounded-full ring-4"
            style={{
              backgroundColor: colors.avatarBg,
              borderColor: colors.cream,
              boxShadow: "0 8px 28px rgba(61, 41, 20, 0.12)",
            }}
          >
            {headerPhotoUrl ? (
              <div className="h-full w-full overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={headerPhotoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  style={{
                    objectPosition: `${headerPhotoCrop.x}% ${headerPhotoCrop.y}%`,
                    transform: `scale(${headerPhotoCrop.zoom})`,
                    transformOrigin: "center center",
                  }}
                />
              </div>
            ) : (
              <span
                className="flex h-full w-full items-center justify-center text-4xl font-bold"
                style={{ fontFamily: serif, color: colors.brownMid }}
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
                      backgroundColor: "#8B6F4E",
                      color: "#fff",
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
              {headerDateSegment ? headerDateSegment : null}
              {headerNoDates ? "Dates unknown" : null}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3 sm:justify-start">
              <button
                type="button"
                style={btnOutline}
                onClick={() => openEditPersonModal()}
              >
                Edit
              </button>
              <button
                type="button"
                style={{
                  ...btnOutline,
                  borderColor: colors.forest,
                  color: colors.forest,
                }}
                onClick={() => openMergeModal()}
              >
                Merge with another person
              </button>
              <button
                type="button"
                style={btnOutline}
                title="Coming soon"
                disabled
                className="opacity-50"
              >
                Add Photo
              </button>
              <button
                type="button"
                style={{
                  ...btnOutline,
                  borderColor: "#8B3A3A",
                  color: "#6B2A2A",
                }}
                onClick={() => setDeletePersonOpen(true)}
              >
                Delete
              </button>
            </div>
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
              <h2
                className="mb-6 border-b pb-2 text-2xl font-bold"
                style={{
                  fontFamily: serif,
                  color: colors.brownDark,
                  borderColor: colors.brownBorder,
                }}
              >
                Life &amp; records
              </h2>
              {timelineEvents.length === 0 ? (
                <p
                  className="text-sm italic"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  No events recorded yet.
                </p>
              ) : (
                <div className="relative pl-6 sm:pl-8">
                  <div
                    className="absolute bottom-0 left-[0.6rem] top-0 w-px sm:left-[0.85rem]"
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
                      const headline = ev.story_short?.trim() || typ;
                      const fullPick = firstStoryFullInCluster(mergeCluster);
                      const full = fullPick.text;
                      const storyOpen = expandedStoryFullIds.has(
                        fullPick.eventId
                      );
                      const placesLine =
                        clusterPlacesLine(mergeCluster) || "—";
                      const noteSegments = clusterNotesSegmentsForTimeline(
                        mergeCluster,
                        eventSourcesByEventId
                      );
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
                          className="relative flex gap-4 pb-10 sm:gap-6"
                        >
                          <div
                            className="absolute left-0 top-1 z-10 h-2.5 w-2.5 rounded-full ring-4 ring-[#F3EBE0] sm:left-[0.35rem]"
                            style={{
                              backgroundColor: colors.brownDark,
                            }}
                          />
                          <div
                            className="min-w-[5.5rem] shrink-0 text-right sm:min-w-[6.5rem]"
                            style={{ fontFamily: serif }}
                          >
                            <span
                              className="block text-xs font-bold uppercase tracking-wide"
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
                                  "inset 0 1px 0 rgba(255,255,255,0.6)",
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
                                    className="rounded border border-transparent p-1.5 hover:border-[#A0806099] hover:bg-[#F3EBE0]"
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
                                    className="rounded border border-transparent p-1.5 hover:border-[#A0806099] hover:bg-[#F3EBE0]"
                                    style={{
                                      color: "#8B3A3A",
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
                                    <input
                                      id={`ev-date-${ev.id}`}
                                      type="text"
                                      value={eventEditDraft.event_date}
                                      onChange={(e) =>
                                        setEventEditDraft((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                event_date: e.target.value,
                                              }
                                            : null
                                        )
                                      }
                                      style={modalInputStyle}
                                      placeholder="YYYY-MM-DD or as stored"
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
                                      value={eventEditDraft.event_place}
                                      onChange={(e) =>
                                        setEventEditDraft((prev) =>
                                          prev
                                            ? {
                                                ...prev,
                                                event_place: e.target.value,
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
                                        color: "#8B3A3A",
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
                                  <p
                                    className="text-lg font-bold leading-snug"
                                    style={{
                                      fontFamily: serif,
                                      color: colors.brownDark,
                                    }}
                                  >
                                    {headline}
                                  </p>
                                  <p
                                    className="mt-1 text-sm italic"
                                    style={{
                                      fontFamily: sans,
                                      color: colors.brownMuted,
                                    }}
                                  >
                                    {placesLine || "—"}
                                  </p>
                                  {full ? (
                                    <div className="mt-2">
                                      {!storyOpen ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            toggleStoryFullExpanded(
                                              fullPick.eventId
                                            )
                                          }
                                          className="border-none bg-transparent p-0 text-left text-sm underline decoration-dotted underline-offset-2"
                                          style={{
                                            fontFamily: sans,
                                            color: colors.forest,
                                            fontWeight: 600,
                                            cursor: "pointer",
                                          }}
                                          aria-expanded={false}
                                        >
                                          Read more
                                        </button>
                                      ) : (
                                        <div>
                                          <p
                                            className="whitespace-pre-wrap text-sm leading-relaxed"
                                            style={{
                                              fontFamily: sans,
                                              color: colors.brownMid,
                                            }}
                                          >
                                            {full}
                                          </p>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              toggleStoryFullExpanded(
                                                fullPick.eventId
                                              )
                                            }
                                            className="mt-2 border-none bg-transparent p-0 text-left text-sm underline decoration-dotted underline-offset-2"
                                            style={{
                                              fontFamily: sans,
                                              color: colors.forest,
                                              fontWeight: 600,
                                              cursor: "pointer",
                                            }}
                                            aria-expanded={true}
                                          >
                                            Show less
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  ) : null}
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
                                  {noteSegments.length > 0 ? (
                                    <div className="mt-3">
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
                                        {notesOpen ? "Hide notes" : "Notes"}
                                      </button>
                                      {notesOpen ? (
                                        <div
                                          className="mt-2 pl-0.5 text-sm leading-relaxed"
                                          style={{
                                            fontFamily: sans,
                                            color: colors.brownMid,
                                          }}
                                        >
                                          {noteSegments.map((chunk, ni) => (
                                            <div key={`${listKey}-n-${ni}`}>
                                              {ni > 0 ? (
                                                <hr
                                                  className="my-3 border-0 border-t"
                                                  style={{
                                                    borderColor: `${colors.brownBorder}99`,
                                                  }}
                                                />
                                              ) : null}
                                              <p className="whitespace-pre-wrap">
                                                {chunk}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                  {linkedSources.length > 0 ? (
                                    <div className="mt-3">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          toggleTimelineSourcesForEvent(ev.id)
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
                                      {sourcesOpen ? (
                                        <ul className="mt-2 space-y-1.5 pl-0.5">
                                          {linkedSources.map((src) => (
                                            <li key={src.id}>
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
                                            </li>
                                          ))}
                                        </ul>
                                      ) : null}
                                    </div>
                                  ) : null}
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
                                          backgroundColor: "#8B3A3A",
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
                boxShadow: "0 4px 18px rgba(61, 41, 20, 0.06)",
              }}
            >
              <h2
                className="mb-4 text-xl font-bold"
                style={{ fontFamily: serif, color: colors.brownDark }}
              >
                Immediate family
              </h2>
              <FamilyGroup title="Parents" members={family.parents} />
              <FamilyGroup title="Spouses" members={family.spouses} />
              <FamilyGroup title="Siblings" members={family.siblings} />
              <FamilyGroup title="Children" members={family.children} />
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
                          boxShadow: "0 2px 8px rgba(61, 41, 20, 0.05)",
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
                style={{ fontFamily: sans, color: "#8B3A3A" }}
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
                  const isPrimary =
                    row.is_primary === true || row.primary === true;
                  if (!url) return null;
                  const openCropModal = () => {
                    setCropModalPhoto(row);
                    setCropPos({
                      x: cropPercentFromUnknown(row.crop_x, 50),
                      y: cropPercentFromUnknown(row.crop_y, 50),
                    });
                    setCropZoom(cropZoomFromUnknown(row.crop_zoom, 1));
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
                            className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-[#2A1810]/0 transition-colors group-hover:bg-[#2A1810]/45"
                            aria-hidden
                          >
                            <span className="inline-flex scale-[2] opacity-0 transition-opacity group-hover:opacity-100">
                              <IconPencil className="block text-[#FFFCF7] drop-shadow-md" />
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
                            className="absolute inset-0 z-[3] flex items-end justify-center gap-2 bg-gradient-to-t from-[#3D2914]/70 via-transparent to-transparent pb-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                            style={{ pointerEvents: "none" }}
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
                                color: "#8B3A3A",
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
                style={{ fontFamily: sans, color: "#8B3A3A" }}
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
          style={{ backgroundColor: "rgba(61, 41, 20, 0.45)" }}
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
              boxShadow: "0 12px 40px rgba(61, 41, 20, 0.2)",
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
                <input
                  id="edit-bd"
                  type="text"
                  value={editPersonDraft.birth_date}
                  onChange={(e) =>
                    setEditPersonDraft((d) =>
                      d ? { ...d, birth_date: e.target.value } : null
                    )
                  }
                  style={modalInputStyle}
                  placeholder="YYYY-MM-DD"
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
                <input
                  id="edit-dd"
                  type="text"
                  value={editPersonDraft.death_date}
                  onChange={(e) =>
                    setEditPersonDraft((d) =>
                      d ? { ...d, death_date: e.target.value } : null
                    )
                  }
                  style={modalInputStyle}
                  placeholder="YYYY-MM-DD"
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                  htmlFor="edit-bp"
                >
                  Birth place
                </label>
                <input
                  id="edit-bp"
                  type="text"
                  value={editPersonDraft.birth_place}
                  onChange={(e) =>
                    setEditPersonDraft((d) =>
                      d ? { ...d, birth_place: e.target.value } : null
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
                style={{ fontFamily: sans, color: "#8B3A3A" }}
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
          style={{ backgroundColor: "rgba(61, 41, 20, 0.45)" }}
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
              boxShadow: "0 12px 40px rgba(61, 41, 20, 0.2)",
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
                  backgroundColor: "#8B3A3A",
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

      {mergeModalOpen && person ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(61, 41, 20, 0.45)" }}
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
              boxShadow: "0 12px 40px rgba(61, 41, 20, 0.2)",
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
                    style={{ fontFamily: sans, color: "#8B3A3A" }}
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
                    style={{ fontFamily: sans, color: "#8B3A3A" }}
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
                    style={{ fontFamily: sans, color: "#8B3A3A" }}
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
          style={{ backgroundColor: "rgba(61, 41, 20, 0.45)" }}
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
              boxShadow: "0 12px 40px rgba(61, 41, 20, 0.2)",
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
                backgroundColor: "rgba(42, 24, 16, 0.42)",
              }}
            >
              <div
                className="select-none"
                style={{
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
                  return (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt=""
                      draggable={false}
                      className="h-full w-full object-cover"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectPosition: `${cropPos.x}% ${cropPos.y}%`,
                        transform: `scale(${cropZoom})`,
                        transformOrigin: "center center",
                        pointerEvents: "none",
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
                  if (id)
                    void saveCropPosition(
                      id,
                      cropPos.x,
                      cropPos.y,
                      cropZoom
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
    </div>
  );
}
