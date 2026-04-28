/**
 * Stripe Checkout redirect URLs shown after payment. Kept pure for tests and to avoid accidental drift between success/cancel.
 */
export function normalizeCheckoutReturnDestination(
  returnTo: unknown
): "dashboard" | "onboarding" | "account" {
  if (returnTo === "onboarding") return "onboarding";
  if (returnTo === "account") return "account";
  return "dashboard";
}

export function buildStripeCheckoutBillingUrls(
  origin: string,
  returnTo: "dashboard" | "onboarding" | "account"
): { success_url: string; cancel_url: string } {
  const base =
    returnTo === "account"
      ? `${origin}/dashboard/account`
      : `${origin}/${returnTo}`;
  return {
    success_url: `${base}?billing=success`,
    cancel_url: `${base}?billing=cancel`,
  };
}

/** Query flags consumed by the upgrade invoice banner after subscription-update upgrades (no Checkout). */
export const UPGRADE_INVOICE_RETURN_PARAM_KEYS = [
  "upgrade_invoice_id",
  "upgrade_invoice_paid_cents",
  "upgrade_invoice_total_cents",
  "upgrade_invoice_currency",
  "upgrade_invoice_hosted",
] as const;

export type BillingUpgradeInvoiceReturnPayload = {
  invoiceId: string;
  hostedInvoiceUrl: string | null;
  paidCents: number;
  totalCents: number;
  currency: string;
};

/** Append Stripe invoice snapshot to post-upgrade redirect (stay in-app + optional hosted invoice link). */
export function appendBillingUpgradeReturnParams(
  successUrl: string,
  opts: BillingUpgradeInvoiceReturnPayload
): string {
  const u = new URL(successUrl);
  u.searchParams.set("billing", "success");
  u.searchParams.set("upgrade_invoice_id", opts.invoiceId);
  u.searchParams.set(
    "upgrade_invoice_paid_cents",
    String(Math.max(0, Math.round(opts.paidCents)))
  );
  u.searchParams.set(
    "upgrade_invoice_total_cents",
    String(Math.max(0, Math.round(opts.totalCents)))
  );
  u.searchParams.set(
    "upgrade_invoice_currency",
    (opts.currency || "usd").toLowerCase()
  );
  if (
    typeof opts.hostedInvoiceUrl === "string" &&
    opts.hostedInvoiceUrl.trim() !== ""
  ) {
    u.searchParams.set(
      "upgrade_invoice_hosted",
      opts.hostedInvoiceUrl.trim()
    );
  }
  return u.toString();
}
