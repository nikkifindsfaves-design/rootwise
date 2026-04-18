"use client";

import { useTheme } from "@/lib/theme/theme-context";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";

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
};

const VIBES = [
  {
    id: "classic",
    name: "Classic",
    description:
      "Dry wit, sharp observations. Like a true-crime podcast about your family.",
    example:
      "Della Mae Hutchins arrived in Pittsylvania County on a Tuesday in March, 1887, and the paperwork was filed accordingly.",
  },
  {
    id: "gossip_girl",
    name: "Gossip Girl",
    description:
      "Theatrical, knowing, slightly scandalous. XOXO.",
    example:
      "Della Mae Hutchins made her entrance in March 1887 — already fashionably late to the nineteenth century, and not yet done surprising people.",
  },
  {
    id: "old_timey",
    name: "Old-Timey",
    description:
      "A learned gentleman of the 1800s with time to spare and a lot to say.",
    example:
      "It is with no small measure of satisfaction that we record the birth of Miss Della Mae Hutchins, who arrived in Pittsylvania County, Virginia, on the fourth of March, 1887, as if she had always intended to.",
  },
  {
    id: "southern_gothic",
    name: "Southern Gothic",
    description:
      "Slow, atmospheric, beautiful and a little haunted.",
    example:
      "Della Mae Hutchins came into the world in the red clay county of Pittsylvania, Virginia, in the early days of March 1887, when the ground was still cold and everything was beginning anyway.",
  },
  {
    id: "gen_z",
    name: "Gen Z",
    description:
      "Unbothered narrator. Casual. Your ancestor is the main character.",
    example:
      "della mae hutchins was born march 4, 1887 in pittsylvania county, virginia. her dad roy, a farmer, filed the paperwork. very normal start for someone's whole entire life.",
  },
] as const;

const CANVAS_THEMES = [
  {
    id: "string",
    name: "String",
    description: "Default canvas theme.",
    example: "Straightforward layout—names and lines stay easy to scan.",
  },
  {
    id: "dead_gossip",
    name: "Dead Gossip",
    description: "Ledger and letterpress tone.",
    example: "Ink, margins, and quiet drama fit for a family chronicle.",
  },
  {
    id: "roots",
    name: "Roots",
    description: "Grounded, organic palette.",
    example: "Earth tones that feel like soil, bark, and old photographs.",
  },
] as const;

type VibeId = (typeof VIBES)[number]["id"];
type CanvasThemeId = (typeof CANVAS_THEMES)[number]["id"];

function vibeDisplayName(vibeId: string): string {
  const v = VIBES.find((x) => x.id === vibeId);
  return v?.name ?? "Classic";
}

function toVibeId(raw: string): VibeId {
  const v = VIBES.find((x) => x.id === raw);
  return v ? v.id : "classic";
}

function toCanvasThemeId(raw: string): CanvasThemeId {
  const t = CANVAS_THEMES.find((x) => x.id === raw);
  return t ? t.id : "string";
}

function canvasThemeDisplayName(themeId: string): string {
  const t = CANVAS_THEMES.find((x) => x.id === themeId);
  return t?.name ?? "String";
}

