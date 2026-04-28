import { describe, expect, it } from "vitest";
import {
  appendBillingUpgradeReturnParams,
  buildStripeCheckoutBillingUrls,
  normalizeCheckoutReturnDestination,
} from "@/lib/billing/checkout-redirect";

describe("normalizeCheckoutReturnDestination", () => {
  it("defaults to dashboard for undefined, null, dashboard, and arbitrary values", () => {
    expect(normalizeCheckoutReturnDestination(undefined)).toBe("dashboard");
    expect(normalizeCheckoutReturnDestination(null)).toBe("dashboard");
    expect(normalizeCheckoutReturnDestination("dashboard")).toBe("dashboard");
    expect(normalizeCheckoutReturnDestination("")).toBe("dashboard");
    expect(normalizeCheckoutReturnDestination("other")).toBe("dashboard");
  });

  it("uses onboarding only when explicitly onboarding", () => {
    expect(normalizeCheckoutReturnDestination("onboarding")).toBe("onboarding");
  });

  it("uses account when explicitly account", () => {
    expect(normalizeCheckoutReturnDestination("account")).toBe("account");
  });
});

describe("buildStripeCheckoutBillingUrls", () => {
  it("builds paired success/cancel URLs with billing query flags for dashboard", () => {
    const urls = buildStripeCheckoutBillingUrls(
      "http://localhost:3000",
      "dashboard"
    );
    expect(urls.success_url).toBe("http://localhost:3000/dashboard?billing=success");
    expect(urls.cancel_url).toBe("http://localhost:3000/dashboard?billing=cancel");
  });

  it("uses onboarding path when requested", () => {
    const urls = buildStripeCheckoutBillingUrls(
      "https://example.app",
      "onboarding"
    );
    expect(urls.success_url).toBe("https://example.app/onboarding?billing=success");
    expect(urls.cancel_url).toBe("https://example.app/onboarding?billing=cancel");
  });

  it("uses dashboard account path when requested", () => {
    const urls = buildStripeCheckoutBillingUrls(
      "https://example.app",
      "account"
    );
    expect(urls.success_url).toBe(
      "https://example.app/dashboard/account?billing=success"
    );
    expect(urls.cancel_url).toBe(
      "https://example.app/dashboard/account?billing=cancel"
    );
  });

  it("pairs success and cancel to the same base path (regression guard for redirect drift)", () => {
    const origin = "http://127.0.0.1:3001";
    const urls = buildStripeCheckoutBillingUrls(origin, "dashboard");
    const successBase = urls.success_url.replace(/\?billing=success$/, "");
    const cancelBase = urls.cancel_url.replace(/\?billing=cancel$/, "");
    expect(successBase).toBe(cancelBase);
    expect(successBase).toBe(`${origin}/dashboard`);
  });
});

describe("appendBillingUpgradeReturnParams", () => {
  it("extends success URL with billing success and Stripe invoice snapshot", () => {
    const base =
      "https://example.app/dashboard/account?billing=success";
    const next = appendBillingUpgradeReturnParams(base, {
      invoiceId: "in_123",
      hostedInvoiceUrl: "https://stripe.com/invoice/test",
      paidCents: 499,
      totalCents: 499,
      currency: "usd",
    });
    const u = new URL(next);
    expect(u.pathname).toBe("/dashboard/account");
    expect(u.searchParams.get("billing")).toBe("success");
    expect(u.searchParams.get("upgrade_invoice_id")).toBe("in_123");
    expect(u.searchParams.get("upgrade_invoice_paid_cents")).toBe("499");
    expect(u.searchParams.get("upgrade_invoice_total_cents")).toBe("499");
    expect(u.searchParams.get("upgrade_invoice_currency")).toBe("usd");
    expect(u.searchParams.get("upgrade_invoice_hosted")).toBe(
      "https://stripe.com/invoice/test"
    );
  });

  it("omits hosted URL when null", () => {
    const base = "http://localhost:3000/dashboard?billing=success";
    const next = appendBillingUpgradeReturnParams(base, {
      invoiceId: "in_abc",
      hostedInvoiceUrl: null,
      paidCents: 0,
      totalCents: 0,
      currency: "usd",
    });
    expect(new URL(next).searchParams.has("upgrade_invoice_hosted")).toBe(
      false
    );
  });
});
