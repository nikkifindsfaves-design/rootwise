import { describe, expect, it } from "vitest";
import { normalizeStripeSubscriptionBillingInterval } from "@/lib/billing/subscription-interval";

describe("normalizeStripeSubscriptionBillingInterval", () => {
  it("maps annual explicitly", () => {
    expect(normalizeStripeSubscriptionBillingInterval("annual")).toBe("annual");
  });

  it("defaults to monthly for empty, quarterly, junk, monthly, and monthly-like values", () => {
    expect(normalizeStripeSubscriptionBillingInterval(undefined)).toBe("monthly");
    expect(normalizeStripeSubscriptionBillingInterval(null)).toBe("monthly");
    expect(normalizeStripeSubscriptionBillingInterval("")).toBe("monthly");
    expect(normalizeStripeSubscriptionBillingInterval("monthly")).toBe("monthly");
    expect(normalizeStripeSubscriptionBillingInterval("quarterly")).toBe(
      "monthly"
    );
  });
});
