"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { UPGRADE_INVOICE_RETURN_PARAM_KEYS } from "@/lib/billing/checkout-redirect";

const sans = "var(--font-dg-body), Lato, sans-serif";

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export function UpgradeInvoiceReturnBanner() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const invoiceId = searchParams.get("upgrade_invoice_id");
  const billingReturn = searchParams.get("billing");

  const payload = useMemo(() => {
    if (!invoiceId || billingReturn !== "success") return null;
    const paidRaw = searchParams.get("upgrade_invoice_paid_cents");
    const totalRaw = searchParams.get("upgrade_invoice_total_cents");
    const currency = searchParams.get("upgrade_invoice_currency") ?? "usd";
    const hosted = searchParams.get("upgrade_invoice_hosted");
    const paid = paidRaw !== null ? Number.parseInt(paidRaw, 10) : NaN;
    const total = totalRaw !== null ? Number.parseInt(totalRaw, 10) : NaN;
    return {
      paidCents: Number.isFinite(paid) ? paid : 0,
      totalCents: Number.isFinite(total) ? total : 0,
      currency,
      hosted:
        typeof hosted === "string" && hosted.startsWith("http") ? hosted : null,
    };
  }, [invoiceId, billingReturn, searchParams]);

  function dismiss() {
    const u = new URL(window.location.href);
    for (const key of UPGRADE_INVOICE_RETURN_PARAM_KEYS) {
      u.searchParams.delete(key);
    }
    if (u.searchParams.get("billing") === "success") {
      u.searchParams.delete("billing");
    }
    router.replace(u.pathname + u.search + u.hash);
  }

  if (!payload) return null;

  const onDashboardHome = pathname === "/dashboard";
  const paidLabel = formatMoney(payload.paidCents, payload.currency);
  const totalLabel = formatMoney(payload.totalCents, payload.currency);
  const zeroPaid = payload.paidCents === 0;

  return (
    <div
      className="border-b px-4 py-3 sm:px-6"
      style={{
        fontFamily: sans,
        backgroundColor: "color-mix(in srgb, var(--dg-brown-outline) 12%, var(--dg-cream))",
        borderColor: "var(--dg-brown-border)",
      }}
      role="status"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3">
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {!onDashboardHome ? (
            <Link
              href="/dashboard"
              className="text-sm font-semibold underline underline-offset-2"
              style={{ color: "var(--dg-brown-outline)" }}
            >
              Back to Dead Gossip
            </Link>
          ) : null}
          {payload.hosted ? (
            <a
              href={payload.hosted}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold underline underline-offset-2"
              style={{ color: "var(--dg-brown-outline)" }}
            >
              Open Stripe invoice ↗
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => dismiss()}
            className="rounded-md border px-3 py-1.5 text-sm font-semibold"
            style={{
              borderColor: "var(--dg-brown-border)",
              color: "var(--dg-brown-dark)",
              backgroundColor: "var(--dg-parchment)",
            }}
          >
            Dismiss
          </button>
        </div>
        <div className="min-w-0 space-y-1">
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--dg-brown-dark)" }}
          >
            Plan upgrade complete
          </p>
          <p className="text-sm" style={{ color: "var(--dg-brown-muted)" }}>
            Amount paid on this invoice:{" "}
            <span style={{ color: "var(--dg-brown-dark)" }}>{paidLabel}</span>
            {payload.totalCents !== payload.paidCents ? (
              <>
                {" "}
                · Invoice total:{" "}
                <span style={{ color: "var(--dg-brown-dark)" }}>
                  {totalLabel}
                </span>
              </>
            ) : null}
          </p>
          {zeroPaid ? (
            <p className="text-xs" style={{ color: "var(--dg-brown-muted)" }}>
              Stripe shows $0 when sandbox prices are set to $0 in the Stripe
              Dashboard, when a coupon covers the charge, or when your customer
              balance covers the proration. Confirm amounts under Products →
              Prices in Stripe test mode.
            </p>
          ) : null}
          <p className="sr-only">Invoice id {invoiceId}</p>
        </div>
      </div>
    </div>
  );
}
