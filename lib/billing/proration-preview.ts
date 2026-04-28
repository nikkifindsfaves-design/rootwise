/**
 * Upgrade add-on preview for plan picker — matches {@link calculateProratedUpgradeCredits}.
 */
import {
  MEMBERSHIP_TIER_ORDER,
  TIER_DEFINITIONS,
  type BillingInterval,
  type MembershipTier,
} from "@/lib/billing/config";

export function compareMembershipTier(
  a: MembershipTier,
  b: MembershipTier
): number {
  return MEMBERSHIP_TIER_ORDER.indexOf(a) - MEMBERSHIP_TIER_ORDER.indexOf(b);
}

/** Preview — flat difference in monthly allotments (target − active). */
export function proratedAddonCreditsPreview(params: {
  activeTier: MembershipTier;
  targetTier: MembershipTier;
  currentPeriodEnd: string | null;
  billingInterval: BillingInterval;
}): number {
  void params.billingInterval;
  void params.currentPeriodEnd;

  if (compareMembershipTier(params.activeTier, params.targetTier) >= 0) {
    return 0;
  }
  const deltaMonthlyCredits =
    TIER_DEFINITIONS[params.targetTier].monthlyCredits -
    TIER_DEFINITIONS[params.activeTier].monthlyCredits;
  return Math.max(0, deltaMonthlyCredits);
}
