import { describe, expect, it } from "vitest";
import {
  buildReviewLifeSpineForCard,
  isCensusLikeEventType,
} from "@/lib/story/life-spine";
import { emptySharedEventDetails } from "@/lib/review/shared-event-merge";

describe("isCensusLikeEventType", () => {
  it("detects census labels", () => {
    expect(isCensusLikeEventType("census")).toBe(true);
    expect(isCensusLikeEventType("Census")).toBe(true);
    expect(isCensusLikeEventType("birth")).toBe(false);
  });
});

describe("buildReviewLifeSpineForCard", () => {
  it("includes census rows and omits only the excluded event key", () => {
    const shared = emptySharedEventDetails();
    const anchorKey = "a1";
    const childKey = "c1";
    const cards = [
      {
        key: anchorKey,
        form: { first_name: "Ruth", middle_name: "", last_name: "May" },
        relationships: [
          { relatedPeerIndex: 1, relationshipType: "child" as const },
        ],
        events: [
          {
            key: "ev-keep",
            eventType: "birth",
            eventDate: "1900-01-01",
            event_place_display: "Town, OH",
            event_place_id: null,
            event_place_fields: null,
            eventNotes: "first child",
            useSharedDetails: false,
          },
          {
            key: "ev-drop",
            eventType: "marriage",
            eventDate: "1920-06-01",
            event_place_display: "",
            event_place_id: null,
            event_place_fields: null,
            eventNotes: "",
            useSharedDetails: false,
          },
        ],
      },
      {
        key: childKey,
        form: { first_name: "Ann", middle_name: "", last_name: "May" },
        relationships: [],
        events: [
          {
            key: "ev-census",
            eventType: "census",
            eventDate: "1910",
            event_place_display: "Somewhere",
            event_place_id: null,
            event_place_fields: null,
            eventNotes: "skip",
            useSharedDetails: false,
          },
          {
            key: "ev-child-birth",
            eventType: "birth",
            eventDate: "1925-03-03",
            event_place_display: "",
            event_place_id: null,
            event_place_fields: null,
            eventNotes: "",
            useSharedDetails: false,
          },
        ],
      },
    ];

    const spine = buildReviewLifeSpineForCard({
      anchorCardKey: anchorKey,
      cards,
      shared,
      useSharedNotesLayer: false,
      excludeEventKeys: new Set(["ev-drop"]),
    });

    const typesDates = spine.map((r) => `${r.event_type}:${r.event_date}`);
    expect(typesDates).toContain("birth:1900-01-01");
    expect(typesDates).not.toContain("marriage:1920-06-01");
    expect(typesDates).toContain("birth:1925-03-03");
    expect(typesDates).toContain("census:1910");
    expect(spine.filter((r) => r.subject_name.includes("Ruth")).length).toBe(1);
    expect(spine.some((r) => r.subject_name.includes("Ann"))).toBe(true);
  });
});
