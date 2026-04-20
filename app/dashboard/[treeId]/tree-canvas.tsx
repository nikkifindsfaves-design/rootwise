"use client";

import { useTheme } from "@/lib/theme/theme-context";
import type { CanvasThemeId } from "@/lib/themes/canvas-themes";
import { createClient } from "@/lib/supabase/client";
import { formatDateString } from "@/lib/utils/dates";
import { normalizeGender } from "@/lib/utils/gender";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
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

/**
 * Bulletin corkboard: repeating cork photo under stacked translucent gradients (no SVG filters).
 */
function treeCanvasCorkboardSurfaceStyle(isDark: boolean): CSSProperties {
  const fiberA = isDark ? 0.075 : 0.055;
  const fiberB = isDark ? 0.065 : 0.048;
  const fibers: string[] = [
    `repeating-linear-gradient(46deg, transparent 0, transparent 9px, rgba(45, 28, 14, ${fiberA}) 9px, rgba(45, 28, 14, ${fiberA}) 10px)`,
    `repeating-linear-gradient(-39deg, transparent 0, transparent 12px, rgba(38, 22, 12, ${fiberB}) 12px, rgba(38, 22, 12, ${fiberB}) 13px)`,
  ];
  const vignette = isDark
    ? "radial-gradient(ellipse 130% 92% at 50% 40%, transparent 38%, rgba(0,0,0,0.42) 100%)"
    : "radial-gradient(ellipse 125% 90% at 50% 42%, transparent 45%, rgba(48, 30, 18, 0.16) 100%)";

  const specksLight = [
    "radial-gradient(circle at 9% 14%, rgba(255,250,242,0.58) 0, transparent 0.42%)",
    "radial-gradient(circle at 24% 71%, rgba(72,42,22,0.22) 0, transparent 0.38%)",
    "radial-gradient(circle at 43% 28%, rgba(255,255,255,0.42) 0, transparent 0.28%)",
    "radial-gradient(circle at 58% 82%, rgba(90,52,28,0.18) 0, transparent 0.4%)",
    "radial-gradient(circle at 73% 19%, rgba(255,248,236,0.38) 0, transparent 0.32%)",
    "radial-gradient(circle at 88% 64%, rgba(62,36,20,0.2) 0, transparent 0.36%)",
    "radial-gradient(circle at 31% 48%, rgba(255,255,255,0.28) 0, transparent 0.22%)",
    "radial-gradient(circle at 67% 51%, rgba(80,48,26,0.15) 0, transparent 0.45%)",
    "radial-gradient(circle at 15% 88%, rgba(255,252,246,0.32) 0, transparent 0.3%)",
    "radial-gradient(circle at 92% 38%, rgba(70,40,22,0.16) 0, transparent 0.35%)",
  ];
  const specksDark = [
    "radial-gradient(circle at 10% 16%, rgba(200,168,130,0.16) 0, transparent 0.5%)",
    "radial-gradient(circle at 26% 74%, rgba(0,0,0,0.22) 0, transparent 0.42%)",
    "radial-gradient(circle at 44% 30%, rgba(220,190,150,0.12) 0, transparent 0.32%)",
    "radial-gradient(circle at 61% 85%, rgba(0,0,0,0.18) 0, transparent 0.38%)",
    "radial-gradient(circle at 76% 21%, rgba(190,155,120,0.14) 0, transparent 0.35%)",
    "radial-gradient(circle at 89% 58%, rgba(0,0,0,0.2) 0, transparent 0.4%)",
    "radial-gradient(circle at 33% 50%, rgba(210,175,138,0.1) 0, transparent 0.28%)",
    "radial-gradient(circle at 69% 48%, rgba(0,0,0,0.14) 0, transparent 0.48%)",
    "radial-gradient(circle at 17% 90%, rgba(185,150,115,0.12) 0, transparent 0.34%)",
    "radial-gradient(circle at 94% 36%, rgba(0,0,0,0.16) 0, transparent 0.36%)",
  ];

  const overlayLayers: string[] = [
    ...fibers,
    vignette,
    ...(isDark ? specksDark : specksLight),
  ];
  /** Last in list = back-most layer (under overlays). Public file: `public/small cork.jpg`. */
  const corkTile = "url(/small%20cork.jpg)";

  return {
    backgroundColor: isDark ? "#4f3829" : "#b9855c",
    backgroundImage: [...overlayLayers, corkTile].join(", "),
    boxShadow: isDark
      ? "inset 0 0 120px rgba(0,0,0,0.4)"
      : "inset 0 0 140px rgba(42, 26, 14, 0.11)",
  };
}

/** Roots theme: full-bleed art from `public/Roots Tree BG.jpg` (light/dark read via gradient only). */
function treeCanvasRootsSurfaceStyle(isDark: boolean): CSSProperties {
  const bg = "url(/Roots%20Tree%20BG.jpg)";
  const wash = isDark
    ? "linear-gradient(180deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.52) 100%)"
    : "linear-gradient(180deg, rgba(255,252,248,0.12) 0%, rgba(42,26,14,0.14) 100%)";
  return {
    backgroundColor: isDark ? "#1e1812" : "#c4b4a2",
    backgroundImage: `${wash}, ${bg}`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    boxShadow: isDark
      ? "inset 0 0 120px rgba(0,0,0,0.45)"
      : "inset 0 0 140px rgba(42, 26, 14, 0.1)",
  };
}

/** Explicit pedigree layout (fixed canvas geometry). */
const LAYOUT_CANVAS_W = 2400;

/** Polaroid-style tree cards (same proportions as profile header polaroids, smaller). */
const TREE_POLAROID_EDGE = 5;
const TREE_POLAROID_IMG_W = 88;
const TREE_POLAROID_IMG_H = Math.round(
  (TREE_POLAROID_IMG_W * 160) / 128
);
/** Roots leaf cards only: photo viewport 30% smaller than polaroid tree print. */
const TREE_ROOTS_LEAF_IMG_W = Math.round(TREE_POLAROID_IMG_W * 0.7);
const TREE_ROOTS_LEAF_IMG_H = Math.round(TREE_POLAROID_IMG_H * 0.7);
/** Room for two 11px lines at tight leading + gap before dates (avoids line-clamp clip). */
const TREE_POLAROID_CAPTION_MIN_H = 46;
const TREE_POLAROID_SET_ROOT_H = 22;
const TREE_POLAROID_CAPTION_GAP = 6;

const LAYOUT_NODE_W = TREE_POLAROID_EDGE * 2 + TREE_POLAROID_IMG_W;
const LAYOUT_NODE_H =
  TREE_POLAROID_EDGE +
  TREE_POLAROID_IMG_H +
  TREE_POLAROID_CAPTION_GAP +
  TREE_POLAROID_CAPTION_MIN_H +
  TREE_POLAROID_SET_ROOT_H;

/**
 * Leaf art is ~square; `cover` inside the tall narrow polaroid rect clips the sides flat.
 * Roots uses a wider (and slightly taller) surface centered on the same layout slot so the
 * SVG can scale up without losing the curved silhouette. Layout math still uses LAYOUT_NODE_*.
 * Width stays wide for side curves; height ≥ ~width so ~square `leaf.svg` + `cover` does not clip the tip.
 */
const TREE_LEAF_SURFACE_W = Math.round(LAYOUT_NODE_H * 1.464);
const TREE_LEAF_SURFACE_H = Math.round(
  Math.max(LAYOUT_NODE_H * 1.35, TREE_LEAF_SURFACE_W * 1.04)
);
/** Roots tree cards: move photo + caption block down by 30% of leaf height (see `items-center` on Link). */
const TREE_LEAF_ROOTS_CONTENT_SHIFT_Y = Math.round(TREE_LEAF_SURFACE_H * 0.3);
/** Caption pill text: literal dark brown so it stays readable in app dark mode (`--dg-*` browns often invert). */
const TREE_ROOTS_CAPTION_INK = "#2a1810";

const LAYOUT_BASE_Y = 1200;
const LAYOUT_GEN_DY = 300;
const LAYOUT_V_PAD = 80;
const LAYOUT_MIN_NODE_GAP = 80;

/** Hand-tilted polaroid rotation (-3°..3°), deterministic from id chars 0–3 with per-index weights. */
function treeCardTiltDegreesFromPersonId(id: string): number {
  let acc = 0;
  for (let i = 0; i < 4; i++) {
    const ch = i < id.length ? id.charCodeAt(i) : 47 + i;
    acc += ch * (5 + i * 13);
  }
  const bucket = acc % 601;
  return -3 + (bucket / 600) * 6;
}

/** Small vertical offset (-25px..25px), deterministic from id chars 4–7 (independent of tilt chars). */
function treeCardVerticalNudgePxFromPersonId(id: string): number {
  let acc = 0;
  for (let i = 0; i < 4; i++) {
    const idx = 4 + i;
    const ch = idx < id.length ? id.charCodeAt(idx) : 31 + i * 3;
    acc += ch * (11 + i * 17);
  }
  const bucket = acc % 1001;
  return -25 + (bucket / 1000) * 50;
}

/**
 * Head center offset from card edge; stem overlaps the card (pins SVG above string lines above cards).
 */
const TREE_PIN_HEAD_OFFSET_Y = 12;
const TREE_PIN_HEAD_R = 9;
const TREE_PIN_STEM_W = 2.5;
const TREE_PIN_STEM_LEN = 8;
const TREE_PIN_STEM_FILL = "#5a0000";
/** Local symbol: head at (11,11), viewBox height fits head + stem. */
const TREE_PIN_SYMBOL_W = 22;
const TREE_PIN_SYMBOL_H = 30;
const TREE_PIN_HEAD_CX = 11;
const TREE_PIN_HEAD_CY = 11;

/** Flat copper tack on card face: near-circle ~10px, viewBox center (6,6). */
const TREE_BRAD_SYMBOL_W = 12;
const TREE_BRAD_SYMBOL_H = 12;
const TREE_BRAD_CX = 6;
const TREE_BRAD_CY = 6;
/** Center Y from card top: below caption/dates on the polaroid face, not the outer bottom edge. */
const TREE_COPPER_TACK_CENTER_Y_FROM_TOP =
  TREE_POLAROID_EDGE +
  TREE_POLAROID_IMG_H +
  TREE_POLAROID_CAPTION_GAP +
  TREE_POLAROID_CAPTION_MIN_H +
  8;

/** Parent–child, gather, and solo threads (not marriage / spouse-only). */
const TREE_THREAD_LINEAGE = "#8b2e2e";
/** Marriage / spouse-only horizontal threads between top pins. */
const TREE_THREAD_MARRIAGE = "#a3470f";
const TREE_THREAD_STROKE_DARK = 3.5;
const TREE_THREAD_STROKE_BRIGHT = 1.8;

/** Roots tree canvas only: branch strokes + hub fill (same dark brown; dual width for slight edge). */
const TREE_ROOTS_BRANCH_BROWN = "#3a2416";
const TREE_ROOTS_BRANCH_STROKE_BACK = 7;
const TREE_ROOTS_BRANCH_STROKE_FRONT = 2.35;
/** Symbol-space Y of Roots stem bullet / path start (`TreeRootsTopPinGraphic`; thread endpoints use with `TREE_PIN_HEAD_CY`). */
const TREE_ROOTS_BULLET_SYMBOL_CY = -1.5;

/** Multi-child branch gather point: small hub, smaller than thumbtack head (r≈9 at 22px pin width). */
const TREE_GATHER_JUNCTION_R = 5.25;

function treeThreadSegmentIsMarriage(key: string): boolean {
  return key.startsWith("thread:marriage:") || key.startsWith("thread:spouse:");
}

/** Distinct top-pin cap hues; repeats after this many generations (not black — buried state uses black). */
const TREE_TOP_PIN_COLOR_CYCLE = 25;

