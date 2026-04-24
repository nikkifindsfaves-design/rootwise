/**
 * Single source of truth for canvas theme copy and visual identifiers.
 * Wire pages/components to these exports in follow-up work — do not duplicate strings.
 */

export const CANVAS_THEME_IDS = [
  "evidence_board",
  "dead_gossip",
  "heirloom",
] as const;

export type CanvasThemeId = (typeof CANVAS_THEME_IDS)[number];
export const DEFAULT_CANVAS_THEME_ID: CanvasThemeId = CANVAS_THEME_IDS[0];
export const CANVAS_THEME_ID = {
  STRING: CANVAS_THEME_IDS[0],
  DEAD_GOSSIP: CANVAS_THEME_IDS[1],
  ROOTS: CANVAS_THEME_IDS[2],
} as const;

export const CANVAS_THEME_OPTIONS = [
  {
    id: CANVAS_THEME_ID.STRING,
    name: "Evidence Board",
    description: "Every connection mapped. Every photo pinned. The case is never closed.",
    example: "Straightforward layout—names and lines stay easy to scan.",
  },
  {
    id: CANVAS_THEME_ID.DEAD_GOSSIP,
    name: "Dead Gossip",
    description: "Taped up, marked up, impossible to put down.",
    example: "Ink, margins, and quiet drama fit for a family chronicle.",
  },
  {
    id: CANVAS_THEME_ID.ROOTS,
    name: "Heirloom",
    description: "Preserved on parchment, like something worth keeping.",
    example: "Earth tones that feel like soil, bark, and old photographs.",
  },
] as const;

export type PhotoFrameStyle = "polaroid" | "scrapbook" | "oval";

export type CanvasThemeProperties = {
  /** Label above the immediate family section on the profile page. */
  familyPanelTitle: string;
  /** Label above the events / timeline section on the profile page. */
  timelineHeader: string;
  /** Label on the control that adds a new timeline event. */
  newEventButton: string;
  /** Label before the birth date on the profile header. */
  bornLabel: string;
  /** Label before the death date on the profile header. */
  diedLabel: string;
  /** How the profile photo should be framed in the UI. */
  photoFrameStyle: PhotoFrameStyle;
};

export type CanvasThemeDefinition = CanvasThemeProperties & {
  id: CanvasThemeId;
};

export const CANVAS_THEMES: Record<CanvasThemeId, CanvasThemeDefinition> = {
  [CANVAS_THEME_ID.STRING]: {
    id: CANVAS_THEME_ID.STRING,
    familyPanelTitle: "The Usual Suspects",
    timelineHeader: "The Case File",
    newEventButton: "+ New Intel",
    bornLabel: "REPORTED ALIVE",
    diedLabel: "CASE CLOSED",
    photoFrameStyle: "polaroid",
  },
  [CANVAS_THEME_ID.DEAD_GOSSIP]: {
    id: CANVAS_THEME_ID.DEAD_GOSSIP,
    familyPanelTitle: "The Inner Circle",
    timelineHeader: "The Tea",
    newEventButton: "+ Spill",
    bornLabel: "ENTERED THE CHAT",
    diedLabel: "CHECKED OUT",
    photoFrameStyle: "scrapbook",
  },
  [CANVAS_THEME_ID.ROOTS]: {
    id: CANVAS_THEME_ID.ROOTS,
    familyPanelTitle: "The Branch",
    timelineHeader: "The Chronicle",
    newEventButton: "+ Record It",
    bornLabel: "FIRST LIGHT",
    diedLabel: "LAST LIGHT",
    photoFrameStyle: "oval",
  },
};

export function isCanvasThemeId(value: string | null | undefined): value is CanvasThemeId {
  return !!value && (CANVAS_THEME_IDS as readonly string[]).includes(value);
}
