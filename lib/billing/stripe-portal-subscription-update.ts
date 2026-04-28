import type Stripe from "stripe";
import { getConfiguredMembershipStripePriceIds } from "@/lib/billing/stripe";

export type BillingPortalMembershipProducts = Array<{
  product: string;
  prices: string[];
}>;

let cachedMembershipPortalProducts: BillingPortalMembershipProducts | null =
  null;

/** Avoid hitting `configurations.update` on every upgrade after a successful sync. */
let lastSuccessfulPortalEnsureAt = 0;
const PORTAL_ENSURE_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Groups configured membership Price IDs by Stripe Product for Customer Portal
 * `subscription_update.products` (required for confirmed upgrades).
 */
export async function resolveBillingPortalMembershipProducts(
  stripe: Stripe
): Promise<BillingPortalMembershipProducts> {
  const priceIds = getConfiguredMembershipStripePriceIds();
  if (priceIds.length === 0) {
    throw new Error(
      "No STRIPE_PRICE_* membership prices are configured in the environment."
    );
  }
  const byProduct = new Map<string, Set<string>>();
  for (const priceId of priceIds) {
    const price = await stripe.prices.retrieve(priceId);
    let productId: string | null = null;
    if (typeof price.product === "string") {
      productId = price.product;
    } else if (
      price.product &&
      typeof price.product === "object" &&
      "deleted" in price.product &&
      price.product.deleted
    ) {
      continue;
    } else if (
      price.product &&
      typeof price.product === "object" &&
      "id" in price.product &&
      typeof price.product.id === "string"
    ) {
      productId = price.product.id;
    }
    if (!productId) continue;
    if (!byProduct.has(productId)) byProduct.set(productId, new Set());
    byProduct.get(productId)!.add(priceId);
  }
  const rows = [...byProduct.entries()].map(([product, prices]) => ({
    product,
    prices: [...prices],
  }));
  if (rows.length === 0) {
    throw new Error(
      "Could not resolve Stripe product IDs from configured membership prices."
    );
  }
  if (rows.length > 10) {
    throw new Error(
      "Stripe Customer Portal allows at most 10 products for subscription updates; reduce membership products or merge prices."
    );
  }
  return rows;
}

export async function getOrResolveBillingPortalMembershipProducts(
  stripe: Stripe
): Promise<BillingPortalMembershipProducts> {
  if (cachedMembershipPortalProducts) return cachedMembershipPortalProducts;
  cachedMembershipPortalProducts =
    await resolveBillingPortalMembershipProducts(stripe);
  return cachedMembershipPortalProducts;
}

/**
 * Ensures the default Billing Portal configuration allows subscription updates for
 * every membership price in env. Stripe requires this for `subscription_update_confirm` flows.
 */
export async function ensureDefaultBillingPortalSubscriptionUpdate(
  stripe: Stripe
): Promise<void> {
  if (
    lastSuccessfulPortalEnsureAt > 0 &&
    Date.now() - lastSuccessfulPortalEnsureAt < PORTAL_ENSURE_COOLDOWN_MS
  ) {
    return;
  }

  const products = await getOrResolveBillingPortalMembershipProducts(stripe);
  const explicitId = process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID?.trim();

  if (explicitId) {
    await stripe.billingPortal.configurations.update(explicitId, {
      features: {
        subscription_update: {
          enabled: true,
          default_allowed_updates: ["price"],
          products,
          proration_behavior: "always_invoice",
        },
      },
    });
    lastSuccessfulPortalEnsureAt = Date.now();
    return;
  }

  const list = await stripe.billingPortal.configurations.list({ limit: 100 });
  const cfg =
    list.data.find((c) => c.is_default) ??
    list.data.find((c) => c.active) ??
    list.data[0];

  if (!cfg) {
    throw new Error(
      "No Customer Portal configuration found. In Stripe Dashboard open Billing → Customer portal, then save settings once to create the default configuration."
    );
  }

  await stripe.billingPortal.configurations.update(cfg.id, {
    features: {
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        products,
        proration_behavior: "always_invoice",
      },
    },
  });
  lastSuccessfulPortalEnsureAt = Date.now();
}
