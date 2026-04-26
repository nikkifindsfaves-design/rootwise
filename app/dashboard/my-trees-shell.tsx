"use client";

import { useTheme } from "@/lib/theme/theme-context";
import { createClient } from "@/lib/supabase/client";
import {
  ADDON_PACKS,
  getTierDisplayName,
} from "@/lib/billing/config";
import { DEFAULT_VIBE } from "@/lib/constants/shared-values";
import {
  CANVAS_THEME_ID,
  CANVAS_THEME_OPTIONS,
  DEFAULT_CANVAS_THEME_ID,
  type CanvasThemeId,
} from "@/lib/themes/canvas-themes";
import { treeCanvasSurfaceStyleForTheme } from "@/lib/themes/tree-canvas-surface-styles";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties } from "react";

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

type TodayHistoryItem = {
  id: string;
  personName: string;
  eventType: string;
  eventDateLabel: string;
  storyFull: string | null;
  description: string | null;
  notes: string | null;
};

const DUMMY_TODAY_HISTORY: TodayHistoryItem[] = [
  {
    id: "dummy-1",
    personName: "Eliza Holloway",
    eventType: "Birth",
    eventDateLabel: "Apr 25, 1882",
    storyFull:
      "Eliza Holloway arrived just before dawn while spring rain tapped the roofline, and the parish entry fixed her beginning in careful ink.",
    description: null,
    notes: null,
  },
  {
    id: "dummy-2",
    personName: "Thomas Garrett",
    eventType: "Land Deed",
    eventDateLabel: "Apr 24, 1819",
    storyFull: null,
    description:
      "Purchased 34.5 acres along the eastern ridge near Randolph County.",
    notes: null,
  },
  {
    id: "dummy-3",
    personName: "Mary Anne Ford",
    eventType: "Residence",
    eventDateLabel: "Apr 28, 1900",
    storyFull: null,
    description: null,
    notes:
      "Listed with husband John Ford and two children in the census household.",
  },
];

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

