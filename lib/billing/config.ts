export type MembershipTier = "basic" | "pro" | "max" | "possessed";
export type BillingInterval = "monthly" | "annual";
export type CreditActionType =
  | "story_generate"
  | "story_regenerate"
  | "extraction_sonnet"
  | "extraction_opus";

export const BILLING_FLAGS = {
  billingEnabled: process.env.BILLING_ENABLED === "true",
  pilotModeEnabled: process.env.BILLING_PILOT_MODE === "true",
  requireAuthForPilot: process.env.BILLING_REQUIRE_AUTH_FOR_PILOT !== "false",
  hardStopOnZeroCredits: process.env.BILLING_HARD_STOP_ON_ZERO !== "false",
};

export const TIER_DEFINITIONS: Record<
  MembershipTier,
  {
    displayName: string;
    monthlyCredits: number;
    supportsExtraction: boolean;
    prices: Record<BillingInterval, number>;
  }
> = {
  basic: {
    displayName: "Curious",
    monthlyCredits: 350,
    supportsExtraction: false,
    prices: { monthly: 7, annual: 67 },
  },
  pro: {
    displayName: "Devoted",
    monthlyCredits: 700,
    supportsExtraction: true,
    prices: { monthly: 13, annual: 125 },
  },
  max: {
    displayName: "Obsessed",
    monthlyCredits: 1200,
    supportsExtraction: true,
    prices: { monthly: 20, annual: 192 },
  },
  possessed: {
    displayName: "Possessed",
    monthlyCredits: 1800,
    supportsExtraction: true,
    prices: { monthly: 30, annual: 288 },
  },
};

export const MEMBERSHIP_TIER_ORDER: MembershipTier[] = [
  "basic",
  "pro",
  "max",
  "possessed",
];

export const ADDON_PACKS = {
  credits_250: { label: "250 Credits", credits: 250, price: 2.99 },
  credits_450: { label: "450 Credits", credits: 450, price: 5.99 },
  credits_800: { label: "800 Credits", credits: 800, price: 9.99 },
} as const;

export const ACTION_CREDIT_COST: Record<CreditActionType, number> = {
  story_generate: 2,
  story_regenerate: 2,
  extraction_sonnet: 3,
  extraction_opus: 5,
};

export function getTierFromString(raw: string | null | undefined): MembershipTier {
  const normalized = (raw ?? "").trim().toLowerCase();
  if (normalized === "possessed") return "possessed";
  if (normalized === "obsessed") return "max";
  if (normalized === "devoted") return "pro";
  if (normalized === "curious") return "basic";
  if (normalized === "pro") return "pro";
  if (normalized === "max") return "max";
  return "basic";
}

export function getTierDisplayName(tier: MembershipTier): string {
  return TIER_DEFINITIONS[tier].displayName;
}
