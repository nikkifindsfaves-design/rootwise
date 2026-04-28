/** Maps Stripe/metadata interval strings onto DB billing_interval (monthly | annual only). */
export function normalizeStripeSubscriptionBillingInterval(
  raw: unknown
): "monthly" | "annual" {
  return raw === "annual" ? "annual" : "monthly";
}
