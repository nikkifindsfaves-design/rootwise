import { createClient } from "@/lib/supabase/server";
import {
  ACTION_CREDIT_COST,
  BILLING_FLAGS,
  type CreditActionType,
  type MembershipTier,
} from "@/lib/billing/config";

type BalanceRow = {
  subscription_credits: number;
  addon_credits: number;
  monthly_reset_at: string | null;
  pilot_mode_enabled: boolean;
};

type SubscriptionRow = {
  tier: MembershipTier;
  status: string;
};

export type CreditSnapshot = {
  tier: MembershipTier;
  subscriptionCredits: number;
  addonCredits: number;
  totalCredits: number;
  canUseExtraction: boolean;
  monthlyResetAt: string | null;
};

export async function getCreditSnapshotForUser(userId: string): Promise<CreditSnapshot> {
  const supabase = await createClient();

  const [{ data: balance }, { data: subscription }] = await Promise.all([
    supabase
      .from("credit_balances")
      .select("subscription_credits, addon_credits, monthly_reset_at, pilot_mode_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("tier, status")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const balanceRow = (balance ?? {
    subscription_credits: 0,
    addon_credits: 0,
    monthly_reset_at: null,
    pilot_mode_enabled: BILLING_FLAGS.pilotModeEnabled,
  }) as BalanceRow;
  const subscriptionRow = (subscription ?? {
    tier: "basic",
    status: "inactive",
  }) as SubscriptionRow;

  const isPaid =
    subscriptionRow.status === "active" || subscriptionRow.status === "trialing";
  const tier = isPaid ? subscriptionRow.tier : "basic";
  const canUseExtraction = tier !== "basic";
  const totalCredits = balanceRow.subscription_credits + balanceRow.addon_credits;

  return {
    tier,
    subscriptionCredits: balanceRow.subscription_credits,
    addonCredits: balanceRow.addon_credits,
    totalCredits,
    canUseExtraction,
    monthlyResetAt: balanceRow.monthly_reset_at,
  };
}

export function resolveActionCost(action: CreditActionType): number {
  return ACTION_CREDIT_COST[action];
}

export function validateActionAllowedByTier(
  tier: MembershipTier,
  action: CreditActionType
): { allowed: boolean; reason: string | null } {
  const extractionAction =
    action === "extraction_opus" || action === "extraction_sonnet";
  if (tier === "basic" && extractionAction) {
    return {
      allowed: false,
      reason: "Extraction is available on Pro and Max plans only.",
    };
  }
  return { allowed: true, reason: null };
}

export async function debitCreditsForAction(params: {
  userId: string;
  action: CreditActionType;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<
  | {
      ok: true;
      chargedCredits: number;
      subscriptionCredits: number;
      addonCredits: number;
    }
  | { ok: false; errorCode: string }
> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("consume_credits", {
    p_user_id: params.userId,
    p_action: params.action,
    p_idempotency_key: params.idempotencyKey,
    p_metadata: params.metadata ?? {},
  });

  if (error) {
    return { ok: false, errorCode: "billing_rpc_error" };
  }

  const row = Array.isArray(data) ? data[0] : null;
  if (!row || row.success !== true) {
    return {
      ok: false,
      errorCode: row?.error_code ?? "unknown_debit_error",
    };
  }

  return {
    ok: true,
    chargedCredits: row.charged_credits as number,
    subscriptionCredits: row.subscription_credits as number,
    addonCredits: row.addon_credits as number,
  };
}
