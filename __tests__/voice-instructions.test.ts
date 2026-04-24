/// <reference types="vitest/globals" />

import { getVoiceInstructions } from "@/lib/vibes/voice-instructions";

const VALID_VIBES = [
  "classic",
  "gossip_girl",
  "hearthside",
  "southern_gothic",
  "gen_z",
] as const;

describe("getVoiceInstructions", () => {
  describe("valid vibe keys", () => {
    it.each(VALID_VIBES)(
      "returns a non-empty string for the %s vibe",
      (vibe) => {
        const result = getVoiceInstructions(vibe);
        expect(result).toBeTruthy();
        expect(result.length).toBeGreaterThan(0);
      },
    );

    it("returns a different string for each of the five valid vibes", () => {
      const outputs = VALID_VIBES.map((v) => getVoiceInstructions(v));
      const unique = new Set(outputs);
      expect(unique.size).toBe(VALID_VIBES.length);
    });

    it.each(VALID_VIBES)("does not include a strict character limit for %s", (vibe) => {
      expect(getVoiceInstructions(vibe)).not.toContain("STRICT LIMIT:");
    });
  });

  describe("unrecognized vibe keys", () => {
    it("does not throw and returns a string for an unknown vibe key", () => {
      expect(() => getVoiceInstructions("not_a_real_vibe")).not.toThrow();
      const result = getVoiceInstructions("not_a_real_vibe");
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
