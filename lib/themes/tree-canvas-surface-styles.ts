import type { CSSProperties } from "react";
import {
  CANVAS_THEME_ID,
  type CanvasThemeId,
} from "@/lib/themes/canvas-themes";

/**
 * Bulletin corkboard: repeating cork photo under stacked translucent gradients.
 * Kept in sync with `TreeCanvas` so listing cards match the live tree surface.
 */
export function treeCanvasCorkboardSurfaceStyle(isDark: boolean): CSSProperties {
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
  const corkTile = "url(/small%20cork.jpg)";

  return {
    backgroundColor: isDark ? "#4f3829" : "#b9855c",
    backgroundImage: [...overlayLayers, corkTile].join(", "),
    boxShadow: isDark
      ? "inset 0 0 120px rgba(0,0,0,0.4)"
      : "inset 0 0 140px rgba(42, 26, 14, 0.11)",
  };
}

export function treeCanvasRootsSurfaceStyle(isDark: boolean): CSSProperties {
  const bg = "url(/Wood%20Heir.png)";
  const wash = isDark
    ? "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.44) 100%)"
    : "linear-gradient(180deg, rgba(255,252,248,0.1) 0%, rgba(42,26,14,0.12) 100%)";
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

export function treeCanvasDeadGossipSurfaceStyle(isDark: boolean): CSSProperties {
  const bg = "url(/Goss.jpg)";
  const wash = isDark
    ? "linear-gradient(180deg, rgba(0,0,0,0.44) 0%, rgba(0,0,0,0.56) 100%)"
    : "linear-gradient(180deg, rgba(255,252,248,0.14) 0%, rgba(42,26,14,0.18) 100%)";
  return {
    backgroundColor: isDark ? "#201711" : "#c7b7a5",
    backgroundImage: `${wash}, ${bg}`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    boxShadow: isDark
      ? "inset 0 0 120px rgba(0,0,0,0.45)"
      : "inset 0 0 140px rgba(42, 26, 14, 0.1)",
  };
}

export function treeCanvasSurfaceStyleForTheme(
  themeId: CanvasThemeId,
  isDark: boolean
): CSSProperties {
  if (themeId === CANVAS_THEME_ID.ROOTS) {
    return treeCanvasRootsSurfaceStyle(isDark);
  }
  if (themeId === CANVAS_THEME_ID.DEAD_GOSSIP) {
    return treeCanvasDeadGossipSurfaceStyle(isDark);
  }
  return treeCanvasCorkboardSurfaceStyle(isDark);
}
