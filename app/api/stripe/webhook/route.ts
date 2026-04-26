import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADDON_PACKS, TIER_DEFINITIONS, type MembershipTier } from "@/lib/billing/config";
import {
  getStripeServerClient,
  getTierIntervalFromPriceId,
} from "@/lib/billing/stripe";

type StripeMeta = {
  user_id?: string;
  checkout_mode?: string;
  tier?: MembershipTier;
  interval?: "monthly" | "annual";
  addon_pack?: keyof typeof ADDON_PACKS;
};

function getMonthlyAllocationForTier(tier: MembershipTier): number {
  return TIER_DEFINITIONS[tier].monthlyCredits;
}

function calculateProratedUpgradeCredits(params: {
  oldTier: MembershipTier;
  newTier: MembershipTier;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  fallbackInterval: "monthly" | "annual";
}): number {
  const deltaMonthlyCredits =
    getMonthlyAllocationForTier(params.newTier) -
    getMonthlyAllocationForTier(params.oldTier);
  if (deltaMonthlyCredits <= 0) return 0;

  const nowMs = Date.now();
  const periodEndMs = params.currentPeriodEnd
    ? Date.parse(params.currentPeriodEnd)
    : NaN;
  if (!Number.isFinite(periodEndMs) || periodEndMs <= nowMs) return 0;

  const periodStartMs = params.currentPeriodStart
    ? Date.parse(params.currentPeriodStart)
    : NaN;
  const fallbackWindowDays = params.fallbackInterval === "annual" ? 365 : 30;
  const fallbackWindowMs = fallbackWindowDays * 24 * 60 * 60 * 1000;

  const fullWindowMs =
    Number.isFinite(periodStartMs) && periodEndMs > periodStartMs
      ? periodEndMs - periodStartMs
      : fallbackWindowMs;
  if (fullWindowMs <= 0) return 0;

  const remainingWindowMs = periodEndMs - nowMs;
  const proratedCredits = Math.floor(
    (deltaMonthlyCredits * remainingWindowMs) / fullWindowMs
  );
  return Math.max(0, proratedCredits);
}

