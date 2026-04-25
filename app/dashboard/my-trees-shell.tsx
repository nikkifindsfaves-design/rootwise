"use client";

import { useTheme } from "@/lib/theme/theme-context";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_VIBE } from "@/lib/constants/shared-values";
import {
  CANVAS_THEME_ID,
  CANVAS_THEME_OPTIONS,
  DEFAULT_CANVAS_THEME_ID,
  type CanvasThemeId,
} from "@/lib/themes/canvas-themes";
import { treeCanvasSurfaceStyleForTheme } from "@/lib/themes/tree-canvas-surface-styles";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState, type CSSProperties } from "react";

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
    name: "Case File",
    description: "The record shows what happened. The gaps are more interesting.",
  },
  {
    id: "gossip_girl",
    name: "Scandal Sheet",
    description: "Everyone had a reputation. Yours had one too.",
  },
  {
    id: "hearthside",
    name: "Hearthside",
    description:
      "This is the story as it was told, and worth telling again.",
  },
  {
    id: "southern_gothic",
    name: "Southern Gothic",
    description: "The land remembers what the family forgot.",
  },
  {
    id: "gen_z",
    name: "Gen Z",
    description: "your ancestor had a whole life. let's get into it.",
  },
] as const;

const CREATE_TREE_VIBE_SECTION_HELP =
  "Your vibe is the narrative voice your stories are written in. It shapes tone, not facts — same ancestor, completely different feeling. You can change it any time, but it only affects new stories and any you choose to regenerate.";

const CREATE_TREE_CANVAS_SECTION_HELP =
  "Your canvas theme controls how your family tree looks — the visual style of the tree itself, plus headers and profile frames on each person's page. This is purely cosmetic and can be changed any time without affecting your data.";

type VibeId = (typeof VIBES)[number]["id"];

function toVibeId(raw: string): VibeId {
  if (raw === "old_timey") return "hearthside";
  const v = VIBES.find((x) => x.id === raw);
  return v ? v.id : DEFAULT_VIBE;
}

function toCanvasThemeId(raw: string): CanvasThemeId {
  if (raw === "string") return "evidence_board";
  if (raw === "roots") return "heirloom";
  const t = CANVAS_THEME_OPTIONS.find((x) => x.id === raw);
  return t ? t.id : DEFAULT_CANVAS_THEME_ID;
}

/**
 * Tree list cards use photo textures in app light. Light fills + dark outer glow
 * read better than brown-on-brown. Avoid `var(--dg-cream)` in app dark (it inverts).
 */
function treeListingCardInk(isAppDark: boolean): {
  title: string;
  meta: string;
  icon: string;
  titleShadowLight: string;
  metaShadowLight: string;
  iconFilterLight: string;
  /** `filter` drop-shadow on tree name (light + dark). */
  titleDropFilter: string;
} {
  if (isAppDark) {
    return {
      title: "#faf6f0",
      meta: "rgba(244, 236, 224, 0.92)",
      icon: "rgba(255, 250, 242, 0.92)",
      titleShadowLight: "",
      metaShadowLight: "",
      iconFilterLight: "",
      titleDropFilter:
        "drop-shadow(0 2px 10px rgba(0,0,0,0.55)) drop-shadow(0 1px 4px rgba(0,0,0,0.48)) drop-shadow(0 0 1px rgba(0,0,0,0.35))",
    };
  }
  return {
    title: "#fffefb",
    meta: "rgba(255, 248, 240, 0.96)",
    icon: "#fffefb",
    titleShadowLight:
      "0 0 2px rgba(0,0,0,0.92), 0 0 4px rgba(0,0,0,0.75), 0 1px 4px rgba(0,0,0,0.82), 0 3px 20px rgba(0,0,0,0.55)",
    metaShadowLight:
      "0 0 2px rgba(0,0,0,0.9), 0 1px 3px rgba(0,0,0,0.82), 0 2px 14px rgba(0,0,0,0.52)",
    iconFilterLight:
      "drop-shadow(0 0 2px rgba(0,0,0,0.95)) drop-shadow(0 1px 3px rgba(0,0,0,0.88)) drop-shadow(0 2px 10px rgba(0,0,0,0.55))",
    titleDropFilter:
      "drop-shadow(0 4px 18px rgba(0,0,0,0.42)) drop-shadow(0 2px 8px rgba(0,0,0,0.35)) drop-shadow(0 1px 2px rgba(0,0,0,0.28))",
  };
}

