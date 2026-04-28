import {
  MEMBERSHIP_TIER_ORDER,
  TIER_DEFINITIONS,
  type MembershipTier,
} from "@/lib/billing/config";

function getMonthlyAllocationForTier(tier: MembershipTier): number {
  return TIER_DEFINITIONS[tier].monthlyCredits;
}

function isStrictUpgrade(
  oldTier: MembershipTier,
  newTier: MembershipTier
): boolean {
  return (
    MEMBERSHIP_TIER_ORDER.indexOf(newTier) >
    MEMBERSHIP_TIER_ORDER.indexOf(oldTier)
  );
}

/**
 * One-time add-on credits on upgrade: the **difference in monthly subscription credit allotments**
 * between tiers (new minus old). Same numbers shown on the plan picker.
 *
 * Period bounds are unused but kept so callers do not churn.
 */
export function calculateProratedUpgradeCredits(params: {
  oldTier: MembershipTier;
  newTier: MembershipTier;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}): number {
  void params.currentPeriodStart;
  void params.currentPeriodEnd;

  if (!isStrictUpgrade(params.oldTier, params.newTier)) return 0;

  const deltaMonthlyCredits =
    getMonthlyAllocationForTier(params.newTier) -
    getMonthlyAllocationForTier(params.oldTier);
  return Math.max(0, deltaMonthlyCredits);
}