export async function POST(request: Request) {
  const debugLog = (
    hypothesisId: "A1" | "A2" | "A3" | "A4",
    message: string,
    data: Record<string, unknown>
  ) => {
    // #region agent log
    fetch("http://127.0.0.1:7639/ingest/a693cb65-e28a-44a1-aea5-3b8c20c0fd62", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "0f02f8",
      },
      body: JSON.stringify({
        sessionId: "0f02f8",
        runId: "addon-debug",
        hypothesisId,
        location: "app/api/stripe/webhook/route.ts:POST",
        message,
        data,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  };

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET is not configured." },
      { status: 500 }
    );
  }

  const signature = (await headers()).get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe signature." }, { status: 400 });
  }

  const stripe = getStripeServerClient();
  const payload = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return NextResponse.json({ error: "Invalid stripe signature." }, { status: 400 });
  }

  const admin = createAdminClient();
  const stripeEventId = event.id;
  const eventType = event.type;
  // #region agent log
  debugLog("A1", "stripe.webhook.received_event", {
    stripeEventId,
    eventType,
  });
  // #endregion

  const { error: idempotencyError } = await admin.from("billing_webhook_events").insert({
    stripe_event_id: stripeEventId,
    event_type: eventType,
    payload: event as unknown as Record<string, unknown>,
  });

  if (idempotencyError) {
    // #region agent log
    debugLog("A4", "stripe.webhook.idempotency_failed", {
      stripeEventId,
      eventType,
      code: idempotencyError.code ?? null,
      message: idempotencyError.message,
    });
    // #endregion
    if (idempotencyError.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    return NextResponse.json(
      { error: `Webhook logging failed: ${idempotencyError.message}` },
      { status: 500 }
    );
  }

  if (eventType === "checkout.session.completed") {
    const session = event.data.object as {
      id: string;
      metadata?: StripeMeta;
      customer?: string;
      subscription?: string;
      customer_email?: string;
    };
    const meta = session.metadata ?? {};
    const userId = meta.user_id;
    // #region agent log
    debugLog("A2", "stripe.webhook.checkout_completed_meta", {
      stripeEventId,
      sessionId: session.id,
      userId: userId ?? null,
      checkoutMode: meta.checkout_mode ?? null,
      addonPack: meta.addon_pack ?? null,
    });
    // #endregion

    if (userId) {
      const { data: existingSubscription } = await admin
        .from("subscriptions")
        .select(
          "tier, billing_interval, current_period_start, current_period_end, status, stripe_subscription_id"
        )
        .eq("user_id", userId)
        .maybeSingle();

      if (session.customer) {
        await admin.from("billing_customers").upsert({
          user_id: userId,
          stripe_customer_id: session.customer,
        });
      }

      if (meta.checkout_mode === "subscription") {
        const tier = meta.tier ?? "basic";
        const prior = (existingSubscription ?? null) as
          | {
              tier?: MembershipTier | null;
              billing_interval?: "monthly" | "quarterly" | "annual" | null;
              current_period_start?: string | null;
              current_period_end?: string | null;
              stripe_subscription_id?: string | null;
            }
          | null;
        const hadExistingSubscription =
          typeof prior?.stripe_subscription_id === "string" &&
          prior.stripe_subscription_id.trim() !== "";
        const oldTier = (prior?.tier ?? "basic") as MembershipTier;
        const fallbackInterval =
          prior?.billing_interval === "annual" ? "annual" : "monthly";
        const pendingUpgradeCredits =
          hadExistingSubscription && oldTier !== tier
            ? calculateProratedUpgradeCredits({
                oldTier,
                newTier: tier,
                currentPeriodStart: prior?.current_period_start ?? null,
                currentPeriodEnd: prior?.current_period_end ?? null,
                fallbackInterval,
              })
            : 0;

        const { error: subscriptionUpsertError } = await admin.from("subscriptions").upsert({
          user_id: userId,
          stripe_subscription_id: session.subscription ?? null,
          stripe_price_id: null,
          tier,
          billing_interval: meta.interval ?? "monthly",
          status: "active",
          pending_upgrade_from_tier: pendingUpgradeCredits > 0 ? oldTier : null,
          pending_upgrade_to_tier: pendingUpgradeCredits > 0 ? tier : null,
          pending_upgrade_credits: pendingUpgradeCredits,
          pending_upgrade_session_id:
            pendingUpgradeCredits > 0 ? session.id : null,
        });
        if (subscriptionUpsertError) {
          return NextResponse.json(
            { error: `Subscription update failed: ${subscriptionUpsertError.message}` },
            { status: 500 }
          );
        }

        if (!hadExistingSubscription) {
          const { error: activationGrantError } = await admin.rpc(
            "reset_monthly_subscription_credits",
            {
              p_user_id: userId,
              p_monthly_allocation: getMonthlyAllocationForTier(tier),
              p_idempotency_key: `checkout.session.completed:${session.id}:activation_reset`,
              p_metadata: {
                stripe_event_id: stripeEventId,
                tier,
                reason: "initial_activation",
              },
            }
          );
          if (activationGrantError) {
            return NextResponse.json(
              { error: `Initial credit grant failed: ${activationGrantError.message}` },
              { status: 500 }
            );
          }
        }
      } else if (meta.checkout_mode === "addon") {
        const pack = meta.addon_pack ?? "credits_250";
        const credits = ADDON_PACKS[pack].credits;
        const { error: addonGrantError } = await admin.rpc("grant_credits", {
          p_user_id: userId,
          p_subscription_delta: 0,
          p_addon_delta: credits,
          p_event_type: "addon_purchase",
          p_idempotency_key: `checkout.session.completed:${session.id}:addon_${pack}`,
          p_source: "stripe",
          p_metadata: { stripe_event_id: stripeEventId, pack, credits },
        });
        if (addonGrantError) {
          // #region agent log
          debugLog("A3", "stripe.webhook.addon_grant_failed", {
            stripeEventId,
            sessionId: session.id,
            userId,
            pack,
            credits,
            code: addonGrantError.code ?? null,
            message: addonGrantError.message,
            details: addonGrantError.details ?? null,
          });
          // #endregion
          return NextResponse.json(
            { error: `Add-on credit grant failed: ${addonGrantError.message}` },
            { status: 500 }
          );
        }
        // #region agent log
        debugLog("A3", "stripe.webhook.addon_grant_succeeded", {
          stripeEventId,
          sessionId: session.id,
          userId,
          pack,
          credits,
        });
        // #endregion
      }
    }
  }

  if (eventType === "customer.subscription.updated" || eventType === "customer.subscription.deleted") {
    const subscription = event.data.object as {
      id: string;
      status: string;
      metadata?: StripeMeta;
      current_period_start?: number;
      current_period_end?: number;
    };

    const { data: row } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_subscription_id", subscription.id)
      .maybeSingle();

    if (row?.user_id) {
      const firstPriceId =
        Array.isArray((subscription as { items?: { data?: Array<{ price?: { id?: string } }> } }).items?.data)
          ? (subscription as { items?: { data?: Array<{ price?: { id?: string } }> } }).items?.data?.[0]?.price?.id
          : undefined;
      const tierFromStripe = firstPriceId
        ? getTierIntervalFromPriceId(firstPriceId)?.tier
        : null;
      const intervalFromStripe = firstPriceId
        ? getTierIntervalFromPriceId(firstPriceId)?.interval
        : null;

      await admin
        .from("subscriptions")
        .update({
          status:
            subscription.status === "active"
              ? "active"
              : subscription.status === "canceled" ||
                  eventType === "customer.subscription.deleted"
                ? "canceled"
                : subscription.status === "unpaid"
                  ? "unpaid"
                  : "past_due",
          ...(tierFromStripe ? { tier: tierFromStripe } : {}),
          ...(intervalFromStripe ? { billing_interval: intervalFromStripe } : {}),
          ...(firstPriceId ? { stripe_price_id: firstPriceId } : {}),
          current_period_start: subscription.current_period_start
            ? new Date(subscription.current_period_start * 1000).toISOString()
            : null,
          current_period_end: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
        })
        .eq("user_id", row.user_id);
    }
  }

  if (eventType === "invoice.paid") {
    const invoice = event.data.object as {
      id: string;
      subscription?: string;
      billing_reason?: string;
    };
    if (invoice.subscription) {
      const { data: subscriptionRow } = await admin
        .from("subscriptions")
        .select(
          "user_id, tier, pending_upgrade_from_tier, pending_upgrade_to_tier, pending_upgrade_credits, pending_upgrade_session_id"
        )
        .eq("stripe_subscription_id", invoice.subscription)
        .maybeSingle();

      if (subscriptionRow?.user_id) {
        const tier = (subscriptionRow.tier ?? "basic") as MembershipTier;
        const billingReason = invoice.billing_reason ?? "unknown";
        const isResetInvoice = billingReason === "subscription_cycle";
        const pendingUpgradeCredits = Number(
          (
            subscriptionRow as {
              pending_upgrade_credits?: number | null;
            }
          ).pending_upgrade_credits ?? 0
        );
        const pendingFrom = (
          subscriptionRow as {
            pending_upgrade_from_tier?: MembershipTier | null;
          }
        ).pending_upgrade_from_tier;
        const pendingTo = (
          subscriptionRow as {
            pending_upgrade_to_tier?: MembershipTier | null;
          }
        ).pending_upgrade_to_tier;
        const pendingSessionId = (
          subscriptionRow as {
            pending_upgrade_session_id?: string | null;
          }
        ).pending_upgrade_session_id;

        if (isResetInvoice) {
          await admin.rpc("reset_monthly_subscription_credits", {
            p_user_id: subscriptionRow.user_id,
            p_monthly_allocation: getMonthlyAllocationForTier(tier),
            p_idempotency_key: `invoice.paid:${invoice.id}:monthly_reset`,
            p_metadata: { stripe_event_id: stripeEventId, tier, billing_reason: billingReason },
          });
        }

        if (pendingUpgradeCredits > 0) {
          await admin.rpc("grant_credits", {
            p_user_id: subscriptionRow.user_id,
            p_subscription_delta: 0,
            p_addon_delta: pendingUpgradeCredits,
            p_event_type: "upgrade_proration_grant",
            p_idempotency_key: `invoice.paid:${invoice.id}:upgrade_proration`,
            p_source: "stripe",
            p_metadata: {
              stripe_event_id: stripeEventId,
              invoice_id: invoice.id,
              from_tier: pendingFrom,
              to_tier: pendingTo,
              checkout_session_id: pendingSessionId,
              granted_credits: pendingUpgradeCredits,
            },
          });
          await admin
            .from("subscriptions")
            .update({
              pending_upgrade_from_tier: null,
              pending_upgrade_to_tier: null,
              pending_upgrade_credits: 0,
              pending_upgrade_session_id: null,
            })
            .eq("user_id", subscriptionRow.user_id);
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
