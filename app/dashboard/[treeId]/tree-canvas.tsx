"use client";

import { useTheme } from "@/lib/theme/theme-context";
import { createClient } from "@/lib/supabase/client";
import { formatDateString } from "@/lib/utils/dates";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  TransformComponent,
  TransformWrapper,
  useControls,
  type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch";
import DocumentUploadSection from "../document-upload";

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

/** Default zoom for initial view, search focus, and reset alignment with zoomToElement. */
const CANVAS_INITIAL_SCALE = 1.2;

/** Explicit pedigree layout (fixed canvas geometry). */
const LAYOUT_CANVAS_W = 2400;
const LAYOUT_NODE_W = 160;
const LAYOUT_NODE_H = 90;
const LAYOUT_BASE_Y = 1200;
const LAYOUT_GEN_DY = 220;
const LAYOUT_V_PAD = 80;
const LAYOUT_MIN_NODE_GAP = 40;

/** Pedigree connectors: horizontal couple bar offset from parent node top (see spec). */
const PED_COUPLE_LINE_Y = 110;
const PED_BRANCH_BAR_ABOVE_CHILD = 30;

type LayoutEdge = { parent: string; child: string };

function normRelType(t: string): string {
  return t.trim().toLowerCase();
}

function parentChildEdges(
  relationships: TreeCanvasRelationship[],
  personSet: Set<string>
): LayoutEdge[] {
  const out: LayoutEdge[] = [];
  for (const r of relationships) {
    if (normRelType(r.relationship_type) !== "parent") continue;
    const parent = r.person_a_id;
    const child = r.person_b_id;
    if (!personSet.has(parent) || !personSet.has(child)) continue;
    out.push({ parent, child });
  }
  return out;
}

function buildParentsOfMap(
  edges: LayoutEdge[]
): Map<string, Set<string>> {
  const parentsOf = new Map<string, Set<string>>();
  for (const { parent, child } of edges) {
    if (!parentsOf.has(child)) parentsOf.set(child, new Set());
    parentsOf.get(child)!.add(parent);
  }
  return parentsOf;
}

function buildChildrenOfMap(
  edges: LayoutEdge[],
  personSet: Set<string>
): Map<string, Set<string>> {
  const childrenOf = new Map<string, Set<string>>();
  for (const id of personSet) childrenOf.set(id, new Set());
  for (const { parent, child } of edges) {
    if (!personSet.has(parent) || !personSet.has(child)) continue;
    childrenOf.get(parent)!.add(child);
  }
  return childrenOf;
}

function reachableFromRoot(
  root: string,
  edges: LayoutEdge[],
  personSet: Set<string>
): Set<string> {
  const adj = new Map<string, Set<string>>();
  for (const id of personSet) adj.set(id, new Set());
  for (const { parent, child } of edges) {
    adj.get(parent)!.add(child);
    adj.get(child)!.add(parent);
  }
  const out = new Set<string>();
  if (!root || !personSet.has(root)) return out;
  const stack = [root];
  out.add(root);
  while (stack.length) {
    const u = stack.pop()!;
    for (const v of adj.get(u) ?? []) {
      if (!out.has(v)) {
        out.add(v);
        stack.push(v);
      }
    }
  }
  return out;
}

function maxAncestorDepth(
  id: string,
  parentsOf: Map<string, Set<string>>,
  memo: Map<string, number>,
  visiting: Set<string>
): number {
  if (memo.has(id)) return memo.get(id)!;
  if (visiting.has(id)) return 0;
  visiting.add(id);
  const pars = parentsOf.get(id);
  let d = 0;
  if (pars) {
    for (const p of pars) {
      d = Math.max(d, 1 + maxAncestorDepth(p, parentsOf, memo, visiting));
    }
  }
  visiting.delete(id);
  memo.set(id, d);
  return d;
}

function pickDeepestRoot(
  personIds: string[],
  parentsOf: Map<string, Set<string>>
): string {
  if (personIds.length === 0) return "";
  let best = personIds[0]!;
  let bestDepth = -1;
  const memo = new Map<string, number>();
  for (const id of personIds) {
    const d = maxAncestorDepth(id, parentsOf, memo, new Set());
    if (d > bestDepth || (d === bestDepth && id < best)) {
      bestDepth = d;
      best = id;
    }
  }
  return best;
}

/**
 * STEP 1: root = 0; propagate via parent edges (parent = child + 1).
 * Unreachable from root (undirected parent/child graph) → generation 0 (island).
 */
function assignGenerations(
  personIds: string[],
  edges: LayoutEdge[],
  root: string
): Map<string, number> {
  const personSet = new Set(personIds);
  const gen = new Map<string, number>();
  const adj = new Map<string, Set<string>>();
  for (const id of personIds) adj.set(id, new Set());
  for (const { parent, child } of edges) {
    adj.get(parent)!.add(child);
    adj.get(child)!.add(parent);
  }
  const reachable = new Set<string>();
  if (root && personSet.has(root)) {
    const stack = [root];
    reachable.add(root);
    while (stack.length) {
      const u = stack.pop()!;
      for (const v of adj.get(u) ?? []) {
        if (!reachable.has(v)) {
          reachable.add(v);
          stack.push(v);
        }
      }
    }
  }
  for (const id of personIds) {
    if (!reachable.has(id)) gen.set(id, 0);
  }
  if (!root || !personSet.has(root)) return gen;
  gen.set(root, 0);
  let changed = true;
  while (changed) {
    changed = false;
    for (const { parent, child } of edges) {
      const gp = gen.get(parent);
      const gc = gen.get(child);
      if (gp !== undefined) {
        const needChild = gp - 1;
        if (!gen.has(child) || gen.get(child)! > needChild) {
          gen.set(child, needChild);
          changed = true;
        }
      }
      if (gc !== undefined) {
        const needParent = gc + 1;
        if (!gen.has(parent) || gen.get(parent)! < needParent) {
          gen.set(parent, needParent);
          changed = true;
        }
      }
    }
  }
  return gen;
}

const LAYOUT_ROOT_X = 1200;

