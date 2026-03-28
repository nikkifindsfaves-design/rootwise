"use client";

import { createClient } from "@/lib/supabase/client";
import { formatDateString } from "@/lib/utils/dates";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  photo_url: string | null;
  gender: string | null;
  notes: string | null;
};

type EventRow = {
  id: string;
  event_type: string;
  event_date: string | null;
  event_place: string | null;
  description: string | null;
  record_id: string | null;
  notes: string | null;
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

const SIGNED_URL_EXPIRY_SEC = 3600;
const DAY_MS = 86400000;
const CLUSTER_WINDOW_MS = 365 * DAY_MS;

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

/**
 * Group by normalized event_type; within each type, merge consecutive events
 * whose dates are at most 365 days apart (by sorted order).
 */
function clusterEventsForTimeline(events: EventRow[]): EventCluster[] {
  const byTypeKey = new Map<string, EventRow[]>();
  for (const ev of events) {
    const key = (ev.event_type || "other").trim().toLowerCase() || "other";
    if (!byTypeKey.has(key)) byTypeKey.set(key, []);
    byTypeKey.get(key)!.push(ev);
  }

  const clusters: EventCluster[] = [];

  for (const [, list] of byTypeKey) {
    const withDates = list.filter((e) => parseEventDateMs(e.event_date) != null);
    const noDates = list.filter((e) => parseEventDateMs(e.event_date) == null);

    withDates.sort(
      (a, b) =>
        parseEventDateMs(a.event_date)! - parseEventDateMs(b.event_date)!
    );

    let chunk: EventRow[] = [];
    for (const ev of withDates) {
      const t = parseEventDateMs(ev.event_date)!;
      if (chunk.length === 0) {
        chunk = [ev];
      } else {
        const prevT = parseEventDateMs(chunk[chunk.length - 1]!.event_date)!;
        if (t - prevT <= CLUSTER_WINDOW_MS) {
          chunk.push(ev);
        } else {
          clusters.push({
            displayType: chunk[0]!.event_type || "Event",
            events: chunk,
          });
          chunk = [ev];
        }
      }
    }
    if (chunk.length > 0) {
      clusters.push({
        displayType: chunk[0]!.event_type || "Event",
        events: chunk,
      });
    }
    if (noDates.length > 0) {
      clusters.push({
        displayType: noDates[0]!.event_type || "Event",
        events: noDates,
      });
    }
  }

  clusters.sort((a, b) => {
    const da = parseEventDateMs(a.events[0]?.event_date ?? null);
    const db = parseEventDateMs(b.events[0]?.event_date ?? null);
    if (da == null && db == null) return 0;
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });

  return clusters;
}

function clusterDateLabel(cluster: EventCluster): string {
  const msList = cluster.events
    .map((e) => parseEventDateMs(e.event_date))
    .filter((m): m is number => m != null)
    .sort((a, b) => a - b);
  if (msList.length === 0) {
    const any = cluster.events.find((e) => e.event_date?.trim());
    return any?.event_date ? formatDateString(any.event_date) : "Date unknown";
  }
  const minMs = msList[0]!;
  const maxMs = msList[msList.length - 1]!;
  const minEv = cluster.events.find(
    (e) => parseEventDateMs(e.event_date) === minMs
  );
  const maxEv = cluster.events.find(
    (e) => parseEventDateMs(e.event_date) === maxMs
  );
  const firstStr = formatDateString(minEv?.event_date ?? "");
  if (minMs === maxMs) return firstStr;
  const lastStr = formatDateString(maxEv?.event_date ?? "");
  return `${firstStr} – ${lastStr}`;
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

function recordSourcesForCluster(
  cluster: EventCluster,
  recordsById: Map<string, RecordRow>,
  signedDocUrls: Map<string, string>
): { id: string; label: string; url: string | null }[] {
  const seen = new Set<string>();
  const out: { id: string; label: string; url: string | null }[] = [];
  for (const ev of cluster.events) {
    const id = ev.record_id;
    if (!id || seen.has(id) || !recordsById.has(id)) continue;
    seen.add(id);
    const rec = recordsById.get(id)!;
    out.push({
      id,
      label: recordTypeLabel(rec),
      url: signedDocUrls.get(id) ?? null,
    });
  }
  return out;
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
  const [expandedEventNotesIds, setExpandedEventNotesIds] = useState<
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

  useEffect(() => {
    setExpandedEventNotesIds(new Set());
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
        "id, first_name, middle_name, last_name, birth_date, death_date, photo_url, gender, notes"
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

    const p = personData as PersonRow;

    const { data: eventData, error: eventErr } = await supabase
      .from("events")
      .select(
        "id, event_type, event_date, event_place, description, record_id, notes"
      )
      .eq("person_id", personId)
      .eq("user_id", user.id)
      .order("event_date", { ascending: true, nullsFirst: false });

    if (eventErr) {
      setError(eventErr.message);
      setLoading(false);
      return;
    }

    const evs = (eventData ?? []) as EventRow[];
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

    const recordIds = [
      ...new Set(
        sortedEvents
          .map((e) => e.record_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      ),
    ];

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

  const timelineClusters = useMemo(
    () => clusterEventsForTimeline(events),
    [events]
  );

  function toggleEventNotesExpanded(eventId: string) {
    setExpandedEventNotesIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
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

  async function handleDelete() {
    if (!person || !window.confirm("Permanently delete this person?")) return;
    const supabase = createClient();
    const {
      data: { user: u },
    } = await supabase.auth.getUser();
    if (!u) return;
    const { error: delErr } = await supabase
      .from("persons")
      .delete()
      .eq("id", person.id)
      .eq("user_id", u.id);

    if (delErr) {
      setError(delErr.message);
      return;
    }
    router.push("/dashboard");
    router.refresh();
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

  const documentRecords = [
    ...new Map(
      events
        .map((e) => e.record_id)
        .filter((id): id is string => !!id && recordsById.has(id))
        .map((id) => [id, recordsById.get(id)!] as const)
    ).values(),
  ];

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
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={headerPhotoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span
                className="flex h-full w-full items-center justify-center text-4xl font-bold"
                style={{ fontFamily: serif, color: colors.brownMid }}
              >
                {initials(person)}
              </span>
            )}
          </div>
          <div className="mt-6 min-w-0 flex-1 sm:mt-0">
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
            <p
              className="mt-4 text-sm italic sm:text-base"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              {person.birth_date
                ? `b. ${formatDateString(person.birth_date)}`
                : ""}
              {person.birth_date && person.death_date ? "  ·  " : ""}
              {person.death_date
                ? `d. ${formatDateString(person.death_date)}`
                : ""}
              {!person.birth_date && !person.death_date
                ? "Dates unknown"
                : ""}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3 sm:justify-start">
              <button
                type="button"
                style={btnOutline}
                title="Coming soon"
                disabled
                className="opacity-50"
              >
                Edit
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
                onClick={() => void handleDelete()}
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
              {events.length === 0 ? (
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
                    {timelineClusters.map((cluster, cIdx) => {
                      const sources = recordSourcesForCluster(
                        cluster,
                        recordsById,
                        signedDocUrls
                      );
                      const places = [
                        ...new Set(
                          cluster.events
                            .map((e) => e.event_place?.trim())
                            .filter(Boolean) as string[]
                        ),
                      ];
                      const descriptions = [
                        ...new Set(
                          cluster.events
                            .map((e) => e.description?.trim())
                            .filter(Boolean) as string[]
                        ),
                      ];
                      const clusterKey =
                        cluster.events.map((e) => e.id).join("-") ||
                        `cluster-${cIdx}`;
                      return (
                        <li
                          key={`${clusterKey}-${cIdx}`}
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
                              {clusterDateLabel(cluster)}
                            </span>
                          </div>
                          <div
                            className="min-w-0 flex-1 pl-4 sm:pl-6"
                            style={{ borderColor: "transparent" }}
                          >
                            <div
                              className="rounded-md border px-4 py-3"
                              style={{
                                backgroundColor: colors.cream,
                                borderColor: `${colors.brownBorder}99`,
                                boxShadow:
                                  "inset 0 1px 0 rgba(255,255,255,0.6)",
                              }}
                            >
                              <p
                                className="text-lg font-bold leading-snug"
                                style={{
                                  fontFamily: serif,
                                  color: colors.brownDark,
                                }}
                              >
                                {cluster.displayType || "Event"}
                              </p>
                              {places.length > 0 ? (
                                <p
                                  className="mt-1 text-sm"
                                  style={{
                                    fontFamily: sans,
                                    color: colors.brownMid,
                                    fontStyle: "italic",
                                  }}
                                >
                                  {places.join(" · ")}
                                </p>
                              ) : null}
                              {descriptions.map((text, di) => (
                                <p
                                  key={`d-${di}-${text.slice(0, 24)}`}
                                  className="mt-2 text-sm leading-relaxed"
                                  style={{
                                    fontFamily: sans,
                                    color: colors.brownMuted,
                                  }}
                                >
                                  {text}
                                </p>
                              ))}
                              {cluster.events.some((e) => e.notes?.trim()) ? (
                                <div className="mt-3 space-y-2">
                                  {cluster.events.map((e) => {
                                    const noteText = e.notes?.trim();
                                    if (!noteText) return null;
                                    const open = expandedEventNotesIds.has(
                                      e.id
                                    );
                                    return (
                                      <div key={e.id}>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            toggleEventNotesExpanded(e.id)
                                          }
                                          className="border-none bg-transparent p-0 text-left text-sm underline decoration-dotted underline-offset-2"
                                          style={{
                                            fontFamily: sans,
                                            color: colors.forest,
                                            fontWeight: 600,
                                            cursor: "pointer",
                                          }}
                                          aria-expanded={open}
                                        >
                                          {open
                                            ? "▼ Hide notes"
                                            : "▸ Show notes"}
                                        </button>
                                        {open ? (
                                          <p
                                            className="mt-1.5 whitespace-pre-wrap pl-0.5 text-sm leading-relaxed"
                                            style={{
                                              fontFamily: sans,
                                              color: colors.brownMid,
                                            }}
                                          >
                                            {noteText}
                                          </p>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : null}
                              {sources.length > 0 ? (
                                <div
                                  className="mt-3 border-t pt-3"
                                  style={{
                                    borderColor: `${colors.brownBorder}55`,
                                  }}
                                >
                                  <p
                                    className="mb-1.5 text-[10px] font-bold uppercase tracking-widest"
                                    style={{
                                      fontFamily: sans,
                                      color: colors.brownMuted,
                                    }}
                                  >
                                    Document sources
                                  </p>
                                  <ul className="space-y-1.5">
                                    {sources.map((src) => (
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
                                </div>
                              ) : null}
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
            {photoRows.length === 0 ? (
              <p
                className="text-sm italic"
                style={{ fontFamily: sans, color: colors.brownMuted }}
              >
                No photos uploaded for this person yet.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-3">
                {photoRows.map((row, i) => {
                  const url = photoUrlFromRow(row);
                  const pid =
                    typeof row.id === "string" ? row.id : `photo-${i}`;
                  if (!url) return null;
                  return (
                    <li
                      key={pid}
                      className="h-28 w-28 overflow-hidden rounded-lg border"
                      style={{ borderColor: colors.brownBorder }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
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
    </div>
  );
}
