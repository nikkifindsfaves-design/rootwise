import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ADDON_PACKS, TIER_DEFINITIONS, type MembershipTier } from "@/lib/billing/config";
import { getStripeServerClient } from "@/lib/billing/stripe";

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

export async function POST(request: Request) {
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

  const { error: idempotencyError } = await admin.from("billing_webhook_events").insert({
    stripe_event_id: stripeEventId,
    event_type: eventType,
    payload: event as unknown as Record<string, unknown>,
  });

  if (idempotencyError) {
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

    if (userId) {
      if (session.customer) {
        await admin.from("billing_customers").upsert({
          user_id: userId,
          stripe_customer_id: session.customer,
        });
      }

      if (meta.checkout_mode === "subscription") {
        const tier = meta.tier ?? "basic";
        const allocation = getMonthlyAllocationForTier(tier);

        await admin.from("subscriptions").upsert({
          user_id: userId,
          stripe_subscription_id: session.subscription ?? null,
          tier,
          billing_interval: meta.interval ?? "monthly",
          status: "active",
        });

        await admin.rpc("reset_monthly_subscription_credits", {
          p_user_id: userId,
          p_monthly_allocation: allocation,
          p_idempotency_key: `checkout.session.completed:${session.id}:subscription_grant`,
          p_metadata: { stripe_event_id: stripeEventId, tier },
        });
      } else if (meta.checkout_mode === "addon") {
        const pack = meta.addon_pack ?? "credits_250";
        const credits = ADDON_PACKS[pack].credits;
        await admin.rpc("grant_credits", {
          p_user_id: userId,
          p_subscription_delta: 0,
          p_addon_delta: credits,
          p_event_type: "addon_purchase",
          p_idempotency_key: `checkout.session.completed:${session.id}:addon_${pack}`,
          p_source: "stripe",
          p_metadata: { stripe_event_id: stripeEventId, pack, credits },
        });
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
      await admin
        .from("subscriptions")
        .update({
          status:
            subscription.status === "active" || subscription.status === "trialing"
              ? subscription.status
              : eventType === "customer.subscription.deleted"
                ? "canceled"
                : "past_due",
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
    };
    if (invoice.subscription) {
      const { data: subscriptionRow } = await admin
        .from("subscriptions")
        .select("user_id, tier")
        .eq("stripe_subscription_id", invoice.subscription)
        .maybeSingle();

      if (subscriptionRow?.user_id) {
        const tier = (subscriptionRow.tier ?? "basic") as MembershipTier;
        await admin.rpc("reset_monthly_subscription_credits", {
          p_user_id: subscriptionRow.user_id,
          p_monthly_allocation: getMonthlyAllocationForTier(tier),
          p_idempotency_key: `invoice.paid:${invoice.id}:monthly_reset`,
          p_metadata: { stripe_event_id: stripeEventId, tier },
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
