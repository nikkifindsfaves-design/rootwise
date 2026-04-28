import { describe, expect, it } from "vitest";
import { resolveCheckoutSessionUser } from "@/lib/billing/checkout-session-user";

describe("resolveCheckoutSessionUser", () => {
  it("prefers metadata user_id when present", () => {
    const r = resolveCheckoutSessionUser({
      metadata: { user_id: "  UUID-PRIMARY  " },
      client_reference_id: "UUID-FALLBACK",
    });
    expect(r.userId).toBe("UUID-PRIMARY");
    expect(r.hadMetaUserId).toBe(true);
    expect(r.hadClientReferenceId).toBe(true);
  });

  it("falls back to client_reference_id when metadata user_id absent", () => {
    const r = resolveCheckoutSessionUser({
      metadata: {},
      client_reference_id: "client-ref-only",
    });
    expect(r.userId).toBe("client-ref-only");
    expect(r.hadMetaUserId).toBe(false);
    expect(r.hadClientReferenceId).toBe(true);
  });

  it("falls back when metadata user_id is only whitespace", () => {
    const r = resolveCheckoutSessionUser({
      metadata: { user_id: "   " },
      client_reference_id: "from-ref",
    });
    expect(r.userId).toBe("from-ref");
    expect(r.hadMetaUserId).toBe(false);
  });

  it("returns undefined when neither side is usable", () => {
    const r = resolveCheckoutSessionUser({
      metadata: { user_id: "" },
      client_reference_id: null,
    });
    expect(r.userId).toBe(undefined);
    expect(r.hadMetaUserId).toBe(false);
    expect(r.hadClientReferenceId).toBe(false);
  });
});
