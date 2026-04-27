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
  current_period_end?: string | null;
};

export type CreditSnapshot = {
  tier: MembershipTier;
  subscriptionCredits: number;
  addonCredits: number;
  totalCredits: number;
  canUseExtraction: boolean;
  monthlyResetAt: string | null;
  hasPaidAccess: boolean;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
};

export type SubscriptionAccessState = {
  hasAccess: boolean;
  status: string;
  currentPeriodEnd: string | null;
  tier: MembershipTier;
};

function isTodayOrFutureIsoDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  return timestamp >= startOfToday;
}

export function hasPaidAccessFromSubscription(
  subscription: Pick<SubscriptionRow, "status" | "current_period_end"> | null | undefined
): boolean {
  if (!subscription) return false;
  if (subscription.status === "active") return true;
  return isTodayOrFutureIsoDate(subscription.current_period_end ?? null);
}

export async function getSubscriptionAccessStateForUser(
  userId: string
): Promise<SubscriptionAccessState> {
  const supabase = await createClient();
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("tier, status, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  const row = (subscription ?? {
    tier: "basic",
    status: "inactive",
    current_period_end: null,
  }) as SubscriptionRow;

  return {
    hasAccess: hasPaidAccessFromSubscription(row),
    status: row.status,
    currentPeriodEnd: row.current_period_end ?? null,
    tier: row.tier,
  };
}

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
      .select("tier, status, current_period_end")
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
    current_period_end: null,
  }) as SubscriptionRow;

  const isPaid = hasPaidAccessFromSubscription(subscriptionRow);
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
    hasPaidAccess: isPaid,
    subscriptionStatus: subscriptionRow.status,
    currentPeriodEnd: subscriptionRow.current_period_end ?? null,
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
      reason: "Extraction is available on Pro, Max, and Possessed plans only.",
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