function treeListingCardFonts(
  canvasTheme: CanvasThemeId,
  isAppDark: boolean
): {
  heading: string;
  body: string;
  headingItalic: boolean;
  headingWeight: CSSProperties["fontWeight"];
  metaFontSize: string;
  metaFontWeight: CSSProperties["fontWeight"];
} {
  const metaDefault = { size: "0.9375rem", weight: 600 as const };
  const metaEvidenceLight = { size: "1.0625rem", weight: 700 as const };

  if (canvasTheme === CANVAS_THEME_ID.ROOTS) {
    const meta = !isAppDark ? metaEvidenceLight : metaDefault;
    return {
      heading:
        "var(--font-heirloom), var(--font-dg-display), Georgia, serif",
      body: "var(--font-heirloom-body), var(--font-dg-body), Lato, sans-serif",
      headingItalic: true,
      headingWeight: 600,
      metaFontSize: meta.size,
      metaFontWeight: meta.weight,
    };
  }
  if (canvasTheme === CANVAS_THEME_ID.DEAD_GOSSIP) {
    const meta = !isAppDark ? metaEvidenceLight : metaDefault;
    return {
      heading:
        "var(--font-dead-gossip), var(--font-dg-display), Georgia, serif",
      body: "var(--font-dead-gossip-body), var(--font-dg-body), Lato, sans-serif",
      headingItalic: false,
      headingWeight: 700,
      metaFontSize: meta.size,
      metaFontWeight: meta.weight,
    };
  }
  const isEvidenceCorkLight = !isAppDark;
  return {
    heading:
      "var(--font-evidence-board), var(--font-dg-display), Georgia, serif",
    body: "var(--font-evidence-board-body), var(--font-dg-body), Lato, sans-serif",
    headingItalic: false,
    headingWeight: 700,
    metaFontSize: isEvidenceCorkLight
      ? metaEvidenceLight.size
      : metaDefault.size,
    metaFontWeight: isEvidenceCorkLight
      ? metaEvidenceLight.weight
      : metaDefault.weight,
  };
}

