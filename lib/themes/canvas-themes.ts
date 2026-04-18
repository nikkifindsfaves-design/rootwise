/**
 * Single source of truth for canvas theme copy and visual identifiers.
 * Wire pages/components to these exports in follow-up work — do not duplicate strings.
 */

export const CANVAS_THEME_IDS = ["string", "dead_gossip", "roots"] as const;

export type CanvasThemeId = (typeof CANVAS_THEME_IDS)[number];

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
  string: {
    id: "string",
    familyPanelTitle: "The Usual Suspects",
    timelineHeader: "The Case File",
    newEventButton: "+ New Intel",
    bornLabel: "REPORTED ALIVE",
    diedLabel: "CASE CLOSED",
    photoFrameStyle: "polaroid",
  },
  dead_gossip: {
    id: "dead_gossip",
    familyPanelTitle: "The Inner Circle",
    timelineHeader: "The Tea",
    newEventButton: "+ Spill",
    bornLabel: "ENTERED THE CHAT",
    diedLabel: "CHECKED OUT",
    photoFrameStyle: "scrapbook",
  },
  roots: {
    id: "roots",
    familyPanelTitle: "The Branch",
    timelineHeader: "The Chronicle",
    newEventButton: "+ Record It",
    bornLabel: "FIRST LIGHT",
    diedLabel: "LAST LIGHT",
    photoFrameStyle: "oval",
  },
};

export function isCanvasThemeId(value: string | null | undefined): value is CanvasThemeId {
  return (
    value === "string" ||
    value === "dead_gossip" ||
    value === "roots"
  );
}