export type TreeWithCount = {
  id: string;
  name: string;
  created_at: string;
  ancestorCount: number;
  vibe: string;
  canvas_theme: string;
};

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export default function MyTreesShell({
  trees,
  treesErrorMessage,
  personsErrorMessage,
}: {
  trees: TreeWithCount[];
  treesErrorMessage: string | null;
  personsErrorMessage: string | null;
}) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [newTreeName, setNewTreeName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [vibeModalOpen, setVibeModalOpen] = useState(false);
  const [vibeModalMode, setVibeModalMode] = useState<"create" | "change">(
    "create"
  );
  const [vibeModalTreeId, setVibeModalTreeId] = useState<string | null>(null);
  const [pendingTreeName, setPendingTreeName] = useState("");
  const [selectedVibe, setSelectedVibe] = useState<VibeId | null>(null);
  const [hoveredVibe, setHoveredVibe] = useState<VibeId | null>(null);
  const [vibeChanging, setVibeChanging] = useState(false);
  const [vibeChangeError, setVibeChangeError] = useState<string | null>(null);

  /** Set when creating a tree (inside vibe modal) or changing theme (canvas modal). */
  const [selectedCanvasTheme, setSelectedCanvasTheme] =
    useState<CanvasThemeId | null>(null);
  const [hoveredCanvasThemePick, setHoveredCanvasThemePick] =
    useState<CanvasThemeId | null>(null);

  const [canvasThemeModalOpen, setCanvasThemeModalOpen] = useState(false);
  const [canvasThemeModalTreeId, setCanvasThemeModalTreeId] = useState<
    string | null
  >(null);
  const [canvasThemeChanging, setCanvasThemeChanging] = useState(false);
  const [canvasThemeChangeError, setCanvasThemeChangeError] = useState<
    string | null
  >(null);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalTreeId, setDeleteModalTreeId] = useState<string | null>(
    null
  );
  const [deleteModalTreeName, setDeleteModalTreeName] = useState("");
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }, [router]);

  const heroBtnBase: CSSProperties = {
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

  const btnOutline: CSSProperties = {
    ...heroBtnBase,
    fontSize: "0.875rem",
    padding: "0.55rem 1.2rem",
  };

  const btnPrimaryModal: CSSProperties = {
    fontFamily: sans,
    backgroundColor: colors.brownOutline,
    color: colors.cream,
    border: "none",
    padding: "0.55rem 1.2rem",
    fontSize: "0.875rem",
    fontWeight: 700,
    borderRadius: 2,
    cursor: "pointer",
  };

  const openTreeCardBtnStyle: CSSProperties = {
    ...heroBtnBase,
    fontSize: "1rem",
    width: "100%",
    boxSizing: "border-box",
  };

  const inputStyle: CSSProperties = {
    fontFamily: sans,
    color: colors.brownDark,
    backgroundColor: colors.cream,
    borderColor: colors.brownBorder,
    borderWidth: 1,
    borderStyle: "solid",
    padding: "0.65rem 0.75rem",
    fontSize: "1rem",
    borderRadius: 2,
    width: "100%",
    maxWidth: "24rem",
    boxSizing: "border-box",
    outlineColor: colors.brownOutline,
  };

  function closeVibeModal() {
    if (creating || vibeChanging) return;
    setVibeModalOpen(false);
    setPendingTreeName("");
    setSelectedVibe(null);
    setHoveredVibe(null);
    setVibeModalTreeId(null);
    setVibeChangeError(null);
    setCreateError(null);
    setVibeModalMode("create");
    setSelectedCanvasTheme(null);
    setHoveredCanvasThemePick(null);
  }

  function closeCanvasThemeModal() {
    if (canvasThemeChanging) return;
    setCanvasThemeModalOpen(false);
    setCanvasThemeModalTreeId(null);
    setSelectedCanvasTheme(null);
    setHoveredCanvasThemePick(null);
    setCanvasThemeChangeError(null);
  }

  function handleCreateTree(e: FormEvent) {
    e.preventDefault();
    const name = newTreeName.trim();
    if (name === "") {
      setCreateError("Give your tree a name—the ledger needs a title.");
      return;
    }
    setCreateError(null);
    setPendingTreeName(name);
    setVibeModalMode("create");
    setSelectedVibe(null);
    setSelectedCanvasTheme("string");
    setHoveredCanvasThemePick(null);
    setVibeModalOpen(true);
  }

  async function confirmCreateTree() {
    if (!selectedVibe) return;
    setCreating(true);
    setCreateError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setCreateError("Not signed in.");
        return;
      }
      const { data, error } = await supabase
        .from("trees")
        .insert({
          user_id: user.id,
          name: pendingTreeName,
          vibe: selectedVibe,
          canvas_theme: selectedCanvasTheme ?? "string",
        })
        .select("id")
        .single();
      if (error) {
        setCreateError(error.message);
        return;
      }
      const id = (data as { id: string }).id;
      setNewTreeName("");
      setVibeModalOpen(false);
      setPendingTreeName("");
      setSelectedVibe(null);
      setHoveredVibe(null);
      setSelectedCanvasTheme(null);
      setHoveredCanvasThemePick(null);
      router.push(`/dashboard/${id}`);
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  async function handleChangeVibe(treeId: string, currentVibe: VibeId) {
    setVibeModalTreeId(treeId);
    setSelectedVibe(currentVibe);
    setVibeModalMode("change");
    setVibeModalOpen(true);
    setVibeChangeError(null);
    setSelectedCanvasTheme(null);
    setHoveredCanvasThemePick(null);
  }

  function handleChangeCanvasTheme(treeId: string, currentTheme: CanvasThemeId) {
    setCanvasThemeModalTreeId(treeId);
    setSelectedCanvasTheme(currentTheme);
    setCanvasThemeModalOpen(true);
    setCanvasThemeChangeError(null);
    setHoveredCanvasThemePick(null);
  }

  async function confirmChangeCanvasTheme() {
    if (!canvasThemeModalTreeId || !selectedCanvasTheme) return;
    setCanvasThemeChanging(true);
    setCanvasThemeChangeError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("trees")
        .update({ canvas_theme: selectedCanvasTheme })
        .eq("id", canvasThemeModalTreeId);
      if (error) {
        setCanvasThemeChangeError(error.message);
        return;
      }
      setCanvasThemeModalOpen(false);
      setCanvasThemeModalTreeId(null);
      setSelectedCanvasTheme(null);
      setHoveredCanvasThemePick(null);
      router.refresh();
    } finally {
      setCanvasThemeChanging(false);
    }
  }

  async function confirmChangeVibe() {
    if (!vibeModalTreeId || !selectedVibe) return;
    setVibeChanging(true);
    setVibeChangeError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("trees")
        .update({ vibe: selectedVibe })
        .eq("id", vibeModalTreeId);
      if (error) {
        setVibeChangeError(error.message);
        return;
      }
      setVibeModalOpen(false);
      setVibeModalTreeId(null);
      setSelectedVibe(null);
      setHoveredVibe(null);
      router.refresh();
    } finally {
      setVibeChanging(false);
    }
  }

  function handleDeleteTree(treeId: string, treeName: string) {
    setDeleteModalTreeId(treeId);
    setDeleteModalTreeName(treeName);
    setDeleteConfirmInput("");
    setDeleteError(null);
    setDeleteModalOpen(true);
  }

  function closeDeleteModal() {
    if (deleting) return;
    setDeleteModalOpen(false);
    setDeleteModalTreeId(null);
    setDeleteModalTreeName("");
    setDeleteConfirmInput("");
    setDeleteError(null);
  }

  async function confirmDeleteTree() {
    if (
      deleteModalTreeId === null ||
      deleteConfirmInput !== deleteModalTreeName
    ) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(
        `/api/trees/${deleteModalTreeId}/delete`,
        { method: "DELETE" }
      );
      let data: { error?: string } = {};
      try {
        data = (await res.json()) as { error?: string };
      } catch {
        /* non-JSON body */
      }
      if (!res.ok) {
        setDeleteError(
          typeof data.error === "string" && data.error.trim() !== ""
            ? data.error
            : `Request failed (${res.status})`
        );
        return;
      }
      setDeleteModalOpen(false);
      setDeleteModalTreeId(null);
      setDeleteModalTreeName("");
      setDeleteConfirmInput("");
      setDeleteError(null);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .dg-hero-btn:hover:not(:disabled) {
              background-color: var(--dg-parchment-deep) !important;
              border-color: var(--dg-brown-dark) !important;
            }
            .dg-signout:hover {
              background-color: var(--dg-parchment) !important;
              border-color: var(--dg-brown-border) !important;
            }
            .dg-delete-tree-btn:hover {
              color: var(--dg-danger) !important;
            }
          `,
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
              className="mt-0.5"
              style={{
                fontFamily: sans,
                fontStyle: "italic",
                fontSize: "1rem",
                color: "var(--dg-brown-mid)",
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
            Your Family Trees
          </h1>
          <p
            className="mt-5"
            style={{
              fontFamily: sans,
              fontSize: "1.25rem",
              color: colors.brownMid,
              fontStyle: "italic",
              lineHeight: 1.55,
            }}
          >
            Each tree keeps its own whispers—open one to chart the names, the
            dates, and what the parish register left out.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {treesErrorMessage ? (
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
            Could not load trees: {treesErrorMessage}
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
            Ancestor counts may be incomplete: {personsErrorMessage}
          </p>
        ) : null}

        <section
          className="mb-10 rounded-lg border p-6"
          style={{
            borderColor: colors.brownBorder,
            backgroundColor: colors.parchment,
            boxShadow: "0 8px 28px rgb(var(--dg-shadow-rgb) / 0.08)",
          }}
        >
          <h2
            className="mb-4 text-xl font-bold sm:text-2xl"
            style={{ fontFamily: serif, color: colors.brownDark }}
          >
            Create New Tree
          </h2>
          <p
            className="mb-4"
            style={{
              fontFamily: sans,
              fontSize: "1.1rem",
              color: "var(--dg-brown-mid)",
            }}
          >
            A fresh ledger for a new line—name it whatever the cousins would
            argue over at Sunday dinner.
          </p>
          <form
            className="flex flex-col"
            onSubmit={(e) => handleCreateTree(e)}
          >
            <label
              htmlFor="new-tree-name"
              className="mb-1 block font-bold uppercase tracking-wide"
              style={{
                fontFamily: sans,
                fontSize: "0.85rem",
                color: colors.brownMuted,
              }}
            >
              Tree name
            </label>
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <input
                  id="new-tree-name"
                  type="text"
                  value={newTreeName}
                  onChange={(e) => setNewTreeName(e.target.value)}
                  placeholder="e.g. The Holloway line"
                  disabled={creating}
                  autoComplete="off"
                  style={{ ...inputStyle, maxWidth: "none" }}
                />
              </div>
              <button
                type="submit"
                className="dg-hero-btn min-w-[10rem] shrink-0"
                style={heroBtnBase}
                disabled={creating}
              >
                Create tree
              </button>
            </div>
          </form>
          {createError && !vibeModalOpen ? (
            <p
              className="mt-3 text-sm"
              style={{ fontFamily: sans, color: "#8B3A3A" }}
              role="alert"
            >
              {createError}
            </p>
          ) : null}
        </section>

        <h2
          className="mb-4 font-bold"
          style={{
            fontFamily: serif,
            fontSize: "1.6rem",
            color: colors.brownDark,
          }}
        >
          Your trees
        </h2>

        {trees.length === 0 ? (
          <div
            className="rounded-lg border px-6 py-12 text-center"
            style={{
              borderColor: colors.brownBorder,
              backgroundColor: colors.cream,
            }}
          >
            <p
              className="text-lg"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              No trees yet—nothing to gossip about.
            </p>
            <p
              className="mx-auto mt-3 max-w-md text-sm"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              Spin up your first tree above. Once it exists, you&apos;ll open it
              here and start filling in the names they swore were lost to time.
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trees.map((tree) => (
              <li
                key={tree.id}
                className="flex flex-col rounded-lg border p-8"
                style={{
                  position: "relative",
                  borderColor: colors.brownBorder,
                  backgroundColor: colors.cream,
                  boxShadow: "0 4px 16px rgb(var(--dg-shadow-rgb) / 0.06)",
                }}
              >
                <button
                  type="button"
                  className="dg-delete-tree-btn"
                  aria-label="Delete tree"
                  style={{
                    position: "absolute",
                    top: "0.6rem",
                    right: "0.6rem",
                    backgroundColor: "transparent",
                    border: "none",
                    cursor: "pointer",
                    color: colors.brownMuted,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0.35rem",
                    borderRadius: 4,
                  }}
                  onClick={() => handleDeleteTree(tree.id, tree.name)}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.75}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
                    />
                  </svg>
                </button>
                <h3
                  className="font-bold leading-snug"
                  style={{
                    fontFamily: serif,
                    fontSize: "1.4rem",
                    color: colors.brownDark,
                  }}
                >
                  {tree.name}
                </h3>
                <p
                  className="mt-2"
                  style={{
                    fontFamily: sans,
                    fontSize: "1rem",
                    color: "var(--dg-brown-mid)",
                  }}
                >
                  {tree.ancestorCount}{" "}
                  {tree.ancestorCount === 1 ? "ancestor" : "ancestors"}
                </p>
                <p
                  className="mt-1"
                  style={{
                    fontFamily: sans,
                    fontSize: "1rem",
                    color: "var(--dg-brown-mid)",
                  }}
                >
                  Created {formatCreatedAt(tree.created_at)}
                </p>
                <div className="mt-3 flex flex-wrap items-start gap-x-8 gap-y-3">
                  <div className="flex min-w-0 flex-col">
                    <span
                      className="inline-flex w-fit rounded-full border px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        fontFamily: sans,
                        borderColor: colors.brownBorder,
                        backgroundColor: colors.cream,
                        color: colors.brownDark,
                      }}
                    >
                      {vibeDisplayName(tree.vibe)}
                    </span>
                    <button
                      type="button"
                      className="mt-2 w-fit border-none bg-transparent p-0 text-left text-xs underline-offset-2 hover:underline"
                      style={{ fontFamily: sans, color: colors.brownMuted }}
                      onClick={() =>
                        void handleChangeVibe(tree.id, toVibeId(tree.vibe))
                      }
                    >
                      Change vibe
                    </button>
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span
                      className="inline-flex w-fit rounded-full border px-2.5 py-0.5 text-xs font-medium"
                      style={{
                        fontFamily: sans,
                        borderColor: colors.brownBorder,
                        backgroundColor: colors.cream,
                        color: colors.brownDark,
                      }}
                    >
                      {canvasThemeDisplayName(tree.canvas_theme)}
                    </span>
                    <button
                      type="button"
                      className="mt-2 w-fit border-none bg-transparent p-0 text-left text-xs underline-offset-2 hover:underline"
                      style={{ fontFamily: sans, color: colors.brownMuted }}
                      onClick={() =>
                        handleChangeCanvasTheme(
                          tree.id,
                          toCanvasThemeId(tree.canvas_theme)
                        )
                      }
                    >
                      Change theme
                    </button>
                  </div>
                </div>
                <div
                  className="mt-4 h-px w-full shrink-0"
                  style={{ backgroundColor: `${colors.brownBorder}66` }}
                  aria-hidden
                />
                <Link
                  href={`/dashboard/${tree.id}`}
                  className="dg-hero-btn mt-4 inline-flex w-full items-center justify-center text-center no-underline"
                  style={openTreeCardBtnStyle}
                >
                  Open Tree
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {vibeModalOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="vibe-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !creating && !vibeChanging) {
              closeVibeModal();
            }
          }}
        >
          <div
            className="my-8 w-full max-w-2xl rounded-lg border p-6 shadow-xl"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="vibe-modal-title"
              className="text-2xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Choose your vibe
            </h2>
            {vibeModalMode === "change" ? (
              <p
                className="mt-2 text-sm"
                style={{ fontFamily: sans, color: colors.brownMuted }}
              >
                Changing your vibe affects new uploads only.
              </p>
            ) : null}

            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
              {VIBES.map((v) => {
                const isSelected = selectedVibe === v.id;
                const isHovered = hoveredVibe === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    className="rounded-lg border p-3 text-left transition"
                    style={{
                      borderColor: isSelected
                        ? colors.brownOutline
                        : colors.brownBorder,
                      backgroundColor: isSelected
                        ? "var(--dg-parchment-deep)"
                        : colors.cream,
                      cursor: "pointer",
                    }}
                    onMouseEnter={() => setHoveredVibe(v.id)}
                    onMouseLeave={() => setHoveredVibe(null)}
                    onClick={() => setSelectedVibe(v.id)}
                  >
                    <p
                      className="font-bold leading-tight"
                      style={{ fontFamily: serif, color: colors.brownDark }}
                    >
                      {v.name}
                    </p>
                    <p
                      className="mt-1 text-sm leading-snug"
                      style={{ fontFamily: sans, color: colors.brownMid }}
                    >
                      {v.description}
                    </p>
                    {isHovered ? (
                      <p
                        className="mt-2 text-xs italic leading-snug"
                        style={{ fontFamily: sans, color: colors.brownMuted }}
                      >
                        {v.example}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {vibeModalMode === "create" ? (
              <>
                <h3
                  className="mt-8 text-2xl font-bold"
                  style={{ fontFamily: serif, color: colors.brownDark }}
                >
                  Canvas theme
                </h3>
                <p
                  className="mt-2 text-sm"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  Choose how your family tree looks on the canvas.
                </p>
                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {CANVAS_THEMES.map((ct) => {
                    const isSelected = selectedCanvasTheme === ct.id;
                    const isHovered = hoveredCanvasThemePick === ct.id;
                    return (
                      <button
                        key={ct.id}
                        type="button"
                        className="rounded-lg border p-3 text-left transition"
                        style={{
                          borderColor: isSelected
                            ? colors.brownOutline
                            : colors.brownBorder,
                          backgroundColor: isSelected
                            ? "var(--dg-parchment-deep)"
                            : colors.cream,
                          cursor: "pointer",
                        }}
                        onMouseEnter={() => setHoveredCanvasThemePick(ct.id)}
                        onMouseLeave={() => setHoveredCanvasThemePick(null)}
                        onClick={() => setSelectedCanvasTheme(ct.id)}
                      >
                        <p
                          className="font-bold leading-tight"
                          style={{ fontFamily: serif, color: colors.brownDark }}
                        >
                          {ct.name}
                        </p>
                        <p
                          className="mt-1 text-sm leading-snug"
                          style={{ fontFamily: sans, color: colors.brownMid }}
                        >
                          {ct.description}
                        </p>
                        {isHovered ? (
                          <p
                            className="mt-2 text-xs italic leading-snug"
                            style={{ fontFamily: sans, color: colors.brownMuted }}
                          >
                            {ct.example}
                          </p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center gap-2">
              {vibeModalMode === "create" ? (
                <button
                  type="button"
                  disabled={selectedVibe === null || creating}
                  style={{
                    ...btnPrimaryModal,
                    opacity:
                      selectedVibe === null || creating ? 0.65 : 1,
                    cursor:
                      selectedVibe === null || creating ? "not-allowed" : "pointer",
                  }}
                  onClick={() => void confirmCreateTree()}
                >
                  {creating ? "Creating…" : "Create tree"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={vibeChanging}
                  style={{
                    ...btnPrimaryModal,
                    opacity: vibeChanging ? 0.65 : 1,
                    cursor: vibeChanging ? "wait" : "pointer",
                  }}
                  onClick={() => void confirmChangeVibe()}
                >
                  {vibeChanging ? "Saving…" : "Save"}
                </button>
              )}
              <button
                type="button"
                style={btnOutline}
                disabled={creating || vibeChanging}
                onClick={closeVibeModal}
              >
                Cancel
              </button>
            </div>
            {vibeModalMode === "create" && createError ? (
              <p
                className="mt-3 text-sm"
                style={{ fontFamily: sans, color: "var(--dg-danger)" }}
                role="alert"
              >
                {createError}
              </p>
            ) : null}
            {vibeChangeError ? (
              <p
                className="mt-3 text-sm"
                style={{ fontFamily: sans, color: "var(--dg-danger)" }}
                role="alert"
              >
                {vibeChangeError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {canvasThemeModalOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="canvas-theme-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !canvasThemeChanging) {
              closeCanvasThemeModal();
            }
          }}
        >
          <div
            className="my-8 w-full max-w-2xl rounded-lg border p-6 shadow-xl"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="canvas-theme-modal-title"
              className="text-2xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Choose canvas theme
            </h2>
            <p
              className="mt-2 text-sm"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              This controls the look of the family tree canvas for this tree.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {CANVAS_THEMES.map((ct) => {
                const isSelected = selectedCanvasTheme === ct.id;
                const isHovered = hoveredCanvasThemePick === ct.id;
                return (
                  <button
                    key={ct.id}
                    type="button"
                    className="rounded-lg border p-3 text-left transition"
                    style={{
                      borderColor: isSelected
                        ? colors.brownOutline
                        : colors.brownBorder,
                      backgroundColor: isSelected
                        ? "var(--dg-parchment-deep)"
                        : colors.cream,
                      cursor: "pointer",
                    }}
                    onMouseEnter={() => setHoveredCanvasThemePick(ct.id)}
                    onMouseLeave={() => setHoveredCanvasThemePick(null)}
                    onClick={() => setSelectedCanvasTheme(ct.id)}
                  >
                    <p
                      className="font-bold leading-tight"
                      style={{ fontFamily: serif, color: colors.brownDark }}
                    >
                      {ct.name}
                    </p>
                    <p
                      className="mt-1 text-sm leading-snug"
                      style={{ fontFamily: sans, color: colors.brownMid }}
                    >
                      {ct.description}
                    </p>
                    {isHovered ? (
                      <p
                        className="mt-2 text-xs italic leading-snug"
                        style={{ fontFamily: sans, color: colors.brownMuted }}
                      >
                        {ct.example}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={selectedCanvasTheme === null || canvasThemeChanging}
                style={{
                  ...btnPrimaryModal,
                  opacity:
                    selectedCanvasTheme === null || canvasThemeChanging
                      ? 0.65
                      : 1,
                  cursor:
                    selectedCanvasTheme === null || canvasThemeChanging
                      ? "not-allowed"
                      : "pointer",
                }}
                onClick={() => void confirmChangeCanvasTheme()}
              >
                {canvasThemeChanging ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                style={btnOutline}
                disabled={canvasThemeChanging}
                onClick={closeCanvasThemeModal}
              >
                Cancel
              </button>
            </div>
            {canvasThemeChangeError ? (
              <p
                className="mt-3 text-sm"
                style={{ fontFamily: sans, color: "var(--dg-danger)" }}
                role="alert"
              >
                {canvasThemeChangeError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {deleteModalOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-tree-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeDeleteModal();
            }
          }}
        >
          <div
            className="my-8 w-full max-w-2xl rounded-lg border p-6 shadow-xl"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="delete-tree-modal-title"
              className="text-2xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Delete this tree?
            </h2>
            <p
              className="mt-2"
              style={{
                fontFamily: sans,
                fontSize: "0.9375rem",
                color: colors.brownMuted,
              }}
            >
              This will permanently delete{" "}
              <strong style={{ color: colors.brownDark }}>
                {deleteModalTreeName}
              </strong>{" "}
              and all its ancestors, documents, photos, and relationships. This
              cannot be undone.
            </p>
            <label
              htmlFor="delete-tree-confirm-name"
              className="mb-1 mt-6 block font-bold uppercase tracking-wide"
              style={{
                fontFamily: sans,
                fontSize: "0.85rem",
                color: colors.brownMuted,
              }}
            >
              Type the tree name to confirm
            </label>
            <input
              id="delete-tree-confirm-name"
              type="text"
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              disabled={deleting}
              autoComplete="off"
              style={{ ...inputStyle, maxWidth: "none" }}
            />
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={
                  deleting ||
                  deleteConfirmInput !== deleteModalTreeName
                }
                style={{
                  fontFamily: sans,
                  backgroundColor: "#8B3A3A",
                  color: "white",
                  border: "none",
                  padding: "0.55rem 1.2rem",
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  borderRadius: 2,
                  cursor:
                    deleting || deleteConfirmInput !== deleteModalTreeName
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    deleting || deleteConfirmInput !== deleteModalTreeName
                      ? 0.65
                      : 1,
                }}
                onClick={() => void confirmDeleteTree()}
              >
                {deleting ? "Deleting…" : "Delete tree"}
              </button>
              <button
                type="button"
                style={btnOutline}
                disabled={deleting}
                onClick={closeDeleteModal}
              >
                Cancel
              </button>
            </div>
            {deleteError ? (
              <p
                className="mt-3 text-sm"
                style={{ fontFamily: sans, color: "var(--dg-danger)" }}
                role="alert"
              >
                {deleteError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