export type TreeWithCount = {
  id: string;
  name: string;
  created_at: string;
  ancestorCount: number;
  vibe: string;
  canvas_theme: string;
};

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
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [vibeModalOpen, setVibeModalOpen] = useState(false);
  const [pendingTreeName, setPendingTreeName] = useState("");
  const [selectedVibe, setSelectedVibe] = useState<VibeId | null>(null);
  const [hoveredVibe, setHoveredVibe] = useState<VibeId | null>(null);

  /** Set when creating a tree (inside vibe modal). */
  const [selectedCanvasTheme, setSelectedCanvasTheme] =
    useState<CanvasThemeId | null>(null);
  const [hoveredCanvasThemePick, setHoveredCanvasThemePick] =
    useState<CanvasThemeId | null>(null);
  const [createTreeSectionInfo, setCreateTreeSectionInfo] = useState<
    null | "vibe" | "canvas"
  >(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTreeId, setEditTreeId] = useState<string | null>(null);
  const [editTreeName, setEditTreeName] = useState("");
  const [editVibe, setEditVibe] = useState<VibeId>(DEFAULT_VIBE as VibeId);
  const [editCanvasTheme, setEditCanvasTheme] =
    useState<CanvasThemeId>(DEFAULT_CANVAS_THEME_ID);
  const [editHoveredVibe, setEditHoveredVibe] = useState<VibeId | null>(null);
  const [editHoveredCanvas, setEditHoveredCanvas] =
    useState<CanvasThemeId | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

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
    if (creating) return;
    setVibeModalOpen(false);
    setPendingTreeName("");
    setSelectedVibe(null);
    setHoveredVibe(null);
    setCreateError(null);
    setSelectedCanvasTheme(null);
    setHoveredCanvasThemePick(null);
    setCreateTreeSectionInfo(null);
  }

  function closeEditModal() {
    if (editSaving) return;
    setEditModalOpen(false);
    setEditTreeId(null);
    setEditTreeName("");
    setEditHoveredVibe(null);
    setEditHoveredCanvas(null);
    setEditError(null);
  }

  function openEditTree(tree: TreeWithCount) {
    setEditTreeId(tree.id);
    setEditTreeName(tree.name);
    setEditVibe(toVibeId(tree.vibe));
    setEditCanvasTheme(toCanvasThemeId(tree.canvas_theme));
    setEditHoveredVibe(null);
    setEditHoveredCanvas(null);
    setEditError(null);
    setEditModalOpen(true);
  }

  async function confirmEditTree() {
    if (!editTreeId) return;
    const name = editTreeName.trim();
    if (name === "") {
      setEditError("Tree name cannot be empty.");
      return;
    }
    setEditSaving(true);
    setEditError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("trees")
        .update({
          name,
          vibe: editVibe,
          canvas_theme: editCanvasTheme,
        })
        .eq("id", editTreeId);
      if (error) {
        setEditError(error.message);
        return;
      }
      closeEditModal();
      router.refresh();
    } finally {
      setEditSaving(false);
    }
  }

  function openCreateTreeFromCard() {
    setCreateError(null);
    setPendingTreeName("");
    setSelectedVibe(null);
    setHoveredVibe(null);
    setSelectedCanvasTheme(DEFAULT_CANVAS_THEME_ID);
    setHoveredCanvasThemePick(null);
    setVibeModalOpen(true);
  }

  async function confirmCreateTree() {
    if (!selectedVibe) return;
    const name = pendingTreeName.trim();
    if (name === "") {
      setCreateError("Give your tree a name—the ledger needs a title.");
      return;
    }
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
          name,
          vibe: selectedVibe,
          canvas_theme: selectedCanvasTheme ?? DEFAULT_CANVAS_THEME_ID,
        })
        .select("id")
        .maybeSingle();
      if (error) {
        setCreateError(error.message);
        return;
      }
      if (!data) {
        console.warn("Tree creation returned no record.");
        return;
      }
      const id = (data as { id: string }).id;
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
            .dg-edit-tree-btn:hover {
              color: var(--dg-brown-dark) !important;
            }
            .dg-tree-list-card-wrap {
              border-radius: 0.5rem;
              min-height: 0;
              align-self: stretch;
              display: flex;
              flex-direction: column;
              transition: transform 0.22s ease, box-shadow 0.22s ease;
            }
            .dg-tree-list-card-wrap:hover,
            .dg-tree-list-card-wrap:focus-within {
              transform: translateY(-3px);
              box-shadow:
                0 18px 44px rgb(var(--dg-shadow-rgb) / 0.28),
                0 8px 22px rgb(var(--dg-shadow-rgb) / 0.16);
            }
            .dark .dg-tree-list-card-wrap:hover,
            .dark .dg-tree-list-card-wrap:focus-within {
              box-shadow:
                0 22px 52px rgba(0, 0, 0, 0.42),
                0 10px 26px rgba(0, 0, 0, 0.28);
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
          <div className="mb-5">
            <h2
              className="text-xl font-bold sm:text-2xl"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Your trees
            </h2>
          </div>

          {trees.length === 0 ? (
            <div className="mb-6 rounded-lg border px-4 py-6 text-center sm:px-6">
              <p
                className="text-lg"
                style={{ fontFamily: serif, color: colors.brownDark }}
              >
                No trees yet—nothing to gossip about.
              </p>
              <p
                className="mx-auto mt-2 max-w-md text-sm"
                style={{ fontFamily: sans, color: colors.brownMuted }}
              >
                Use New tree below to start your first ledger. Once it exists,
                you&apos;ll open it here and start filling in the names they
                swore were lost to time.
              </p>
            </div>
          ) : null}

          <ul
            className="grid gap-4"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(200px, 200px))",
            }}
          >
            {trees.map((tree) => {
              const canvasResolved = toCanvasThemeId(tree.canvas_theme);
              const isAppDark = theme === "dark";
              const surface = treeCanvasSurfaceStyleForTheme(
                canvasResolved,
                isAppDark
              );
              const ink = treeListingCardInk(isAppDark);
              const fonts = treeListingCardFonts(canvasResolved, isAppDark);
              const titleShadow = isAppDark
                ? "0 1px 3px rgba(0,0,0,0.85), 0 0 1px rgba(0,0,0,0.6), 0 2px 12px rgba(0,0,0,0.35)"
                : ink.titleShadowLight;
              const metaShadow = isAppDark
                ? "0 1px 2px rgba(0,0,0,0.75)"
                : ink.metaShadowLight;
              const iconShadow = isAppDark
                ? "drop-shadow(0 1px 2px rgba(0,0,0,0.85))"
                : ink.iconFilterLight;
              return (
                <div
                  key={tree.id}
                  className="dg-tree-list-card-wrap w-full min-w-0 max-w-[200px]"
                >
                <li
                  className="group relative flex h-full min-h-[9.5rem] w-full min-w-0 flex-col overflow-hidden rounded-lg border shadow-sm"
                  style={{
                    position: "relative",
                    borderColor: `${colors.brownBorder}bb`,
                    boxShadow: "0 4px 20px rgb(var(--dg-shadow-rgb) / 0.12)",
                    ...surface,
                  }}
                >
                  <Link
                    href={`/dashboard/${tree.id}`}
                    className="absolute inset-0 z-[1] rounded-lg"
                    aria-label={`Open tree ${tree.name}`}
                  />
                  <div
                    className="relative z-20 flex shrink-0 justify-end gap-0.5 px-2.5 pt-2"
                    style={{ pointerEvents: "auto" }}
                  >
                    <span
                      role="button"
                      tabIndex={0}
                      className="dg-edit-tree-btn inline-flex cursor-pointer p-1.5"
                      style={{ color: ink.icon, filter: iconShadow }}
                      aria-label="Edit tree name, vibe, and canvas"
                      onClick={() => openEditTree(tree)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openEditTree(tree);
                        }
                      }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.75}
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 20h9"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                        />
                      </svg>
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      className="dg-delete-tree-btn inline-flex cursor-pointer p-1.5"
                      style={{ color: ink.icon, filter: iconShadow }}
                      aria-label="Delete tree"
                      onClick={() => handleDeleteTree(tree.id, tree.name)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleDeleteTree(tree.id, tree.name);
                        }
                      }}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.75}
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"
                        />
                      </svg>
                    </span>
                  </div>
                  <div className="pointer-events-none relative z-[2] min-w-0 flex-1 px-2.5 pb-2.5 pt-1">
                    <h3
                      className="line-clamp-3 min-w-0 break-words leading-snug"
                      style={{
                        fontFamily: fonts.heading,
                        fontStyle: fonts.headingItalic ? "italic" : undefined,
                        fontWeight: fonts.headingWeight,
                        fontSize: "clamp(1.05rem, 2.5vw, 1.28rem)",
                        letterSpacing: fonts.headingItalic ? "0.02em" : "0.03em",
                        color: ink.title,
                        textShadow: titleShadow,
                        filter: ink.titleDropFilter,
                      }}
                    >
                      {tree.name}
                    </h3>
                    <p
                      className="mt-1 shrink-0"
                      style={{
                        fontFamily: fonts.body,
                        fontSize: `calc(${fonts.metaFontSize} * 0.88)`,
                        fontWeight: fonts.metaFontWeight,
                        color: ink.meta,
                        textShadow: metaShadow,
                        lineHeight: 1.35,
                      }}
                    >
                      {tree.ancestorCount}{" "}
                      {tree.ancestorCount === 1 ? "ancestor" : "ancestors"}
                    </p>
                  </div>
                </li>
                </div>
              );
            })}
            <div className="flex w-full min-w-0 max-w-[200px] flex-col self-stretch">
              <button
                type="button"
                className="flex h-full min-h-[9.5rem] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-2.5 py-3 transition-opacity hover:opacity-90"
                style={{
                  borderColor: colors.brownBorder,
                  backgroundColor: colors.cream,
                  fontFamily: sans,
                  color: colors.brownMid,
                  cursor: "pointer",
                  boxSizing: "border-box",
                }}
                onClick={() => openCreateTreeFromCard()}
              >
                <span
                  className="text-[1.65rem] font-light leading-none"
                  style={{ color: colors.brownDark }}
                  aria-hidden
                >
                  +
                </span>
                <span className="text-sm font-semibold">New tree</span>
              </button>
            </div>
          </ul>
        </section>

        <section
          className="mb-10 rounded-lg border p-6"
          style={{
            borderColor: colors.brownBorder,
            backgroundColor: colors.parchment,
            boxShadow: "0 8px 28px rgb(var(--dg-shadow-rgb) / 0.08)",
          }}
        >
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2
              className="text-xl font-bold sm:text-2xl"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Needs attention
            </h2>
            <button
              type="button"
              className="shrink-0 border-none bg-transparent p-0 text-sm underline-offset-2 hover:underline"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              View all
            </button>
          </div>
          <div>
            <div
              className="flex items-start gap-3 border-b py-3 last:border-b-0"
              style={{ borderColor: `${colors.brownBorder}66` }}
            >
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: "#b45309" }}
                aria-hidden
              />
              <p
                className="text-sm leading-snug"
                style={{ fontFamily: sans, color: colors.brownMid }}
              >
                Review suggested merge for two John Smith entries in the 1880
                census draft.
              </p>
            </div>
            <div
              className="flex items-start gap-3 border-b py-3 last:border-b-0"
              style={{ borderColor: `${colors.brownBorder}66` }}
            >
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: "#2563eb" }}
                aria-hidden
              />
              <p
                className="text-sm leading-snug"
                style={{ fontFamily: sans, color: colors.brownMid }}
              >
                One baptism record is waiting for source confirmation before it
                can move to verified.
              </p>
            </div>
            <div className="flex items-start gap-3 py-3">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: "#7c3aed" }}
                aria-hidden
              />
              <p
                className="text-sm leading-snug"
                style={{ fontFamily: sans, color: colors.brownMid }}
              >
                Place standardization flagged a county boundary change for an
                1870 land deed pin.
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section
            className="rounded-lg border p-6"
            style={{
              borderColor: colors.brownBorder,
              backgroundColor: colors.parchment,
              boxShadow: "0 8px 28px rgb(var(--dg-shadow-rgb) / 0.08)",
            }}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2
                className="text-xl font-bold sm:text-2xl"
                style={{ fontFamily: serif, color: colors.brownDark }}
              >
                Research resources
              </h2>
              <button
                type="button"
                className="shrink-0 border-none bg-transparent p-0 text-sm underline-offset-2 hover:underline"
                style={{ fontFamily: sans, color: colors.brownMuted }}
              >
                Browse all →
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["Census records", "Free sources and tips"],
                  ["Land and deeds", "Where to look"],
                  ["Vital records", "By state and era"],
                  ["Church records", "Baptism and burial"],
                ] as const
              ).map(([title, subtitle]) => (
                <div
                  key={title}
                  className="rounded-md border p-3 sm:p-4"
                  style={{
                    borderColor: colors.brownBorder,
                    backgroundColor: colors.cream,
                  }}
                >
                  <p
                    className="text-sm font-bold leading-tight sm:text-base"
                    style={{ fontFamily: serif, color: colors.brownDark }}
                  >
                    {title}
                  </p>
                  <p
                    className="mt-1 text-xs leading-snug sm:text-sm"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                  >
                    {subtitle}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section
            className="rounded-lg border p-6"
            style={{
              borderColor: colors.brownBorder,
              backgroundColor: colors.parchment,
              boxShadow: "0 8px 28px rgb(var(--dg-shadow-rgb) / 0.08)",
            }}
          >
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2
                className="text-xl font-bold sm:text-2xl"
                style={{ fontFamily: serif, color: colors.brownDark }}
              >
                Ask a question
              </h2>
              <span
                className="rounded-full border px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
                style={{
                  fontFamily: sans,
                  borderColor: colors.brownBorder,
                  color: colors.brownMuted,
                  backgroundColor: colors.cream,
                }}
              >
                Coming soon
              </span>
            </div>
            <div className="space-y-3">
              <div
                className="rounded-lg border px-3 py-2.5 text-sm leading-relaxed"
                style={{
                  fontFamily: sans,
                  borderColor: `${colors.brownBorder}99`,
                  backgroundColor: colors.cream,
                  color: colors.brownMid,
                }}
              >
                “Who migrated between these two counties in the 1890s, and what
                records would prove it?”
              </div>
              <div
                className="rounded-lg border px-3 py-2.5 text-sm leading-relaxed"
                style={{
                  fontFamily: sans,
                  borderColor: `${colors.brownBorder}99`,
                  backgroundColor: colors.cream,
                  color: colors.brownMid,
                }}
              >
                “List everyone in this tree with a missing death date before
                1950.”
              </div>
            </div>
            <p
              className="mt-4 text-sm leading-relaxed"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              Ask questions across all your trees. Spot patterns, find gaps.
            </p>
          </section>
        </div>
      </div>

      {vibeModalOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto overscroll-y-contain p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-tree-name-label vibe-modal-title canvas-theme-heading"
        >
          <div
            className="my-8 w-full max-w-xl rounded-lg border p-5 shadow-xl"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <label
              id="create-tree-name-label"
              htmlFor="create-tree-name"
              className="mb-1 block font-bold uppercase tracking-wide"
              style={{
                fontFamily: sans,
                fontSize: "0.85rem",
                color: colors.brownMuted,
              }}
            >
              Tree name
            </label>
            <input
              id="create-tree-name"
              type="text"
              value={pendingTreeName}
              onChange={(e) => setPendingTreeName(e.target.value)}
              placeholder="e.g. The Holloway line"
              disabled={creating}
              autoComplete="off"
              style={{ ...inputStyle, maxWidth: "none" }}
            />

            <div className="mt-6 flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <h2
                id="vibe-modal-title"
                className="m-0 text-xl font-bold leading-tight sm:text-2xl"
                style={{ fontFamily: serif, color: colors.brownDark }}
              >
                Choose your vibe
              </h2>
              <div
                className="relative inline-flex shrink-0"
                onMouseEnter={() => {
                  if (!creating) setCreateTreeSectionInfo("vibe");
                }}
                onMouseLeave={() => setCreateTreeSectionInfo(null)}
              >
                <button
                  type="button"
                  className="flex h-5 w-5 items-center justify-center rounded-full border"
                  style={{
                    borderColor: colors.brownBorder,
                    backgroundColor: colors.cream,
                    color: colors.brownMuted,
                    cursor: creating ? "not-allowed" : "default",
                  }}
                  disabled={creating}
                  aria-label="What is a vibe?"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="9"
                    height="9"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4" />
                    <path d="M12 8h.01" />
                  </svg>
                </button>
                {createTreeSectionInfo === "vibe" ? (
                  <div
                    className="pointer-events-none absolute left-0 top-full z-[220] mt-1.5 w-[min(18rem,calc(100vw-2.5rem))] rounded-md border px-3 py-2 text-left text-xs leading-snug"
                    role="tooltip"
                    style={{
                      fontFamily: sans,
                      color: colors.brownDark,
                      borderColor: colors.brownBorder,
                      backgroundColor: colors.cream,
                      boxShadow:
                        "0 10px 24px rgb(var(--dg-shadow-rgb) / 0.18)",
                    }}
                  >
                    {CREATE_TREE_VIBE_SECTION_HELP}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
              {VIBES.map((v) => {
                const isSelected = selectedVibe === v.id;
                const isHovered = hoveredVibe === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    className="relative h-14 rounded-lg border px-2.5 py-2 text-left transition-shadow"
                    style={{
                      borderColor: isSelected
                        ? colors.brownOutline
                        : colors.brownBorder,
                      backgroundColor: isSelected
                        ? "var(--dg-parchment-deep)"
                        : colors.cream,
                      boxShadow: isHovered
                        ? "0 10px 24px rgb(var(--dg-shadow-rgb) / 0.18)"
                        : "none",
                      cursor: "pointer",
                    }}
                    onMouseEnter={() => setHoveredVibe(v.id)}
                    onMouseLeave={() => setHoveredVibe(null)}
                    onClick={() => setSelectedVibe(v.id)}
                  >
                    <p
                      className="text-sm font-bold leading-tight"
                      style={{ fontFamily: serif, color: colors.brownDark }}
                    >
                      {v.name}
                    </p>
                    {isHovered ? (
                      <div
                        className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-60 -translate-x-1/2 rounded-md border px-3 py-2 text-xs leading-snug"
                        style={{
                          fontFamily: sans,
                          color: colors.brownDark,
                          borderColor: colors.brownBorder,
                          backgroundColor: colors.cream,
                          boxShadow:
                            "0 10px 24px rgb(var(--dg-shadow-rgb) / 0.18)",
                        }}
                      >
                        {v.description}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              <button
                type="button"
                className="border-none bg-transparent p-0 text-xs underline-offset-2 hover:underline"
                style={{ fontFamily: sans, color: colors.brownMuted }}
              >
                See all vibes compared →
              </button>
            </div>

            <>
              <div className="mt-6 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <h3
                  id="canvas-theme-heading"
                  className="m-0 text-xl font-bold leading-tight sm:text-2xl"
                  style={{ fontFamily: serif, color: colors.brownDark }}
                >
                  Canvas theme
                </h3>
                <div
                  className="relative inline-flex shrink-0"
                  onMouseEnter={() => {
                    if (!creating) setCreateTreeSectionInfo("canvas");
                  }}
                  onMouseLeave={() => setCreateTreeSectionInfo(null)}
                >
                  <button
                    type="button"
                    className="flex h-5 w-5 items-center justify-center rounded-full border"
                    style={{
                      borderColor: colors.brownBorder,
                      backgroundColor: colors.cream,
                      color: colors.brownMuted,
                      cursor: creating ? "not-allowed" : "default",
                    }}
                    disabled={creating}
                    aria-label="What is a canvas theme?"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="9"
                      height="9"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4" />
                      <path d="M12 8h.01" />
                    </svg>
                  </button>
                  {createTreeSectionInfo === "canvas" ? (
                    <div
                      className="pointer-events-none absolute left-0 top-full z-[220] mt-1.5 w-[min(18rem,calc(100vw-2.5rem))] rounded-md border px-3 py-2 text-left text-xs leading-snug"
                      role="tooltip"
                      style={{
                        fontFamily: sans,
                        color: colors.brownDark,
                        borderColor: colors.brownBorder,
                        backgroundColor: colors.cream,
                        boxShadow:
                          "0 10px 24px rgb(var(--dg-shadow-rgb) / 0.18)",
                      }}
                    >
                      {CREATE_TREE_CANVAS_SECTION_HELP}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {CANVAS_THEME_OPTIONS.map((ct) => {
                  const isSelected = selectedCanvasTheme === ct.id;
                  const isHovered = hoveredCanvasThemePick === ct.id;
                  return (
                    <button
                      key={ct.id}
                      type="button"
                      className="relative h-14 rounded-lg border px-2.5 py-2 text-left transition-shadow"
                      style={{
                        borderColor: isSelected
                          ? colors.brownOutline
                          : colors.brownBorder,
                        backgroundColor: isSelected
                          ? "var(--dg-parchment-deep)"
                          : colors.cream,
                        boxShadow: isHovered
                          ? "0 10px 24px rgb(var(--dg-shadow-rgb) / 0.18)"
                          : "none",
                        cursor: "pointer",
                      }}
                      onMouseEnter={() => setHoveredCanvasThemePick(ct.id)}
                      onMouseLeave={() => setHoveredCanvasThemePick(null)}
                      onClick={() => setSelectedCanvasTheme(ct.id)}
                    >
                      <p
                        className="text-sm font-bold leading-tight"
                        style={{ fontFamily: serif, color: colors.brownDark }}
                      >
                        {ct.name}
                      </p>
                      {isHovered ? (
                        <div
                          className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-60 -translate-x-1/2 rounded-md border px-3 py-2 text-xs leading-snug"
                          style={{
                            fontFamily: sans,
                            color: colors.brownDark,
                            borderColor: colors.brownBorder,
                            backgroundColor: colors.cream,
                            boxShadow:
                              "0 10px 24px rgb(var(--dg-shadow-rgb) / 0.18)",
                          }}
                        >
                          {ct.description}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={
                  selectedVibe === null ||
                  creating ||
                  pendingTreeName.trim() === ""
                }
                style={{
                  ...btnPrimaryModal,
                  opacity:
                    selectedVibe === null ||
                    creating ||
                    pendingTreeName.trim() === ""
                      ? 0.65
                      : 1,
                  cursor:
                    selectedVibe === null ||
                    creating ||
                    pendingTreeName.trim() === ""
                      ? "not-allowed"
                      : "pointer",
                }}
                onClick={() => void confirmCreateTree()}
              >
                {creating ? "Creating…" : "Create tree"}
              </button>
              <button
                type="button"
                style={btnOutline}
                disabled={creating}
                onClick={closeVibeModal}
              >
                Cancel
              </button>
            </div>
            {createError ? (
              <p
                className="mt-3 text-sm"
                style={{ fontFamily: sans, color: "var(--dg-danger)" }}
                role="alert"
              >
                {createError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {editModalOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto overscroll-y-contain p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-tree-modal-title"
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
              id="edit-tree-modal-title"
              className="text-2xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Edit tree
            </h2>
            <p
              className="mt-2 text-sm"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              Update the ledger title, narrative vibe, and tree canvas look.
              Canvas changes are cosmetic only.
            </p>

            <label
              htmlFor="edit-tree-name"
              className="mb-1 mt-6 block font-bold uppercase tracking-wide"
              style={{
                fontFamily: sans,
                fontSize: "0.85rem",
                color: colors.brownMuted,
              }}
            >
              Tree name
            </label>
            <input
              id="edit-tree-name"
              type="text"
              value={editTreeName}
              onChange={(e) => setEditTreeName(e.target.value)}
              disabled={editSaving}
              autoComplete="off"
              style={{ ...inputStyle, maxWidth: "none" }}
            />

            <h3
              className="mt-8 text-xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Vibe
            </h3>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
              {VIBES.map((v) => {
                const isSelected = editVibe === v.id;
                const isHovered = editHoveredVibe === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    className="relative h-14 rounded-lg border px-2.5 py-2 text-left transition-shadow"
                    style={{
                      borderColor: isSelected
                        ? colors.brownOutline
                        : colors.brownBorder,
                      backgroundColor: isSelected
                        ? "var(--dg-parchment-deep)"
                        : colors.cream,
                      boxShadow: isHovered
                        ? "0 10px 24px rgb(var(--dg-shadow-rgb) / 0.18)"
                        : "none",
                      cursor: "pointer",
                    }}
                    onMouseEnter={() => setEditHoveredVibe(v.id)}
                    onMouseLeave={() => setEditHoveredVibe(null)}
                    onClick={() => setEditVibe(v.id)}
                  >
                    <p
                      className="text-sm font-bold leading-tight"
                      style={{ fontFamily: serif, color: colors.brownDark }}
                    >
                      {v.name}
                    </p>
                    {isHovered ? (
                      <div
                        className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-60 -translate-x-1/2 rounded-md border px-3 py-2 text-xs leading-snug"
                        style={{
                          fontFamily: sans,
                          color: colors.brownDark,
                          borderColor: colors.brownBorder,
                          backgroundColor: colors.cream,
                          boxShadow:
                            "0 10px 24px rgb(var(--dg-shadow-rgb) / 0.18)",
                        }}
                      >
                        {v.description}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <h3
              className="mt-8 text-xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Canvas theme
            </h3>
            <p
              className="mt-2 text-sm"
              style={{
                fontFamily: sans,
                color: colors.brownMuted,
                lineHeight: 1.6,
              }}
            >
              Matches the background on your family tree canvas and profile
              frames for this tree.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {CANVAS_THEME_OPTIONS.map((ct) => {
                const isSelected = editCanvasTheme === ct.id;
                const isHovered = editHoveredCanvas === ct.id;
                return (
                  <button
                    key={ct.id}
                    type="button"
                    className="relative h-14 rounded-lg border px-2.5 py-2 text-left transition-shadow"
                    style={{
                      borderColor: isSelected
                        ? colors.brownOutline
                        : colors.brownBorder,
                      backgroundColor: isSelected
                        ? "var(--dg-parchment-deep)"
                        : colors.cream,
                      boxShadow: isHovered
                        ? "0 10px 24px rgb(var(--dg-shadow-rgb) / 0.18)"
                        : "none",
                      cursor: "pointer",
                    }}
                    onMouseEnter={() => setEditHoveredCanvas(ct.id)}
                    onMouseLeave={() => setEditHoveredCanvas(null)}
                    onClick={() => setEditCanvasTheme(ct.id)}
                  >
                    <p
                      className="text-sm font-bold leading-tight"
                      style={{ fontFamily: serif, color: colors.brownDark }}
                    >
                      {ct.name}
                    </p>
                    {isHovered ? (
                      <div
                        className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-60 -translate-x-1/2 rounded-md border px-3 py-2 text-xs leading-snug"
                        style={{
                          fontFamily: sans,
                          color: colors.brownDark,
                          borderColor: colors.brownBorder,
                          backgroundColor: colors.cream,
                          boxShadow:
                            "0 10px 24px rgb(var(--dg-shadow-rgb) / 0.18)",
                        }}
                      >
                        {ct.description}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={editSaving}
                style={{
                  ...btnPrimaryModal,
                  opacity: editSaving ? 0.65 : 1,
                  cursor: editSaving ? "wait" : "pointer",
                }}
                onClick={() => void confirmEditTree()}
              >
                {editSaving ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                style={btnOutline}
                disabled={editSaving}
                onClick={closeEditModal}
              >
                Cancel
              </button>
            </div>
            {editError ? (
              <p
                className="mt-3 text-sm"
                style={{ fontFamily: sans, color: "var(--dg-danger)" }}
                role="alert"
              >
                {editError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {deleteModalOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto overscroll-y-contain p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-tree-modal-title"
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
