import { describe, expect, it } from "vitest";
import {
  resolveCheckoutSessionCheckoutMode,
  subscriptionIdFromCheckoutSession,
} from "@/lib/billing/checkout-session-webhook";

describe("subscriptionIdFromCheckoutSession", () => {
  it("reads string ids", () => {
    expect(subscriptionIdFromCheckoutSession({ subscription: "sub_abc" })).toBe(
      "sub_abc"
    );
  });

  it("reads expanded subscription objects", () => {
    expect(
      subscriptionIdFromCheckoutSession({
        subscription: { id: "sub_xyz", object: "subscription" },
      })
    ).toBe("sub_xyz");
  });

  it("returns null when missing", () => {
    expect(subscriptionIdFromCheckoutSession({})).toBe(null);
  });
});

describe("resolveCheckoutSessionCheckoutMode", () => {
  it("respects trimmed metadata", () => {
    expect(
      resolveCheckoutSessionCheckoutMode(
        { checkout_mode: " subscription " },
        undefined,
        null
      )
    ).toBe("subscription");
  });

  it("falls back to session.mode subscription", () => {
    expect(
      resolveCheckoutSessionCheckoutMode({}, "subscription", null)
    ).toBe("subscription");
  });

  it("falls back to subscription id when metadata/mode missing", () => {
    expect(
      resolveCheckoutSessionCheckoutMode({}, undefined, "sub_123")
    ).toBe("subscription");
  });

  it("uses payment mode for addon checkouts without subscription id", () => {
    expect(resolveCheckoutSessionCheckoutMode({}, "payment", null)).toBe(
      "addon"
    );
  });
});
