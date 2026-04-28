export type StripeCheckoutMeta = {
  user_id?: string;
  checkout_mode?: string;
  tier?: string;
  interval?: string;
  addon_pack?: string;
};

export function subscriptionIdFromCheckoutSession(session: {
  subscription?: unknown;
}): string | null {
  const sub = session.subscription;
  if (typeof sub === "string" && sub.trim() !== "") return sub.trim();
  if (
    sub &&
    typeof sub === "object" &&
    "id" in sub &&
    typeof (sub as { id: unknown }).id === "string" &&
    (sub as { id: string }).id.trim() !== ""
  ) {
    return (sub as { id: string }).id.trim();
  }
  return null;
}

export function resolveCheckoutSessionCheckoutMode(
  meta: StripeCheckoutMeta,
  sessionMode: string | undefined,
  subscriptionId: string | null
): "subscription" | "addon" | null {
  const raw =
    typeof meta.checkout_mode === "string" ? meta.checkout_mode.trim() : "";
  if (raw === "subscription" || raw === "addon") return raw;
  if (subscriptionId) return "subscription";
  if (sessionMode === "subscription") return "subscription";
  if (sessionMode === "payment") return "addon";
  return null;
}
