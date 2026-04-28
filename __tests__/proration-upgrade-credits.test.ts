import { describe, expect, it } from "vitest";
import { calculateProratedUpgradeCredits } from "@/lib/billing/proration-upgrade-credits";

describe("calculateProratedUpgradeCredits", () => {
  it("flat monthly allotment delta (Curious→Devoted)", () => {
    const credits = calculateProratedUpgradeCredits({
      oldTier: "basic",
      newTier: "pro",
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });
    expect(credits).toBe(350);
  });

  it("flat monthly allotment delta (Devoted→Obsessed)", () => {
    const credits = calculateProratedUpgradeCredits({
      oldTier: "pro",
      newTier: "max",
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });
    expect(credits).toBe(500);
  });

  it("flat monthly allotment delta (Obsessed→Possessed)", () => {
    const credits = calculateProratedUpgradeCredits({
      oldTier: "max",
      newTier: "possessed",
      currentPeriodStart: null,
      currentPeriodEnd: null,
    });
    expect(credits).toBe(600);
  });

  it("returns 0 when not an upgrade", () => {
    expect(
      calculateProratedUpgradeCredits({
        oldTier: "pro",
        newTier: "basic",
        currentPeriodStart: null,
        currentPeriodEnd: null,
      })
    ).toBe(0);
  });
});
