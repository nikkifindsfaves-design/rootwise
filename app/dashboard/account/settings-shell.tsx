"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getTierDisplayName,
  MEMBERSHIP_TIER_ORDER,
  TIER_DEFINITIONS,
  type BillingInterval,
  type MembershipTier,
} from "@/lib/billing/config";

const serif = "var(--font-dg-display), 'Playfair Display', Georgia, serif";
const sans = "var(--font-dg-body), Lato, sans-serif";

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
  const [billingWorking, setBillingWorking] = useState<
    null | "subscription" | "portal" | "pilot_grant" | "delete_account"
  >(null);
  const [selectedTier, setSelectedTier] = useState<MembershipTier>("pro");
  const [selectedInterval, setSelectedInterval] =
    useState<BillingInterval>("monthly");
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

  async function refreshBilling() {
    setBillingLoading(true);
    try {
      const response = await fetch("/api/billing/status", { method: "GET" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Could not load billing status.");
      }
      setBillingSnapshot(data.snapshot ?? null);
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

  async function openCheckout() {
    setBillingWorking("subscription");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "subscription",
          tier: selectedTier,
          interval: selectedInterval,
        }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") {
        throw new Error(data?.error ?? "Could not create checkout session.");
      }
      window.location.href = data.url;
    } catch (error) {
      setBillingError(
        error instanceof Error ? error.message : "Could not create checkout session."
      );
    } finally {
      setBillingWorking(null);
    }
  }

  async function openBillingPortal() {
    setBillingWorking("portal");
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
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

  async function requestPilotGrant() {
    setBillingWorking("pilot_grant");
    try {
      const response = await fetch("/api/pilot/grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grant_credits: 350 }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? "Could not apply pilot credits.");
      }
      await refreshBilling();
    } catch (error) {
      setBillingError(
        error instanceof Error ? error.message : "Could not apply pilot credits."
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

  const tierPrices = TIER_DEFINITIONS[selectedTier].prices;
  const activeTier = billingSnapshot?.tier ?? "basic";
  const activeMonthlyCredits =
    TIER_DEFINITIONS[activeTier as MembershipTier].monthlyCredits;
  const selectedMonthlyCredits = TIER_DEFINITIONS[selectedTier].monthlyCredits;
  const upgradeDeltaMonthly = Math.max(
    0,
    selectedMonthlyCredits - activeMonthlyCredits
  );
  const currentPeriodEndMs = billingSnapshot?.currentPeriodEnd
    ? Date.parse(billingSnapshot.currentPeriodEnd)
    : NaN;
  const remainingFraction =
    Number.isFinite(currentPeriodEndMs) && currentPeriodEndMs > Date.now()
      ? Math.min(
          1,
          Math.max(
            0,
            (currentPeriodEndMs - Date.now()) /
              (selectedInterval === "annual"
                ? 365 * 24 * 60 * 60 * 1000
                : 30 * 24 * 60 * 60 * 1000)
          )
        )
      : 0;
  const proratedUpgradePreview = Math.floor(upgradeDeltaMonthly * remainingFraction);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1
          className="text-2xl font-bold sm:text-3xl"
          style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}
        >
          Account Settings
        </h1>
        <Link
          href="/dashboard"
          className="text-sm underline underline-offset-2"
          style={{ fontFamily: sans, color: "var(--dg-brown-outline)" }}
        >
          Back to dashboard
        </Link>
      </div>

      <section
        className="rounded-lg border p-6"
        style={{
          borderColor: "var(--dg-brown-border)",
          backgroundColor: "var(--dg-parchment)",
        }}
      >
        <p className="text-sm" style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}>
          Manage your membership, payment details, and account settings.
        </p>
        {billingLoading ? (
          <p className="mt-3 text-sm" style={{ fontFamily: sans, color: "var(--dg-brown-mid)" }}>
            Loading billing status…
          </p>
        ) : null}

        {billingSnapshot ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-3" style={{ borderColor: "var(--dg-brown-border)", backgroundColor: "var(--dg-cream)" }}>
              <p style={{ fontFamily: sans, fontSize: "0.75rem", color: "var(--dg-brown-muted)" }}>Plan</p>
              <p style={{ fontFamily: serif, fontSize: "1.05rem", color: "var(--dg-brown-dark)" }}>{getTierDisplayName(billingSnapshot.tier)}</p>
            </div>
            <div className="rounded-md border p-3" style={{ borderColor: "var(--dg-brown-border)", backgroundColor: "var(--dg-cream)" }}>
              <p style={{ fontFamily: sans, fontSize: "0.75rem", color: "var(--dg-brown-muted)" }}>Monthly credits</p>
              <p style={{ fontFamily: serif, fontSize: "1.05rem", color: "var(--dg-brown-dark)" }}>{billingSnapshot.subscriptionCredits}</p>
            </div>
            <div className="rounded-md border p-3" style={{ borderColor: "var(--dg-brown-border)", backgroundColor: "var(--dg-cream)" }}>
              <p style={{ fontFamily: sans, fontSize: "0.75rem", color: "var(--dg-brown-muted)" }}>Add-on credits</p>
              <p style={{ fontFamily: serif, fontSize: "1.05rem", color: "var(--dg-brown-dark)" }}>{billingSnapshot.addonCredits}</p>
            </div>
          </div>
        ) : null}
        {billingReturn === "success" ? (
          <p className="mt-3 text-sm" style={{ fontFamily: sans, color: "var(--dg-brown-dark)" }}>
            Checkout completed. Billing status has been refreshed.
          </p>
        ) : null}
        {billingReturn === "cancel" ? (
          <p className="mt-3 text-sm" style={{ fontFamily: sans, color: "var(--dg-brown-mid)" }}>
            Checkout was canceled, so no billing changes were applied.
          </p>
        ) : null}

        {billingError ? (
          <p className="mt-3 text-sm" style={{ fontFamily: sans, color: "var(--dg-danger)" }}>
            {billingError}
          </p>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}>
              Membership tier
            </p>
            <select
              value={selectedTier}
              onChange={(e) => setSelectedTier(e.target.value as MembershipTier)}
              className="w-full rounded-md px-3 py-2"
              style={{ fontFamily: sans, border: "1px solid var(--dg-brown-border)", backgroundColor: "var(--dg-cream)" }}
            >
              {MEMBERSHIP_TIER_ORDER.map((tier) => (
                <option key={tier} value={tier}>
                  {getTierDisplayName(tier)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}>
              Billing interval
            </p>
            <select
              value={selectedInterval}
              onChange={(e) => setSelectedInterval(e.target.value as BillingInterval)}
              className="w-full rounded-md px-3 py-2"
              style={{ fontFamily: sans, border: "1px solid var(--dg-brown-border)", backgroundColor: "var(--dg-cream)" }}
            >
              <option value="monthly">Monthly (${tierPrices.monthly}/mo)</option>
              <option value="annual">Annual (${tierPrices.annual}/yr)</option>
            </select>
          </div>
        </div>

        <div className="mt-3">
          <button
            type="button"
            disabled={billingWorking !== null}
            onClick={() => void openCheckout()}
            className="rounded-md border px-4 py-2 text-sm font-semibold"
            style={{ fontFamily: sans, borderColor: "var(--dg-brown-outline)", color: "var(--dg-brown-dark)" }}
          >
            {billingWorking === "subscription" ? "Opening checkout…" : "Upgrade membership"}
          </button>
          {billingSnapshot?.hasPaidAccess && upgradeDeltaMonthly > 0 ? (
            <p className="mt-2 text-sm" style={{ fontFamily: sans, color: "var(--dg-brown-mid)" }}>
              Upgrade preview: about {proratedUpgradePreview} non-expiring add-on credits now, then{" "}
              {selectedMonthlyCredits} monthly credits at your next billing reset.
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={billingWorking !== null}
            onClick={() => void openBillingPortal()}
            className="rounded-md border px-4 py-2 text-sm font-semibold"
            style={{ fontFamily: sans, borderColor: "var(--dg-brown-border)", color: "var(--dg-brown-dark)" }}
          >
            {billingWorking === "portal" ? "Opening portal…" : "Update payment info"}
          </button>
          <button
            type="button"
            disabled={billingWorking !== null}
            onClick={() => void requestPilotGrant()}
            className="rounded-md border px-4 py-2 text-sm font-semibold"
            style={{ fontFamily: sans, borderColor: "var(--dg-brown-border)", color: "var(--dg-brown-dark)" }}
          >
            {billingWorking === "pilot_grant" ? "Applying…" : "Apply pilot credits"}
          </button>
          <button
            type="button"
            disabled={billingWorking !== null}
            onClick={() => void requestAccountDeletion()}
            className="rounded-md border px-4 py-2 text-sm font-semibold"
            style={{ fontFamily: sans, borderColor: "var(--dg-brown-border)", color: "var(--dg-brown-dark)" }}
          >
            {billingWorking === "delete_account"
              ? "Submitting…"
              : "Request account deletion"}
          </button>
        </div>

        <hr className="my-6 border-[var(--dg-brown-border)]/60" />

        <h2
          className="text-xl font-bold"
          style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}
        >
          Profile and sign-in
        </h2>
        <p
          className="mt-1 text-sm"
          style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}
        >
          Update the name and email used on your account.
        </p>

        {identityLoading ? (
          <p
            className="mt-3 text-sm"
            style={{ fontFamily: sans, color: "var(--dg-brown-mid)" }}
          >
            Loading profile…
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <p
                className="mb-1 text-xs font-semibold uppercase tracking-wide"
                style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}
              >
                Full name
              </p>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md px-3 py-2"
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
                className="mt-2 rounded-md border px-4 py-2 text-sm font-semibold"
                style={{
                  fontFamily: sans,
                  borderColor: "var(--dg-brown-border)",
                  color: "var(--dg-brown-dark)",
                }}
              >
                {identityWorking === "profile" ? "Saving…" : "Save name"}
              </button>
            </div>
            <div>
              <p
                className="mb-1 text-xs font-semibold uppercase tracking-wide"
                style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}
              >
                Email
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md px-3 py-2"
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
                className="mt-2 rounded-md border px-4 py-2 text-sm font-semibold"
                style={{
                  fontFamily: sans,
                  borderColor: "var(--dg-brown-border)",
                  color: "var(--dg-brown-dark)",
                }}
              >
                {identityWorking === "email" ? "Sending…" : "Update email"}
              </button>
            </div>
          </div>
        )}

        {identityMessage ? (
          <p
            className="mt-3 text-sm"
            style={{ fontFamily: sans, color: "var(--dg-brown-dark)" }}
          >
            {identityMessage}
          </p>
        ) : null}
        {identityError ? (
          <p
            className="mt-2 text-sm"
            style={{ fontFamily: sans, color: "var(--dg-danger)" }}
          >
            {identityError}
          </p>
        ) : null}

        <hr className="my-6 border-[var(--dg-brown-border)]/60" />

        <h2
          className="text-xl font-bold"
          style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}
        >
          Security
        </h2>
        <p
          className="mt-1 text-sm"
          style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}
        >
          Change your account password.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p
              className="mb-1 text-xs font-semibold uppercase tracking-wide"
              style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}
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
              style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}
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
        <button
          type="button"
          onClick={() => void updatePassword()}
          disabled={identityWorking !== null}
          className="mt-2 rounded-md border px-4 py-2 text-sm font-semibold"
          style={{
            fontFamily: sans,
            borderColor: "var(--dg-brown-border)",
            color: "var(--dg-brown-dark)",
          }}
        >
          {identityWorking === "profile" ? "Saving…" : "Update password"}
        </button>

        <hr className="my-6 border-[var(--dg-brown-border)]/60" />

        <h2
          className="text-xl font-bold"
          style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}
        >
          How can we help?
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <p
              className="mb-1 text-xs font-semibold uppercase tracking-wide"
              style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}
            >
              Topic
            </p>
            <div className="flex items-center gap-2">
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
                className="w-full rounded-md px-3 py-2"
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
              <button
                type="button"
                onClick={() => void copyText(selectedSupportEmail, "Email")}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border"
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
            <p
              className="mt-1 text-xs"
              style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}
            >
              {selectedSupportEmail}
            </p>
          </div>
        </div>
        <div className="mt-3">
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
          <div className="mt-2 flex flex-wrap gap-2">
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
              className="mt-2 text-sm"
              style={{ fontFamily: sans, color: "var(--dg-brown-dark)" }}
            >
              {supportStatus}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
