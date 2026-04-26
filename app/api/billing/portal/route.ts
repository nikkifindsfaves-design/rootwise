import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStripeServerClient } from "@/lib/billing/stripe";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const stripe = getStripeServerClient();
  const portal = await stripe.billingPortal.sessions.create({
    customer: billingCustomer.stripe_customer_id,
    return_url: `${request.nextUrl.origin}/dashboard`,
  });

  return NextResponse.json({ url: portal.url });
}
