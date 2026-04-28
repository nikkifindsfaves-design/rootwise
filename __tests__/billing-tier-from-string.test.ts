import { describe, expect, it } from "vitest";
import { getTierFromString } from "@/lib/billing/config";

describe("getTierFromString", () => {
  it("maps display names and API slugs to membership tiers", () => {
    expect(getTierFromString("curious")).toBe("basic");
    expect(getTierFromString("devoted")).toBe("pro");
    expect(getTierFromString("obsessed")).toBe("max");
    expect(getTierFromString("possessed")).toBe("possessed");
    expect(getTierFromString("pro")).toBe("pro");
    expect(getTierFromString("max")).toBe("max");
  });

  it("trims whitespace and lowercases", () => {
    expect(getTierFromString("  PRO  ")).toBe("pro");
  });

  it("defaults to basic when unknown or empty", () => {
    expect(getTierFromString(undefined)).toBe("basic");
    expect(getTierFromString("")).toBe("basic");
    expect(getTierFromString("unknown-tier")).toBe("basic");
  });
});