function treeTopPinGenerationMod(generation: number): number {
  const g = generation === -999 ? 0 : generation;
  const m = g % TREE_TOP_PIN_COLOR_CYCLE;
  return m < 0 ? m + TREE_TOP_PIN_COLOR_CYCLE : m;
}

/** Roots: dual-stroke browns for top “pin” (varies by generation; buried = muted dead twig). */
function treeRootsPinBranchStrokes(
  genMod: number,
  isBuried: boolean
): { back: string; front: string } {
  if (isBuried) {
    return { back: "#12100c", front: "#241c14" };
  }
  const t = genMod / TREE_TOP_PIN_COLOR_CYCLE;
  const hue = 20 + (genMod % 9) * 2.1;
  const lBack = 17 + t * 15;
  const lFront = Math.min(46, lBack + 9);
  return {
    back: `hsl(${hue.toFixed(1)} 40% ${lBack.toFixed(1)}%)`,
    front: `hsl(${hue.toFixed(1)} 32% ${lFront.toFixed(1)}%)`,
  };
}

/** Roots theme only: small curved branch + top bullet (thumbtack symbol space; bullet triggers bury/restore). */
function TreeRootsTopPinGraphic({
  genMod,
  isBuried,
  pinInteractive,
}: {
  genMod: number;
  isBuried: boolean;
  pinInteractive: boolean;
}) {
  const { back, front } = treeRootsPinBranchStrokes(genMod, isBuried);
  /** +3px upward vs prior start so the twig meets the connector line. */
  const d = `M 11 ${TREE_ROOTS_BULLET_SYMBOL_CY} C 8.2 9.5 13.8 15.5 11 27`;
  const bulletCy = TREE_ROOTS_BULLET_SYMBOL_CY;
  return (
    <g aria-hidden>
      <g style={{ pointerEvents: "none" }}>
        <path
          d={d}
          fill="none"
          stroke={back}
          strokeWidth={3.18}
          strokeLinecap="round"
        />
        <path
          d={d}
          fill="none"
          stroke={front}
          strokeWidth={1.26}
          strokeLinecap="round"
        />
      </g>
      <circle
        cx={11}
        cy={bulletCy}
        r={4.235}
        fill={isBuried ? "#0a0806" : TREE_ROOTS_BRANCH_BROWN}
        style={{
          pointerEvents: pinInteractive ? "all" : "none",
          cursor: pinInteractive ? "pointer" : "default",
        }}
      />
    </g>
  );
}

/** Radial dome stops for a generation cap: warm highlight center → saturated mid → dark rim (L≥14%). */
function treeTopPinDomeStopColors(
  genMod: number
): readonly [string, string, string, string, string] {
  const hue = (genMod * (360 / TREE_TOP_PIN_COLOR_CYCLE)) % 360;
  return [
    `hsl(${hue} 82% 94%)`,
    `hsl(${hue} 78% 74%)`,
    `hsl(${hue} 72% 54%)`,
    `hsl(${hue} 65% 34%)`,
    `hsl(${hue} 58% 18%)`,
  ] as const;
}

type LayoutEdge = { parent: string; child: string };

/**
 * Pin attachment in canvas coords after the same nudge + rotate applied to the card
 * (`top: pos.y + nudge`, `transform-origin: center`, `rotate(tilt)`).
 */
function treeCardPinPointAfterVisualTransform(
  pos: { x: number; y: number; id: string },
  localXFromCardLeft: number,
  localYFromCardTop: number
): { x: number; y: number } {
  const nudgeY = treeCardVerticalNudgePxFromPersonId(pos.id);
  const tiltDeg = treeCardTiltDegreesFromPersonId(pos.id);
  const cx = pos.x + LAYOUT_NODE_W / 2;
  const cy = pos.y + nudgeY + LAYOUT_NODE_H / 2;
  const dx = localXFromCardLeft - LAYOUT_NODE_W / 2;
  const dy = localYFromCardTop - LAYOUT_NODE_H / 2;
  const rad = (tiltDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: cx + cos * dx - sin * dy,
    y: cy + sin * dx + cos * dy,
  };
}

/** Local Y for thread endpoints (Roots: aligned to leaf apex; stem uses extra nudge separately). */
function treeCardPinTopLocalYForThreads(canvasTheme: CanvasThemeId): number {
  if (canvasTheme !== "roots") return -TREE_PIN_HEAD_OFFSET_Y;
  return (LAYOUT_NODE_H - TREE_LEAF_SURFACE_H) / 2 - TREE_PIN_HEAD_OFFSET_Y;
}

/** Roots only: stem graphic sits lower than connector anchor so lines meet the original junction. */
const TREE_ROOTS_STEM_EXTRA_LOCAL_Y = 20;

function treeCardPinTopLocalYForStemVisual(canvasTheme: CanvasThemeId): number {
  if (canvasTheme !== "roots") return treeCardPinTopLocalYForThreads(canvasTheme);
  return (
    treeCardPinTopLocalYForThreads(canvasTheme) + TREE_ROOTS_STEM_EXTRA_LOCAL_Y
  );
}

/** Top anchor for connector geometry (threads, gathering math). */
function treeCardPinTopCenterForThreads(
  pos: { x: number; y: number; id: string },
  canvasTheme: CanvasThemeId
): { x: number; y: number } {
  return treeCardPinPointAfterVisualTransform(
    pos,
    LAYOUT_NODE_W / 2,
    treeCardPinTopLocalYForThreads(canvasTheme)
  );
}

/** Roots stem / thumbtack visual only (lower than `ForThreads`). */
function treeCardPinTopCenterForStemVisual(
  pos: { x: number; y: number; id: string },
  canvasTheme: CanvasThemeId
): { x: number; y: number } {
  return treeCardPinPointAfterVisualTransform(
    pos,
    LAYOUT_NODE_W / 2,
    treeCardPinTopLocalYForStemVisual(canvasTheme)
  );
}

/** Thread segment endpoint at top of card: Roots = stem bullet center; others = pin/leaf apex. */
function treeCardPinTopForThreadSegments(
  pos: { x: number; y: number; id: string },
  canvasTheme: CanvasThemeId
): { x: number; y: number } {
  if (canvasTheme !== "roots") {
    return treeCardPinTopCenterForThreads(pos, canvasTheme);
  }
  const stem = treeCardPinTopCenterForStemVisual(pos, canvasTheme);
  return {
    x: stem.x,
    y: stem.y + (TREE_ROOTS_BULLET_SYMBOL_CY - TREE_PIN_HEAD_CY),
  };
}

/**
 * Copper tack on front of card (below dates); strings attach to tack center.
 */
function treeCardPinBottomCenter(pos: { x: number; y: number; id: string }): {
  x: number;
  y: number;
} {
  return treeCardPinPointAfterVisualTransform(
    pos,
    LAYOUT_NODE_W / 2,
    TREE_COPPER_TACK_CENTER_Y_FROM_TOP
  );
}

type TreeThreadSegment = {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isMarriage: boolean;
};

type TreeGatheringPin = {
  key: string;
  x: number;
  y: number;
};

function treePinTopUseTransform(wx: number, wy: number): string {
  return `translate(${wx - TREE_PIN_HEAD_CX}, ${wy - TREE_PIN_HEAD_CY})`;
}

function treeBradUseTransform(wx: number, wy: number): string {
  return `translate(${wx - TREE_BRAD_CX}, ${wy - TREE_BRAD_CY})`;
}

function TreeThreadLine({
  x1,
  y1,
  x2,
  y2,
  isMarriage,
  rootsBranchVisual,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  isMarriage: boolean;
  rootsBranchVisual: boolean;
}) {
  const strokeDark = rootsBranchVisual
    ? TREE_ROOTS_BRANCH_BROWN
    : isMarriage
      ? TREE_THREAD_MARRIAGE
      : TREE_THREAD_LINEAGE;
  const strokeBright = rootsBranchVisual
    ? TREE_ROOTS_BRANCH_BROWN
    : isMarriage
      ? TREE_THREAD_MARRIAGE
      : TREE_THREAD_LINEAGE;
  const wBack = rootsBranchVisual
    ? TREE_ROOTS_BRANCH_STROKE_BACK
    : TREE_THREAD_STROKE_DARK;
  const wFront = rootsBranchVisual
    ? TREE_ROOTS_BRANCH_STROKE_FRONT
    : TREE_THREAD_STROKE_BRIGHT;
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={strokeDark}
        strokeWidth={wBack}
        strokeLinecap="round"
      />
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={strokeBright}
        strokeWidth={wFront}
        strokeLinecap="round"
      />
    </g>
  );
}

/** Hit target when a pin can bury or restore (same geometry as the pin symbol). */
function TreePinActionWrap({
  interactive,
  ariaLabel,
  onAction,
  children,
}: {
  interactive: boolean;
  ariaLabel: string | null;
  onAction: () => void;
  children: ReactNode;
}) {
  if (!interactive || !ariaLabel) return <>{children}</>;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      style={{ cursor: "pointer", pointerEvents: "auto" }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onAction();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        e.stopPropagation();
        onAction();
      }}
    >
      <rect
        width={TREE_PIN_SYMBOL_W}
        height={TREE_PIN_SYMBOL_H}
        fill="transparent"
        pointerEvents="all"
      />
      {children}
    </g>
  );
}

function buildParentToChildren(edges: LayoutEdge[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const { parent, child } of edges) {
    if (!m.has(parent)) m.set(parent, []);
    m.get(parent)!.push(child);
  }
  return m;
}

function normRelType(t: string): string {
  return t.trim().toLowerCase();
}

/**
 * Canonical directed “older generation → younger” edge for layout and ancestor walks.
 * Matches DB rows from review/person flows: parent/child swap, plus grandparent/grandchild.
 */
function directedGenerationalEdge(r: {
  person_a_id: string;
  person_b_id: string;
  relationship_type: string;
}): { parent: string; child: string } | null {
  const t = normRelType(r.relationship_type);
  if (t === "parent") {
    return { parent: r.person_a_id, child: r.person_b_id };
  }
  if (t === "child") {
    return { parent: r.person_b_id, child: r.person_a_id };
  }
  if (t === "grandparent") {
    return { parent: r.person_a_id, child: r.person_b_id };
  }
  if (t === "grandchild") {
    return { parent: r.person_b_id, child: r.person_a_id };
  }
  return null;
}

