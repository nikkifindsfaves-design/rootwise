/// <reference types="vitest/globals" />

import {
  getIsBirthRecord,
  getIsBirthRecordChild,
  getIsDeathRecord,
  getIsMarriageRecord,
} from "@/lib/utils/review-visibility";

describe("getIsDeathRecord", () => {
  it('returns true when recordType is exactly "Death Record"', () => {
    expect(getIsDeathRecord("Death Record")).toBe(true);
  });

  it('returns false when recordType is "Birth Record"', () => {
    expect(getIsDeathRecord("Birth Record")).toBe(false);
  });

  it('returns false when recordType is "Marriage Record"', () => {
    expect(getIsDeathRecord("Marriage Record")).toBe(false);
  });

  it('returns false when recordType is "Census Record"', () => {
    expect(getIsDeathRecord("Census Record")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(getIsDeathRecord("")).toBe(false);
  });
});

describe("getIsMarriageRecord", () => {
  it('returns true when recordType is exactly "Marriage Record"', () => {
    expect(getIsMarriageRecord("Marriage Record")).toBe(true);
  });

  it('returns false when recordType is "Death Record"', () => {
    expect(getIsMarriageRecord("Death Record")).toBe(false);
  });

  it('returns false when recordType is "Birth Record"', () => {
    expect(getIsMarriageRecord("Birth Record")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(getIsMarriageRecord("")).toBe(false);
  });
});

describe("getIsBirthRecord", () => {
  it('returns true when recordType is exactly "Birth Record"', () => {
    expect(getIsBirthRecord("Birth Record")).toBe(true);
  });

  it('returns false when recordType is "Death Record"', () => {
    expect(getIsBirthRecord("Death Record")).toBe(false);
  });

  it('returns false when recordType is "Marriage Record"', () => {
    expect(getIsBirthRecord("Marriage Record")).toBe(false);
  });

  it("returns false for an empty string", () => {
    expect(getIsBirthRecord("")).toBe(false);
  });
});

describe("getIsBirthRecordChild", () => {
  it(
    'returns true when recordType is not Death or Marriage and events include one with eventType "birth"',
    () => {
      expect(
        getIsBirthRecordChild([{ eventType: "birth" }], "Census Record"),
      ).toBe(true);
    },
  );

  it(
    'returns false when recordType is "Death Record" even if events include a birth event',
    () => {
      expect(
        getIsBirthRecordChild(
          [{ eventType: "birth" }, { eventType: "burial" }],
          "Death Record",
        ),
      ).toBe(false);
    },
  );

  it(
    'returns false when recordType is "Marriage Record" even if events include a birth event',
    () => {
      expect(
        getIsBirthRecordChild([{ eventType: "birth" }], "Marriage Record"),
      ).toBe(false);
    },
  );

  it(
    'returns false when events array has no birth event and recordType is "Birth Record"',
    () => {
      expect(
        getIsBirthRecordChild(
          [{ eventType: "marriage" }, { eventType: "death" }],
          "Birth Record",
        ),
      ).toBe(false);
    },
  );

  it("returns false when the events array is empty", () => {
    expect(getIsBirthRecordChild([], "Birth Record")).toBe(false);
  });

  it(
    'returns true with multiple events where one is birth and recordType is "Birth Record"',
    () => {
      expect(
        getIsBirthRecordChild(
          [{ eventType: "marriage" }, { eventType: "birth" }],
          "Birth Record",
        ),
      ).toBe(true);
    },
  );
});
