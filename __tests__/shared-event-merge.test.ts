/// <reference types="vitest/globals" />

import {
  emptySharedEventDetails,
  eventSignatureForSharedCluster,
  extractionSkippedFromAi,
  migrateExtractedEventsToShared,
  resolveEventDatePlaceNotes,
  type MergeEventRow,
  type MergePersonCard,
} from "@/lib/review/shared-event-merge";

function row(partial: Partial<MergeEventRow> & Pick<MergeEventRow, "key">): MergeEventRow {
  return {
    eventType: "residence",
    eventDate: "",
    event_place_display: "",
    event_place_id: null,
    event_place_fields: null,
    eventNotes: "",
    eventStoryFull: "",
    landData: null,
    ...partial,
  };
}

describe("extractionSkippedFromAi", () => {
  it("returns true when extraction_skipped is true", () => {
    expect(extractionSkippedFromAi({ extraction_skipped: true })).toBe(true);
  });

  it("returns false when flag is absent", () => {
    expect(extractionSkippedFromAi({ people: [] })).toBe(false);
  });

  it("returns false for non-objects", () => {
    expect(extractionSkippedFromAi(null)).toBe(false);
  });
});

describe("resolveEventDatePlaceNotes", () => {
  const shared = {
    eventDate: "1880",
    event_place_display: "Ohio, USA",
    event_place_id: null,
    event_place_fields: null,
    eventNotes: "shared note",
  };

  it("uses shared date/place and shared notes when linked and useSharedNotesLayer", () => {
    const e = row({
      key: "a",
      useSharedDetails: true,
      eventNotes: "row note",
    });
    const r = resolveEventDatePlaceNotes(e, shared, true);
    expect(r.eventDate).toBe("1880");
    expect(r.event_place_display).toBe("Ohio, USA");
    expect(r.eventNotes).toBe("shared note");
  });

  it("uses shared date/place but row notes when linked and not useSharedNotesLayer (AI)", () => {
    const e = row({
      key: "a",
      useSharedDetails: true,
      eventNotes: "Head of household",
    });
    const r = resolveEventDatePlaceNotes(e, shared, false);
    expect(r.eventDate).toBe("1880");
    expect(r.eventNotes).toBe("Head of household");
  });

  it("uses row fields when not linked", () => {
    const e = row({
      key: "b",
      eventDate: "1900",
      event_place_display: "Kentucky",
      eventNotes: "local",
    });
    const r = resolveEventDatePlaceNotes(e, shared, true);
    expect(r.eventDate).toBe("1900");
    expect(r.event_place_display).toBe("Kentucky");
    expect(r.eventNotes).toBe("local");
  });
});

describe("eventSignatureForSharedCluster", () => {
  it("ignores eventNotes so different roles share one cluster", () => {
    const a = row({
      key: "1",
      eventDate: "1880",
      event_place_display: "X",
      eventNotes: "Head",
    });
    const b = row({
      key: "2",
      eventDate: "1880",
      event_place_display: "X",
      eventNotes: "Wife",
    });
    expect(eventSignatureForSharedCluster(a)).toBe(
      eventSignatureForSharedCluster(b)
    );
  });
});

describe("migrateExtractedEventsToShared", () => {
  it("leaves shared.eventNotes empty and preserves per-row notes when linking", () => {
    const cards: MergePersonCard[] = [
      {
        events: [
          row({
            key: "e1",
            eventType: "residence",
            eventDate: "1880",
            event_place_display: "Town",
            eventNotes: "Head of household",
          }),
          row({
            key: "e2",
            eventType: "residence",
            eventDate: "1880",
            event_place_display: "Town",
            eventNotes: "Wife",
          }),
        ],
      },
    ];

    const { cards: next, shared } = migrateExtractedEventsToShared(cards);
    expect(shared.eventDate).toBe("1880");
    expect(shared.event_place_display).toBe("Town");
    expect(shared.eventNotes).toBe("");

    const [a, b] = next[0]!.events;
    expect(a.useSharedDetails).toBe(true);
    expect(b.useSharedDetails).toBe(true);
    expect(a.eventNotes).toBe("Head of household");
    expect(b.eventNotes).toBe("Wife");

    expect(resolveEventDatePlaceNotes(a, shared, false).eventNotes).toBe(
      "Head of household"
    );
    expect(resolveEventDatePlaceNotes(b, shared, false).eventNotes).toBe(
      "Wife"
    );
  });

  it("does not cluster land events", () => {
    const cards: MergePersonCard[] = [
      {
        events: [
          row({
            key: "l1",
            eventType: "land",
            eventDate: "1900",
            event_place_display: "Plot A",
            eventNotes: "note",
          }),
        ],
      },
    ];
    const { cards: next, shared } = migrateExtractedEventsToShared(cards);
    expect(shared).toEqual(emptySharedEventDetails());
    expect(next[0]!.events[0]!.useSharedDetails).toBeUndefined();
  });

  it("picks the largest date/place group when notes differ", () => {
    const cards: MergePersonCard[] = [
      {
        events: [
          row({
            key: "a",
            eventType: "residence",
            eventDate: "1880",
            event_place_display: "Big",
            eventNotes: "n1",
          }),
          row({
            key: "b",
            eventType: "residence",
            eventDate: "1880",
            event_place_display: "Big",
            eventNotes: "n2",
          }),
          row({
            key: "c",
            eventType: "birth",
            eventDate: "1850",
            event_place_display: "Other",
            eventNotes: "solo",
          }),
        ],
      },
    ];
    const { shared } = migrateExtractedEventsToShared(cards);
    expect(shared.eventDate).toBe("1880");
    expect(shared.event_place_display).toBe("Big");
  });
});
