/** Subscription id on Stripe Invoice objects (string or expanded). */
export function stripeSubscriptionIdFromInvoice(invoice: {
  subscription?: string | { id?: string } | null;
}): string | null {
  const s = invoice.subscription;
  if (typeof s === "string" && s.trim() !== "") return s.trim();
  if (
    s &&
    typeof s === "object" &&
    typeof s.id === "string" &&
    s.id.trim() !== ""
  ) {
    return s.id.trim();
  }
  return null;
}

/** Addon grant targets proration/update invoices — not renewals or the initial subscription invoice. */
export function invoiceEligibleForPendingUpgradeAddonGrant(
  billingReason: string | null | undefined
): boolean {
  const br = billingReason ?? "";
  return br !== "subscription_cycle" && br !== "subscription_create";
}
