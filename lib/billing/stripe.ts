import Stripe from "stripe";
import {
  ADDON_PACKS,
  BILLING_INTERVAL_ORDER,
  MEMBERSHIP_TIER_ORDER,
  type BillingInterval,
  type MembershipTier,
} from "@/lib/billing/config";

let stripeClient: Stripe | null = null;
const PRICE_ID_TO_PLAN = new Map<string, { tier: MembershipTier; interval: BillingInterval }>();

for (const tier of MEMBERSHIP_TIER_ORDER) {
  for (const interval of BILLING_INTERVAL_ORDER) {
    const envKey = `STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}`;
    const configuredPriceId = process.env[envKey];
    if (configuredPriceId) {
      PRICE_ID_TO_PLAN.set(configuredPriceId, { tier, interval });
    }
  }
}

export function getStripeServerClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured.");
  }
  if (stripeClient) return stripeClient;
  stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

export function getStripePriceIdForTier(
  tier: MembershipTier,
  interval: BillingInterval
): string {
  const envKey = `STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}`;
  const value = process.env[envKey];
  if (!value) {
    throw new Error(`${envKey} is not configured.`);
  }
  return value;
}

export function getStripePriceIdForAddon(pack: keyof typeof ADDON_PACKS): string {
  const envKey = `STRIPE_ADDON_${pack.toUpperCase()}`;
  const value = process.env[envKey];
  if (!value) {
    throw new Error(`${envKey} is not configured.`);
  }
  return value;
}

export function getTierIntervalFromPriceId(priceId: string): {
  tier: MembershipTier;
  interval: BillingInterval;
} | null {
  return PRICE_ID_TO_PLAN.get(priceId) ?? null;
}

/** All configured `STRIPE_PRICE_*` ids (membership only), for Customer Portal subscription updates. */
export function getConfiguredMembershipStripePriceIds(): string[] {
  const ids: string[] = [];
  for (const tier of MEMBERSHIP_TIER_ORDER) {
    for (const interval of BILLING_INTERVAL_ORDER) {
      const envKey = `STRIPE_PRICE_${tier.toUpperCase()}_${interval.toUpperCase()}`;
      const id = process.env[envKey]?.trim();
      if (id) ids.push(id);
    }
  }
  return ids;
}
