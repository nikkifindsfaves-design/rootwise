import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import type { MembershipTier } from "@/lib/billing/config";
import { invoiceEligibleForPendingUpgradeAddonGrant } from "@/lib/billing/stripe-invoice-upgrade-eligibility";

export type ReconcilePendingUpgradeResult =
  | { applied: false; reason: string }
  | { applied: true; invoiceId: string };

/**
 * Applies pending upgrade add-on credits using Stripe invoice history. Mirrors webhook
 * `invoice.paid` so credits land even when webhooks do not reach this environment (common in local dev).
 */
export async function reconcilePendingUpgradeCreditsFromStripe(params: {
  admin: SupabaseClient;
  stripe: Stripe;
  userId: string;
}): Promise<ReconcilePendingUpgradeResult> {
  const { admin, stripe, userId } = params;

  const { data: subRow, error: subErr } = await admin
    .from("subscriptions")
    .select(
      "stripe_subscription_id, pending_upgrade_credits, pending_upgrade_from_tier, pending_upgrade_to_tier, pending_upgrade_session_id"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (subErr) {
    return { applied: false, reason: `subscriptions_load:${subErr.message}` };
  }

  const stripeSubId =
    typeof subRow?.stripe_subscription_id === "string"
      ? subRow.stripe_subscription_id.trim()
      : "";
  const pendingCredits = Number(
    (subRow as { pending_upgrade_credits?: number | null })
      .pending_upgrade_credits ?? 0
  );

  if (!stripeSubId || pendingCredits <= 0) {
    return { applied: false, reason: "no_pending_upgrade" };
  }

  let invoices;
  try {
    invoices = await stripe.invoices.list({
      subscription: stripeSubId,
      limit: 20,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "stripe_invoices_list_failed";
    return { applied: false, reason: msg };
  }

  const pendingFrom = (subRow as { pending_upgrade_from_tier?: MembershipTier | null })
    .pending_upgrade_from_tier;
  const pendingTo = (subRow as { pending_upgrade_to_tier?: MembershipTier | null })
    .pending_upgrade_to_tier;
  const pendingSessionId = (subRow as { pending_upgrade_session_id?: string | null })
    .pending_upgrade_session_id;

  for (const inv of invoices.data) {
    if (inv.status !== "paid") continue;

    let billingReason = inv.billing_reason ?? null;
    if (!billingReason && inv.id) {
      try {
        const full = await stripe.invoices.retrieve(inv.id);
        billingReason = full.billing_reason ?? null;
      } catch {
        continue;
      }
    }

    if (!invoiceEligibleForPendingUpgradeAddonGrant(billingReason ?? undefined)) {
      continue;
    }

    const invoiceId = inv.id;
    if (!invoiceId) continue;

    const { error: grantErr } = await admin.rpc("grant_credits", {
      p_user_id: userId,
      p_subscription_delta: 0,
      p_addon_delta: pendingCredits,
      p_event_type: "upgrade_proration_grant",
      p_idempotency_key: `invoice.paid:${invoiceId}:upgrade_proration`,
      p_source: "stripe",
      p_metadata: {
        source: "reconcile_pending_upgrade",
        invoice_id: invoiceId,
        billing_reason: billingReason,
        from_tier: pendingFrom,
        to_tier: pendingTo,
        checkout_session_id: pendingSessionId,
        granted_credits: pendingCredits,
      },
    });

    if (grantErr) {
      return { applied: false, reason: `grant_credits:${grantErr.message}` };
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

    return { applied: true, invoiceId };
  }

  return { applied: false, reason: "no_eligible_paid_invoice_yet" };
}