/** Group by generation, assign y; x from child/parent inheritance + overlap pass (no row index). */
function computeExplicitTreeLayout(
  personIds: string[],
  relationships: TreeCanvasRelationship[],
  rootId: string
): {
  positions: { id: string; x: number; y: number; generation: number }[];
  contentWidth: number;
  contentHeight: number;
} {
  if (personIds.length === 0) {
    return {
      positions: [],
      contentWidth: LAYOUT_CANVAS_W,
      contentHeight: LAYOUT_BASE_Y + LAYOUT_NODE_H + LAYOUT_V_PAD * 2,
    };
  }
  const personSet = new Set(personIds);
  const edges = parentChildEdges(relationships, personSet);
  const gen = assignGenerations(personIds, edges, rootId);
  const reachable = reachableFromRoot(rootId, edges, personSet);
  const floaterIds = personIds.filter((id) => !reachable.has(id));
  const floaterSet = new Set(floaterIds);

  const byGen = new Map<number, string[]>();
  for (const id of personIds) {
    if (floaterSet.has(id)) continue;
    const g = gen.get(id) ?? 0;
    if (!byGen.has(g)) byGen.set(g, []);
    byGen.get(g)!.push(id);
  }
  for (const ids of byGen.values()) ids.sort((a, b) => a.localeCompare(b));

  const posById = new Map<string, { x: number; y: number; generation: number }>();

  for (const [g, ids] of byGen) {
    const y =
      g === 0
        ? LAYOUT_BASE_Y
        : g > 0
          ? LAYOUT_BASE_Y - g * LAYOUT_GEN_DY
          : LAYOUT_BASE_Y + Math.abs(g) * LAYOUT_GEN_DY;
    for (const id of ids) {
      posById.set(id, { x: LAYOUT_ROOT_X, y, generation: g });
    }
  }

  const parentsOf = buildParentsOfMap(edges);
  const childrenOf = buildChildrenOfMap(edges, personSet);
  const centerX = LAYOUT_CANVAS_W / 2;
  const xById = new Map<string, number>();
  const sortedIds = [...personIds].sort((a, b) => a.localeCompare(b));

  if (rootId && personSet.has(rootId)) {
    xById.set(rootId, LAYOUT_ROOT_X);
  }

  const maxPasses = Math.max(8, personIds.length * 3);
  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    for (const id of sortedIds) {
      if (id === rootId && personSet.has(rootId)) {
        if (xById.get(id) !== LAYOUT_ROOT_X) {
          xById.set(id, LAYOUT_ROOT_X);
          changed = true;
        }
        continue;
      }
      if (!reachable.has(id)) {
        const prev = xById.get(id);
        if (prev !== centerX) {
          xById.set(id, centerX);
          changed = true;
        }
        continue;
      }

      let nx: number | undefined;

      const kids = [...(childrenOf.get(id) ?? [])].filter((c) =>
        personSet.has(c)
      );
      const kidXs = kids.map((c) => xById.get(c)).filter((v): v is number => v !== undefined);
      if (kidXs.length === 1) {
        nx = kidXs[0]!;
      } else if (kidXs.length >= 2) {
        nx = kidXs.reduce((a, b) => a + b, 0) / kidXs.length;
      }

      if (nx === undefined) {
        const pars = [...(parentsOf.get(id) ?? [])].filter((pid) =>
          personSet.has(pid)
        );
        const parXs = pars
          .map((p) => xById.get(p))
          .filter((v): v is number => v !== undefined);
        if (parXs.length === 1) {
          nx = parXs[0]!;
        } else if (parXs.length >= 2) {
          nx = parXs.reduce((a, b) => a + b, 0) / parXs.length;
        }
      }

      if (nx === undefined) {
        nx = centerX;
      }

      const prev = xById.get(id);
      if (prev === undefined || Math.abs(prev - nx) > 1e-9) {
        xById.set(id, nx);
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (const id of personIds) {
    const p = posById.get(id);
    if (!p) continue;
    p.x = xById.get(id) ?? centerX;
  }

  for (let r = 0; r < 5; r++) {
    let moved = false;
    for (const ids of byGen.values()) {
      const nonFloaters = ids.filter((id) => !floaterSet.has(id));
      const sorted = [...nonFloaters].sort((a, b) => {
        const xa = posById.get(a)!.x;
        const xb = posById.get(b)!.x;
        if (xa !== xb) return xa - xb;
        return a.localeCompare(b);
      });
      for (let i = 1; i < sorted.length; i++) {
        const prev = posById.get(sorted[i - 1]!)!;
        const cur = posById.get(sorted[i]!)!;
        const minX = prev.x + LAYOUT_NODE_W + LAYOUT_MIN_NODE_GAP;
        if (cur.x < minX) {
          cur.x = minX;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  let maxConnectedY = LAYOUT_BASE_Y;
  if (posById.size > 0) {
    maxConnectedY = Math.max(...[...posById.values()].map((p) => p.y));
  }

  const floaterY = maxConnectedY + LAYOUT_GEN_DY * 2;
  const floaterStep = LAYOUT_NODE_W + LAYOUT_MIN_NODE_GAP;
  const sortedFloaters = [...floaterIds].sort((a, b) => a.localeCompare(b));
  for (let i = 0; i < sortedFloaters.length; i++) {
    const id = sortedFloaters[i]!;
    posById.set(id, {
      x: LAYOUT_V_PAD + i * floaterStep,
      y: floaterY,
      generation: -999,
    });
  }

  const positions = personIds
    .map((id) => {
      const p = posById.get(id);
      if (!p) return null;
      return { id, x: p.x, y: p.y, generation: p.generation };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  let maxBottom = -Infinity;
  let maxRight = LAYOUT_CANVAS_W;
  for (const p of positions) {
    maxBottom = Math.max(maxBottom, p.y + LAYOUT_NODE_H);
    maxRight = Math.max(maxRight, p.x + LAYOUT_NODE_W + LAYOUT_V_PAD);
  }
  if (positions.length === 0) {
    maxBottom = LAYOUT_BASE_Y + LAYOUT_NODE_H;
  }
  if (floaterIds.length > 0) {
    maxBottom = Math.max(maxBottom, floaterY + LAYOUT_NODE_H);
  }
  const contentHeight = Math.max(
    maxBottom + LAYOUT_V_PAD,
    LAYOUT_BASE_Y + LAYOUT_NODE_H + LAYOUT_V_PAD
  );

  return {
    positions,
    contentWidth: maxRight,
    contentHeight,
  };
}

function TreeCanvasZoomControls() {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  const btnBase: CSSProperties = {
    fontFamily: sans,
    minWidth: 36,
    height: 32,
    padding: "0 0.35rem",
    fontSize: "1.05rem",
    fontWeight: 700,
    lineHeight: 1,
    color: colors.brownDark,
    backgroundColor: colors.parchment,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.brownBorder,
    borderRadius: 4,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background-color 0.15s, border-color 0.15s",
  };

  return (
    <div
      className="pointer-events-auto absolute bottom-4 right-4 z-20 flex flex-col gap-1 rounded-md border p-1.5 shadow-sm"
      style={{
        backgroundColor: colors.parchment,
        borderColor: colors.brownBorder,
        boxShadow: "0 2px 12px rgb(var(--dg-shadow-rgb) / 0.14)",
      }}
      role="toolbar"
      aria-label="Canvas zoom"
    >
      <button
        type="button"
        className="dg-tree-zoom-btn"
        style={btnBase}
        aria-label="Zoom in"
        onClick={() => zoomIn()}
      >
        +
      </button>
      <button
        type="button"
        className="dg-tree-zoom-btn"
        style={btnBase}
        aria-label="Zoom out"
        onClick={() => zoomOut()}
      >
        −
      </button>
      <button
        type="button"
        className="dg-tree-zoom-btn"
        style={{
          ...btnBase,
          fontSize: "0.65rem",
          fontWeight: 600,
          letterSpacing: "0.02em",
        }}
        aria-label="Reset zoom"
        onClick={() => resetTransform()}
      >
        Reset
      </button>
    </div>
  );
}

export type TreeCanvasPerson = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  birth_date: string | null;
  death_date: string | null;
  photo_url: string | null;
};

export type TreeCanvasRelationship = {
  person_a_id: string;
  person_b_id: string;
  relationship_type: string;
};

type TreeConnectorPath = {
  key: string;
  d: string;
  kind: "couple" | "default";
};

function displayName(p: TreeCanvasPerson): string {
  return [p.first_name, p.middle_name ?? "", p.last_name]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

function initials(p: TreeCanvasPerson): string {
  const f = p.first_name.trim().charAt(0);
  const l = p.last_name.trim().charAt(0);
  const s = (f + l).toUpperCase();
  return s || "?";
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

function isAllowedTreePhotoFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (
    t === "image/jpeg" ||
    t === "image/jpg" ||
    t === "image/png" ||
    t === "image/webp" ||
    t === "image/gif"
  ) {
    return true;
  }
  const n = file.name.toLowerCase();
  return /\.(jpe?g|png|webp|gif)$/i.test(n);
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

type ClientPrimaryPhotoRow = {
  person_id: string;
  file_url: string;
  natural_width: number | null;
  natural_height: number | null;
  crop_x: number | null;
  crop_y: number | null;
  crop_zoom: number | null;
};

function parseNumField(r: Record<string, unknown>, key: string): number | null {
  const v = r[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseClientPrimaryPhotoRow(
  row: Record<string, unknown>
): ClientPrimaryPhotoRow | null {
  const person_id = String(row.person_id ?? "");
  const file_url = String(row.file_url ?? "").trim();
  if (!person_id || !file_url) return null;
  return {
    person_id,
    file_url,
    natural_width: parseNumField(row, "natural_width"),
    natural_height: parseNumField(row, "natural_height"),
    crop_x: parseNumField(row, "crop_x"),
    crop_y: parseNumField(row, "crop_y"),
    crop_zoom: parseNumField(row, "crop_zoom"),
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTaggedPrimaryPhotoRow(
  row: Record<string, unknown>
): ClientPrimaryPhotoRow | null {
  const person_id = String(row.person_id ?? "");
  if (!person_id) return null;
  const nested = row.photos;
  let photoObj: Record<string, unknown> | null = null;
  if (isPlainRecord(nested)) {
    photoObj = nested;
  } else if (Array.isArray(nested) && nested.length > 0) {
    const first = nested[0];
    if (isPlainRecord(first)) photoObj = first;
  }
  if (!photoObj) return null;
  const file_url = String(photoObj.file_url ?? "").trim();
  if (!file_url) return null;
  return {
    person_id,
    file_url,
    natural_width: parseNumField(photoObj, "natural_width"),
    natural_height: parseNumField(photoObj, "natural_height"),
    crop_x: parseNumField(row, "crop_x"),
    crop_y: parseNumField(row, "crop_y"),
    crop_zoom: parseNumField(row, "crop_zoom"),
  };
}

const TREE_NODE_AVATAR_VP = 40;

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

function TreeNodeAvatarImg({
  primary,
  fallbackUrl,
}: {
  primary: ClientPrimaryPhotoRow | undefined;
  fallbackUrl: string | null;
}) {
  const src = (primary?.file_url ?? "").trim() || (fallbackUrl ?? "").trim();
  if (!src) return null;

  const nw = primary?.natural_width ?? null;
  const nh = primary?.natural_height ?? null;
  const cropX = primary?.crop_x ?? null;
  const cropY = primary?.crop_y ?? null;
  const cropZoom = primary?.crop_zoom ?? null;

  const hasPixelCrop =
    primary != null &&
    typeof nw === "number" &&
    nw > 0 &&
    typeof nh === "number" &&
    nh > 0 &&
    typeof cropZoom === "number" &&
    Number.isFinite(cropZoom);

  let pixelStyle: CSSProperties | null = null;
  if (hasPixelCrop) {
    const cx = typeof cropX === "number" ? cropX : 50;
    const cy = typeof cropY === "number" ? cropY : 50;
    const { w: rw, h: rh } = cropCoverRenderedSize(
      nw,
      nh,
      TREE_NODE_AVATAR_VP,
      cropZoom
    );
    const offset = cropPercentToOffsetCover(
      cx,
      cy,
      rw,
      rh,
      TREE_NODE_AVATAR_VP
    );
    pixelStyle = {
      position: "absolute",
      left: offset.x,
      top: offset.y,
      width: rw,
      height: rh,
      maxWidth: "none",
    };
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={hasPixelCrop ? undefined : "h-full w-full object-cover"}
      style={hasPixelCrop ? (pixelStyle ?? undefined) : undefined}
    />
  );
}

type TreeCanvasProps = {
  treeId: string;
  treeName: string;
  persons: TreeCanvasPerson[];
  relationships: TreeCanvasRelationship[];
};

export default function TreeCanvas({
  treeId,
  treeName,
  persons,
  relationships,
}: TreeCanvasProps) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const transformRef = useRef<ReactZoomPanPinchContentRef | null>(null);
  const centeredRef = useRef(false);

  const [extraPersons, setExtraPersons] = useState<TreeCanvasPerson[]>([]);
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);

  const treePhotoFileInputRef = useRef<HTMLInputElement>(null);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoSelectedPerson, setPhotoSelectedPerson] =
    useState<TreeCanvasPerson | null>(null);
  const [photoPersonSearch, setPhotoPersonSearch] = useState("");
  const [photoUploadSaving, setPhotoUploadSaving] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);

  useEffect(() => {
    setExtraPersons((prev) =>
      prev.filter((p) => !persons.some((x) => x.id === p.id))
    );
  }, [persons]);

  const mergedPersons = useMemo(() => {
    const ids = new Set(persons.map((p) => p.id));
    return [...persons, ...extraPersons.filter((p) => !ids.has(p.id))];
  }, [persons, extraPersons]);

  const personIds = useMemo(() => mergedPersons.map((p) => p.id), [mergedPersons]);

  const parentsOfForRoot = useMemo(() => {
    const set = new Set(personIds);
    return buildParentsOfMap(parentChildEdges(relationships, set));
  }, [relationships, personIds]);

  const initialRootId = useMemo(
    () => pickDeepestRoot(personIds, parentsOfForRoot),
    [personIds, parentsOfForRoot]
  );

  const [layoutRootOverride, setLayoutRootOverride] = useState<string | null>(
    null
  );
  const effectiveRoot =
    layoutRootOverride &&
    personIds.includes(layoutRootOverride) &&
    layoutRootOverride !== ""
      ? layoutRootOverride
      : initialRootId;

  const layout = useMemo(
    () => computeExplicitTreeLayout(personIds, relationships, effectiveRoot),
    [personIds, relationships, effectiveRoot]
  );

  const effectiveRootRef = useRef(effectiveRoot);
  effectiveRootRef.current = effectiveRoot;

  const personById = useMemo(() => {
    const m = new Map<string, TreeCanvasPerson>();
    for (const p of mergedPersons) m.set(p.id, p);
    return m;
  }, [mergedPersons]);

  const personIdsRef = useRef(personIds);
  personIdsRef.current = personIds;

  const [primaryPhotoMap, setPrimaryPhotoMap] = useState<
    Record<string, ClientPrimaryPhotoRow>
  >({});

  const refetchPrimaryPhotos = useCallback(async () => {
    const ids = personIdsRef.current;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || ids.length === 0) {
      setPrimaryPhotoMap({});
      return;
    }
    const { data: photosData, error: photosError } = await supabase
      .from("photos")
      .select("person_id, file_url, natural_width, natural_height, crop_x, crop_y, crop_zoom")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .in("person_id", ids);
    if (photosError) {
      return;
    }
    const next: Record<string, ClientPrimaryPhotoRow> = {};
    for (const row of photosData ?? []) {
      const parsed = parseClientPrimaryPhotoRow(row as Record<string, unknown>);
      if (parsed && !next[parsed.person_id]) {
        next[parsed.person_id] = parsed;
      }
    }

    const { data: tagsData, error: tagsError } = await supabase
      .from("photo_tags")
      .select("person_id, crop_x, crop_y, crop_zoom, photos(file_url, natural_width, natural_height)")
      .eq("is_primary", true)
      .eq("user_id", user.id)
      .in("person_id", ids);
    if (!tagsError) {
      for (const row of tagsData ?? []) {
        const r = row as Record<string, unknown>;
        const person_id = String(r.person_id ?? "").trim();
        if (!person_id) continue;

        const photosField = r.photos as Record<string, unknown> | null;
        const file_url = String(photosField?.file_url ?? "").trim();
        if (!file_url) continue;

        const natural_width =
          typeof photosField?.natural_width === "number"
            ? photosField.natural_width
            : null;
        const natural_height =
          typeof photosField?.natural_height === "number"
            ? photosField.natural_height
            : null;
        const crop_x = typeof r.crop_x === "number" ? r.crop_x : null;
        const crop_y = typeof r.crop_y === "number" ? r.crop_y : null;
        const crop_zoom = typeof r.crop_zoom === "number" ? r.crop_zoom : null;

        next[person_id] = {
          person_id,
          file_url,
          natural_width,
          natural_height,
          crop_x,
          crop_y,
          crop_zoom,
        };
      }
    }

    setPrimaryPhotoMap(next);
  }, []);

  useEffect(() => {
    void refetchPrimaryPhotos();
  }, [personIds, refetchPrimaryPhotos]);

  const [searchQ, setSearchQ] = useState("");
  const searchLower = searchQ.trim().toLowerCase();
  const searchMatches = useMemo(() => {
    if (searchLower.length < 1) return [];
    return mergedPersons
      .filter((p) => displayName(p).toLowerCase().includes(searchLower))
      .slice(0, 12);
  }, [mergedPersons, searchLower]);

  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [addFirst, setAddFirst] = useState("");
  const [addMiddle, setAddMiddle] = useState("");
  const [addLast, setAddLast] = useState("");
  const [addBirth, setAddBirth] = useState("");
  const [addDeath, setAddDeath] = useState("");
  const [addGender, setAddGender] = useState("");
  const [addPersonError, setAddPersonError] = useState<string | null>(null);
  const [addPersonSaving, setAddPersonSaving] = useState(false);

  const resetAddPersonForm = useCallback(() => {
    setAddFirst("");
    setAddMiddle("");
    setAddLast("");
    setAddBirth("");
    setAddDeath("");
    setAddGender("");
    setAddPersonError(null);
  }, []);

  const closeAddPersonModal = useCallback(() => {
    if (addPersonSaving) return;
    setAddPersonOpen(false);
    resetAddPersonForm();
  }, [addPersonSaving, resetAddPersonForm]);

  const closeUploadModal = useCallback(() => {
    setUploadPanelOpen(false);
  }, []);

  const photoPersonOptions = useMemo(() => {
    const sorted = [...mergedPersons].sort((a, b) =>
      displayName(a).localeCompare(displayName(b))
    );
    const q = photoPersonSearch.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((p) =>
      displayName(p).toLowerCase().includes(q)
    );
  }, [mergedPersons, photoPersonSearch]);

  const openPhotoModal = useCallback(() => {
    setPhotoUploadError(null);
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPhotoFile(null);
    setPhotoSelectedPerson(null);
    setPhotoPersonSearch("");
    setPhotoModalOpen(true);
  }, []);

  const closePhotoModal = useCallback(() => {
    if (photoUploadSaving) return;
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPhotoModalOpen(false);
    setPhotoFile(null);
    setPhotoSelectedPerson(null);
    setPhotoPersonSearch("");
    setPhotoUploadError(null);
  }, [photoUploadSaving]);

  const saveTreePhoto = useCallback(async () => {
    if (!photoFile) {
      setPhotoUploadError("Please select a photo.");
      return;
    }
    if (!photoSelectedPerson) {
      setPhotoUploadError("Please select who this photo is of.");
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

      const personId = photoSelectedPerson.id;
      const { data: existingPhotos } = await supabase
        .from("photos")
        .select("id")
        .eq("person_id", personId);

      const isPrimary = !existingPhotos || existingPhotos.length === 0;

      const { w: naturalWidth, h: naturalHeight } =
        await getNaturalSize(photoFile);
      const ext = extFromImageFile(photoFile);
      const path = `${user.id}/${personId}/${crypto.randomUUID()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("photos")
        .upload(path, photoFile, {
          contentType: photoFile.type || `image/${ext}`,
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
        is_primary: isPrimary,
        ...(naturalWidth > 0 && naturalHeight > 0
          ? { natural_width: naturalWidth, natural_height: naturalHeight }
          : {}),
      });

      if (insErr) {
        await supabase.storage.from("photos").remove([path]);
        setPhotoUploadError(insErr.message);
        return;
      }

      setPhotoPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPhotoModalOpen(false);
      setPhotoFile(null);
      setPhotoSelectedPerson(null);
      setPhotoPersonSearch("");
      setPhotoUploadError(null);
      await refetchPrimaryPhotos();
    } finally {
      setPhotoUploadSaving(false);
    }
  }, [photoFile, photoSelectedPerson, refetchPrimaryPhotos]);

  const submitAddPerson = useCallback(async () => {
    const first_name = addFirst.trim();
    const last_name = addLast.trim();
    if (!first_name || !last_name) {
      setAddPersonError("First and last name are required.");
      return;
    }
    setAddPersonSaving(true);
    setAddPersonError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setAddPersonError("Not signed in.");
        return;
      }
      const middle_name = addMiddle.trim() === "" ? null : addMiddle.trim();
      const birth_date = addBirth.trim() === "" ? null : addBirth.trim();
      const death_date = addDeath.trim() === "" ? null : addDeath.trim();
      const gender =
        addGender.trim() === "" ? "Unknown" : addGender.trim();

      const { data, error } = await supabase
        .from("persons")
        .insert({
          user_id: user.id,
          tree_id: treeId,
          first_name,
          middle_name,
          last_name,
          birth_date,
          death_date,
          gender,
          notes: null,
          photo_url: null,
        })
        .select(
          "id, first_name, middle_name, last_name, birth_date, death_date, photo_url"
        )
        .single();

      if (error) {
        setAddPersonError(error.message);
        return;
      }
      if (!data) {
        setAddPersonError("Could not create person.");
        return;
      }
      const row = data as Record<string, unknown>;
      const newPerson: TreeCanvasPerson = {
        id: String(row.id),
        first_name: String(row.first_name ?? ""),
        middle_name:
          row.middle_name === null || row.middle_name === undefined
            ? null
            : String(row.middle_name),
        last_name: String(row.last_name ?? ""),
        birth_date:
          row.birth_date === null || row.birth_date === undefined
            ? null
            : String(row.birth_date),
        death_date:
          row.death_date === null || row.death_date === undefined
            ? null
            : String(row.death_date),
        photo_url:
          row.photo_url === null || row.photo_url === undefined
            ? null
            : String(row.photo_url),
      };
      setExtraPersons((prev) => [...prev, newPerson]);
      setAddPersonOpen(false);
      resetAddPersonForm();
      router.refresh();
    } finally {
      setAddPersonSaving(false);
    }
  }, [
    addBirth,
    addDeath,
    addFirst,
    addGender,
    addLast,
    addMiddle,
    resetAddPersonForm,
    router,
    treeId,
  ]);

  const zoomToPerson = useCallback(
    (personId: string, animationTime = 400) => {
      const api = transformRef.current;
      if (!api) return;
      const el = document.getElementById(`tree-node-${personId}`);
      if (!el) return;
      api.zoomToElement(el, CANVAS_INITIAL_SCALE, animationTime, "easeOut");
    },
    []
  );

  const handleSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }, [router]);

  useEffect(() => {
    centeredRef.current = false;
  }, [effectiveRoot, layout.contentWidth, layout.contentHeight]);

  useEffect(() => {
    if (centeredRef.current) return;
    const rootId = effectiveRoot;
    if (!rootId) return;
    const t = window.setTimeout(() => {
      if (centeredRef.current) return;
      zoomToPerson(rootId, 0);
      centeredRef.current = true;
    }, 48);
    return () => window.clearTimeout(t);
  }, [effectiveRoot, zoomToPerson, layout.positions.length]);

  const handleTransformInit = useCallback(
    (ctx: ReactZoomPanPinchContentRef) => {
      transformRef.current = ctx;
      const rootId = effectiveRootRef.current;
      if (!rootId || centeredRef.current) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.getElementById(`tree-node-${rootId}`);
          if (el) {
            ctx.zoomToElement(el, CANVAS_INITIAL_SCALE, 0, "easeOut");
            centeredRef.current = true;
          }
        });
      });
    },
    []
  );

  /** Pedigree connectors: couple + trunk + branch bar + child drops; single-parent → straight to child top-center. */
  const parentChildConnectorPaths = useMemo(() => {
    const posById = new Map(layout.positions.map((p) => [p.id, p]));
    const cx = LAYOUT_NODE_W / 2;

    const seenEdge = new Set<string>();
    const edges: { parent: string; child: string }[] = [];
    for (const r of relationships) {
      if (normRelType(r.relationship_type) !== "parent") continue;
      const parent = r.person_a_id;
      const child = r.person_b_id;
      const dedupe = `${parent}->${child}`;
      if (seenEdge.has(dedupe)) continue;
      seenEdge.add(dedupe);
      if (!posById.has(parent) || !posById.has(child)) continue;
      edges.push({ parent, child });
    }

    const parentsOf = new Map<string, Set<string>>();
    for (const { parent, child } of edges) {
      if (!parentsOf.has(child)) parentsOf.set(child, new Set());
      parentsOf.get(child)!.add(parent);
    }

    const pairToChildren = new Map<string, string[]>();
    for (const [childId, pars] of parentsOf) {
      if (pars.size !== 2) continue;
      const [p1, p2] = [...pars].sort((a, b) => a.localeCompare(b));
      const pk = `${p1}|${p2}`;
      if (!pairToChildren.has(pk)) pairToChildren.set(pk, []);
      const list = pairToChildren.get(pk)!;
      if (!list.includes(childId)) list.push(childId);
    }

    const covered = new Set<string>();
    const out: TreeConnectorPath[] = [];

    for (const [pk, children] of pairToChildren) {
      const pipe = pk.indexOf("|");
      if (pipe < 0) continue;
      const p1 = pk.slice(0, pipe);
      const p2 = pk.slice(pipe + 1);
      const pos1 = posById.get(p1);
      const pos2 = posById.get(p2);
      if (!pos1 || !pos2) continue;

      const left = pos1.x <= pos2.x ? p1 : p2;
      const right = left === p1 ? p2 : p1;
      const posL = posById.get(left)!;
      const posR = posById.get(right)!;

      const xL = posL.x + cx;
      const xR = posR.x + cx;
      const coupleY = Math.max(posL.y, posR.y) + PED_COUPLE_LINE_Y;
      const midX = (xL + xR) / 2;

      const childLayouts = children
        .map((cid) => {
          const p = posById.get(cid);
          return p ? { id: cid, p } : null;
        })
        .filter(
          (
            x
          ): x is {
            id: string;
            p: { id: string; x: number; y: number; generation: number };
          } => x != null
        );
      if (childLayouts.length === 0) continue;

      const branchY =
        Math.min(...childLayouts.map((c) => c.p.y)) - PED_BRANCH_BAR_ABOVE_CHILD;
      const centers = childLayouts.map((c) => c.p.x + cx).sort((a, b) => a - b);
      const barLeft = Math.min(centers[0]!, midX);
      const barRight = Math.max(centers[centers.length - 1]!, midX);

      out.push({
        key: `ped:couple:${pk}`,
        d: `M ${xL} ${coupleY} L ${xR} ${coupleY}`,
        kind: "couple",
      });
      out.push({
        key: `ped:trunk:${pk}`,
        d: `M ${midX} ${coupleY} L ${midX} ${branchY}`,
        kind: "default",
      });
      out.push({
        key: `ped:branch:${pk}`,
        d: `M ${barLeft} ${branchY} L ${barRight} ${branchY}`,
        kind: "default",
      });

      for (const { id: cid, p: posC } of childLayouts) {
        const ccx = posC.x + cx;
        out.push({
          key: `ped:cdrop:${pk}:${cid}`,
          d: `M ${ccx} ${branchY} L ${ccx} ${posC.y}`,
          kind: "default",
        });
        covered.add(`${p1}->${cid}`);
        covered.add(`${p2}->${cid}`);
      }
    }

    const spousePairSeen = new Set<string>();
    for (const r of relationships) {
      const t = normRelType(r.relationship_type);
      if (t !== "spouse" && t !== "married") continue;
      const a = r.person_a_id;
      const b = r.person_b_id;
      if (!posById.has(a) || !posById.has(b)) continue;
      const spk = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (spousePairSeen.has(spk)) continue;
      spousePairSeen.add(spk);
      if (pairToChildren.has(spk)) continue;

      const posA = posById.get(a)!;
      const posB = posById.get(b)!;
      const left = posA.x <= posB.x ? a : b;
      const right = left === a ? b : a;
      const posL = posById.get(left)!;
      const posR = posById.get(right)!;
      const sxL = posL.x + cx;
      const sxR = posR.x + cx;
      const spouseCoupleY =
        Math.max(posL.y, posR.y) + PED_COUPLE_LINE_Y;
      out.push({
        key: `ped:spouse:${spk}`,
        d: `M ${sxL} ${spouseCoupleY} L ${sxR} ${spouseCoupleY}`,
        kind: "couple",
      });
    }

    for (const { parent, child } of edges) {
      if (covered.has(`${parent}->${child}`)) continue;
      const posP = posById.get(parent);
      const posC = posById.get(child);
      if (!posP || !posC) continue;
      const sx = posP.x + 80;
      const sy = posP.y + 90;
      const ex = posC.x + 80;
      const ey = posC.y;
      out.push({
        key: `ped:fb:${parent}:${child}`,
        d: `M ${sx} ${sy} L ${ex} ${ey}`,
        kind: "default",
      });
    }

    return out;
  }, [layout.positions, relationships]);

  const heroBtnBase: CSSProperties = {
    fontFamily: sans,
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.brownOutline,
    color: colors.brownDark,
    backgroundColor: "transparent",
    padding: "0.5rem 0.85rem",
    borderRadius: 4,
    fontSize: "0.8125rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background-color 0.2s, color 0.2s, border-color 0.2s",
  };

  const searchInputStyle: CSSProperties = {
    fontFamily: sans,
    color: colors.brownDark,
    backgroundColor: colors.cream,
    borderColor: colors.brownBorder,
    borderWidth: 1,
    borderStyle: "solid",
    padding: "0.45rem 0.6rem",
    fontSize: "0.875rem",
    borderRadius: 2,
    minWidth: 140,
    outlineColor: colors.brownOutline,
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

  const photoUploadHeroBtn: CSSProperties = {
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

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .dg-tree-hero-btn:hover:not(:disabled) {
              background-color: var(--dg-parchment-deep) !important;
              border-color: var(--dg-brown-dark) !important;
            }
            .dg-photo-modal-hero-btn:hover:not(:disabled) {
              background-color: var(--dg-parchment-deep) !important;
              border-color: var(--dg-brown-dark) !important;
            }
            .dg-tree-signout:hover {
              background-color: var(--dg-parchment) !important;
              border-color: var(--dg-brown-border) !important;
            }
            .dg-tree-zoom-btn:hover {
              background-color: var(--dg-parchment-deep) !important;
              border-color: var(--dg-brown-dark) !important;
            }
          `,
        }}
      />

      <input
        ref={treePhotoFileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (!isAllowedTreePhotoFile(f)) {
            setPhotoUploadError(
              "Please choose a JPG, PNG, WebP, or GIF image."
            );
            return;
          }
          setPhotoUploadError(null);
          setPhotoPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(f);
          });
          setPhotoFile(f);
        }}
      />

      <div className="flex h-svh min-h-0 flex-col overflow-hidden">
        <nav
          className="shrink-0 border-b px-4 py-3 sm:px-6"
          style={{
            backgroundColor: colors.cream,
            borderColor: `${colors.brownBorder}55`,
          }}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-6">
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
              <div className="min-w-0 shrink-0">
                <p
                  className="text-xl font-bold tracking-tight sm:text-2xl"
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
              <div
                className="min-w-0 flex-1 border-l pl-3 sm:pl-4"
                style={{ borderColor: `${colors.brownBorder}99` }}
              >
                <p
                  className="truncate text-base font-bold sm:text-lg"
                  style={{ fontFamily: serif, color: colors.brownDark }}
                  title={treeName}
                >
                  {treeName}
                </p>
                <Link
                  href="/dashboard"
                  className="mt-1 inline-block text-xs underline sm:text-sm"
                  style={{ fontFamily: sans, color: colors.forest }}
                >
                  Back to My Trees
                </Link>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 lg:shrink-0">
              <div className="relative min-w-[8rem] flex-1 sm:max-w-[220px] sm:flex-none">
                <input
                  type="search"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && searchMatches[0]) {
                      zoomToPerson(searchMatches[0].id);
                    }
                  }}
                  placeholder="Find a person…"
                  className="w-full"
                  style={searchInputStyle}
                  aria-label="Search people on tree"
                />
                {searchMatches.length > 0 && searchLower.length >= 1 ? (
                  <ul
                    className="absolute left-0 right-0 top-full z-30 mt-1 max-h-40 overflow-y-auto rounded border shadow-md"
                    style={{
                      borderColor: colors.brownBorder,
                      backgroundColor: colors.parchment,
                    }}
                  >
                    {searchMatches.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:opacity-90"
                          style={{ fontFamily: sans, color: colors.brownDark }}
                          onClick={() => {
                            zoomToPerson(p.id);
                            setSearchQ(displayName(p));
                          }}
                        >
                          {displayName(p)}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <button
                type="button"
                className="dg-tree-hero-btn shrink-0"
                style={heroBtnBase}
                onClick={() => setUploadPanelOpen(true)}
              >
                Upload Record
              </button>
              <button
                type="button"
                className="dg-tree-hero-btn shrink-0"
                style={heroBtnBase}
                onClick={openPhotoModal}
              >
                Upload Photo
              </button>
              <button
                type="button"
                className="dg-tree-hero-btn shrink-0"
                style={heroBtnBase}
                onClick={() => {
                  setAddPersonError(null);
                  setAddPersonOpen(true);
                }}
              >
                Add Person
              </button>
              <button
                type="button"
                className="shrink-0"
                aria-label={
                  theme === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"
                }
                style={{
                  fontFamily: sans,
                  fontSize: "1.15rem",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "0.35rem 0.5rem",
                  borderRadius: 4,
                }}
                onClick={toggleTheme}
              >
                {theme === "dark" ? "☀️" : "🌙"}
              </button>
              <button
                type="button"
                className="dg-tree-signout shrink-0 rounded-md border px-3 py-1.5 text-sm"
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
          </div>
        </nav>

        <div
          className="relative min-h-0 flex-1"
          style={{ backgroundColor: "var(--dg-parchment)" }}
        >
          <TransformWrapper
            ref={transformRef}
            initialScale={CANVAS_INITIAL_SCALE}
            minScale={0.2}
            maxScale={2}
            limitToBounds={false}
            centerOnInit={false}
            wheel={{ step: 0.12 }}
            doubleClick={{ mode: "reset" }}
            onInit={handleTransformInit}
          >
            <div className="relative h-full min-h-0 w-full">
              <TransformComponent
                wrapperClass="!w-full !h-full"
                wrapperStyle={{
                  width: "100%",
                  height: "100%",
                  maxHeight: "100%",
                }}
                contentClass="!block"
                contentStyle={{
                  width: layout.contentWidth,
                  height: layout.contentHeight,
                  position: "relative",
                  backgroundColor: "var(--dg-parchment)",
                }}
              >
                <div
                  className="relative"
                  style={{
                    width: layout.contentWidth,
                    height: layout.contentHeight,
                    backgroundColor: "var(--dg-parchment)",
                  }}
                >
                <svg
                  className="pointer-events-none absolute left-0 top-0 z-0"
                  width={layout.contentWidth}
                  height={layout.contentHeight}
                  aria-hidden
                >
                  {parentChildConnectorPaths.map(({ key, d, kind }) => (
                    <path
                      key={key}
                      d={d}
                      fill="none"
                      stroke={
                        kind === "couple"
                          ? "var(--dg-brown-mid)"
                          : "var(--dg-brown-border)"
                      }
                      strokeWidth={2}
                      strokeDasharray={kind === "couple" ? "6 4" : undefined}
                      opacity={0.7}
                    />
                  ))}
                </svg>
                {mergedPersons.length === 0 ? (
                  <p
                    className="absolute left-1/2 top-1/2 max-w-sm -translate-x-1/2 -translate-y-1/2 text-center text-sm"
                    style={{ fontFamily: sans, color: colors.brownMid }}
                  >
                    No people in this tree yet. Use Add Person above to start
                    this tree.
                  </p>
                ) : null}

                {layout.positions.map((pos) => {
                  const p = personById.get(pos.id);
                  if (!p) return null;
                  const primaryRow = primaryPhotoMap[pos.id];
                  const fallback = p.photo_url?.trim() || null;
                  const hasAvatarSrc =
                    !!(primaryRow?.file_url ?? "").trim() || !!fallback;
                  const dates = [
                    p.birth_date ? formatDateString(p.birth_date) : null,
                    p.death_date ? formatDateString(p.death_date) : null,
                  ]
                    .filter(Boolean)
                    .join(" – ");

                  return (
                    <div
                      key={pos.id}
                      id={`tree-node-${pos.id}`}
                      className="group absolute z-[1] rounded-md border shadow-sm"
                      style={{
                        left: pos.x,
                        top: pos.y,
                        width: LAYOUT_NODE_W,
                        height: LAYOUT_NODE_H,
                        borderColor: colors.brownBorder,
                        backgroundColor: colors.cream,
                        boxShadow: "0 2px 8px rgb(var(--dg-shadow-rgb) / 0.08)",
                      }}
                    >
                      <Link
                        href={`/dashboard/${treeId}/person/${pos.id}`}
                        className="absolute left-0 right-0 top-0 z-0 flex gap-2 rounded-t-md p-2 no-underline"
                        style={{
                          color: colors.brownDark,
                          bottom: 22,
                        }}
                      >
                        <div
                          className="relative shrink-0 overflow-hidden rounded-full"
                          style={{
                            width: 40,
                            height: 40,
                            backgroundColor: "var(--dg-avatar-bg)",
                            border: `1px solid ${colors.brownBorder}`,
                          }}
                        >
                          {hasAvatarSrc ? (
                            <TreeNodeAvatarImg
                              primary={primaryRow}
                              fallbackUrl={fallback}
                            />
                          ) : (
                            <div
                              className="flex h-full w-full items-center justify-center text-xs font-bold"
                              style={{
                                fontFamily: sans,
                                color: colors.brownMid,
                              }}
                            >
                              {initials(p)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <p
                            className="truncate text-sm font-bold leading-tight"
                            style={{ fontFamily: serif }}
                            title={displayName(p)}
                          >
                            {displayName(p)}
                          </p>
                          {dates ? (
                            <p
                              className="mt-0.5 truncate text-[11px] leading-snug"
                              style={{
                                fontFamily: sans,
                                color: colors.brownMuted,
                              }}
                              title={dates}
                            >
                              {dates}
                            </p>
                          ) : null}
                        </div>
                      </Link>
                      <button
                        type="button"
                        className="dg-tree-hero-btn absolute bottom-0 left-0 right-0 z-10 rounded-b-md border-t px-1 py-0.5 text-[10px] font-semibold opacity-0 transition-opacity group-hover:opacity-100"
                        style={{
                          fontFamily: sans,
                          borderColor: colors.brownBorder,
                          color: colors.brownDark,
                          backgroundColor: colors.parchment,
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setLayoutRootOverride(pos.id);
                          centeredRef.current = false;
                        }}
                      >
                        Set as root
                      </button>
                    </div>
                  );
                })}
                </div>
              </TransformComponent>
              <TreeCanvasZoomControls />
            </div>
          </TransformWrapper>
        </div>
      </div>

      {uploadPanelOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tree-upload-record-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeUploadModal();
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
                id="tree-upload-record-title"
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
                onClick={closeUploadModal}
              >
                ×
              </button>
            </div>
            <p
              className="mb-4 text-sm"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              Upload a document and let Claude extract people, events, and
              relationships.
            </p>
            <DocumentUploadSection treeId={treeId} embedded />
          </div>
        </div>
      ) : null}

      {photoModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tree-photo-upload-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePhotoModal();
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
              id="tree-photo-upload-title"
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
                {photoPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoPreviewUrl}
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
                className="dg-photo-modal-hero-btn rounded border-2 px-4 py-2 text-sm font-semibold"
                style={{
                  ...photoUploadHeroBtn,
                  padding: "0.5rem 1rem",
                  fontSize: "0.875rem",
                }}
                onClick={() => treePhotoFileInputRef.current?.click()}
              >
                {photoFile ? "Change photo" : "Choose photo"}
              </button>
            </div>

            <div className="mb-4">
              <label
                className="mb-1 block text-xs font-bold uppercase tracking-wide"
                style={{ fontFamily: sans, color: colors.brownMuted }}
                htmlFor="tree-photo-person-search"
              >
                Who is in this photo?
              </label>
              <input
                id="tree-photo-person-search"
                type="search"
                value={photoPersonSearch}
                onChange={(e) => setPhotoPersonSearch(e.target.value)}
                placeholder="Search by name…"
                autoComplete="off"
                className="mb-2 w-full"
                style={modalInputStyle}
              />
              {photoSelectedPerson ? (
                <div
                  className="mb-2 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm"
                  style={{
                    fontFamily: sans,
                    borderColor: colors.brownBorder,
                    backgroundColor: colors.cream,
                    color: colors.brownDark,
                  }}
                >
                  {displayName(photoSelectedPerson)}
                  <button
                    type="button"
                    className="ml-0.5 rounded px-1 leading-none"
                    style={{ color: colors.brownMid }}
                    aria-label="Clear selected person"
                    onClick={() => setPhotoSelectedPerson(null)}
                  >
                    ×
                  </button>
                </div>
              ) : null}
              <ul
                id="tree-photo-person-listbox"
                role="listbox"
                className="max-h-48 overflow-y-auto rounded border"
                style={{
                  borderColor: colors.brownBorder,
                  backgroundColor: colors.cream,
                }}
              >
                {photoPersonOptions.length === 0 ? (
                  <li
                    className="px-3 py-2 text-sm"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                  >
                    No people match this tree.
                  </li>
                ) : (
                  photoPersonOptions.map((p) => (
                    <li key={p.id} role="option" aria-selected={false}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:opacity-90"
                        style={{
                          fontFamily: sans,
                          color: colors.brownDark,
                          backgroundColor:
                            photoSelectedPerson?.id === p.id
                              ? "var(--dg-parchment-deep)"
                              : "transparent",
                        }}
                        onClick={() => {
                          setPhotoSelectedPerson(p);
                          setPhotoPersonSearch("");
                        }}
                      >
                        {displayName(p)}
                      </button>
                    </li>
                  ))
                )}
              </ul>
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
                className="dg-photo-modal-hero-btn"
                style={photoUploadHeroBtn}
                disabled={photoUploadSaving}
                onClick={() => void saveTreePhoto()}
              >
                {photoUploadSaving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                className="dg-photo-modal-hero-btn"
                style={photoUploadHeroBtn}
                disabled={photoUploadSaving}
                onClick={closePhotoModal}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {addPersonOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="tree-add-person-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeAddPersonModal();
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
              id="tree-add-person-title"
              className="mb-4 text-2xl font-bold"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Add a person
            </h2>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submitAddPerson();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="tree-add-first"
                    className="mb-1 block text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                  >
                    First name *
                  </label>
                  <input
                    id="tree-add-first"
                    type="text"
                    required
                    value={addFirst}
                    onChange={(e) => setAddFirst(e.target.value)}
                    autoComplete="given-name"
                    style={modalInputStyle}
                  />
                </div>
                <div>
                  <label
                    htmlFor="tree-add-middle"
                    className="mb-1 block text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                  >
                    Middle name
                  </label>
                  <input
                    id="tree-add-middle"
                    type="text"
                    value={addMiddle}
                    onChange={(e) => setAddMiddle(e.target.value)}
                    autoComplete="additional-name"
                    style={modalInputStyle}
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="tree-add-last"
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  Last name *
                </label>
                <input
                  id="tree-add-last"
                  type="text"
                  required
                  value={addLast}
                  onChange={(e) => setAddLast(e.target.value)}
                  autoComplete="family-name"
                  style={modalInputStyle}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="tree-add-birth"
                    className="mb-1 block text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                  >
                    Birth date
                  </label>
                  <input
                    id="tree-add-birth"
                    type="date"
                    value={addBirth}
                    onChange={(e) => setAddBirth(e.target.value)}
                    style={modalInputStyle}
                  />
                </div>
                <div>
                  <label
                    htmlFor="tree-add-death"
                    className="mb-1 block text-xs font-bold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                  >
                    Death date
                  </label>
                  <input
                    id="tree-add-death"
                    type="date"
                    value={addDeath}
                    onChange={(e) => setAddDeath(e.target.value)}
                    style={modalInputStyle}
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="tree-add-gender"
                  className="mb-1 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  Gender
                </label>
                <select
                  id="tree-add-gender"
                  value={addGender}
                  onChange={(e) => setAddGender(e.target.value)}
                  style={modalInputStyle}
                >
                  <option value="">—</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Unknown">Unknown</option>
                </select>
              </div>

              {addPersonError ? (
                <p
                  className="text-sm"
                  style={{ fontFamily: sans, color: "#8B3A3A" }}
                  role="alert"
                >
                  {addPersonError}
                </p>
              ) : null}

              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  type="submit"
                  className="dg-tree-hero-btn rounded border-2 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  style={heroBtnBase}
                  disabled={addPersonSaving}
                >
                  {addPersonSaving ? "Saving…" : "Add person"}
                </button>
                <button
                  type="button"
                  className="dg-tree-hero-btn rounded border-2 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  style={heroBtnBase}
                  disabled={addPersonSaving}
                  onClick={closeAddPersonModal}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