function teaserFromHistoryItem(item: TodayHistoryItem): string {
  const first =
    item.storyFull?.trim() ?? item.description?.trim() ?? item.notes?.trim() ?? "";
  if (first !== "") {
    return first.length > 128 ? `${first.slice(0, 125)}…` : first;
  }
  return `${item.personName} — ${item.eventType} (${item.eventDateLabel}).`;
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
  const searchParams = useSearchParams();
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

  /** When set, the create/edit tree modal is saving an existing tree instead of inserting. */
  const [editingTreeId, setEditingTreeId] = useState<string | null>(null);
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
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingSnapshot, setBillingSnapshot] = useState<{
    tier: "basic" | "pro" | "max" | "possessed";
    subscriptionCredits: number;
    addonCredits: number;
    totalCredits: number;
    canUseExtraction: boolean;
    monthlyResetAt: string | null;
  } | null>(null);
  const [billingWorking, setBillingWorking] = useState<null | "addon">(
    null
  );
  const [addonModalOpen, setAddonModalOpen] = useState(false);
  const [selectedAddonPack, setSelectedAddonPack] =
    useState<keyof typeof ADDON_PACKS>("credits_250");

  const handleSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }, [router]);

  const refreshBilling = useCallback(async () => {
    setBillingLoading(true);
    try {
      const response = await fetch("/api/billing/status", { method: "GET" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string" ? data.error : "Could not load billing status."
        );
      }
      setBillingSnapshot(data.snapshot ?? null);
      setBillingError(null);
    } catch (error) {
      setBillingError(
        error instanceof Error ? error.message : "Could not load billing status."
      );
    } finally {
      setBillingLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBilling();
  }, [refreshBilling]);
  useEffect(() => {
    const billingReturn = searchParams.get("billing");
    if (billingReturn === "success" || billingReturn === "cancel") {
      void refreshBilling();
    }
  }, [refreshBilling, searchParams]);
  useEffect(() => {
    const onFocus = () => {
      void refreshBilling();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshBilling]);

  async function openCheckout(mode: "subscription" | "addon") {
    setBillingWorking("addon");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, addon_pack: selectedAddonPack }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") {
        throw new Error(data?.error ?? "Could not create checkout session.");
      }
      window.location.href = data.url;
    } catch (error) {
      setBillingError(
        error instanceof Error ? error.message : "Could not create checkout session."
      );
    } finally {
      setBillingWorking(null);
    }
  }

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
    if (creating || editSaving) return;
    setVibeModalOpen(false);
    setEditingTreeId(null);
    setPendingTreeName("");
    setSelectedVibe(null);
    setHoveredVibe(null);
    setCreateError(null);
    setEditError(null);
    setSelectedCanvasTheme(null);
    setHoveredCanvasThemePick(null);
    setCreateTreeSectionInfo(null);
  }

  function openEditTree(tree: TreeWithCount) {
    setEditingTreeId(tree.id);
    setPendingTreeName(tree.name);
    setSelectedVibe(toVibeId(tree.vibe));
    setSelectedCanvasTheme(toCanvasThemeId(tree.canvas_theme));
    setHoveredVibe(null);
    setHoveredCanvasThemePick(null);
    setCreateTreeSectionInfo(null);
    setCreateError(null);
    setEditError(null);
    setVibeModalOpen(true);
  }

  async function confirmEditTree() {
    if (!editingTreeId) return;
    const name = pendingTreeName.trim();
    if (name === "") {
      setEditError("Tree name cannot be empty.");
      return;
    }
    if (!selectedVibe) {
      setEditError("Choose a vibe for this tree.");
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
          vibe: selectedVibe,
          canvas_theme: selectedCanvasTheme ?? DEFAULT_CANVAS_THEME_ID,
        })
        .eq("id", editingTreeId);
      if (error) {
        setEditError(error.message);
        return;
      }
      closeVibeModal();
      router.refresh();
    } finally {
      setEditSaving(false);
    }
  }

  function openCreateTreeFromCard() {
    setEditingTreeId(null);
    setCreateError(null);
    setEditError(null);
    setPendingTreeName("");
    setSelectedVibe(null);
    setHoveredVibe(null);
    setSelectedCanvasTheme(DEFAULT_CANVAS_THEME_ID);
    setHoveredCanvasThemePick(null);
    setCreateTreeSectionInfo(null);
    setVibeModalOpen(true);
  }

  async function confirmCreateTree() {
    if (editingTreeId) return;
    if (!selectedVibe) return;
    const name = pendingTreeName.trim();
    if (name === "") {
      setCreateError("Give your tree a name—the ledger needs a title.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    setEditError(null);
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
      setEditingTreeId(null);
      setPendingTreeName("");
      setSelectedVibe(null);
      setHoveredVibe(null);
      setSelectedCanvasTheme(null);
      setHoveredCanvasThemePick(null);
      setCreateTreeSectionInfo(null);
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
            .dg-settings-btn {
              transition: transform 0.2s ease, color 0.2s ease, filter 0.2s ease;
            }
            .dg-settings-btn:hover {
              color: var(--dg-brown-dark) !important;
              transform: translateY(-1px);
              filter: drop-shadow(0 2px 6px rgb(var(--dg-shadow-rgb) / 0.22));
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
            .dg-history-card {
              transition: transform 0.22s ease, box-shadow 0.22s ease;
            }
            .dg-history-card:hover,
            .dg-history-card:focus-within {
              transform: translateY(-3px);
              box-shadow:
                0 18px 44px rgb(var(--dg-shadow-rgb) / 0.28),
                0 8px 22px rgb(var(--dg-shadow-rgb) / 0.16);
            }
            .dark .dg-history-card:hover,
            .dark .dg-history-card:focus-within {
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
          <Link
            href="/dashboard/account"
            className="dg-settings-btn ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center"
            style={{
              fontFamily: sans,
              color: colors.brownMid,
            }}
            aria-label="Account settings"
            title="Account settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.08a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <section
          className="mb-6 rounded-lg border p-4 sm:p-5"
          style={{
            borderColor: colors.brownBorder,
            backgroundColor: colors.parchment,
            boxShadow: "0 6px 20px rgb(var(--dg-shadow-rgb) / 0.07)",
          }}
        >
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="self-center space-y-3">
              <div
                className="rounded-md border p-3"
                style={{
                  borderColor: colors.brownBorder,
                  backgroundColor: colors.cream,
                }}
              >
                <p
                  style={{
                    fontFamily: sans,
                    fontSize: "0.75rem",
                    color: colors.brownMuted,
                  }}
                >
                  Monthly credits
                </p>
                <p
                  style={{
                    fontFamily: serif,
                    fontSize: "1.05rem",
                    color: colors.brownDark,
                  }}
                >
                  {billingSnapshot?.subscriptionCredits ?? "—"}
                </p>
              </div>

              <div
                className="relative rounded-md border p-3"
                style={{
                  borderColor: colors.brownBorder,
                  backgroundColor: colors.cream,
                }}
              >
                <p
                  style={{
                    fontFamily: sans,
                    fontSize: "0.75rem",
                    color: colors.brownMuted,
                  }}
                >
                  Add-on credits
                </p>
                <p
                  style={{
                    fontFamily: serif,
                    fontSize: "1.05rem",
                    color: colors.brownDark,
                  }}
                >
                  {billingSnapshot?.addonCredits ?? "—"}
                </p>
                <button
                  type="button"
                  onClick={() => setAddonModalOpen(true)}
                  className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border text-base font-semibold"
                  style={{
                    fontFamily: sans,
                    borderColor: colors.brownBorder,
                    color: colors.brownDark,
                    backgroundColor: colors.parchment,
                  }}
                  aria-label="Buy add-on credits"
                  title="Buy add-on credits"
                >
                  +
                </button>
              </div>

              <p
                className="px-0.5 text-xs"
                style={{ fontFamily: sans, color: colors.brownMuted }}
              >
                Plan:{" "}
                {billingSnapshot ? getTierDisplayName(billingSnapshot.tier) : "—"}
              </p>
            </div>

            <div
              className="rounded-md border p-3"
              style={{
                borderColor: colors.brownBorder,
                backgroundColor: colors.cream,
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3
                  className="text-base font-bold sm:text-lg"
                  style={{ fontFamily: serif, color: colors.brownDark }}
                >
                  Today in Your History
                </h3>
              </div>

              {DUMMY_TODAY_HISTORY.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-3">
                  {DUMMY_TODAY_HISTORY.slice(0, 3).map((item) => (
                    <article
                      key={item.id}
                      className="dg-history-card rounded-md border p-2.5"
                      style={{
                        borderColor: colors.brownBorder,
                        backgroundColor: "var(--dg-parchment)",
                      }}
                    >
                      <p
                        className="text-[11px] font-semibold uppercase tracking-wide"
                        style={{ fontFamily: sans, color: colors.brownMuted }}
                      >
                        {item.eventDateLabel}
                      </p>
                      <p
                        className="mt-1 text-sm font-bold"
                        style={{ fontFamily: serif, color: colors.brownDark }}
                      >
                        {item.personName}
                      </p>
                      <p
                        className="text-xs"
                        style={{ fontFamily: sans, color: colors.brownMid }}
                      >
                        {item.eventType}
                      </p>
                      <p
                        className="mt-1 text-xs leading-relaxed"
                        style={{ fontFamily: sans, color: colors.brownDark }}
                      >
                        {teaserFromHistoryItem(item)}
                      </p>
                      <button
                        type="button"
                        className="mt-2 text-xs underline underline-offset-2"
                        style={{ fontFamily: sans, color: colors.brownOutline }}
                      >
                        View story
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div
                  className="rounded-md border p-3 text-sm"
                  style={{
                    fontFamily: sans,
                    borderColor: colors.brownBorder,
                    color: colors.brownMuted,
                    backgroundColor: "var(--dg-parchment)",
                  }}
                >
                  Nothing in range yet. We check nearby dates across past years and
                  will surface events when they are available.
                </div>
              )}

              {billingLoading ? (
                <p
                  className="mt-2 text-xs"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  Refreshing credit balances…
                </p>
              ) : null}
              {billingError ? (
                <p
                  className="mt-2 text-sm"
                  style={{ fontFamily: sans, color: "var(--dg-danger)" }}
                >
                  {billingError}
                </p>
              ) : null}
            </div>
          </div>
        </section>

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

      {addonModalOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto overscroll-y-contain p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="addon-modal-title"
        >
          <div
            className="my-8 w-full max-w-lg rounded-lg border p-5 shadow-xl"
            style={{
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="addon-modal-title"
              className="text-xl font-bold sm:text-2xl"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Buy add-on credits
            </h2>
            <p
              className="mt-2 text-sm"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              Choose a credit pack, then continue to Stripe checkout.
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {Object.entries(ADDON_PACKS).map(([packId, pack]) => {
                const isSelected = selectedAddonPack === packId;
                return (
                  <button
                    key={packId}
                    type="button"
                    onClick={() =>
                      setSelectedAddonPack(packId as keyof typeof ADDON_PACKS)
                    }
                    className="rounded-md border px-3 py-2 text-left"
                    style={{
                      borderColor: isSelected
                        ? colors.brownOutline
                        : colors.brownBorder,
                      backgroundColor: isSelected
                        ? "var(--dg-parchment-deep)"
                        : colors.cream,
                      color: colors.brownDark,
                    }}
                  >
                    <p style={{ fontFamily: serif, fontWeight: 700 }}>
                      {pack.label}
                    </p>
                    <p style={{ fontFamily: sans, fontSize: "0.85rem" }}>
                      ${pack.price.toFixed(2)}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                style={btnPrimaryModal}
                disabled={billingWorking !== null}
                onClick={() => void openCheckout("addon")}
              >
                {billingWorking === "addon"
                  ? "Opening checkout…"
                  : "Checkout"}
              </button>
              <button
                type="button"
                style={btnOutline}
                disabled={billingWorking !== null}
                onClick={() => setAddonModalOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {vibeModalOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center overflow-y-auto overscroll-y-contain p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tree-modal-name-label vibe-modal-title canvas-theme-heading"
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
              id="tree-modal-name-label"
              htmlFor="tree-modal-name"
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
              id="tree-modal-name"
              type="text"
              value={pendingTreeName}
              onChange={(e) => setPendingTreeName(e.target.value)}
              placeholder="e.g. The Holloway line"
              disabled={creating || editSaving}
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
                  if (!creating && !editSaving) setCreateTreeSectionInfo("vibe");
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
                    cursor:
                      creating || editSaving ? "not-allowed" : "default",
                  }}
                  disabled={creating || editSaving}
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
                    if (!creating && !editSaving)
                      setCreateTreeSectionInfo("canvas");
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
                      cursor:
                        creating || editSaving ? "not-allowed" : "default",
                    }}
                    disabled={creating || editSaving}
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
                  editSaving ||
                  pendingTreeName.trim() === ""
                }
                style={{
                  ...btnPrimaryModal,
                  opacity:
                    selectedVibe === null ||
                    creating ||
                    editSaving ||
                    pendingTreeName.trim() === ""
                      ? 0.65
                      : 1,
                  cursor:
                    selectedVibe === null ||
                    creating ||
                    editSaving ||
                    pendingTreeName.trim() === ""
                      ? "not-allowed"
                      : "pointer",
                }}
                onClick={() =>
                  void (editingTreeId ? confirmEditTree() : confirmCreateTree())
                }
              >
                {editingTreeId
                  ? editSaving
                    ? "Saving…"
                    : "Save changes"
                  : creating
                    ? "Creating…"
                    : "Create tree"}
              </button>
              <button
                type="button"
                style={btnOutline}
                disabled={creating || editSaving}
                onClick={closeVibeModal}
              >
                Cancel
              </button>
            </div>
            {(editingTreeId ? editError : createError) ? (
              <p
                className="mt-3 text-sm"
                style={{ fontFamily: sans, color: "var(--dg-danger)" }}
                role="alert"
              >
                {editingTreeId ? editError : createError}
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
