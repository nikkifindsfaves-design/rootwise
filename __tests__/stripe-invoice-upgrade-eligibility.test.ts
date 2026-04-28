import { describe, expect, it } from "vitest";
import {
  invoiceEligibleForPendingUpgradeAddonGrant,
  stripeSubscriptionIdFromInvoice,
} from "@/lib/billing/stripe-invoice-upgrade-eligibility";

describe("stripeSubscriptionIdFromInvoice", () => {
  it("reads string ids", () => {
    expect(stripeSubscriptionIdFromInvoice({ subscription: "sub_abc" })).toBe(
      "sub_abc"
    );
  });

  it("reads expanded object ids", () => {
    expect(
      stripeSubscriptionIdFromInvoice({ subscription: { id: "sub_xyz" } })
    ).toBe("sub_xyz");
  });
});

describe("invoiceEligibleForPendingUpgradeAddonGrant", () => {
  it("allows subscription_update and rejects renewal/create", () => {
    expect(invoiceEligibleForPendingUpgradeAddonGrant("subscription_update")).toBe(
      true
    );
    expect(invoiceEligibleForPendingUpgradeAddonGrant(undefined)).toBe(true);
    expect(invoiceEligibleForPendingUpgradeAddonGrant("subscription_cycle")).toBe(
      false
    );
    expect(invoiceEligibleForPendingUpgradeAddonGrant("subscription_create")).toBe(
      false
    );
  });
});
