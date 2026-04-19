import type { CSSProperties } from "react";

/** Cover-fit rendered size inside a rectangular viewport; zoom scales both axes. */
export function cropCoverRenderedSize(
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

export function clampCropOffsetCover(
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

export function cropPercentToOffsetCover(
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

export type ProfileHeaderPhotoCrop = {
  x: number;
  y: number;
  zoom: number;
};

/**
 * Absolute cover-fit `<img>` styles for profile header polaroid / scrapbook inner /
 * oval (same aperture as polaroid). Keeps one implementation for all three themes.
 */
export function getProfileHeaderCroppedPhotoImgStyle(input: {
  naturalW: number;
  naturalH: number;
  crop: ProfileHeaderPhotoCrop;
  apertureW: number;
  apertureH: number;
  printFilter: string;
}): CSSProperties {
  const { naturalW: nw, naturalH: nh, crop, apertureW, apertureH, printFilter } =
    input;
  if (nw <= 0 || nh <= 0) {
    return {
      position: "absolute",
      left: 0,
      top: 0,
      width: "100%",
      height: "100%",
      opacity: 0,
    };
  }
  const { w: rw, h: rh } = cropCoverRenderedSize(
    nw,
    nh,
    apertureW,
    apertureH,
    crop.zoom
  );
  const off = cropPercentToOffsetCover(
    crop.x,
    crop.y,
    rw,
    rh,
    apertureW,
    apertureH
  );
  return {
    position: "absolute",
    left: off.x,
    top: off.y,
    width: rw,
    height: rh,
    opacity: 1,
    pointerEvents: "none",
    maxWidth: "none",
    filter: printFilter,
  };
}
