import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ADDON_PACKS,
  TIER_DEFINITIONS,
  getTierFromString,
  type MembershipTier,
} from "@/lib/billing/config";
import { resolveCheckoutSessionUser } from "@/lib/billing/checkout-session-user";
import { normalizeStripeSubscriptionBillingInterval } from "@/lib/billing/subscription-interval";
import {
  getStripeServerClient,
  getTierIntervalFromPriceId,
} from "@/lib/billing/stripe";
import {
  resolveCheckoutSessionCheckoutMode,
  subscriptionIdFromCheckoutSession,
  type StripeCheckoutMeta,
} from "@/lib/billing/checkout-session-webhook";
import { calculateProratedUpgradeCredits } from "@/lib/billing/proration-upgrade-credits";
import {
  invoiceEligibleForPendingUpgradeAddonGrant,
  stripeSubscriptionIdFromInvoice,
} from "@/lib/billing/stripe-invoice-upgrade-eligibility";

/** Narrow Stripe Checkout metadata + typed tier keys used when creating sessions from our API. */
type StripeMeta = StripeCheckoutMeta & {
  tier?: MembershipTier;
  interval?: "monthly" | "annual";
  addon_pack?: keyof typeof ADDON_PACKS;
};

function getMonthlyAllocationForTier(tier: MembershipTier): number {
  return TIER_DEFINITIONS[tier].monthlyCredits;
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
    if (idempotencyError.code !== "23505") {
      return NextResponse.json(
        { error: `Webhook logging failed: ${idempotencyError.message}` },
        { status: 500 }
      );
    }
    // Duplicate stripe_event_id: a prior delivery may have logged the event but failed
    // before finishing (Stripe retries with the same id). Re-run handlers; upserts and
    // credit RPCs are idempotent via idempotency keys.
    debugLog("A4", "stripe.webhook.duplicate_event_replay", {
      stripeEventId,
      eventType,
    });
  }

  if (eventType === "checkout.session.completed") {
    const session = event.data.object as {
      id: string;
      mode?: string;
      metadata?: StripeMeta;
      customer?: string;
      subscription?: unknown;
      customer_email?: string;
      client_reference_id?: string | null;
    };
    const meta = session.metadata ?? {};
    const subscriptionId = subscriptionIdFromCheckoutSession(session);
    const resolvedCheckoutMode = resolveCheckoutSessionCheckoutMode(
      meta,
      session.mode,
      subscriptionId
    );
    const { userId, hadMetaUserId, hadClientReferenceId } =
      resolveCheckoutSessionUser(session);
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

      if (resolvedCheckoutMode === "subscription") {
        const tier = getTierFromString(meta.tier);
        const billingInterval = normalizeStripeSubscriptionBillingInterval(meta.interval);
        let checkoutPeriodStart: string | null = null;
        let checkoutPeriodEnd: string | null = null;
        let checkoutSubscriptionStatus: string = "active";
        if (!subscriptionId) {
          return NextResponse.json(
            { error: "Checkout did not include a subscription id." },
            { status: 500 }
          );
        }
        try {
          const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
          const firstSubscriptionItem =
            Array.isArray(stripeSubscription.items?.data) &&
            stripeSubscription.items.data.length > 0
              ? stripeSubscription.items.data[0]
              : null;
          const periodStartUnix =
            firstSubscriptionItem?.current_period_start ?? null;
          const periodEndUnix =
            firstSubscriptionItem?.current_period_end ?? null;
          checkoutPeriodStart = periodStartUnix
            ? new Date(periodStartUnix * 1000).toISOString()
            : null;
          checkoutPeriodEnd = periodEndUnix
            ? new Date(periodEndUnix * 1000).toISOString()
            : null;
          checkoutSubscriptionStatus = stripeSubscription.status ?? "active";
        } catch (subscriptionFetchError) {
          const message =
            subscriptionFetchError instanceof Error
              ? subscriptionFetchError.message
              : "Unknown error while retrieving Stripe subscription.";
          return NextResponse.json(
            { error: `Could not read Stripe subscription period: ${message}` },
            { status: 500 }
          );
        }
        if (!checkoutPeriodStart || !checkoutPeriodEnd) {
          const now = new Date();
          const periodStart = now;
          const periodEnd = new Date(now);
          if (billingInterval === "annual") {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
          } else {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
          }
          checkoutPeriodStart = checkoutPeriodStart ?? periodStart.toISOString();
          checkoutPeriodEnd = checkoutPeriodEnd ?? periodEnd.toISOString();
        }

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
        const pendingUpgradeCredits =
          hadExistingSubscription && oldTier !== tier
            ? calculateProratedUpgradeCredits({
                oldTier,
                newTier: tier,
                currentPeriodStart: prior?.current_period_start ?? null,
                currentPeriodEnd: prior?.current_period_end ?? null,
              })
            : 0;

        const { error: subscriptionUpsertError } = await admin.from("subscriptions").upsert(
          {
            user_id: userId,
            stripe_subscription_id: subscriptionId,
            stripe_price_id: null,
            tier,
            billing_interval: billingInterval,
            status:
              checkoutSubscriptionStatus === "active"
                ? "active"
                : checkoutSubscriptionStatus === "canceled"
                  ? "canceled"
                  : checkoutSubscriptionStatus === "unpaid"
                    ? "unpaid"
                    : "past_due",
            current_period_start: checkoutPeriodStart,
            current_period_end: checkoutPeriodEnd,
            pending_upgrade_from_tier: pendingUpgradeCredits > 0 ? oldTier : null,
            pending_upgrade_to_tier: pendingUpgradeCredits > 0 ? tier : null,
            pending_upgrade_credits: pendingUpgradeCredits,
            pending_upgrade_session_id:
              pendingUpgradeCredits > 0 ? session.id : null,
          },
          { onConflict: "user_id" }
        );
        if (subscriptionUpsertError) {
          return NextResponse.json(
            { error: `Subscription update failed: ${subscriptionUpsertError.message}` },
            { status: 500 }
          );
        }

        // Grant upgrade proration credits here — not only on invoice.paid — because invoice.paid
        // can arrive before this handler runs or before stripe_subscription_id matches the new sub.
        if (pendingUpgradeCredits > 0) {
          const { error: upgradeGrantError } = await admin.rpc("grant_credits", {
            p_user_id: userId,
            p_subscription_delta: 0,
            p_addon_delta: pendingUpgradeCredits,
            p_event_type: "upgrade_proration_grant",
            p_idempotency_key: `checkout.session.completed:${session.id}:upgrade_proration`,
            p_source: "stripe",
            p_metadata: {
              stripe_event_id: stripeEventId,
              checkout_session_id: session.id,
              from_tier: oldTier,
              to_tier: tier,
              granted_credits: pendingUpgradeCredits,
            },
          });
          if (upgradeGrantError) {
            return NextResponse.json(
              {
                error: `Upgrade proration grant failed: ${upgradeGrantError.message}`,
              },
              { status: 500 }
            );
          }
          await admin
            .from("subscriptions")
            .update({
              pending_upgrade_from_tier: null,
              pending_upgrade_to_tier: null,
              pending_upgrade_credits: 0,
              pending_upgrade_session_id: null,
            })
            .eq("user_id", userId);
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
      } else if (resolvedCheckoutMode === "addon") {
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
    } else {
      debugLog("A2", "stripe.webhook.checkout_completed_missing_user_id", {
        stripeEventId,
        sessionId: session.id,
        hadMetaUserId,
        hadClientReferenceId,
      });
    }
  }

  if (eventType === "customer.subscription.updated" || eventType === "customer.subscription.deleted") {
    const subscription = event.data.object as {
      id: string;
      status: string;
      metadata?: StripeMeta;
      current_period_start?: number;
      current_period_end?: number;
      items?: {
        data?: Array<{
          current_period_start?: number;
          current_period_end?: number;
          price?: { id?: string };
        }>;
      };
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
      const firstSubscriptionItem =
        Array.isArray(subscription.items?.data) &&
        subscription.items.data.length > 0
          ? subscription.items.data[0]
          : null;
      const periodStartUnix =
        subscription.current_period_start ??
        firstSubscriptionItem?.current_period_start ??
        null;
      const periodEndUnix =
        subscription.current_period_end ??
        firstSubscriptionItem?.current_period_end ??
        null;

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
          current_period_start: periodStartUnix
            ? new Date(periodStartUnix * 1000).toISOString()
            : null,
          current_period_end: periodEndUnix
            ? new Date(periodEndUnix * 1000).toISOString()
            : null,
        })
        .eq("user_id", row.user_id);
    }
  }

  if (
    eventType === "invoice.paid" ||
    eventType === "invoice.payment_succeeded"
  ) {
    const invoice = event.data.object as {
      id: string;
      subscription?: string | { id?: string } | null;
      billing_reason?: string;
    };
    const subscriptionId = stripeSubscriptionIdFromInvoice(invoice);
    if (subscriptionId) {
      const { data: subscriptionRow } = await admin
        .from("subscriptions")
        .select(
          "user_id, tier, pending_upgrade_from_tier, pending_upgrade_to_tier, pending_upgrade_credits, pending_upgrade_session_id"
        )
        .eq("stripe_subscription_id", subscriptionId)
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

        if (
          pendingUpgradeCredits > 0 &&
          invoiceEligibleForPendingUpgradeAddonGrant(invoice.billing_reason)
        ) {
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
              billing_reason: billingReason,
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
