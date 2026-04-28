import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCreditSnapshotForUser } from "@/lib/billing/credits";
import { reconcilePendingUpgradeCreditsFromStripe } from "@/lib/billing/reconcile-pending-upgrade";
import { getStripeServerClient } from "@/lib/billing/stripe";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (typeof process.env.STRIPE_SECRET_KEY === "string" && process.env.STRIPE_SECRET_KEY.trim() !== "") {
    try {
      await reconcilePendingUpgradeCreditsFromStripe({
        admin: createAdminClient(),
        stripe: getStripeServerClient(),
        userId: user.id,
      });
    } catch (err) {
      console.error("[billing/status] reconcile pending upgrade:", err);
    }
  }

  const [
    snapshot,
    ledgerResult,
    subscriptionRowResult,
  ] = await Promise.all([
    getCreditSnapshotForUser(user.id),
    supabase
      .from("credit_ledger")
      .select(
        "id, event_type, action_type, delta_subscription_credits, delta_addon_credits, source, metadata, created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const { data: ledgerRows, error: ledgerError } = ledgerResult;

  if (ledgerError) {
    return NextResponse.json(
      { error: `Could not load credit ledger: ${ledgerError.message}` },
      { status: 500 }
    );
  }

  const stripeSubscriptionId =
    typeof subscriptionRowResult.data?.stripe_subscription_id === "string"
      ? subscriptionRowResult.data.stripe_subscription_id
      : null;

  return NextResponse.json({
    snapshot,
    ledger: ledgerRows ?? [],
    stripeSubscriptionId,
  });
}
