import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripeServerClient } from "@/lib/billing/stripe";
import type Stripe from "stripe";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let intent: string | undefined;
  try {
    const body = (await request.json()) as { intent?: string } | null;
    intent = typeof body?.intent === "string" ? body.intent : undefined;
  } catch {
    intent = undefined;
  }

  const { data: billingCustomer } = await supabase
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!billingCustomer?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing customer found for this account." },
      { status: 404 }
    );
  }

  let flowData: Stripe.BillingPortal.SessionCreateParams["flow_data"] | undefined;

  if (intent === "cancel_subscription") {
    const { data: subscriptionRow } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const stripeSubscriptionId =
      typeof subscriptionRow?.stripe_subscription_id === "string"
        ? subscriptionRow.stripe_subscription_id.trim()
        : "";

    if (stripeSubscriptionId === "") {
      return NextResponse.json(
        { error: "No Stripe subscription found to cancel." },
        { status: 404 }
      );
    }

    flowData = {
      type: "subscription_cancel",
      subscription_cancel: {
        subscription: stripeSubscriptionId,
      },
    };
  }

  const stripe = getStripeServerClient();
  const portal = await stripe.billingPortal.sessions.create({
    customer: billingCustomer.stripe_customer_id,
    return_url: `${request.nextUrl.origin}/dashboard/account`,
    ...(flowData ? { flow_data: flowData } : {}),
  });

  return NextResponse.json({ url: portal.url });
}
