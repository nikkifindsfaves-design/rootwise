"use client";

import type { CSSProperties, ReactNode } from "react";

/** Matches `public/Circle Frame 2.svg` viewBox. */
const VB_W = 315;
const VB_H = 225;

/**
 * Photo window bounds from `public/Circle Frame 2.svg` clipPath `693c287f6c`:
 * M 118 68.445312 L 212.4375 68.445312 L 212.4375 187.695312 L 118 187.695312 Z
 * Portrait is clipped to the circle inscribed in this rect.
 */
const APERTURE_LEFT = 118;
const APERTURE_TOP = 68.445312;
const APERTURE_W = 212.4375 - APERTURE_LEFT;
const APERTURE_H = 187.695312 - APERTURE_TOP;
const CIRCLE_CX = APERTURE_LEFT + APERTURE_W / 2;
const CIRCLE_CY = APERTURE_TOP + APERTURE_H / 2;
const CIRCLE_R = Math.min(APERTURE_W, APERTURE_H) / 2;

const PHOTO_W = 128;
const PHOTO_H = 160;

/**
 * Roots / oval theme — how the **standard polaroid print** (children) sits inside the
 * circular opening behind the SVG frame. Presentation only; does not change stored crop
 * (crop stays in `getProfileHeaderCroppedPhotoImgStyle` on the person page).
 */
const ROOTS_OVAL_PHOTO_FILL = 0.75;

/**
 * Moves the **whole circular hole** (mat + photo) down relative to the SVG frame (px).
 * Use this to align the aperture with the artwork; keeps crop geometry unchanged.
 */
const ROOTS_OVAL_HOLE_VERTICAL_OFFSET_PX = 7;

/**
 * Extra vertical nudge on the **print wrapper** inside the hole (px). Prefer
 * `ROOTS_OVAL_HOLE_VERTICAL_OFFSET_PX` for “move photo in frame”; keep 0 unless you need
 * a second, small adjustment after the hole is aligned.
 */
const ROOTS_OVAL_PRINT_VERTICAL_BIAS_PX = 0;

/**
 * Scale the SVG so the **inscribed photo hole** matches the polaroid image height
 * (same apparent window as Dead Gossip’s 128×160 print). `2*CIRCLE_R` is hole diameter in vb.
 */
const HOLE_DIAMETER_TARGET_PX = 200;
const ROOTS_FRAME_TARGET_DISPLAY_H =
  (HOLE_DIAMETER_TARGET_PX * VB_H) / (2 * CIRCLE_R);
const ROOTS_FRAME_TARGET_DISPLAY_W =
  (ROOTS_FRAME_TARGET_DISPLAY_H * VB_W) / VB_H;

const FRAME_SRC = "/Circle%20Frame%202.svg";

export const ROOTS_FRAME_DISPLAY_H = ROOTS_FRAME_TARGET_DISPLAY_H;
export const ROOTS_FRAME_DISPLAY_W = ROOTS_FRAME_TARGET_DISPLAY_W;

function rootsFrameDropShadow(isDark: boolean): string {
  return isDark
    ? "drop-shadow(0 10px 18px rgb(0 0 0 / 0.42)) drop-shadow(0 4px 8px rgb(0 0 0 / 0.3))"
    : "drop-shadow(0 10px 16px rgb(61 41 20 / 0.18)) drop-shadow(0 4px 6px rgb(0 0 0 / 0.08))";
}

export type RootsFramePortraitProps = {
  isDark: boolean;
  children: ReactNode;
};

export function RootsFramePortrait({ isDark, children }: RootsFramePortraitProps) {
  const displayW = ROOTS_FRAME_DISPLAY_W;
  const displayH = ROOTS_FRAME_DISPLAY_H;

  const cdPx = (2 * CIRCLE_R * displayW) / VB_W;
  const leftPx = ((CIRCLE_CX - CIRCLE_R) / VB_W) * displayW;
  const topPx =
    ((CIRCLE_CY - CIRCLE_R) / VB_H) * displayH +
    ROOTS_OVAL_HOLE_VERTICAL_OFFSET_PX;

  const photoCirclePx = cdPx * ROOTS_OVAL_PHOTO_FILL;
  const photoFillScale = photoCirclePx / PHOTO_W;

  /**
   * No `filter` on this root — a parent `filter` flattens descendants and breaks
   * `overflow` / `clip-path` clipping in Chrome/WebKit (rectangular photo “punches through”).
   */
  const rootStyle: CSSProperties = {
    position: "relative",
    width: displayW,
    height: displayH,
    flexShrink: 0,
  };

  /**
   * Circular mat behind the photo. Light: warm paper. Dark: `--dg-parchment` /
   * `--dg-bg-main` mix so the ring reads against `--dg-bg-main` (`app/globals.css` `.dark`).
   * Depth uses `holeStyle` inset only (symmetric top/bottom) — avoids a hard “lined” rim.
   */
  const holeMatStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    display: "block",
    boxSizing: "border-box",
    borderRadius: "50%",
    overflow: "hidden",
    zIndex: 0,
    backgroundColor: isDark
      ? "color-mix(in srgb, var(--dg-parchment) 42%, var(--dg-bg-main) 58%)"
      : "rgb(245 238 226)",
    pointerEvents: "none",
  };

  const holeStyle: CSSProperties = {
    position: "absolute",
    left: leftPx,
    top: topPx,
    width: cdPx,
    height: cdPx,
    zIndex: 0,
    isolation: "isolate",
    contain: "paint",
    borderRadius: "50%",
    overflow: "hidden",
    clipPath: "circle(50% at 50% 50%)",
    transform: "translateZ(0)",
    boxShadow: isDark
      ? "inset 0 11px 28px rgb(0 0 0 / 0.3), inset 0 -11px 28px rgb(0 0 0 / 0.3)"
      : "inset 0 0 10px rgba(0,0,0,0.1)",
  };

  const centerStageStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    zIndex: 1,
  };

  const photoCircleStyle: CSSProperties = {
    width: photoCirclePx,
    height: photoCirclePx,
    borderRadius: "50%",
    overflow: "hidden",
    flexShrink: 0,
    position: "relative",
  };

  const photoInnerStyle: CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: `translate(-50%, calc(-50% + ${ROOTS_OVAL_PRINT_VERTICAL_BIAS_PX}px)) scale(${photoFillScale})`,
    transformOrigin: "center center",
    width: PHOTO_W,
    height: PHOTO_H,
  };

  const frameLayerStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    zIndex: 2,
    pointerEvents: "none",
  };

  const frameImgStyle: CSSProperties = {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "contain",
    filter: rootsFrameDropShadow(isDark),
  };

  return (
    <div data-dg-roots-frame-root="" style={rootStyle}>
      <div data-dg-roots-hole="" style={holeStyle}>
        <div data-dg-roots-hole-mat="" style={holeMatStyle} aria-hidden />
        <div data-dg-roots-center-stage="" style={centerStageStyle}>
          <div data-dg-roots-photo-circle="" style={photoCircleStyle}>
            <div data-dg-roots-photo-inner="" style={photoInnerStyle}>
              {children}
            </div>
          </div>
        </div>
      </div>
      <div data-dg-roots-frame-layer="" style={frameLayerStyle}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={FRAME_SRC} alt="" draggable={false} style={frameImgStyle} />
      </div>
    </div>
  );
}
