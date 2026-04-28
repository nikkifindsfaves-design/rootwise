import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADDON_PACKS, getTierFromString, type MembershipTier } from "@/lib/billing/config";
import {
  buildStripeCheckoutBillingUrls,
  normalizeCheckoutReturnDestination,
} from "@/lib/billing/checkout-redirect";
import { calculateProratedUpgradeCredits } from "@/lib/billing/proration-upgrade-credits";
import { ensureDefaultBillingPortalSubscriptionUpdate } from "@/lib/billing/stripe-portal-subscription-update";
import { normalizeStripeSubscriptionBillingInterval } from "@/lib/billing/subscription-interval";
import {
  getStripePriceIdForAddon,
  getStripePriceIdForTier,
  getStripeServerClient,
} from "@/lib/billing/stripe";

type RequestBody = {
  mode?: "subscription" | "addon";
  tier?: string;
  interval?: "monthly" | "annual";
  addon_pack?: keyof typeof ADDON_PACKS;
  return_to?: "dashboard" | "onboarding" | "account";
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = body.mode;
  if (mode !== "subscription" && mode !== "addon") {
    return NextResponse.json(
      { error: "mode must be subscription or addon" },
      { status: 400 }
    );
  }

  const stripe = getStripeServerClient();
  const origin = request.nextUrl.origin;
  const returnTo = normalizeCheckoutReturnDestination(body.return_to);

  if (mode === "subscription") {
    const newTier = getTierFromString(body.tier);
    const billingInterval = normalizeStripeSubscriptionBillingInterval(body.interval);
    const admin = createAdminClient();

    const [{ data: subRow }, { data: custRow }] = await Promise.all([
      admin
        .from("subscriptions")
        .select(
          "stripe_subscription_id, tier, billing_interval, current_period_start, current_period_end"
        )
        .eq("user_id", user.id)
        .maybeSingle(),
      admin
        .from("billing_customers")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const stripeSubId =
      typeof subRow?.stripe_subscription_id === "string"
        ? subRow.stripe_subscription_id.trim()
        : "";
    const stripeCustId =
      typeof custRow?.stripe_customer_id === "string"
        ? custRow.stripe_customer_id.trim()
        : "";

    if (stripeSubId !== "" && stripeCustId !== "") {
      let existingStripeSub;
      try {
        existingStripeSub = await stripe.subscriptions.retrieve(stripeSubId);
      } catch {
        return NextResponse.json(
          { error: "Could not load your Stripe subscription." },
          { status: 400 }
        );
      }

      const itemId = existingStripeSub.items?.data?.[0]?.id;
      const currentPriceId = existingStripeSub.items?.data?.[0]?.price?.id;
      const priceInterval: "monthly" | "annual" =
        billingInterval === "annual" ? "annual" : "monthly";
      const newPriceId = getStripePriceIdForTier(newTier, priceInterval);

      if (!itemId) {
        return NextResponse.json(
          { error: "Could not find a subscription item to update." },
          { status: 400 }
        );
      }

      if (currentPriceId === newPriceId) {
        const { success_url } = buildStripeCheckoutBillingUrls(origin, returnTo);
        return NextResponse.json({ url: success_url });
      }

      const oldTier = (subRow?.tier ?? "basic") as MembershipTier;

      const firstSubItem = existingStripeSub.items?.data?.[0];
      const stripePeriodStartUnix = firstSubItem?.current_period_start;
      const stripePeriodEndUnix = firstSubItem?.current_period_end;
      const periodStartIso =
        typeof stripePeriodStartUnix === "number"
          ? new Date(stripePeriodStartUnix * 1000).toISOString()
          : subRow?.current_period_start ?? null;
      const periodEndIso =
        typeof stripePeriodEndUnix === "number"
          ? new Date(stripePeriodEndUnix * 1000).toISOString()
          : subRow?.current_period_end ?? null;

      const pendingUpgradeCredits =
        oldTier !== newTier
          ? calculateProratedUpgradeCredits({
              oldTier,
              newTier,
              currentPeriodStart: periodStartIso,
              currentPeriodEnd: periodEndIso,
            })
          : 0;

      if (pendingUpgradeCredits > 0) {
        const { error: pendErr } = await admin.from("subscriptions").update({
          pending_upgrade_from_tier: oldTier,
          pending_upgrade_to_tier: newTier,
          pending_upgrade_credits: pendingUpgradeCredits,
          pending_upgrade_session_id: null,
        }).eq("user_id", user.id);
        if (pendErr) {
          return NextResponse.json(
            { error: `Could not prepare upgrade credits: ${pendErr.message}` },
            { status: 500 }
          );
        }
      }

      // Hosted Stripe Checkout cannot attach an upgrade to an existing subscription (that API creates a new subscription).
      // Customer Portal `subscription_update_confirm` is Stripe's hosted confirmation flow: customer sees plan/proration,
      // confirms, then Stripe applies the update and charges. Proration credits are granted on `invoice.paid` (subscription_update).
      const billingUrls = buildStripeCheckoutBillingUrls(origin, returnTo);
      const itemQty =
        typeof existingStripeSub.items?.data?.[0]?.quantity === "number"
          ? existingStripeSub.items.data[0].quantity
          : 1;
      try {
        await ensureDefaultBillingPortalSubscriptionUpdate(stripe);
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: stripeCustId,
          return_url: billingUrls.success_url,
          flow_data: {
            type: "subscription_update_confirm",
            subscription_update_confirm: {
              subscription: stripeSubId,
              items: [{ id: itemId, price: newPriceId, quantity: itemQty }],
            },
            after_completion: {
              type: "redirect",
              redirect: {
                return_url: billingUrls.success_url,
              },
            },
          },
        });
        const portalUrl = portalSession.url;
        if (typeof portalUrl !== "string" || portalUrl.trim() === "") {
          return NextResponse.json(
            { error: "Could not create billing confirmation session." },
            { status: 500 }
          );
        }
        return NextResponse.json({ url: portalUrl });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Stripe billing portal error.";
        return NextResponse.json(
          {
            error: `${message} If this persists, open Stripe Dashboard → Billing → Customer portal and ensure Subscription products includes every membership price, or set STRIPE_BILLING_PORTAL_CONFIGURATION_ID to the portal configuration ID used for upgrades.`,
          },
          { status: 502 }
        );
      }
    }
  }

  const billingUrls = buildStripeCheckoutBillingUrls(origin, returnTo);

  const lineItems =
    mode === "subscription"
      ? [
          {
            price: getStripePriceIdForTier(
              getTierFromString(body.tier),
              body.interval ?? "monthly"
            ),
            quantity: 1,
          },
        ]
      : [
          {
            price: getStripePriceIdForAddon(body.addon_pack ?? "credits_250"),
            quantity: 1,
          },
        ];

  const session = await stripe.checkout.sessions.create({
    mode: mode === "subscription" ? "subscription" : "payment",
    payment_method_types: ["card"],
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    success_url: billingUrls.success_url,
    cancel_url: billingUrls.cancel_url,
    line_items: lineItems,
    metadata: {
      user_id: user.id,
      checkout_mode: mode,
      tier: mode === "subscription" ? getTierFromString(body.tier) : "",
      interval: mode === "subscription" ? body.interval ?? "monthly" : "",
      addon_pack: mode === "addon" ? body.addon_pack ?? "credits_250" : "",
    },
  });

  return NextResponse.json({ url: session.url });
}
