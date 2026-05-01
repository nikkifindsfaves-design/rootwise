"use client";

import { UpgradeInvoiceReturnBanner } from "@/components/billing/upgrade-invoice-return-banner";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getTierDisplayName,
  TIER_DEFINITIONS,
  type MembershipTier,
} from "@/lib/billing/config";

const serif = "var(--font-dg-display), 'Playfair Display', Georgia, serif";
const sans = "var(--font-dg-body), Lato, sans-serif";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CreditLedgerRow = {
  id: string;
  event_type: string;
  action_type: string | null;
  delta_subscription_credits: number;
  delta_addon_credits: number;
  created_at: string;
};

function ledgerCreditsCharged(row: CreditLedgerRow): number {
  return Math.abs(row.delta_subscription_credits + row.delta_addon_credits);
}

function creditActionDescription(actionType: string | null): string {
  switch (actionType) {
    case "story_generate":
      return "Story generation";
    case "story_regenerate":
      return "Story regeneration";
    case "extraction_sonnet":
      return "Document extraction";
    case "extraction_opus":
      return "Document extraction";
    default:
      return "Credit use";
  }
}

function formatLedgerDay(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatResetOnLabel(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function AccountSettingsShell() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingSnapshot, setBillingSnapshot] = useState<{
    tier: MembershipTier;
    subscriptionCredits: number;
    addonCredits: number;
    totalCredits: number;
    canUseExtraction: boolean;
    monthlyResetAt: string | null;
    hasPaidAccess: boolean;
    subscriptionStatus: string;
    currentPeriodEnd: string | null;
  } | null>(null);
  const [creditLedger, setCreditLedger] = useState<CreditLedgerRow[]>([]);
  const [stripeSubscriptionId, setStripeSubscriptionId] = useState<
    string | null
  >(null);
  const [billingWorking, setBillingWorking] = useState<
    null | "portal" | "cancel_portal" | "delete_account"
  >(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [identityLoading, setIdentityLoading] = useState(true);
  const [identityWorking, setIdentityWorking] = useState<
    null | "profile" | "email"
  >(null);
  const [identityMessage, setIdentityMessage] = useState<string | null>(null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [supportTopic, setSupportTopic] = useState<
    "General support" | "Billing question" | "Bug report"
  >("General support");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportStatus, setSupportStatus] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"billing" | "profile" | "support">(
    "billing"
  );

  async function refreshBilling() {
    setBillingLoading(true);
    try {
      const response = await fetch("/api/billing/status", { method: "GET" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Could not load billing status.");
      }
      setBillingSnapshot(data.snapshot ?? null);
      setCreditLedger(
        Array.isArray(data.ledger) ? (data.ledger as CreditLedgerRow[]) : []
      );
      setStripeSubscriptionId(
        typeof data.stripeSubscriptionId === "string"
          ? data.stripeSubscriptionId
          : null
      );
      setBillingError(null);
    } catch (error) {
      setBillingError(
        error instanceof Error ? error.message : "Could not load billing status."
      );
    } finally {
      setBillingLoading(false);
    }
  }

  useEffect(() => {
    void refreshBilling();
  }, []);
  const billingReturn = searchParams.get("billing");
  useEffect(() => {
    if (billingReturn === "success" || billingReturn === "cancel") {
      void refreshBilling();
    }
  }, [billingReturn]);
  useEffect(() => {
    const onFocus = () => {
      void refreshBilling();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      setIdentityLoading(true);
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (error) throw error;
        if (!mounted) return;
        setEmail(user?.email ?? "");
        const rawFullName = user?.user_metadata?.full_name;
        const rawFirst = user?.user_metadata?.first_name;
        const rawLast = user?.user_metadata?.last_name;
        const synthesized =
          typeof rawFirst === "string" || typeof rawLast === "string"
            ? `${typeof rawFirst === "string" ? rawFirst : ""} ${typeof rawLast === "string" ? rawLast : ""}`.trim()
            : "";
        if (typeof rawFullName === "string" && rawFullName.trim() !== "") {
          setFullName(rawFullName);
        } else {
          setFullName(synthesized);
        }
      } catch (err) {
        if (!mounted) return;
        setIdentityError(
          err instanceof Error ? err.message : "Could not load profile settings."
        );
      } finally {
        if (mounted) setIdentityLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [supabase]);

  async function updateFullName() {
    setIdentityWorking("profile");
    setIdentityError(null);
    setIdentityMessage(null);
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ");
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim(),
          first_name: firstName,
          last_name: lastName,
        },
      });
      if (error) throw error;
      setIdentityMessage("Name updated.");
    } catch (err) {
      setIdentityError(
        err instanceof Error ? err.message : "Could not update name."
      );
    } finally {
      setIdentityWorking(null);
    }
  }

  async function updateEmail() {
    setIdentityWorking("email");
    setIdentityError(null);
    setIdentityMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({
        email: email.trim(),
      });
      if (error) throw error;
      setIdentityMessage(
        "Verification sent to your new email. Confirm it to finish the change."
      );
    } catch (err) {
      setIdentityError(
        err instanceof Error ? err.message : "Could not update email."
      );
    } finally {
      setIdentityWorking(null);
    }
  }

  async function updatePassword() {
    setIdentityWorking("profile");
    setIdentityError(null);
    setIdentityMessage(null);

    if (newPassword.length < 8) {
      setIdentityError("Password must be at least 8 characters.");
      setIdentityWorking(null);
      return;
    }
    if (newPassword !== confirmPassword) {
      setIdentityError("Password confirmation does not match.");
      setIdentityWorking(null);
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      setIdentityMessage("Password updated.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setIdentityError(
        err instanceof Error ? err.message : "Could not update password."
      );
    } finally {
      setIdentityWorking(null);
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setSupportStatus(`${label} copied.`);
    } catch {
      setSupportStatus(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  async function submitSupportRequest() {
    if (supportMessage.trim() === "") {
      setSupportStatus("Please enter a message before sending.");
      return;
    }
    setSupportStatus(null);
    try {
      const response = await fetch("/api/support/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: supportTopic,
          message: supportMessage.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Could not submit support request.");
      }
      setSupportMessage("");
      setSupportStatus("Message submitted. We will follow up by email.");
    } catch (err) {
      setSupportStatus(
        err instanceof Error ? err.message : "Could not submit support request."
      );
    }
  }

  const selectedSupportEmail =
    supportTopic === "Billing question"
      ? "billing@deadgossip.app"
      : supportTopic === "Bug report"
        ? "bug@deadgossip.app"
        : "support@deadgossip.app";

  async function openBillingPortal() {
    setBillingWorking("portal");
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") {
        throw new Error(data?.error ?? "Could not open billing portal.");
      }
      window.location.href = data.url;
    } catch (error) {
      setBillingError(
        error instanceof Error ? error.message : "Could not open billing portal."
      );
    } finally {
      setBillingWorking(null);
    }
  }

  async function openCancelSubscriptionPortal() {
    setCancelModalOpen(false);
    setBillingWorking("cancel_portal");
    try {
      const response = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "cancel_subscription" }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") {
        throw new Error(
          data?.error ?? "Could not open subscription cancellation."
        );
      }
      window.location.href = data.url;
    } catch (error) {
      setBillingError(
        error instanceof Error
          ? error.message
          : "Could not open subscription cancellation."
      );
    } finally {
      setBillingWorking(null);
    }
  }

  async function requestAccountDeletion() {
    setBillingWorking("delete_account");
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "User initiated from account settings" }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data?.error ?? "Could not create account deletion request."
        );
      }
    } catch (error) {
      setBillingError(
        error instanceof Error
          ? error.message
          : "Could not create account deletion request."
      );
    } finally {
      setBillingWorking(null);
    }
  }

  const cycleTier = (billingSnapshot?.tier ?? "basic") as MembershipTier;
  const cycleAllocation = TIER_DEFINITIONS[cycleTier].monthlyCredits;
  const subscriptionRemaining = billingSnapshot?.subscriptionCredits ?? 0;
  const usedThisCycle = Math.min(
    cycleAllocation,
    Math.max(0, cycleAllocation - subscriptionRemaining)
  );
  const usagePercent =
    cycleAllocation > 0
      ? Math.min(100, Math.round((usedThisCycle / cycleAllocation) * 100))
      : 0;
  const resetOnLabel = billingSnapshot
    ? formatResetOnLabel(
        billingSnapshot.monthlyResetAt ?? billingSnapshot.currentPeriodEnd
      )
    : null;
  const usageLogRows = creditLedger.filter(
    (row) => row.event_type === "usage_debit"
  );
  const usageLogPreview = usageLogRows.slice(0, 5);
  const canCancelViaStripe =
    Boolean(stripeSubscriptionId?.trim()) &&
    Boolean(billingSnapshot?.hasPaidAccess);

  const treeReturnParam = (searchParams.get("tree") ?? "").trim();
  const accountBackHref =
    treeReturnParam !== "" && UUID_RE.test(treeReturnParam)
      ? `/dashboard/${treeReturnParam}`
      : "/tree-select";
  const accountBackLabel =
    treeReturnParam !== "" && UUID_RE.test(treeReturnParam)
      ? "Back to tree dashboard"
      : "Back to trees";

  const shimmerBar =
    "animate-pulse rounded-md bg-[color-mix(in_srgb,var(--dg-brown-border)_35%,transparent)]";

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <UpgradeInvoiceReturnBanner />
      <div className="mb-6 flex items-center justify-between">
        <h1
          className="text-2xl font-bold sm:text-3xl"
          style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}
        >
          Account Settings
        </h1>
        <Link
          href={accountBackHref}
          className="text-sm underline underline-offset-2"
          style={{ fontFamily: sans, color: "var(--dg-brown-outline)" }}
        >
          {accountBackLabel}
        </Link>
      </div>

      <section
        className="rounded-lg border p-6 sm:p-8"
        style={{
          borderColor: "var(--dg-brown-border)",
          backgroundColor: "var(--dg-parchment)",
        }}
      >
        <div
          className="flex flex-wrap gap-1 border-b"
          role="tablist"
          aria-label="Account settings sections"
          style={{ borderColor: "var(--dg-brown-border)" }}
        >
          {(
            [
              ["billing", "Plan & Billing"],
              ["profile", "Profile & Security"],
              ["support", "Support"],
            ] as const
          ).map(([id, label]) => {
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                id={`account-tab-${id}`}
                aria-controls={`account-tabpanel-${id}`}
                onClick={() => setActiveTab(id)}
                className="-mb-px border-b-2 px-3 py-3 text-sm font-semibold transition-colors sm:px-4"
                style={{
                  fontFamily: sans,
                  borderColor: isActive
                    ? "var(--dg-brown-outline)"
                    : "transparent",
                  color: isActive
                    ? "var(--dg-brown-dark)"
                    : "var(--dg-brown-muted)",
                  backgroundColor: isActive
                    ? "color-mix(in srgb, var(--dg-cream) 55%, transparent)"
                    : "transparent",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="mt-6 space-y-5">
          {activeTab === "billing" ? (
            <div
              id="account-tabpanel-billing"
              role="tabpanel"
              aria-labelledby="account-tab-billing"
              className="space-y-5"
            >
              {billingLoading ? (
                <div
                  className="space-y-3"
                  aria-busy="true"
                  aria-label="Loading billing status"
                >
                  <div className={`h-36 w-full ${shimmerBar}`} />
                  <div className={`h-24 w-full ${shimmerBar}`} />
                  <div className={`h-28 w-full ${shimmerBar}`} />
                  <div className={`h-32 w-full ${shimmerBar}`} />
                </div>
              ) : null}

              {!billingLoading ? (
                <div className="flex flex-col gap-3">
                  {billingSnapshot ? (
                <div
                  className="rounded-xl border p-5 shadow-[0_2px_8px_color-mix(in_srgb,var(--dg-brown-dark)_8%,transparent)]"
                  style={{
                    borderColor: "var(--dg-brown-outline)",
                    backgroundColor: "var(--dg-cream)",
                  }}
                >
                  <p
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}
                  >
                    Current plan
                  </p>
                  <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <p
                      className="text-2xl font-bold leading-tight"
                      style={{
                        fontFamily: serif,
                        color: "var(--dg-brown-dark)",
                      }}
                    >
                      {getTierDisplayName(billingSnapshot.tier)}
                    </p>
                    <div className="flex flex-wrap gap-6 sm:gap-10">
                      <div>
                        <p
                          className="text-xs font-medium"
                          style={{
                            fontFamily: sans,
                            color: "var(--dg-brown-muted)",
                          }}
                        >
                          Monthly credits
                        </p>
                        <p
                          className="mt-0.5 text-xl font-semibold tabular-nums"
                          style={{
                            fontFamily: serif,
                            color: "var(--dg-brown-dark)",
                          }}
                        >
                          {billingSnapshot.subscriptionCredits}
                        </p>
                      </div>
                      <div>
                        <p
                          className="text-xs font-medium"
                          style={{
                            fontFamily: sans,
                            color: "var(--dg-brown-muted)",
                          }}
                        >
                          Add-on credits
                        </p>
                        <p
                          className="mt-0.5 text-xl font-semibold tabular-nums"
                          style={{
                            fontFamily: serif,
                            color: "var(--dg-brown-dark)",
                          }}
                        >
                          {billingSnapshot.addonCredits}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p
                        className="text-sm tabular-nums"
                        style={{
                          fontFamily: sans,
                          color: "var(--dg-brown-dark)",
                        }}
                      >
                        {usedThisCycle} of {cycleAllocation} used this cycle
                      </p>
                    </div>
                    <div
                      className="mt-2 h-2.5 w-full overflow-hidden rounded-full"
                      style={{
                        backgroundColor:
                          "color-mix(in srgb, var(--dg-brown-border) 45%, transparent)",
                      }}
                      role="progressbar"
                      aria-valuenow={usagePercent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Subscription credits used this cycle"
                    >
                      <div
                        className="h-full rounded-full transition-[width]"
                        style={{
                          width: `${usagePercent}%`,
                          backgroundColor: "var(--dg-brown-outline)",
                        }}
                      />
                    </div>
                    {resetOnLabel ? (
                      <p
                        className="mt-2 text-xs"
                        style={{
                          fontFamily: sans,
                          color: "var(--dg-brown-muted)",
                        }}
                      >
                        Resets on {resetOnLabel}
                      </p>
                    ) : (
                      <p
                        className="mt-2 text-xs"
                        style={{
                          fontFamily: sans,
                          color: "var(--dg-brown-muted)",
                        }}
                      >
                        Billing cycle dates will appear once your subscription is
                        active.
                      </p>
                    )}
                  </div>
                </div>
                  ) : null}

                  {billingError ? (
                    <p
                      className="text-sm"
                      style={{ fontFamily: sans, color: "var(--dg-danger)" }}
                    >
                      {billingError}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <Link
                      href="/onboarding?plans=1"
                      className="inline-flex shrink-0 items-center rounded-md border px-4 py-2 text-sm font-semibold transition-opacity"
                      style={{
                        fontFamily: sans,
                        borderColor: "var(--dg-brown-outline)",
                        color: "var(--dg-brown-dark)",
                      }}
                    >
                      Change plan
                    </Link>
                    <button
                      type="button"
                      disabled={billingWorking !== null}
                      onClick={() => void openBillingPortal()}
                      className="rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                      style={{
                        fontFamily: sans,
                        borderColor: "var(--dg-brown-border)",
                        color: "var(--dg-brown-dark)",
                      }}
                    >
                      {billingWorking === "portal"
                        ? "Opening…"
                        : "Manage payment method"}
                    </button>
                    <button
                      type="button"
                      disabled={
                        billingWorking !== null ||
                        !canCancelViaStripe
                      }
                      onClick={() => setCancelModalOpen(true)}
                      className="text-sm underline underline-offset-2 transition-colors disabled:opacity-40 text-[color:var(--dg-brown-muted)] hover:text-[color:var(--dg-danger)] disabled:no-underline"
                      style={{
                        fontFamily: sans,
                      }}
                      title={
                        !canCancelViaStripe
                          ? "Requires an active subscription billed through Stripe."
                          : undefined
                      }
                    >
                      {billingWorking === "cancel_portal"
                        ? "Opening…"
                        : "Cancel subscription"}
                    </button>
                  </div>
                </div>
              ) : null}

              <div>
                <p
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}
                >
                  Credit activity
                </p>
                {usageLogPreview.length > 0 ? (
                  <ul className="mt-3 divide-y rounded-md border" style={{ borderColor: "var(--dg-brown-border)", backgroundColor: "var(--dg-parchment)" }}>
                    {usageLogPreview.map((row) => (
                      <li
                        key={row.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-2.5 text-sm"
                        style={{ fontFamily: sans, color: "var(--dg-brown-dark)" }}
                      >
                        <span>{creditActionDescription(row.action_type)}</span>
                        <span className="tabular-nums text-[var(--dg-brown-mid)]">
                          · {ledgerCreditsCharged(row)} credits ·{" "}
                          {formatLedgerDay(row.created_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <>
                    {/* TODO: Remove placeholder once usage_debit ledger rows reliably reflect activity */}
                    <p
                      className="mt-3 rounded-md border px-3 py-3 text-sm"
                      style={{
                        fontFamily: sans,
                        color: "var(--dg-brown-muted)",
                        borderColor: "var(--dg-brown-border)",
                        backgroundColor: "var(--dg-parchment)",
                      }}
                    >
                      Credit activity tracking coming soon
                    </p>
                  </>
                )}
              </div>

              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}
                  >
                    Billing history
                  </p>
                  {/* TODO: Wire Stripe invoice list + hosted_invoice_url PDF downloads; enable View all */}
                  <span
                    className="text-xs opacity-50"
                    style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}
                  >
                    View all
                  </span>
                </div>
                <div
                  className="mt-3 rounded-md border px-3 py-6 text-center text-sm"
                  style={{
                    fontFamily: sans,
                    color: "var(--dg-brown-muted)",
                    borderColor: "var(--dg-brown-border)",
                    backgroundColor: "var(--dg-parchment)",
                  }}
                >
                  Billing history coming soon
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  disabled={billingWorking !== null}
                  onClick={() => void requestAccountDeletion()}
                  className="text-sm underline underline-offset-2 transition-colors disabled:opacity-50 text-[color:var(--dg-brown-muted)] hover:text-[color:var(--dg-danger)]"
                  style={{
                    fontFamily: sans,
                  }}
                >
                  {billingWorking === "delete_account"
                    ? "Submitting…"
                    : "Request account deletion"}
                </button>
              </div>
            </div>
          ) : null}

          {activeTab === "profile" ? (
            <div
              id="account-tabpanel-profile"
              role="tabpanel"
              aria-labelledby="account-tab-profile"
              className="space-y-6"
            >
              {identityLoading ? (
                <div
                  className="space-y-4"
                  aria-busy="true"
                  aria-label="Loading profile"
                >
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className={`h-10 w-full ${shimmerBar}`} />
                    <div className={`h-10 w-full ${shimmerBar}`} />
                  </div>
                  <div className={`h-24 w-full max-w-md ${shimmerBar}`} />
                </div>
              ) : (
                <>
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <p
                        className="mb-1 text-xs font-semibold uppercase tracking-wide"
                        style={{
                          fontFamily: sans,
                          color: "var(--dg-brown-muted)",
                        }}
                      >
                        Full name
                      </p>
                      <div className="flex flex-wrap items-stretch gap-2">
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="min-w-0 flex-1 rounded-md px-3 py-2"
                          style={{
                            fontFamily: sans,
                            border: "1px solid var(--dg-brown-border)",
                            backgroundColor: "var(--dg-cream)",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => void updateFullName()}
                          disabled={identityWorking !== null}
                          className="shrink-0 rounded-md border px-3 py-2 text-sm font-semibold sm:px-4"
                          style={{
                            fontFamily: sans,
                            borderColor: "var(--dg-brown-border)",
                            color: "var(--dg-brown-dark)",
                          }}
                        >
                          {identityWorking === "profile"
                            ? "Saving…"
                            : "Save name"}
                        </button>
                      </div>
                    </div>
                    <div>
                      <p
                        className="mb-1 text-xs font-semibold uppercase tracking-wide"
                        style={{
                          fontFamily: sans,
                          color: "var(--dg-brown-muted)",
                        }}
                      >
                        Email
                      </p>
                      <div className="flex flex-wrap items-stretch gap-2">
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="min-w-0 flex-1 rounded-md px-3 py-2"
                          style={{
                            fontFamily: sans,
                            border: "1px solid var(--dg-brown-border)",
                            backgroundColor: "var(--dg-cream)",
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => void updateEmail()}
                          disabled={identityWorking !== null}
                          className="shrink-0 rounded-md border px-3 py-2 text-sm font-semibold sm:px-4"
                          style={{
                            fontFamily: sans,
                            borderColor: "var(--dg-brown-border)",
                            color: "var(--dg-brown-dark)",
                          }}
                        >
                          {identityWorking === "email"
                            ? "Sending…"
                            : "Update email"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {identityMessage ? (
                    <p
                      className="text-sm"
                      style={{
                        fontFamily: sans,
                        color: "var(--dg-brown-dark)",
                      }}
                    >
                      {identityMessage}
                    </p>
                  ) : null}
                  {identityError ? (
                    <p
                      className="text-sm"
                      style={{
                        fontFamily: sans,
                        color: "var(--dg-danger)",
                      }}
                    >
                      {identityError}
                    </p>
                  ) : null}

                  <div
                    className="border-t pt-6"
                    style={{ borderColor: "var(--dg-brown-border)" }}
                  />

                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p
                          className="mb-1 text-xs font-semibold uppercase tracking-wide"
                          style={{
                            fontFamily: sans,
                            color: "var(--dg-brown-muted)",
                          }}
                        >
                          New password
                        </p>
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="w-full rounded-md px-3 py-2"
                          style={{
                            fontFamily: sans,
                            border: "1px solid var(--dg-brown-border)",
                            backgroundColor: "var(--dg-cream)",
                          }}
                        />
                      </div>
                      <div>
                        <p
                          className="mb-1 text-xs font-semibold uppercase tracking-wide"
                          style={{
                            fontFamily: sans,
                            color: "var(--dg-brown-muted)",
                          }}
                        >
                          Confirm password
                        </p>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full rounded-md px-3 py-2"
                          style={{
                            fontFamily: sans,
                            border: "1px solid var(--dg-brown-border)",
                            backgroundColor: "var(--dg-cream)",
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void updatePassword()}
                        disabled={identityWorking !== null}
                        className="rounded-md border px-4 py-2 text-sm font-semibold"
                        style={{
                          fontFamily: sans,
                          borderColor: "var(--dg-brown-border)",
                          color: "var(--dg-brown-dark)",
                        }}
                      >
                        {identityWorking === "profile"
                          ? "Saving…"
                          : "Update password"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {activeTab === "support" ? (
            <div
              id="account-tabpanel-support"
              role="tabpanel"
              aria-labelledby="account-tab-support"
              className="space-y-6"
            >
              <div>
                <p
                  className="mb-1 text-xs font-semibold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}
                >
                  Topic
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={supportTopic}
                    onChange={(e) =>
                      setSupportTopic(
                        e.target.value as
                          | "General support"
                          | "Billing question"
                          | "Bug report"
                      )
                    }
                    className="min-w-[min(100%,16rem)] flex-1 rounded-md px-3 py-2 sm:max-w-sm"
                    style={{
                      fontFamily: sans,
                      border: "1px solid var(--dg-brown-border)",
                      backgroundColor: "var(--dg-cream)",
                    }}
                  >
                    <option>General support</option>
                    <option>Billing question</option>
                    <option>Bug report</option>
                  </select>
                  <span
                    className="text-sm break-all"
                    style={{
                      fontFamily: sans,
                      color: "var(--dg-brown-mid)",
                    }}
                  >
                    {selectedSupportEmail}
                  </span>
                  <button
                    type="button"
                    onClick={() => void copyText(selectedSupportEmail, "Email")}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border"
                    style={{
                      fontFamily: sans,
                      borderColor: "var(--dg-brown-border)",
                      color: "var(--dg-brown-dark)",
                      backgroundColor: "var(--dg-cream)",
                    }}
                    aria-label="Copy selected support email"
                    title={`Copy ${selectedSupportEmail}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
              </div>
              <div>
                <p
                  className="mb-1 text-xs font-semibold uppercase tracking-wide"
                  style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}
                >
                  Message
                </p>
                <textarea
                  value={supportMessage}
                  onChange={(e) => setSupportMessage(e.target.value)}
                  rows={4}
                  placeholder={
                    supportTopic === "Bug report"
                      ? "Please include as much detail as possible: does it happen every time or only sometimes, and what steps led up to the error?"
                      : "Tell us how we can help."
                  }
                  className="w-full rounded-md px-3 py-2"
                  style={{
                    fontFamily: sans,
                    border: "1px solid var(--dg-brown-border)",
                    backgroundColor: "var(--dg-cream)",
                  }}
                />
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => void submitSupportRequest()}
                    className="rounded-md border px-4 py-2 text-sm font-semibold"
                    style={{
                      fontFamily: sans,
                      borderColor: "var(--dg-brown-border)",
                      color: "var(--dg-brown-dark)",
                    }}
                  >
                    Submit message
                  </button>
                </div>
                {supportStatus ? (
                  <p
                    className="mt-3 text-right text-sm"
                    style={{
                      fontFamily: sans,
                      color: "var(--dg-brown-dark)",
                    }}
                  >
                    {supportStatus}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {cancelModalOpen ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(61, 41, 20, 0.45)" }}
          role="presentation"
          onClick={() => setCancelModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-sub-heading"
            className="max-w-md rounded-lg border p-6 shadow-lg sm:p-8"
            style={{
              borderColor: "var(--dg-brown-border)",
              backgroundColor: "var(--dg-parchment)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="cancel-sub-heading"
              className="text-lg font-bold"
              style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}
            >
              Cancel subscription?
            </h2>
            <p
              className="mt-3 text-sm leading-relaxed"
              style={{ fontFamily: sans, color: "var(--dg-brown-mid)" }}
            >
              You&apos;ll finish cancellation in Stripe&apos;s secure billing
              portal. Subscription terms follow your plan — you may retain access
              until the end of the current billing period.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                className="rounded-md border px-4 py-2 text-sm font-semibold"
                style={{
                  fontFamily: sans,
                  borderColor: "var(--dg-brown-border)",
                  color: "var(--dg-brown-dark)",
                }}
                onClick={() => setCancelModalOpen(false)}
              >
                Keep subscription
              </button>
              <button
                type="button"
                disabled={billingWorking !== null}
                className="rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                style={{
                  fontFamily: sans,
                  borderColor: "var(--dg-brown-outline)",
                  color: "var(--dg-brown-dark)",
                }}
                onClick={() => void openCancelSubscriptionPortal()}
              >
                Continue to cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
