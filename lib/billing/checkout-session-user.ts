/**
 * Stripe checkout.session.completed may expose user id via session metadata or client_reference_id.
 */
export type CheckoutSessionUserResolution = {
  userId: string | undefined;
  hadMetaUserId: boolean;
  hadClientReferenceId: boolean;
};

export function resolveCheckoutSessionUser(session: {
  metadata?: { user_id?: string };
  client_reference_id?: string | null;
}): CheckoutSessionUserResolution {
  const meta = session.metadata ?? {};
  const userIdFromMeta =
    typeof meta.user_id === "string" && meta.user_id.trim() !== ""
      ? meta.user_id.trim()
      : null;
  const userIdFromClientRef =
    typeof session.client_reference_id === "string" &&
    session.client_reference_id.trim() !== ""
      ? session.client_reference_id.trim()
      : null;
  const userId = userIdFromMeta ?? userIdFromClientRef ?? undefined;
  return {
    userId,
    hadMetaUserId: userIdFromMeta !== null,
    hadClientReferenceId: userIdFromClientRef !== null,
  };
}
