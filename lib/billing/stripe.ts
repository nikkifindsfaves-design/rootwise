import Stripe from "stripe";
import { ADDON_PACKS, type BillingInterval, type MembershipTier } from "@/lib/billing/config";

let stripeClient: Stripe | null = null;

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
