"use client";

import { useTheme } from "@/lib/theme/theme-context";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import PeopleGrid, { type PersonGridRow } from "./people-grid";

const serif = "var(--font-dg-display), 'Playfair Display', Georgia, serif";
const sans = "var(--font-dg-body), Lato, sans-serif";

const colors = {
  brownDark: "var(--dg-brown-dark)",
  brownMid: "var(--dg-brown-mid)",
  brownMuted: "var(--dg-brown-muted)",
  brownBorder: "var(--dg-brown-border)",
  brownOutline: "var(--dg-brown-outline)",
  parchment: "var(--dg-parchment)",
  cream: "var(--dg-cream)",
  forest: "var(--dg-forest)",
};

type UploadTagPerson = {
  id: string;
  first_name: string;
  last_name: string;
  middle_name: string | null;
};

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

function displayTagName(p: UploadTagPerson): string {
  return [p.first_name, p.middle_name ?? "", p.last_name]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

export default function DeadGossipShell({
  personCount,
  people,
  uploadSection,
  addPersonSection,
  formError,
  personsErrorMessage,
}: {
  personCount: number;
  people: PersonGridRow[];
  uploadSection: ReactNode;
  addPersonSection: ReactNode;
  formError: string | null;
  personsErrorMessage: string | null;
}) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const [photoUploadModalOpen, setPhotoUploadModalOpen] = useState(false);
  const [photoUploadFile, setPhotoUploadFile] = useState<File | null>(null);
  const [photoUploadPreviewUrl, setPhotoUploadPreviewUrl] = useState<
    string | null
  >(null);
  const [photoUploadDate, setPhotoUploadDate] = useState("");
  const [photoUploadTags, setPhotoUploadTags] = useState<UploadTagPerson[]>(
    []
  );
  const [photoUploadTagSearch, setPhotoUploadTagSearch] = useState("");
  const [photoUploadTagResults, setPhotoUploadTagResults] = useState<
    UploadTagPerson[]
  >([]);
  const [photoUploadSaving, setPhotoUploadSaving] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);

  const photoUploadTagsRef = useRef<UploadTagPerson[]>([]);
  photoUploadTagsRef.current = photoUploadTags;
  const photoUploadSearchSeqRef = useRef(0);
  const dashboardPhotoFileInputRef = useRef<HTMLInputElement>(null);

  const searchUploadTagPersons = useCallback(async (query: string) => {
    const q = query.trim();
    if (q.length < 2) {
      setPhotoUploadTagResults([]);
      return;
    }
    const seq = ++photoUploadSearchSeqRef.current;
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (seq === photoUploadSearchSeqRef.current) {
          setPhotoUploadTagResults([]);
        }
        return;
      }
      const pattern = `%${q}%`;
      const { data: d1, error: e1 } = await supabase
        .from("persons")
        .select("id, first_name, middle_name, last_name")
        .eq("user_id", user.id)
        .ilike("first_name", pattern)
        .limit(10);
      const { data: d2, error: e2 } = await supabase
        .from("persons")
        .select("id, first_name, middle_name, last_name")
        .eq("user_id", user.id)
        .ilike("last_name", pattern)
        .limit(10);
      if (e1 || e2) {
        if (seq === photoUploadSearchSeqRef.current) {
          setPhotoUploadTagResults([]);
        }
        return;
      }
      if (seq !== photoUploadSearchSeqRef.current) return;
      const seen = new Set<string>();
      const merged: UploadTagPerson[] = [];
      for (const row of [...(d1 ?? []), ...(d2 ?? [])]) {
        const r = row as UploadTagPerson;
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        merged.push({
          id: r.id,
          first_name: r.first_name,
          last_name: r.last_name,
          middle_name: r.middle_name ?? null,
        });
      }
      const taggedIds = new Set(photoUploadTagsRef.current.map((t) => t.id));
      setPhotoUploadTagResults(
        merged.filter((p) => !taggedIds.has(p.id)).slice(0, 10)
      );
    } catch {
      if (seq === photoUploadSearchSeqRef.current) {
        setPhotoUploadTagResults([]);
      }
    }
  }, []);

  useEffect(() => {
    if (!photoUploadModalOpen) return;
    const q = photoUploadTagSearch.trim();
    if (q.length < 2) {
      setPhotoUploadTagResults([]);
      return;
    }
    const h = window.setTimeout(() => {
      void searchUploadTagPersons(q);
    }, 300);
    return () => window.clearTimeout(h);
  }, [photoUploadTagSearch, photoUploadModalOpen, searchUploadTagPersons]);

  function openPhotoUploadModal() {
    setPhotoUploadError(null);
    if (photoUploadPreviewUrl) {
      URL.revokeObjectURL(photoUploadPreviewUrl);
    }
    setPhotoUploadPreviewUrl(null);
    setPhotoUploadFile(null);
    setPhotoUploadDate("");
    setPhotoUploadTags([]);
    setPhotoUploadTagSearch("");
    setPhotoUploadTagResults([]);
    photoUploadSearchSeqRef.current += 1;
    setPhotoUploadModalOpen(true);
  }

  function closePhotoUploadModal() {
    if (photoUploadSaving) return;
    if (photoUploadPreviewUrl) {
      URL.revokeObjectURL(photoUploadPreviewUrl);
    }
    setPhotoUploadModalOpen(false);
    setPhotoUploadFile(null);
    setPhotoUploadPreviewUrl(null);
    setPhotoUploadDate("");
    setPhotoUploadTags([]);
    setPhotoUploadTagSearch("");
    setPhotoUploadTagResults([]);
    setPhotoUploadError(null);
    photoUploadSearchSeqRef.current += 1;
  }

  async function saveUploadedPhoto() {
    if (photoUploadTags.length === 0) {
      setPhotoUploadError("Please tag at least one person");
      return;
    }
    if (!photoUploadFile) {
      setPhotoUploadError("Please select a photo.");
      return;
    }
    setPhotoUploadSaving(true);
    setPhotoUploadError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setPhotoUploadError("Not signed in.");
        return;
      }

      const firstTagId = photoUploadTags[0].id;
      const { w: naturalWidth, h: naturalHeight } =
        await getNaturalSize(photoUploadFile);

      const ext = extFromImageFile(photoUploadFile);
      const path = `${user.id}/${firstTagId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("photos")
        .upload(path, photoUploadFile, {
          contentType: photoUploadFile.type || `image/${ext}`,
          upsert: false,
        });
      if (upErr) {
        setPhotoUploadError(upErr.message);
        return;
      }
      const { data: pub } = supabase.storage.from("photos").getPublicUrl(path);
      const file_url = pub.publicUrl;
      const dateTrim = photoUploadDate.trim();
      const { data: newPhoto, error: insErr } = await supabase
        .from("photos")
        .insert({
          user_id: user.id,
          person_id: firstTagId,
          file_url,
          is_primary: false,
          photo_date: dateTrim === "" ? null : dateTrim,
          ...(naturalWidth > 0 && naturalHeight > 0
            ? { natural_width: naturalWidth, natural_height: naturalHeight }
            : {}),
        })
        .select("id")
        .single();
      if (insErr || !newPhoto) {
        setPhotoUploadError(insErr?.message ?? "Could not save photo.");
        return;
      }
      const photoId = (newPhoto as { id: string }).id;
      const tagRows = photoUploadTags.map((t) => ({
        photo_id: photoId,
        person_id: t.id,
        user_id: user.id,
      }));
      const { error: tagErr } = await supabase.from("photo_tags").insert(tagRows);
      if (tagErr) {
        setPhotoUploadError(tagErr.message);
        return;
      }

      if (photoUploadPreviewUrl) {
        URL.revokeObjectURL(photoUploadPreviewUrl);
      }
      setPhotoUploadModalOpen(false);
      setPhotoUploadFile(null);
      setPhotoUploadPreviewUrl(null);
      setPhotoUploadDate("");
      setPhotoUploadTags([]);
      setPhotoUploadTagSearch("");
      setPhotoUploadTagResults([]);
      photoUploadSearchSeqRef.current += 1;
      router.refresh();
    } finally {
      setPhotoUploadSaving(false);
    }
  }

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const formattedCount = new Intl.NumberFormat("en-US").format(personCount);

  const heroBtnBase: React.CSSProperties = {
    fontFamily: sans,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.brownOutline,
    color: colors.brownDark,
    backgroundColor: "transparent",
    padding: "0.75rem 1.5rem",
    borderRadius: 4,
    fontSize: "0.9375rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background-color 0.2s, color 0.2s, border-color 0.2s",
  };

  const modalInputStyle: CSSProperties = {
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

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .dg-hero-btn:hover {
              background-color: var(--dg-parchment-deep) !important;
              border-color: var(--dg-brown-dark) !important;
            }
            .dg-signout:hover {
              background-color: var(--dg-parchment) !important;
              border-color: var(--dg-brown-border) !important;
            }
          `,
        }}
      />

      <input
        ref={dashboardPhotoFileInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setPhotoUploadError(null);
          setPhotoUploadPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(f);
          });
          setPhotoUploadFile(f);
        }}
      />

      <nav
        className="border-b px-4 py-4 sm:px-6"
        style={{
          backgroundColor: colors.cream,
          borderColor: `${colors.brownBorder}55`,
        }}
      >
        <div className="mx-auto flex w-full max-w-6xl items-start gap-4">
          <div>
            <p
              className="text-2xl font-bold tracking-tight sm:text-3xl"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Dead Gossip
            </p>
            <p
              className="mt-0.5 text-xs sm:text-sm"
              style={{
                fontFamily: sans,
                fontStyle: "italic",
                color: colors.brownMuted,
              }}
            >
              The good, the bad, the buried.
            </p>
          </div>
          <button
            type="button"
            className="ml-auto shrink-0"
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
          <button
            type="button"
            className="dg-signout shrink-0 rounded-md border px-3 py-2 text-sm"
            style={{
              fontFamily: sans,
              borderColor: `${colors.brownBorder}99`,
              color: colors.brownMid,
              backgroundColor: colors.cream,
            }}
            onClick={() => void handleSignOut()}
          >
            Sign out
          </button>
        </div>
      </nav>

      <header
        className="border-b px-4 py-10 sm:px-6 sm:py-14"
        style={{
          backgroundColor: colors.parchment,
          borderColor: `${colors.brownBorder}44`,
          backgroundImage:
            "linear-gradient(180deg, var(--dg-gradient-hero-top) 0%, transparent 100%)",
        }}
      >
        <div className="mx-auto max-w-3xl text-center">
          <h1
            className="text-3xl leading-tight sm:text-4xl md:text-[2.75rem]"
            style={{ fontFamily: serif, color: colors.brownDark }}
          >
            Your family&apos;s story, unfiltered.
          </h1>
          <p
            className="mt-5 text-lg sm:text-xl md:text-2xl"
            style={{
              fontFamily: serif,
              color: colors.brownMid,
              fontWeight: 600,
            }}
          >
            {formattedCount}{" "}
            {personCount === 1 ? "ancestor" : "ancestors"} and counting
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              className="dg-hero-btn"
              style={heroBtnBase}
              aria-expanded={uploadOpen}
              onClick={() => setUploadOpen((o) => !o)}
            >
              Upload a Record
            </button>
            <button
              type="button"
              className="dg-hero-btn"
              style={heroBtnBase}
              onClick={openPhotoUploadModal}
            >
              Upload Photo
            </button>
            <button
              type="button"
              className="dg-hero-btn"
              style={heroBtnBase}
              aria-expanded={addOpen}
              onClick={() => setAddOpen((o) => !o)}
            >
              Add a Person
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {formError ? (
          <p
            className="mb-6 rounded-lg border px-4 py-3 text-sm"
            style={{
              borderColor: "var(--dg-error-border)",
              backgroundColor: "var(--dg-error-bg)",
              color: "var(--dg-error-text)",
              fontFamily: sans,
            }}
            role="alert"
          >
            {formError}
          </p>
        ) : null}

        {personsErrorMessage ? (
          <p
            className="mb-6 rounded-lg border px-4 py-3 text-sm"
            style={{
              borderColor: colors.brownBorder,
              backgroundColor: colors.parchment,
              color: colors.brownDark,
              fontFamily: sans,
            }}
            role="alert"
          >
            Could not load persons: {personsErrorMessage}
          </p>
        ) : null}

        {uploadOpen ? (
          <div className="mb-8">{uploadSection}</div>
        ) : null}
        {addOpen ? <div className="mb-10">{addPersonSection}</div> : null}

        <PeopleGrid people={people} forestAccent={colors.forest} />
      </div>

      {photoUploadModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-photo-upload-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePhotoUploadModal();
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
              id="dashboard-photo-upload-title"
              className="mb-5 text-2xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Upload photo
            </h2>

            <div className="mb-6 flex justify-center">
              <div
                className="overflow-hidden rounded-full bg-[var(--dg-avatar-bg)] ring-2"
                style={{
                  width: 200,
                  height: 200,
                  borderColor: colors.brownBorder,
                }}
              >
                {photoUploadPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUploadPreviewUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-sm"
                    style={{
                      fontFamily: sans,
                      color: colors.brownMuted,
                    }}
                  >
                    No photo selected
                  </div>
                )}
              </div>
            </div>

            <div className="mb-4 flex justify-center">
              <button
                type="button"
                className="dg-hero-btn rounded border-2 px-4 py-2 text-sm font-semibold"
                style={{
                  ...heroBtnBase,
                  padding: "0.5rem 1rem",
                  fontSize: "0.875rem",
                }}
                onClick={() => dashboardPhotoFileInputRef.current?.click()}
              >
                {photoUploadFile ? "Change photo" : "Choose photo"}
              </button>
            </div>

            <div className="mb-4">
              <label
                className="mb-1 block text-xs font-bold uppercase tracking-wide"
                style={{ fontFamily: sans, color: colors.brownMuted }}
                htmlFor="dashboard-photo-date"
              >
                Date
              </label>
              <input
                id="dashboard-photo-date"
                type="text"
                value={photoUploadDate}
                onChange={(e) => {
                  const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
                  let formatted = raw;
                  if (raw.length > 2) {
                    formatted = `${raw.slice(0, 2)}/${raw.slice(2)}`;
                  }
                  if (raw.length > 4) {
                    formatted = `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}`;
                  }
                  setPhotoUploadDate(formatted);
                }}
                placeholder="MM/DD/YYYY"
                autoComplete="off"
                style={modalInputStyle}
              />
            </div>

            <div className="mb-4">
              <p
                className="mb-1 text-xs font-bold uppercase tracking-wide"
                style={{ fontFamily: sans, color: colors.brownMuted }}
              >
                Tag people
              </p>
              <input
                type="search"
                value={photoUploadTagSearch}
                onChange={(e) => setPhotoUploadTagSearch(e.target.value)}
                placeholder="Search by first or last name…"
                autoComplete="off"
                className="mb-2 w-full"
                style={modalInputStyle}
              />
              {photoUploadTagResults.length > 0 ? (
                <ul className="mb-2 flex flex-wrap gap-2">
                  {photoUploadTagResults.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-left text-sm"
                        style={{
                          fontFamily: sans,
                          borderColor: colors.brownBorder,
                          backgroundColor: colors.cream,
                          color: colors.brownDark,
                        }}
                        onClick={() => {
                          setPhotoUploadTags((prev) =>
                            prev.some((t) => t.id === p.id) ? prev : [...prev, p]
                          );
                          setPhotoUploadTagSearch("");
                          setPhotoUploadTagResults([]);
                          photoUploadSearchSeqRef.current += 1;
                        }}
                      >
                        {displayTagName(p)}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {photoUploadTags.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {photoUploadTags.map((p) => (
                    <span
                      key={p.id}
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm"
                      style={{
                        fontFamily: sans,
                        borderColor: colors.brownBorder,
                        backgroundColor: colors.cream,
                        color: colors.brownDark,
                      }}
                    >
                      {displayTagName(p)}
                      <button
                        type="button"
                        className="ml-0.5 rounded px-1 leading-none"
                        style={{ color: colors.brownMid }}
                        aria-label={`Remove ${displayTagName(p)}`}
                        onClick={() =>
                          setPhotoUploadTags((prev) =>
                            prev.filter((t) => t.id !== p.id)
                          )
                        }
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            {photoUploadError ? (
              <p
                className="mb-4 text-sm"
                style={{ fontFamily: sans, color: "#8B3A3A" }}
                role="alert"
              >
                {photoUploadError}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                className="dg-hero-btn"
                style={heroBtnBase}
                disabled={photoUploadSaving}
                onClick={() => void saveUploadedPhoto()}
              >
                {photoUploadSaving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="dg-hero-btn"
                style={heroBtnBase}
                disabled={photoUploadSaving}
                onClick={closePhotoUploadModal}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