function parentChildEdges(
  relationships: TreeCanvasRelationship[],
  personSet: Set<string>
): LayoutEdge[] {
  const seenEdge = new Set<string>();
  const out: LayoutEdge[] = [];
  for (const r of relationships) {
    const pc = directedGenerationalEdge(r);
    if (!pc) continue;
    const { parent, child } = pc;
    if (!personSet.has(parent) || !personSet.has(child)) continue;
    const dedupe = `${parent}->${child}`;
    if (seenEdge.has(dedupe)) continue;
    seenEdge.add(dedupe);
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

/** All strict ancestors of `personId` (not including `personId`), walking upward iteratively. */
function getAncestors(
  personId: string,
  parentsOf: Map<string, Set<string>>
): Set<string> {
  const out = new Set<string>();
  const stack: string[] = [];
  const roots = parentsOf.get(personId);
  if (roots) for (const p of roots) stack.push(p);
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    const pars = parentsOf.get(id);
    if (pars) for (const p of pars) stack.push(p);
  }
  return out;
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

  // STEP 1 — identify family units (children who share the exact same parent set).
  const familyUnits = new Map<string, string[]>();
  for (const id of personIds) {
    const pars = [...(parentsOf.get(id) ?? [])].filter((pid) =>
      personSet.has(pid)
    );
    if (pars.length === 0) continue;
    pars.sort((a, b) => a.localeCompare(b));
    const key = pars.join("|");
    if (!familyUnits.has(key)) familyUnits.set(key, []);
    familyUnits.get(key)!.push(id);
  }
  for (const ids of familyUnits.values()) {
    ids.sort((a, b) => a.localeCompare(b));
  }

  // STEP 2 — root, floaters, and true islands (no parents, no children).
  if (rootId && personSet.has(rootId)) {
    xById.set(rootId, LAYOUT_ROOT_X);
  }
  for (const id of personIds) {
    if (!reachable.has(id)) {
      xById.set(id, centerX);
      continue;
    }
    if (id === rootId && personSet.has(rootId)) continue;
    const pars = [...(parentsOf.get(id) ?? [])].filter((pid) =>
      personSet.has(pid)
    );
    const kids = [...(childrenOf.get(id) ?? [])].filter((c) =>
      personSet.has(c)
    );
    if (pars.length === 0 && kids.length === 0) {
      xById.set(id, centerX);
    }
  }

  let minGen = Infinity;
  let maxGen = -Infinity;
  for (const id of personIds) {
    if (floaterSet.has(id)) continue;
    const g = gen.get(id) ?? 0;
    minGen = Math.min(minGen, g);
    maxGen = Math.max(maxGen, g);
  }
  if (minGen === Infinity) {
    minGen = 0;
    maxGen = 0;
  }

  const clusterCenterByKey = new Map<string, number>();
  const unitKeysSorted = [...familyUnits.keys()].sort((a, b) =>
    a.localeCompare(b)
  );

  const placeFamilyUnitCluster = (
    unitKey: string,
    children: string[],
    generation: number,
    forceCluster: boolean
  ) => {
    const inUnit = children.filter(
      (c) =>
        reachable.has(c) &&
        !floaterSet.has(c) &&
        (gen.get(c) ?? 0) === generation
    );
    if (inUnit.length === 0) return;
    if (!inUnit.every((c) => (gen.get(c) ?? 0) === generation)) return;

    const parentIds = unitKey.split("|");
    const positioned = parentIds.filter((p) => xById.has(p));
    if (
      parentIds.length > 0 &&
      positioned.length === 0 &&
      !forceCluster
    ) {
      return;
    }

    let clusterCenter: number;
    if (positioned.length >= 2) {
      clusterCenter =
        positioned.reduce((s, p) => s + xById.get(p)!, 0) /
        positioned.length;
    } else if (positioned.length === 1) {
      clusterCenter = xById.get(positioned[0]!)!;
    } else {
      clusterCenter = centerX;
    }

    const n = inUnit.length;
    const clusterW =
      n * LAYOUT_NODE_W + (n - 1) * LAYOUT_MIN_NODE_GAP;
    let left = clusterCenter - clusterW / 2;
    for (let i = 0; i < n; i++) {
      const cid = inUnit[i]!;
      xById.set(cid, left);
      left += LAYOUT_NODE_W + LAYOUT_MIN_NODE_GAP;
    }
    clusterCenterByKey.set(unitKey, clusterCenter);
  };

  const runStep3TopDown = (forceCluster: boolean) => {
    for (let g = maxGen; g >= minGen; g--) {
      for (const unitKey of unitKeysSorted) {
        const children = familyUnits.get(unitKey)!;
        if (!children.every((c) => (gen.get(c) ?? 0) === g)) continue;
        if (children.some((c) => !reachable.has(c) || floaterSet.has(c)))
          continue;
        placeFamilyUnitCluster(unitKey, children, g, forceCluster);
      }
    }
  };

  const fillParentXFromChildren = () => {
    for (const id of sortedIds) {
      if (id === rootId && personSet.has(rootId)) continue;
      if (!reachable.has(id)) continue;
      if (xById.has(id)) continue;
      const kids = [...(childrenOf.get(id) ?? [])].filter((c) =>
        personSet.has(c)
      );
      const kidXs = kids
        .map((c) => xById.get(c))
        .filter((v): v is number => v !== undefined);
      if (kidXs.length === 0) continue;
      const nx =
        kidXs.length === 1
          ? kidXs[0]!
          : kidXs.reduce((a, b) => a + b, 0) / kidXs.length;
      xById.set(id, nx);
    }
  };

  // Propagate root x upward through ancestor generations before cluster placement.
  fillParentXFromChildren();
  fillParentXFromChildren();
  fillParentXFromChildren();
  fillParentXFromChildren();
  fillParentXFromChildren();
  runStep3TopDown(false);
  fillParentXFromChildren();
  runStep3TopDown(false);
  fillParentXFromChildren();
  runStep3TopDown(true);
  fillParentXFromChildren();

  for (const id of personIds) {
    if (!reachable.has(id) || floaterSet.has(id)) continue;
    if (xById.has(id)) continue;
    if (id === rootId && personSet.has(rootId)) continue;
    xById.set(id, centerX);
  }

  // STEP 5 — multi-partner parents: lay partner clusters side by side under parent x.
  const parentToUnitKeys = new Map<string, Set<string>>();
  for (const unitKey of unitKeysSorted) {
    const parts = unitKey.split("|");
    for (const p of parts) {
      if (!parentToUnitKeys.has(p)) parentToUnitKeys.set(p, new Set());
      parentToUnitKeys.get(p)!.add(unitKey);
    }
  }

  const unitKeySetsEqual = (a: Set<string>, b: Set<string>) => {
    if (a.size !== b.size) return false;
    for (const x of a) if (!b.has(x)) return false;
    return true;
  };

  const step5ProcessedParents = new Set<string>();
  const multiPartnerParentIds = [...parentToUnitKeys.keys()]
    .filter((pid) => parentToUnitKeys.get(pid)!.size > 1)
    .sort((a, b) => a.localeCompare(b));

  for (const parentId of multiPartnerParentIds) {
    if (parentId === rootId && personSet.has(rootId)) continue;
    if (step5ProcessedParents.has(parentId)) continue;

    const unitKeys = parentToUnitKeys.get(parentId)!;
    const avgParentXForUnitKey = (uk: string): number | null => {
      const xs = uk
        .split("|")
        .map((id) => xById.get(id))
        .filter((v): v is number => v !== undefined);
      if (xs.length === 0) return null;
      return xs.reduce((s, v) => s + v, 0) / xs.length;
    };
    const keysSorted = [...unitKeys].sort((a, b) => {
      const da = avgParentXForUnitKey(a);
      const db = avgParentXForUnitKey(b);
      if (da !== null && db !== null && da !== db) return da - db;
      if (da !== null && db === null) return -1;
      if (da === null && db !== null) return 1;
      return a.localeCompare(b);
    });

    const clusterMeta: { width: number; children: string[] }[] = [];
    for (const uk of keysSorted) {
      const children = (familyUnits.get(uk) ?? []).filter(
        (c) => reachable.has(c) && !floaterSet.has(c)
      );
      const n = children.length;
      const clusterW =
        n <= 0
          ? 0
          : n * LAYOUT_NODE_W + (n - 1) * LAYOUT_MIN_NODE_GAP;
      clusterMeta.push({ width: clusterW, children });
    }

    const numClusters = clusterMeta.length;
    const totalWidth =
      clusterMeta.reduce((s, c) => s + c.width, 0) +
      (numClusters > 1 ? (numClusters - 1) * LAYOUT_MIN_NODE_GAP : 0);

    const parentX = xById.get(parentId) ?? centerX;
    let startX = parentX - totalWidth / 2;

    for (const { width: clusterW, children } of clusterMeta) {
      let x = startX;
      for (const cid of children) {
        xById.set(cid, x);
        x += LAYOUT_NODE_W + LAYOUT_MIN_NODE_GAP;
      }
      startX += clusterW + LAYOUT_MIN_NODE_GAP;
    }

    for (const [otherId, otherKeys] of parentToUnitKeys) {
      if (unitKeySetsEqual(otherKeys, unitKeys)) {
        step5ProcessedParents.add(otherId);
      }
    }
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

  const spouseOf = new Map<string, string>();
  for (const r of relationships) {
    const t = normRelType(r.relationship_type);
    if (t === "spouse" || t === "married") {
      spouseOf.set(r.person_a_id, r.person_b_id);
      spouseOf.set(r.person_b_id, r.person_a_id);
    }
  }

  /** Keep couples contiguous on each generation row so unrelated nodes (e.g. siblings) never sit between spouses. */
  const packSpousePairsIntoRows = () => {
    const coupleGap = LAYOUT_MIN_NODE_GAP;
    const nodeSpan = LAYOUT_NODE_W;
    for (const [, ids] of byGen) {
      const row = ids.filter((id) => reachable.has(id) && !floaterSet.has(id));
      if (row.length <= 1) continue;

      const rowSet = new Set(row);
      const seen = new Set<string>();
      const comps: { members: string[] }[] = [];
      for (const id of row) {
        if (seen.has(id)) continue;
        const sid = spouseOf.get(id);
        if (sid && rowSet.has(sid)) {
          const [a, b] = id.localeCompare(sid) < 0 ? [id, sid] : [sid, id];
          comps.push({ members: [a, b] });
          seen.add(a);
          seen.add(b);
        } else {
          comps.push({ members: [id] });
          seen.add(id);
        }
      }

      const compWidth = (m: string[]) =>
        m.length === 1 ? nodeSpan : nodeSpan + coupleGap + nodeSpan;

      comps.sort((c1, c2) => {
        const minx = (m: string[]) =>
          Math.min(...m.map((x) => posById.get(x)!.x));
        return minx(c1.members) - minx(c2.members);
      });

      const nComp = comps.length;
      const totalW =
        comps.reduce((s, c) => s + compWidth(c.members), 0) +
        (nComp > 1 ? (nComp - 1) * coupleGap : 0);

      let sumX = 0;
      for (const id of row) sumX += posById.get(id)!.x;
      const center = sumX / row.length;

      let left = center - totalW / 2;
      for (let i = 0; i < nComp; i++) {
        const m = comps[i]!.members;
        if (m.length === 1) {
          posById.get(m[0]!)!.x = left;
        } else {
          const [L, R] =
            m[0]!.localeCompare(m[1]!) < 0
              ? [m[0]!, m[1]!]
              : [m[1]!, m[0]!];
          posById.get(L)!.x = left;
          posById.get(R)!.x = left + nodeSpan + coupleGap;
        }
        left += compWidth(m) + (i < nComp - 1 ? coupleGap : 0);
      }
    }
  };
  packSpousePairsIntoRows();

  let maxConnectedY = LAYOUT_BASE_Y;
  if (posById.size > 0) {
    maxConnectedY = Math.max(...[...posById.values()].map((p) => p.y));
  }

  const handledFloaters = new Set<string>();
  for (const id of floaterIds) {
    const spouseId = spouseOf.get(id);
    if (!spouseId) continue;
    const spousePos = posById.get(spouseId);
    if (!spousePos || floaterSet.has(spouseId)) continue;
    posById.set(id, {
      x: spousePos.x + LAYOUT_NODE_W + LAYOUT_MIN_NODE_GAP,
      y: spousePos.y,
      generation: spousePos.generation,
    });
    handledFloaters.add(id);
  }

  const remainingFloaters = floaterIds.filter((id) => !handledFloaters.has(id));
  const floaterY = maxConnectedY + LAYOUT_GEN_DY * 2;
  const floaterStep = LAYOUT_NODE_W + LAYOUT_MIN_NODE_GAP;
  const sortedFloaters = [...remainingFloaters].sort((a, b) => a.localeCompare(b));
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

function TreeCanvasZoomControls({
  unlinkedPeople,
  onSelectUnlinkedPerson,
}: {
  unlinkedPeople: TreeCanvasPerson[];
  onSelectUnlinkedPerson: (personId: string) => void;
}) {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  const [unlinkedOpen, setUnlinkedOpen] = useState(false);
  const unlinkedRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!unlinkedOpen) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const root = unlinkedRef.current;
      if (!root || root.contains(e.target as Node)) return;
      setUnlinkedOpen(false);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [unlinkedOpen]);

  return (
    <div
      className="pointer-events-auto absolute bottom-4 right-4 z-20 flex flex-col items-end gap-2"
    >
      {unlinkedPeople.length > 0 ? (
        <div ref={unlinkedRef} className="relative">
          {unlinkedOpen ? (
            <div
              className="absolute bottom-full right-0 mb-2 w-64 max-h-64 overflow-y-auto rounded-md border p-2 shadow-sm"
              style={{
                backgroundColor: colors.parchment,
                borderColor: colors.brownBorder,
                boxShadow: "0 2px 12px rgb(var(--dg-shadow-rgb) / 0.14)",
              }}
            >
              <div className="mb-1 flex items-center justify-between">
                <p
                  className="text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                >
                  Unlinked people
                </p>
                <button
                  type="button"
                  className="rounded border px-1.5 py-0 text-xs"
                  style={{
                    fontFamily: sans,
                    borderColor: colors.brownBorder,
                    color: colors.brownDark,
                    backgroundColor: colors.cream,
                  }}
                  aria-label="Close unlinked people list"
                  onClick={() => setUnlinkedOpen(false)}
                >
                  ×
                </button>
              </div>
              <ul className="space-y-1">
                {unlinkedPeople.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full rounded border px-2 py-1 text-left text-sm hover:opacity-90"
                      style={{
                        fontFamily: sans,
                        borderColor: colors.brownBorder,
                        color: colors.brownDark,
                        backgroundColor: colors.cream,
                      }}
                      onClick={() => {
                        onSelectUnlinkedPerson(p.id);
                        setUnlinkedOpen(false);
                      }}
                    >
                      {displayName(p)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <button
            type="button"
            className="relative rounded-md border px-2 py-1.5 text-sm font-semibold"
            style={{
              fontFamily: sans,
              color: colors.brownDark,
              backgroundColor: colors.parchment,
              borderColor: colors.brownBorder,
              boxShadow: "0 2px 12px rgb(var(--dg-shadow-rgb) / 0.14)",
            }}
            aria-label="Show unlinked people"
            onClick={() => setUnlinkedOpen((v) => !v)}
          >
            ⚭
            <span
              className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full border px-1 text-[11px] leading-4"
              style={{
                borderColor: colors.brownBorder,
                backgroundColor: colors.cream,
                color: colors.brownDark,
              }}
            >
              {unlinkedPeople.length}
            </span>
          </button>
        </div>
      ) : null}
      <div
        className="flex flex-col gap-1 rounded-md border p-1.5 shadow-sm"
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

function primaryDisplayYear(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const y4 = /^(\d{4})/.exec(s);
  if (y4) return y4[1]!;
  const iso = s.match(/^(\d{4})-/);
  if (iso) return iso[1]!;
  const fd = formatDateString(s);
  const m = /(\d{4})/.exec(fd);
  return m ? m[1]! : null;
}

function treeCardYearRange(p: TreeCanvasPerson): string {
  const b = primaryDisplayYear(p.birth_date);
  const d = primaryDisplayYear(p.death_date);
  if (!b && !d) return "";
  if (b && d) return `${b} – ${d}`;
  if (b) return `${b} –`;
  return `– ${d}`;
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

const TREE_PHOTO_CROP_PREVIEW_PX = 200;

/** Match profile polaroid print treatment (light / dark). */
const TREE_POLAROID_PRINT_FILTER_LIGHT =
  "contrast(1.1) sepia(0.15) brightness(1.05)" as const;
const TREE_POLAROID_PRINT_FILTER_DARK =
  "contrast(1.15) sepia(0.2) brightness(0.95)" as const;

/** Same mat color as profile polaroids in dark mode (`HEADER_POLAROID_FRAME_DARK` on person page). */
const TREE_POLAROID_FRAME_DARK = "#b0a08a" as const;
const TREE_POLAROID_DARK_DEPTH_INSET =
  "inset 0 0 9px rgba(20, 10, 6, 0.38)" as const;

/** Subtle print grain (top layer) over mat fill — not a second solid. */
const TREE_POLAROID_MAT_GRAIN = `repeating-linear-gradient(
  48deg,
  transparent,
  transparent 5px,
  rgba(58, 36, 24, 0.03) 5.5px,
  transparent 6.5px,
  transparent 8px
)`;
/** Warm cork-toned lift; no harsh black/gray. */
const TREE_POLAROID_SHADOW_LIFT_LIGHT = [
  "0 1.5px 0 rgba(110, 72, 50, 0.06)",
  "0 3px 6px rgba(70, 44, 32, 0.1)",
  "0 8px 20px rgba(55, 36, 24, 0.12)",
] as const;
const TREE_POLAROID_SHADOW_LIFT_DARK = [
  "0 1.5px 0 rgba(35, 20, 12, 0.4)",
  "0 4px 10px rgba(28, 16, 10, 0.5)",
  "0 9px 22px rgba(42, 26, 16, 0.42)",
] as const;
const TREE_POLAROID_FRAME_INSET_LIGHT = [
  "inset 0 0.5px 0 rgba(255, 252, 245, 0.65)",
  "inset 0 0 0 1px color-mix(in srgb, var(--dg-brown-dark) 10%, transparent)",
  "inset 0 1px 0 rgba(255, 255, 255, 0.2)",
  "inset 0 2px 2px color-mix(in srgb, black 4.5%, transparent)",
  "inset 0 -1px 0 color-mix(in srgb, white 22%, transparent)",
] as const;
const TREE_POLAROID_FRAME_INSET_DARK = [
  "inset 0 0.5px 0 rgba(255, 255, 255, 0.1)",
  "inset 0 0 0 1px rgba(45, 32, 20, 0.35)",
  "inset 0 1px 0 rgba(255, 255, 255, 0.06)",
  "inset 0 2px 3px rgba(0, 0, 0, 0.2)",
] as const;

function treePolaroidFrameChrome(
  generation: number,
  isDark: boolean
): CSSProperties {
  const gen = treeNodeGenerationSurfaceStyle(generation);
  if (isDark) {
    return {
      background: `${TREE_POLAROID_MAT_GRAIN}, ${TREE_POLAROID_FRAME_DARK}`,
      borderRadius: 3,
      border: "1px solid color-mix(in srgb, #1a0f0a 35%, #6b5344)",
      boxShadow: [
        ...TREE_POLAROID_SHADOW_LIFT_DARK,
        ...TREE_POLAROID_FRAME_INSET_DARK,
        TREE_POLAROID_DARK_DEPTH_INSET,
      ].join(", "),
    };
  }
  const matFill = gen.background as string;
  return {
    background: `${TREE_POLAROID_MAT_GRAIN}, ${matFill}`,
    borderRadius: 3,
    border: `1px solid color-mix(in srgb, ${colors.brownBorder} 80%, var(--dg-parchment) 20%)`,
    boxShadow: [
      ...TREE_POLAROID_SHADOW_LIFT_LIGHT,
      ...TREE_POLAROID_FRAME_INSET_LIGHT,
    ].join(", "),
  };
}

/** Roots theme: `public/leaf.svg` scaled to cover the node box (same footprint as polaroid); mask matches. */
function treeLeafInnerSurfaceStyle(isDark: boolean): CSSProperties {
  const leaf = "url(/leaf.svg)";
  return {
    boxSizing: "border-box",
    backgroundColor: isDark ? "#1a2418" : "#f0f6ec",
    backgroundImage: leaf,
    backgroundSize: "cover",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
    WebkitMaskImage: leaf,
    maskImage: leaf,
    WebkitMaskSize: "cover",
    maskSize: "cover",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
  };
}

/**
 * Polaroid aperture when there is no photo. Warm dark brown (not pure black) so
 * light initials read clearly. Initials use fixed light ink — `var(--dg-cream)` is
 * dark in `.dark` and would disappear on this fill.
 */
const POLAROID_NO_PHOTO_BG =
  "color-mix(in srgb, var(--dg-brown-mid) 38%, black)" as const;
const POLAROID_NO_PHOTO_INITIALS = "rgb(255 252 247)" as const;

/** Visual-only: tint by generation from anchor (root). Ancestors warmer; descendants lighter; anchor balanced. */
function treeNodeGenerationSurfaceStyle(generation: number): CSSProperties {
  const g = generation === -999 ? 0 : generation;
  const anc = Math.max(0, g);
  const desc = Math.max(0, -g);

  if (anc > 0) {
    const t = Math.min(anc, 4) / 4;
    const deepPct = 22 + t * 38;
    return {
      background: `color-mix(in srgb, var(--dg-parchment-deep) ${deepPct}%, var(--dg-parchment) ${
        100 - deepPct
      }%)`,
    };
  }
  if (desc > 0) {
    const t = Math.min(desc, 4) / 4;
    const creamPct = 62 + t * 32;
    return {
      background: `color-mix(in srgb, var(--dg-cream) ${creamPct}%, var(--dg-parchment) ${
        100 - creamPct
      }%)`,
    };
  }
  return {
    background: `color-mix(in srgb, var(--dg-parchment) 52%, var(--dg-cream) 48%)`,
  };
}

/** Cover-fit rendered size inside a rectangular viewport (same math as profile polaroids). */
function cropCoverRenderedSize(
  naturalW: number,
  naturalH: number,
  viewportW: number,
  viewportH: number,
  zoom: number
): { w: number; h: number } {
  const scale = Math.max(viewportW / naturalW, viewportH / naturalH) * zoom;
  return {
    w: naturalW * scale,
    h: naturalH * scale,
  };
}

function clampCropOffsetCover(
  offset: { x: number; y: number },
  renderedW: number,
  renderedH: number,
  viewportW: number,
  viewportH: number
): { x: number; y: number } {
  const spanX = renderedW - viewportW;
  const spanY = renderedH - viewportH;
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
  viewportW: number,
  viewportH: number
): { x: number; y: number } {
  const spanX = renderedW - viewportW;
  const spanY = renderedH - viewportH;
  return clampCropOffsetCover(
    {
      x: spanX > 0 ? -(cropX / 100) * spanX : 0,
      y: spanY > 0 ? -(cropY / 100) * spanY : 0,
    },
    renderedW,
    renderedH,
    viewportW,
    viewportH
  );
}

function offsetToCropPercentCover(
  offset: { x: number; y: number },
  renderedW: number,
  renderedH: number,
  viewportW: number,
  viewportH: number
): { x: number; y: number } {
  const spanX = Math.max(0, renderedW - viewportW);
  const spanY = Math.max(0, renderedH - viewportH);
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

function TreeNodeAvatarImg({
  primary,
  fallbackUrl,
  viewportW,
  viewportH,
  printFilter,
}: {
  primary: ClientPrimaryPhotoRow | undefined;
  fallbackUrl: string | null;
  viewportW: number;
  viewportH: number;
  printFilter: string | null;
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
      viewportW,
      viewportH,
      cropZoom
    );
    const offset = cropPercentToOffsetCover(
      cx,
      cy,
      rw,
      rh,
      viewportW,
      viewportH
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

  const imgStyle: CSSProperties = {
    ...(hasPixelCrop && pixelStyle ? pixelStyle : {}),
    ...(printFilter ? { filter: printFilter } : {}),
  };

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className={hasPixelCrop ? undefined : "h-full w-full object-cover"}
      style={Object.keys(imgStyle).length ? imgStyle : undefined}
    />
  );
}

type TreeCanvasProps = {
  treeId: string;
  treeName: string;
  canvasTheme: CanvasThemeId;
  persons: TreeCanvasPerson[];
  relationships: TreeCanvasRelationship[];
};

export default function TreeCanvas({
  treeId,
  treeName,
  canvasTheme,
  persons,
  relationships,
}: TreeCanvasProps) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const treeSurfaceStyle = useMemo(() => {
    const isDark = theme === "dark";
    return canvasTheme === "roots"
      ? treeCanvasRootsSurfaceStyle(isDark)
      : treeCanvasCorkboardSurfaceStyle(isDark);
  }, [canvasTheme, theme]);
  const transformRef = useRef<ReactZoomPanPinchContentRef | null>(null);
  const centeredRef = useRef(false);

  const [extraPersons, setExtraPersons] = useState<TreeCanvasPerson[]>([]);
  const [uploadPanelOpen, setUploadPanelOpen] = useState(false);

  const treePhotoFileInputRef = useRef<HTMLInputElement>(null);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoSelectedPersons, setPhotoSelectedPersons] = useState<
    TreeCanvasPerson[]
  >([]);
  const [cropX, setCropX] = useState(50);
  const [cropY, setCropY] = useState(50);
  const [cropZoom, setCropZoom] = useState(1.0);
  const [photoCropNaturalSize, setPhotoCropNaturalSize] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const [photoCropDragging, setPhotoCropDragging] = useState(false);
  const photoCropMouseDragCleanupRef = useRef<(() => void) | null>(null);
  const photoCropTouchDragCleanupRef = useRef<(() => void) | null>(null);
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

  const [collapsedAtIds, setCollapsedAtIds] = useState<Set<string>>(
    () => new Set()
  );

  const { parentsOfAll, hiddenIds, canBuryIds } = useMemo(() => {
    const allIds = new Set(mergedPersons.map((p) => p.id));
    const parentsOfAll = buildParentsOfMap(
      parentChildEdges(relationships, allIds)
    );

    const childrenOfAll = new Map<string, Set<string>>();
    for (const [child, parents] of parentsOfAll) {
      for (const parent of parents) {
        if (!childrenOfAll.has(parent)) childrenOfAll.set(parent, new Set());
        childrenOfAll.get(parent)!.add(child);
      }
    }

    const candidates = new Set<string>();
    for (const id of collapsedAtIds) {
      const pars = parentsOfAll.get(id);
      if (!pars) continue;
      for (const p of pars) {
        candidates.add(p);
        const kids = childrenOfAll.get(p);
        if (!kids) continue;
        for (const c of kids) {
          if (c !== id) candidates.add(c);
        }
      }
    }

    let removedInPass = true;
    while (removedInPass) {
      removedInPass = false;
      for (const person of [...candidates]) {
        if (!candidates.has(person)) continue;
        const kids = childrenOfAll.get(person) ?? new Set();
        for (const c of kids) {
          if (!candidates.has(c) && !collapsedAtIds.has(c)) {
            candidates.delete(person);
            removedInPass = true;
            break;
          }
        }
      }
    }

    const hiddenIds = new Set<string>();
    for (const x of candidates) {
      if (!collapsedAtIds.has(x)) hiddenIds.add(x);
    }

    const canBuryIds = new Set<string>();
    for (const p of mergedPersons) {
      const pars = parentsOfAll.get(p.id);
      if (!pars || pars.size === 0) continue;
      for (const par of pars) {
        if (!hiddenIds.has(par)) {
          canBuryIds.add(p.id);
          break;
        }
      }
    }

    return { parentsOfAll, hiddenIds, canBuryIds };
  }, [mergedPersons, relationships, collapsedAtIds]);

  const visiblePersonIds = useMemo(
    () => personIds.filter((id) => !hiddenIds.has(id)),
    [personIds, hiddenIds]
  );

  const parentsOfForRoot = useMemo(() => {
    const set = new Set(personIds);
    return buildParentsOfMap(parentChildEdges(relationships, set));
  }, [relationships, personIds]);

  const initialRootId = useMemo(
    () => pickDeepestRoot(personIds, parentsOfForRoot),
    [personIds, parentsOfForRoot]
  );

  const initialRootIdRef = useRef(initialRootId);
  initialRootIdRef.current = initialRootId;

  const layout = useMemo(() => {
    const set = new Set(visiblePersonIds);
    const layoutRootId =
      initialRootId && set.has(initialRootId)
        ? initialRootId
        : pickDeepestRoot(
            visiblePersonIds,
            buildParentsOfMap(
              parentChildEdges(relationships, set)
            )
          );
    return computeExplicitTreeLayout(
      visiblePersonIds,
      relationships,
      layoutRootId
    );
  }, [visiblePersonIds, relationships, initialRootId]);

  const personById = useMemo(() => {
    const m = new Map<string, TreeCanvasPerson>();
    for (const p of mergedPersons) m.set(p.id, p);
    return m;
  }, [mergedPersons]);

  const unlinkedPeople = useMemo(() => {
    const linkedIds = new Set<string>();
    for (const rel of relationships) {
      if (rel.person_a_id) linkedIds.add(rel.person_a_id);
      if (rel.person_b_id) linkedIds.add(rel.person_b_id);
    }
    return mergedPersons.filter((p) => !linkedIds.has(p.id));
  }, [mergedPersons, relationships]);

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
    const next: Record<string, ClientPrimaryPhotoRow> = {};

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

        const photosRaw = r.photos;
        const photosField = (
          Array.isArray(photosRaw) ? photosRaw[0] : photosRaw
        ) as Record<string, unknown> | null;
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
    setPhotoSelectedPersons([]);
    setCropX(50);
    setCropY(50);
    setCropZoom(1.0);
    setPhotoCropDragging(false);
    setPhotoCropNaturalSize(null);
    setPhotoPersonSearch("");
    setPhotoModalOpen(true);
  }, []);

  const closePhotoModal = useCallback(() => {
    if (photoUploadSaving) return;
    photoCropMouseDragCleanupRef.current?.();
    photoCropTouchDragCleanupRef.current?.();
    setPhotoPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPhotoModalOpen(false);
    setPhotoFile(null);
    setPhotoSelectedPersons([]);
    setCropX(50);
    setCropY(50);
    setCropZoom(1.0);
    setPhotoCropDragging(false);
    setPhotoCropNaturalSize(null);
    setPhotoPersonSearch("");
    setPhotoUploadError(null);
  }, [photoUploadSaving]);

  const handlePhotoCropCircleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!photoCropNaturalSize) return;
      e.preventDefault();
      photoCropMouseDragCleanupRef.current?.();
      const { w: rw, h: rh } = cropCoverRenderedSize(
        photoCropNaturalSize.w,
        photoCropNaturalSize.h,
        TREE_PHOTO_CROP_PREVIEW_PX,
        TREE_PHOTO_CROP_PREVIEW_PX,
        cropZoom
      );
      const startOffset = cropPercentToOffsetCover(
        cropX,
        cropY,
        rw,
        rh,
        TREE_PHOTO_CROP_PREVIEW_PX,
        TREE_PHOTO_CROP_PREVIEW_PX
      );
      const startX = e.clientX;
      const startY = e.clientY;
      setPhotoCropDragging(true);
      const onMove = (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const next = clampCropOffsetCover(
          { x: startOffset.x + dx, y: startOffset.y + dy },
          rw,
          rh,
          TREE_PHOTO_CROP_PREVIEW_PX,
          TREE_PHOTO_CROP_PREVIEW_PX
        );
        const nextPct = offsetToCropPercentCover(
          next,
          rw,
          rh,
          TREE_PHOTO_CROP_PREVIEW_PX,
          TREE_PHOTO_CROP_PREVIEW_PX
        );
        setCropX(nextPct.x);
        setCropY(nextPct.y);
      };
      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        photoCropMouseDragCleanupRef.current = null;
        setPhotoCropDragging(false);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
      photoCropMouseDragCleanupRef.current = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
    },
    [photoCropNaturalSize, cropZoom, cropX, cropY]
  );

  const handlePhotoCropCircleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!photoCropNaturalSize) return;
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      photoCropTouchDragCleanupRef.current?.();
      const { w: rw, h: rh } = cropCoverRenderedSize(
        photoCropNaturalSize.w,
        photoCropNaturalSize.h,
        TREE_PHOTO_CROP_PREVIEW_PX,
        TREE_PHOTO_CROP_PREVIEW_PX,
        cropZoom
      );
      const startOffset = cropPercentToOffsetCover(
        cropX,
        cropY,
        rw,
        rh,
        TREE_PHOTO_CROP_PREVIEW_PX,
        TREE_PHOTO_CROP_PREVIEW_PX
      );
      const startX = t.clientX;
      const startY = t.clientY;
      setPhotoCropDragging(true);
      const onMove = (ev: TouchEvent) => {
        const nt = ev.touches[0];
        if (!nt) return;
        const dx = nt.clientX - startX;
        const dy = nt.clientY - startY;
        const next = clampCropOffsetCover(
          { x: startOffset.x + dx, y: startOffset.y + dy },
          rw,
          rh,
          TREE_PHOTO_CROP_PREVIEW_PX,
          TREE_PHOTO_CROP_PREVIEW_PX
        );
        const nextPct = offsetToCropPercentCover(
          next,
          rw,
          rh,
          TREE_PHOTO_CROP_PREVIEW_PX,
          TREE_PHOTO_CROP_PREVIEW_PX
        );
        setCropX(nextPct.x);
        setCropY(nextPct.y);
      };
      const onEnd = () => {
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onEnd);
        window.removeEventListener("touchcancel", onEnd);
        photoCropTouchDragCleanupRef.current = null;
        setPhotoCropDragging(false);
      };
      window.addEventListener("touchmove", onMove, { passive: false });
      window.addEventListener("touchend", onEnd);
      window.addEventListener("touchcancel", onEnd);
      photoCropTouchDragCleanupRef.current = () => {
        window.removeEventListener("touchmove", onMove);
        window.removeEventListener("touchend", onEnd);
        window.removeEventListener("touchcancel", onEnd);
      };
    },
    [photoCropNaturalSize, cropZoom, cropX, cropY]
  );

  useEffect(() => {
    if (photoFile) {
      void (async () => {
        try {
          const { w, h } = await getNaturalSize(photoFile);
          setPhotoCropNaturalSize(
            w > 0 && h > 0
              ? {
                  w,
                  h,
                }
              : null
          );
        } catch {
          setPhotoCropNaturalSize(null);
        }
      })();
    } else {
      setPhotoCropNaturalSize(null);
    }
  }, [photoFile]);

  useEffect(() => {
    return () => {
      photoCropMouseDragCleanupRef.current?.();
      photoCropTouchDragCleanupRef.current?.();
    };
  }, []);

  const saveTreePhoto = useCallback(async () => {
    if (!photoFile) {
      setPhotoUploadError("Please select a photo.");
      return;
    }
    if (photoSelectedPersons.length === 0) {
      setPhotoUploadError("Please select at least one person.");
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

      const primaryPersonId = photoSelectedPersons[0]?.id ?? "";
      if (!primaryPersonId) {
        setPhotoUploadError("Please select at least one person.");
        return;
      }

      const { w: naturalWidth, h: naturalHeight } =
        await getNaturalSize(photoFile);
      const ext = extFromImageFile(photoFile);
      const path = `${user.id}/${primaryPersonId}/${crypto.randomUUID()}.${ext}`;

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

      const { data: insertedPhoto, error: insErr } = await supabase
        .from("photos")
        .insert({
          user_id: user.id,
          file_url,
          ...(naturalWidth > 0 && naturalHeight > 0
            ? { natural_width: naturalWidth, natural_height: naturalHeight }
            : {}),
        })
        .select("id")
        .maybeSingle();

      if (insErr) {
        await supabase.storage.from("photos").remove([path]);
        setPhotoUploadError(insErr.message);
        return;
      }
      if (!insertedPhoto) {
        await supabase.storage.from("photos").remove([path]);
        setPhotoUploadError("Could not save photo.");
        return;
      }
      for (const selectedPerson of photoSelectedPersons) {
        const { data: existingPrimaryTags } = await supabase
          .from("photo_tags")
          .select("id")
          .eq("user_id", user.id)
          .eq("person_id", selectedPerson.id)
          .eq("is_primary", true)
          .limit(1);
        const isPrimary = !existingPrimaryTags || existingPrimaryTags.length === 0;
        const { error: tagErr } = await supabase.from("photo_tags").insert({
          photo_id: insertedPhoto.id,
          person_id: selectedPerson.id,
          user_id: user.id,
          is_primary: isPrimary,
          crop_x: cropX,
          crop_y: cropY,
          crop_zoom: cropZoom,
        });
        if (tagErr) {
          await supabase.storage.from("photos").remove([path]);
          setPhotoUploadError(tagErr.message);
          return;
        }
      }

      setPhotoPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPhotoModalOpen(false);
      setPhotoFile(null);
      setPhotoSelectedPersons([]);
      setCropX(50);
      setCropY(50);
      setCropZoom(1.0);
      setPhotoCropDragging(false);
      setPhotoCropNaturalSize(null);
      setPhotoPersonSearch("");
      setPhotoUploadError(null);
      await refetchPrimaryPhotos();
    } finally {
      setPhotoUploadSaving(false);
    }
  }, [photoFile, photoSelectedPersons, cropX, cropY, cropZoom, refetchPrimaryPhotos]);

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
      const gender = normalizeGender(addGender);

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
        .maybeSingle();

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
  }, [initialRootId, layout.contentWidth, layout.contentHeight]);

  useEffect(() => {
    if (centeredRef.current) return;
    const rootId = initialRootId;
    if (!rootId) return;
    const t = window.setTimeout(() => {
      if (centeredRef.current) return;
      zoomToPerson(rootId, 0);
      centeredRef.current = true;
    }, 48);
    return () => window.clearTimeout(t);
  }, [initialRootId, zoomToPerson, layout.positions.length]);

  const handleTransformInit = useCallback(
    (ctx: ReactZoomPanPinchContentRef) => {
      transformRef.current = ctx;
      const rootId = initialRootIdRef.current;
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

  const pedigreeLayoutData = useMemo(() => {
    const posById = new Map(layout.positions.map((p) => [p.id, p]));

    const seenEdge = new Set<string>();
    const edges: LayoutEdge[] = [];
    for (const r of relationships) {
      const pc = directedGenerationalEdge(r);
      if (!pc) continue;
      const { parent, child } = pc;
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
    for (const [pk, children] of pairToChildren) {
      const pipe = pk.indexOf("|");
      if (pipe < 0) continue;
      const p1 = pk.slice(0, pipe);
      const p2 = pk.slice(pipe + 1);
      for (const cid of children) {
        covered.add(`${p1}->${cid}`);
        covered.add(`${p2}->${cid}`);
      }
    }

    const soloByParent = new Map<string, string[]>();
    for (const { parent, child } of edges) {
      if (covered.has(`${parent}->${child}`)) continue;
      if (!soloByParent.has(parent)) soloByParent.set(parent, []);
      soloByParent.get(parent)!.push(child);
    }

    return {
      posById,
      pairToChildren,
      covered,
      soloByParent,
    };
  }, [layout.positions, relationships]);

  /** Pedigree: threads between top/bottom pins; optional gathering pin for multi-child couples. */
  const treeThreadBundle = useMemo(() => {
    const { posById, pairToChildren, covered, soloByParent } =
      pedigreeLayoutData;

    const segments: TreeThreadSegment[] = [];
    const gatheringPins: TreeGatheringPin[] = [];
    const noBottomPinIds = new Set<string>();

    const pushSeg = (
      key: string,
      x1: number,
      y1: number,
      x2: number,
      y2: number
    ) => {
      segments.push({
        key,
        x1,
        y1,
        x2,
        y2,
        isMarriage: treeThreadSegmentIsMarriage(key),
      });
    };

    /** One straight segment between two pin anchors (angles from layout only). */
    const pushStraightPinThread = (
      key: string,
      from: { x: number; y: number },
      to: { x: number; y: number }
    ) => {
      pushSeg(key, from.x, from.y, to.x, to.y);
    };

    const spousePairKeys = new Set<string>();
    for (const r of relationships) {
      const t = normRelType(r.relationship_type);
      if (t !== "spouse" && t !== "married") continue;
      const a = r.person_a_id;
      const b = r.person_b_id;
      if (!posById.has(a) || !posById.has(b)) continue;
      spousePairKeys.add(a < b ? `${a}|${b}` : `${b}|${a}`);
    }

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

      const pinTopL = treeCardPinTopForThreadSegments(posL, canvasTheme);
      const pinTopR = treeCardPinTopForThreadSegments(posR, canvasTheme);
      const pinBotL = treeCardPinBottomCenter(posL);
      const pinBotR = treeCardPinBottomCenter(posR);

      if (spousePairKeys.has(pk)) {
        pushStraightPinThread(`thread:marriage:${pk}`, pinTopL, pinTopR);
      }

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

      if (childLayouts.length === 1) {
        const { id: cid, p: posC } = childLayouts[0]!;
        const pinChildTop = treeCardPinTopForThreadSegments(posC, canvasTheme);
        pushStraightPinThread(`thread:pc:${pk}:${cid}:L`, pinBotL, pinChildTop);
        pushStraightPinThread(`thread:pc:${pk}:${cid}:R`, pinBotR, pinChildTop);
      } else if (childLayouts.length > 1) {
        const avgChildPinY =
          childLayouts.reduce(
            (s, { p }) => s + treeCardPinTopForThreadSegments(p, canvasTheme).y,
            0
          ) / childLayouts.length;
        const yStart = (pinBotL.y + pinBotR.y) / 2;
        const gatherY = yStart + 0.6 * (avgChildPinY - yStart);
        const gatherX = (pinBotL.x + pinBotR.x) / 2;
        gatheringPins.push({
          key: `gather:${pk}`,
          x: gatherX,
          y: gatherY,
        });
        const gatherPt = { x: gatherX, y: gatherY };
        pushStraightPinThread(`thread:pg:${pk}:L`, pinBotL, gatherPt);
        pushStraightPinThread(`thread:pg:${pk}:R`, pinBotR, gatherPt);
        for (const { id: cid, p: posC } of childLayouts) {
          const pinChildTop = treeCardPinTopForThreadSegments(posC, canvasTheme);
          pushStraightPinThread(`thread:gc:${pk}:${cid}`, gatherPt, pinChildTop);
        }
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
      const pinTopL = treeCardPinTopForThreadSegments(posL, canvasTheme);
      const pinTopR = treeCardPinTopForThreadSegments(posR, canvasTheme);
      pushStraightPinThread(`thread:spouse:${spk}`, pinTopL, pinTopR);

      const soloA = (soloByParent.get(a)?.length ?? 0) > 0;
      const soloB = (soloByParent.get(b)?.length ?? 0) > 0;
      if (!soloA && !soloB) {
        noBottomPinIds.add(a);
        noBottomPinIds.add(b);
      }
    }

    for (const [parentId, soloKids] of soloByParent) {
      const posP = posById.get(parentId);
      if (!posP || soloKids.length === 0) continue;
      const pinBotP = treeCardPinBottomCenter(posP);

      for (const child of soloKids) {
        if (covered.has(`${parentId}->${child}`)) continue;
        const posC = posById.get(child);
        if (!posC) continue;
        const pinChildTop = treeCardPinTopForThreadSegments(posC, canvasTheme);
        pushStraightPinThread(
          `thread:solo:${parentId}:${child}`,
          pinBotP,
          pinChildTop
        );
      }
    }

    return { segments, gatheringPins, noBottomPinIds };
  }, [pedigreeLayoutData, relationships, canvasTheme]);

  const treeThreadSegments = treeThreadBundle.segments;
  const treeGatheringPins = treeThreadBundle.gatheringPins;
  const treeNoBottomPinIds = treeThreadBundle.noBottomPinIds;

  const buryPersonAtId = useCallback((personId: string) => {
    setCollapsedAtIds((prev) => new Set([...prev, personId]));
  }, []);

  const unburyPersonAtId = useCallback((personId: string) => {
    setCollapsedAtIds((prev) => {
      const next = new Set(prev);
      next.delete(personId);
      return next;
    });
  }, []);

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
            .dg-tree-node-card {
              transition: transform 0.2s ease-out, box-shadow 0.2s ease-out, filter 0.2s ease-out;
            }
            .dg-tree-polaroid-light.dg-tree-node-card:hover {
              transform: translateY(-2px);
              box-shadow:
                0 1.5px 0 rgba(100, 65, 45, 0.07),
                0 4px 10px rgba(68, 42, 30, 0.12),
                0 12px 28px rgba(52, 34, 24, 0.15),
                inset 0 0.5px 0 rgba(255, 252, 245, 0.7),
                inset 0 0 0 1px color-mix(in srgb, var(--dg-brown-dark) 10%, transparent),
                inset 0 1px 0 rgba(255, 255, 255, 0.22),
                inset 0 2px 2px color-mix(in srgb, black 4.5%, transparent),
                inset 0 -1px 0 color-mix(in srgb, white 24%, transparent) !important;
            }
            .dg-tree-polaroid-dark.dg-tree-node-card:hover {
              transform: translateY(-2px);
              box-shadow:
                0 1.5px 0 rgba(32, 18, 10, 0.45),
                0 5px 12px rgba(28, 16, 10, 0.52),
                0 11px 28px rgba(40, 24, 16, 0.48),
                inset 0 0.5px 0 rgba(255, 255, 255, 0.12),
                inset 0 0 0 1px rgba(45, 32, 20, 0.42),
                inset 0 1px 0 rgba(255, 255, 255, 0.08),
                inset 0 2px 3px rgba(0, 0, 0, 0.24),
                inset 0 0 9px rgba(18, 8, 5, 0.4) !important;
            }
            .dg-tree-leaf-light.dg-tree-node-card:hover {
              filter:
                drop-shadow(0 7px 20px rgba(42, 26, 16, 0.4))
                drop-shadow(0 2px 8px rgba(42, 26, 16, 0.28)) !important;
            }
            .dg-tree-leaf-dark.dg-tree-node-card:hover {
              filter: drop-shadow(0 6px 18px rgba(0, 0, 0, 0.58)) !important;
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
          setCropX(50);
          setCropY(50);
          setCropZoom(1.0);
        }}
      />

      <div className="flex h-svh min-h-0 flex-col overflow-hidden">
        <nav
          className="shrink-0 border-b px-4 py-3 sm:px-6"
          style={{
            backgroundColor: "var(--dg-parchment-deep)",
            borderColor: "var(--dg-brown-border)",
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
          style={treeSurfaceStyle}
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
                }}
              >
                <div
                  className="relative"
                  style={{
                    width: layout.contentWidth,
                    height: layout.contentHeight,
                  }}
                >
                <svg
                  className={
                    "absolute left-0 top-0 " +
                    (canvasTheme === "roots"
                      ? "z-[1]"
                      : "pointer-events-none z-[2]")
                  }
                  width={layout.contentWidth}
                  height={layout.contentHeight}
                  aria-hidden
                >
                  <defs>
                    <radialGradient
                      id="dg-tree-brad-cap-dome"
                      cx="40%"
                      cy="36%"
                      r="70%"
                      fx="38%"
                      fy="30%"
                      gradientUnits="objectBoundingBox"
                    >
                      <stop offset="0%" stopColor="#fff6e4" />
                      <stop offset="16%" stopColor="#f2d18a" />
                      <stop offset="42%" stopColor="#d4a04a" />
                      <stop offset="72%" stopColor="#7a4a18" />
                      <stop offset="100%" stopColor="#281208" />
                    </radialGradient>
                    <filter
                      id="dg-tree-brad-cap-shadow"
                      x="-65%"
                      y="-65%"
                      width="230%"
                      height="230%"
                    >
                      <feDropShadow
                        dx="0.1"
                        dy="0.5"
                        stdDeviation="0.55"
                        floodColor="#120a04"
                        floodOpacity="0.5"
                      />
                    </filter>
                    <filter
                      id="dg-tree-thumb-head-shadow"
                      x="-55%"
                      y="-55%"
                      width="210%"
                      height="210%"
                    >
                      <feDropShadow
                        dx="0.2"
                        dy="0.85"
                        stdDeviation="0.9"
                        floodColor="#140505"
                        floodOpacity="0.55"
                      />
                    </filter>
                    <symbol
                      id="dg-tree-copper-brad"
                      viewBox={`0 0 ${TREE_BRAD_SYMBOL_W} ${TREE_BRAD_SYMBOL_H}`}
                    >
                      <g filter="url(#dg-tree-brad-cap-shadow)">
                        <ellipse
                          cx={TREE_BRAD_CX}
                          cy={TREE_BRAD_CY}
                          rx={5.08}
                          ry={5.02}
                          fill="url(#dg-tree-brad-cap-dome)"
                        />
                        <ellipse
                          cx={TREE_BRAD_CX - 1.55}
                          cy={TREE_BRAD_CY - 1.65}
                          rx={2.25}
                          ry={1.85}
                          fill="#fff9ee"
                          opacity={0.58}
                        />
                        <ellipse
                          cx={TREE_BRAD_CX + 1.85}
                          cy={TREE_BRAD_CY + 1.75}
                          rx={1.65}
                          ry={1.25}
                          fill="#1a0d04"
                          opacity={0.2}
                        />
                      </g>
                    </symbol>
                    {Array.from({ length: TREE_TOP_PIN_COLOR_CYCLE }, (_, genMod) => {
                      const [c0, c14, c38, c68, c100] =
                        treeTopPinDomeStopColors(genMod);
                      const gid = `dg-tree-thumb-cap-gen-${genMod}`;
                      const sid = `dg-tree-thumbtack-g${genMod}`;
                      return (
                        <Fragment key={sid}>
                          <radialGradient
                            id={gid}
                            cx="38%"
                            cy="34%"
                            r="71%"
                            fx="36%"
                            fy="28%"
                            gradientUnits="objectBoundingBox"
                          >
                            <stop offset="0%" stopColor={c0} />
                            <stop offset="14%" stopColor={c14} />
                            <stop offset="38%" stopColor={c38} />
                            <stop offset="68%" stopColor={c68} />
                            <stop offset="100%" stopColor={c100} />
                          </radialGradient>
                          <symbol
                            id={sid}
                            viewBox={`0 0 ${TREE_PIN_SYMBOL_W} ${TREE_PIN_SYMBOL_H}`}
                          >
                            <rect
                              x={TREE_PIN_HEAD_CX - TREE_PIN_STEM_W / 2}
                              y={TREE_PIN_HEAD_CY + TREE_PIN_HEAD_R}
                              width={TREE_PIN_STEM_W}
                              height={TREE_PIN_STEM_LEN}
                              rx={0.5}
                              fill={TREE_PIN_STEM_FILL}
                            />
                            <g filter="url(#dg-tree-thumb-head-shadow)">
                              <circle
                                cx={TREE_PIN_HEAD_CX}
                                cy={TREE_PIN_HEAD_CY}
                                r={TREE_PIN_HEAD_R}
                                fill={`url(#${gid})`}
                              />
                              <ellipse
                                cx={TREE_PIN_HEAD_CX - 2.6}
                                cy={TREE_PIN_HEAD_CY - 2.5}
                                rx={3.1}
                                ry={2.45}
                                fill="#ffffff"
                                opacity={0.48}
                              />
                              <ellipse
                                cx={TREE_PIN_HEAD_CX + 1.2}
                                cy={TREE_PIN_HEAD_CY + 2.2}
                                rx={1.85}
                                ry={1.35}
                                fill="#1a0c08"
                                opacity={0.22}
                              />
                            </g>
                          </symbol>
                        </Fragment>
                      );
                    })}
                    <symbol
                      id="dg-tree-thumbtack-buried"
                      viewBox={`0 0 ${TREE_PIN_SYMBOL_W} ${TREE_PIN_SYMBOL_H}`}
                    >
                      <circle
                        cx={TREE_PIN_HEAD_CX}
                        cy={TREE_PIN_HEAD_CY}
                        r={TREE_PIN_HEAD_R}
                        fill="#000000"
                      />
                      <rect
                        x={TREE_PIN_HEAD_CX - TREE_PIN_STEM_W / 2}
                        y={TREE_PIN_HEAD_CY + TREE_PIN_HEAD_R}
                        width={TREE_PIN_STEM_W}
                        height={TREE_PIN_STEM_LEN}
                        rx={0.5}
                        fill="#000000"
                      />
                    </symbol>
                    {canvasTheme === "roots" ? (
                      <filter
                        id="dg-tree-roots-branch-displace"
                        filterUnits="userSpaceOnUse"
                        x={0}
                        y={0}
                        width={layout.contentWidth}
                        height={layout.contentHeight}
                        colorInterpolationFilters="sRGB"
                      >
                        <feTurbulence
                          type="fractalNoise"
                          baseFrequency="0.014"
                          numOctaves="2"
                          stitchTiles="stitch"
                          seed="428"
                          result="branchNoise"
                        />
                        <feGaussianBlur
                          in="branchNoise"
                          stdDeviation="0.85"
                          result="branchNoiseSmooth"
                        />
                        <feDisplacementMap
                          in="SourceGraphic"
                          in2="branchNoiseSmooth"
                          scale="6"
                          xChannelSelector="R"
                          yChannelSelector="G"
                        />
                      </filter>
                    ) : null}
                    <filter
                      id="dg-tree-gather-junction-shadow"
                      x="-80%"
                      y="-80%"
                      width="260%"
                      height="260%"
                    >
                      <feDropShadow
                        dx="0"
                        dy="1.15"
                        stdDeviation="1.25"
                        floodColor="#1a0806"
                        floodOpacity="0.5"
                      />
                    </filter>
                  </defs>
                  {canvasTheme === "roots" ? (
                    <>
                      <g
                        filter="url(#dg-tree-roots-branch-displace)"
                        style={{ pointerEvents: "none" }}
                      >
                        {treeThreadSegments.map((s) => (
                          <TreeThreadLine
                            key={s.key}
                            x1={s.x1}
                            y1={s.y1}
                            x2={s.x2}
                            y2={s.y2}
                            isMarriage={s.isMarriage}
                            rootsBranchVisual
                          />
                        ))}
                      </g>
                      {treeGatheringPins.map((gp) => (
                        <circle
                          key={gp.key}
                          cx={gp.x}
                          cy={gp.y}
                          r={TREE_GATHER_JUNCTION_R}
                          fill={TREE_ROOTS_BRANCH_BROWN}
                          filter="url(#dg-tree-gather-junction-shadow)"
                          style={{ pointerEvents: "none" }}
                        />
                      ))}
                      {layout.positions.map((pos) => {
                        const p = personById.get(pos.id);
                        if (!p) return null;
                        const topStem = treeCardPinTopCenterForStemVisual(
                          pos,
                          canvasTheme
                        );
                        const isBuried = collapsedAtIds.has(pos.id);
                        const genMod = treeTopPinGenerationMod(pos.generation);
                        const nameLabel = displayName(p);
                        const buryHere =
                          !isBuried && canBuryIds.has(pos.id);
                        const restoreHere = isBuried;
                        const pinInteractive = buryHere || restoreHere;
                        const pinAriaLabel = restoreHere
                          ? `Restore ${nameLabel}`
                          : buryHere
                            ? `Bury ${nameLabel}`
                            : null;
                        const runPinAction = restoreHere
                          ? () => unburyPersonAtId(pos.id)
                          : () => buryPersonAtId(pos.id);
                        return (
                          <g
                            key={`tree-card-stem:${pos.id}`}
                            transform={treePinTopUseTransform(
                              topStem.x,
                              topStem.y
                            )}
                          >
                            <TreePinActionWrap
                              interactive={pinInteractive}
                              ariaLabel={pinAriaLabel}
                              onAction={runPinAction}
                            >
                              <TreeRootsTopPinGraphic
                                genMod={genMod}
                                isBuried={isBuried}
                                pinInteractive={pinInteractive}
                              />
                            </TreePinActionWrap>
                          </g>
                        );
                      })}
                    </>
                  ) : (
                    treeThreadSegments.map((s) => (
                      <TreeThreadLine
                        key={s.key}
                        x1={s.x1}
                        y1={s.y1}
                        x2={s.x2}
                        y2={s.y2}
                        isMarriage={s.isMarriage}
                        rootsBranchVisual={false}
                      />
                    ))
                  )}
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
                  const yearLine = treeCardYearRange(p);
                  const isDarkPolaroid = theme === "dark";
                  const printFilter = isDarkPolaroid
                    ? TREE_POLAROID_PRINT_FILTER_DARK
                    : TREE_POLAROID_PRINT_FILTER_LIGHT;

                  const cardTiltDeg = treeCardTiltDegreesFromPersonId(pos.id);
                  const cardNudgeY =
                    treeCardVerticalNudgePxFromPersonId(pos.id);
                  const isRootsLeaf = canvasTheme === "roots";

                  const cardPositionStyle: CSSProperties = {
                    left: pos.x,
                    top: pos.y + cardNudgeY,
                    width: LAYOUT_NODE_W,
                    height: LAYOUT_NODE_H,
                    boxSizing: "border-box",
                    transform: `rotate(${cardTiltDeg}deg)`,
                    transformOrigin: "center center",
                  };

                  const treeCardPhotoW = isRootsLeaf
                    ? TREE_ROOTS_LEAF_IMG_W
                    : TREE_POLAROID_IMG_W;
                  const treeCardPhotoH = isRootsLeaf
                    ? TREE_ROOTS_LEAF_IMG_H
                    : TREE_POLAROID_IMG_H;
                  /** Roots profile uses a circular print; square viewport + circle clip matches that crop. */
                  const treeRootsPhotoDiameter = isRootsLeaf
                    ? Math.min(treeCardPhotoW, treeCardPhotoH)
                    : 0;

                  const cardFace = (
                    <Link
                      href={`/dashboard/${treeId}/person/${pos.id}`}
                      className={
                        "absolute left-0 right-0 top-0 z-0 flex flex-col no-underline" +
                        (isRootsLeaf ? " items-center" : "")
                      }
                      style={{
                        color: colors.brownDark,
                        bottom: TREE_POLAROID_SET_ROOT_H,
                        paddingLeft: TREE_POLAROID_EDGE,
                        paddingRight: TREE_POLAROID_EDGE,
                        paddingTop:
                          TREE_POLAROID_EDGE +
                          (isRootsLeaf ? TREE_LEAF_ROOTS_CONTENT_SHIFT_Y : 0),
                      }}
                    >
                      <div
                        className="relative shrink-0 overflow-hidden"
                        style={{
                          width: isRootsLeaf ? treeRootsPhotoDiameter : treeCardPhotoW,
                          height: isRootsLeaf ? treeRootsPhotoDiameter : treeCardPhotoH,
                          backgroundColor: hasAvatarSrc
                            ? "var(--dg-avatar-bg)"
                            : POLAROID_NO_PHOTO_BG,
                          borderRadius: isRootsLeaf ? "50%" : 1,
                          ...(isRootsLeaf
                            ? {
                                clipPath: "circle(50% at 50% 50%)",
                                isolation: "isolate",
                              }
                            : {}),
                        }}
                      >
                        {hasAvatarSrc ? (
                          <TreeNodeAvatarImg
                            primary={primaryRow}
                            fallbackUrl={fallback}
                            viewportW={
                              isRootsLeaf ? treeRootsPhotoDiameter : treeCardPhotoW
                            }
                            viewportH={
                              isRootsLeaf ? treeRootsPhotoDiameter : treeCardPhotoH
                            }
                            printFilter={printFilter}
                          />
                        ) : (
                          <div
                            className="flex h-full w-full items-center justify-center text-sm font-bold"
                            style={{
                              fontFamily: serif,
                              color: POLAROID_NO_PHOTO_INITIALS,
                            }}
                          >
                            {initials(p)}
                          </div>
                        )}
                      </div>
                      <div
                        className={
                          "relative flex flex-col items-center justify-start gap-1.5 px-0.5 pb-0.5 pt-0.5 text-center" +
                          (isRootsLeaf ? "" : " min-h-0 flex-1")
                        }
                        style={{
                          marginTop: TREE_POLAROID_CAPTION_GAP,
                          ...(!isRootsLeaf
                            ? { minHeight: TREE_POLAROID_CAPTION_MIN_H }
                            : {}),
                        }}
                      >
                        {isRootsLeaf ? (
                          <div
                            style={{
                              display: "inline-flex",
                              flexDirection: "column",
                              alignItems: "center",
                              gap: 3,
                              maxWidth: "100%",
                              padding: "2px 7px",
                              borderRadius: 5,
                              backgroundColor: "rgba(255, 253, 248, 0.3)",
                              boxShadow:
                                "0 0 0 1px rgba(62, 42, 28, 0.05), 0 1px 2px rgba(42, 26, 14, 0.05)",
                            }}
                          >
                            <p
                              className="line-clamp-2 max-w-full text-center text-[11px] font-bold"
                              style={{
                                fontFamily: serif,
                                lineHeight: 1.12,
                                color: TREE_ROOTS_CAPTION_INK,
                              }}
                              title={displayName(p)}
                            >
                              {displayName(p)}
                            </p>
                            {yearLine ? (
                              <p
                                className="max-w-full shrink-0 truncate text-center text-[9px] font-semibold leading-tight"
                                style={{
                                  fontFamily: sans,
                                  marginTop: 0,
                                  color: TREE_ROOTS_CAPTION_INK,
                                }}
                                title={yearLine}
                              >
                                {yearLine}
                              </p>
                            ) : null}
                          </div>
                        ) : (
                          <>
                            <p
                              className="line-clamp-2 w-full text-[11px] font-bold"
                              style={{
                                fontFamily: serif,
                                lineHeight: 1.12,
                                color: isDarkPolaroid
                                  ? "color-mix(in srgb, var(--dg-photo-scrim) 88%, black)"
                                  : `color-mix(in srgb, var(--dg-brown-dark) 90%, var(--dg-brown-outline) 10%)`,
                              }}
                              title={displayName(p)}
                            >
                              {displayName(p)}
                            </p>
                            {yearLine ? (
                              <p
                                className="w-full shrink-0 truncate text-[9px] font-semibold leading-tight"
                                style={{
                                  fontFamily: sans,
                                  marginTop: 0,
                                  color: isDarkPolaroid
                                    ? "color-mix(in srgb, var(--dg-photo-scrim) 72%, var(--dg-brown-border) 28%)"
                                    : `color-mix(in srgb, var(--dg-brown-dark) 78%, var(--dg-brown-mid) 22%)`,
                                }}
                                title={yearLine}
                              >
                                {yearLine}
                              </p>
                            ) : null}
                          </>
                        )}
                      </div>
                    </Link>
                  );

                  if (isRootsLeaf) {
                    return (
                      <div
                        key={pos.id}
                        id={`tree-node-${pos.id}`}
                        className={
                          (isDarkPolaroid
                            ? "dg-tree-leaf-dark"
                            : "dg-tree-leaf-light") +
                          " dg-tree-node-card absolute z-[2]"
                        }
                        style={{
                          ...cardPositionStyle,
                          overflow: "visible",
                          filter: isDarkPolaroid
                            ? "drop-shadow(0 4px 10px rgba(0,0,0,0.48))"
                            : "drop-shadow(0 3px 9px rgba(42, 28, 18, 0.26))",
                        }}
                      >
                        <div
                          className="absolute left-1/2 top-1/2 z-0"
                          style={{
                            width: TREE_LEAF_SURFACE_W,
                            height: TREE_LEAF_SURFACE_H,
                            transform: "translate(-50%, -50%)",
                            ...treeLeafInnerSurfaceStyle(isDarkPolaroid),
                          }}
                        >
                          {cardFace}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={pos.id}
                      id={`tree-node-${pos.id}`}
                      className={
                        (isDarkPolaroid
                          ? "dg-tree-polaroid-dark"
                          : "dg-tree-polaroid-light") +
                        " dg-tree-node-card absolute z-[1] overflow-hidden"
                      }
                      style={{
                        ...cardPositionStyle,
                        ...treePolaroidFrameChrome(
                          pos.generation,
                          isDarkPolaroid
                        ),
                      }}
                    >
                      {cardFace}
                    </div>
                  );
                })}
                {canvasTheme !== "roots" ? (
                  <svg
                    className="absolute left-0 top-0 z-[3]"
                    width={layout.contentWidth}
                    height={layout.contentHeight}
                    style={{ pointerEvents: "none" }}
                  >
                    {treeGatheringPins.map((gp) => (
                      <circle
                        key={gp.key}
                        cx={gp.x}
                        cy={gp.y}
                        r={TREE_GATHER_JUNCTION_R}
                        fill={TREE_THREAD_LINEAGE}
                        filter="url(#dg-tree-gather-junction-shadow)"
                      />
                    ))}
                    {layout.positions.map((pos) => {
                      const p = personById.get(pos.id);
                      if (!p) return null;
                      const top = treeCardPinTopCenterForThreads(
                        pos,
                        canvasTheme
                      );
                      const bot = treeCardPinBottomCenter(pos);
                      const hideBottom = treeNoBottomPinIds.has(pos.id);
                      const isBuried = collapsedAtIds.has(pos.id);
                      const genMod = treeTopPinGenerationMod(pos.generation);
                      const pinHref = isBuried
                        ? "#dg-tree-thumbtack-buried"
                        : `#dg-tree-thumbtack-g${genMod}`;
                      const nameLabel = displayName(p);
                      const buryHere =
                        !isBuried && canBuryIds.has(pos.id);
                      const restoreHere = isBuried;
                      const pinInteractive = buryHere || restoreHere;
                      const pinAriaLabel = restoreHere
                        ? `Restore ${nameLabel}`
                        : buryHere
                          ? `Bury ${nameLabel}`
                          : null;
                      const runPinAction = restoreHere
                        ? () => unburyPersonAtId(pos.id)
                        : () => buryPersonAtId(pos.id);
                      return (
                        <g key={`tree-card-pins:${pos.id}`}>
                          <g transform={treePinTopUseTransform(top.x, top.y)}>
                            <TreePinActionWrap
                              interactive={pinInteractive}
                              ariaLabel={pinAriaLabel}
                              onAction={runPinAction}
                            >
                              <use
                                href={pinHref}
                                x={0}
                                y={0}
                                width={TREE_PIN_SYMBOL_W}
                                height={TREE_PIN_SYMBOL_H}
                              />
                            </TreePinActionWrap>
                          </g>
                          {hideBottom ? null : (
                            <g transform={treeBradUseTransform(bot.x, bot.y)}>
                              <use
                                href="#dg-tree-copper-brad"
                                x={0}
                                y={0}
                                width={TREE_BRAD_SYMBOL_W}
                                height={TREE_BRAD_SYMBOL_H}
                              />
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                ) : null}
                </div>
              </TransformComponent>
              <TreeCanvasZoomControls
                unlinkedPeople={unlinkedPeople}
                onSelectUnlinkedPerson={(personId) => {
                  zoomToPerson(personId);
                }}
              />
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
                className="relative overflow-hidden rounded-full bg-[var(--dg-avatar-bg)] ring-2"
                style={{
                  width: TREE_PHOTO_CROP_PREVIEW_PX,
                  height: TREE_PHOTO_CROP_PREVIEW_PX,
                  borderColor: colors.brownBorder,
                  cursor: photoCropDragging ? "grabbing" : "grab",
                  touchAction: "none",
                }}
                onMouseDown={handlePhotoCropCircleMouseDown}
                onTouchStart={handlePhotoCropCircleTouchStart}
              >
                {photoPreviewUrl ? (
                  (() => {
                    const snw = photoCropNaturalSize?.w ?? 0;
                    const snh = photoCropNaturalSize?.h ?? 0;
                    const hasNatural = snw > 0 && snh > 0;
                    const rendered = hasNatural
                      ? cropCoverRenderedSize(
                          snw,
                          snh,
                          TREE_PHOTO_CROP_PREVIEW_PX,
                          TREE_PHOTO_CROP_PREVIEW_PX,
                          cropZoom
                        )
                      : {
                          w: TREE_PHOTO_CROP_PREVIEW_PX * cropZoom,
                          h: TREE_PHOTO_CROP_PREVIEW_PX * cropZoom,
                        };
                    const { w: rw, h: rh } = rendered;
                    const off = hasNatural
                      ? cropPercentToOffsetCover(
                          cropX,
                          cropY,
                          rw,
                          rh,
                          TREE_PHOTO_CROP_PREVIEW_PX,
                          TREE_PHOTO_CROP_PREVIEW_PX
                        )
                      : { x: 0, y: 0 };
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={photoPreviewUrl}
                        alt=""
                        draggable={false}
                        className="absolute select-none"
                        style={{
                          left: off.x,
                          top: off.y,
                          width: rw,
                          height: rh,
                          maxWidth: "none",
                        }}
                      />
                    );
                  })()
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
            {photoPreviewUrl ? (
              <div className="mb-4">
                <label
                  className="mb-2 block text-xs font-bold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: colors.brownMuted }}
                  htmlFor="tree-photo-crop-zoom"
                >
                  Zoom
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-sm"
                    style={{
                      fontFamily: sans,
                      borderColor: colors.brownBorder,
                      color: colors.brownDark,
                      backgroundColor: colors.cream,
                    }}
                    onClick={() => setCropZoom((z) => Math.max(1, +(z - 0.1).toFixed(2)))}
                  >
                    -
                  </button>
                  <input
                    id="tree-photo-crop-zoom"
                    type="range"
                    min={1}
                    max={3}
                    step={0.01}
                    value={cropZoom}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isFinite(next)) return;
                      setCropZoom(Math.min(3, Math.max(1, next)));
                    }}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-sm"
                    style={{
                      fontFamily: sans,
                      borderColor: colors.brownBorder,
                      color: colors.brownDark,
                      backgroundColor: colors.cream,
                    }}
                    onClick={() => setCropZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}
                  >
                    +
                  </button>
                  <span
                    className="w-12 text-right text-sm"
                    style={{ fontFamily: sans, color: colors.brownMuted }}
                  >
                    {Number(cropZoom.toFixed(2))}x
                  </span>
                </div>
              </div>
            ) : null}

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
              {photoSelectedPersons.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-2">
                  {photoSelectedPersons.map((selectedPerson) => (
                    <div
                      key={selectedPerson.id}
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm"
                      style={{
                        fontFamily: sans,
                        borderColor: colors.brownBorder,
                        backgroundColor: colors.cream,
                        color: colors.brownDark,
                      }}
                    >
                      {displayName(selectedPerson)}
                      <button
                        type="button"
                        className="ml-0.5 rounded px-1 leading-none"
                        style={{ color: colors.brownMid }}
                        aria-label={`Remove ${displayName(selectedPerson)}`}
                        onClick={() =>
                          setPhotoSelectedPersons((prev) =>
                            prev.filter((x) => x.id !== selectedPerson.id)
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
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
                    <li
                      key={p.id}
                      role="option"
                      aria-selected={photoSelectedPersons.some((x) => x.id === p.id)}
                    >
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:opacity-90"
                        style={{
                          fontFamily: sans,
                          color: colors.brownDark,
                          backgroundColor:
                            photoSelectedPersons.some((x) => x.id === p.id)
                              ? "var(--dg-parchment-deep)"
                              : "transparent",
                        }}
                        onClick={() => {
                          setPhotoSelectedPersons((prev) =>
                            prev.some((x) => x.id === p.id)
                              ? prev.filter((x) => x.id !== p.id)
                              : [...prev, p]
                          );
                          setPhotoPersonSearch("");
                        }}
                      >
                        {photoSelectedPersons.some((x) => x.id === p.id)
                          ? `✓ ${displayName(p)}`
                          : displayName(p)}
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
