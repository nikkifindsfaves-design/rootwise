"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  MEMBERSHIP_TIER_ORDER,
  TIER_DEFINITIONS,
  type BillingInterval,
  type MembershipTier,
} from "@/lib/billing/config";

type BillingSnapshot = {
  hasPaidAccess: boolean;
  tier: MembershipTier;
};

const serif = "var(--font-dg-display), 'Playfair Display', Georgia, serif";
const sans = "var(--font-dg-body), Lato, sans-serif";

export default function OnboardingPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [billing, setBilling] = useState<BillingSnapshot | null>(null);
  const [selectedTier, setSelectedTier] = useState<MembershipTier>("pro");
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval>("monthly");
  const [working, setWorking] = useState<null | "checkout">(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refreshState = useCallback(async () => {
    setLoading(true);
    setError(null);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/login?signup=1");
      return;
    }

    const response = await fetch("/api/billing/status", { method: "GET" });
    const data = await response.json();
    if (!response.ok) {
      setBilling(null);
      setError(data?.error ?? "Could not load billing status.");
      setLoading(false);
      return;
    }
    setBilling((data.snapshot ?? null) as BillingSnapshot | null);
    setLoading(false);
  }, [router, supabase]);

  useEffect(() => {
    void refreshState();
  }, [refreshState]);

  useEffect(() => {
    const billingReturn = searchParams.get("billing");
    const signupState = searchParams.get("signup_state");
    const reason = searchParams.get("reason");
    if (signupState) {
      console.info("[auth] onboarding_entry_state", { signupState });
    }
    if (reason) {
      console.info("[auth] onboarding_entry_reason", { reason });
    }
    if (signupState === "requires_verification") {
      setMessage("Your account is created. Verify your email to continue.");
    } else if (signupState === "recoverable_no_session") {
      setMessage("We could not start a session automatically. Sign in or use a magic link.");
    } else if (reason === "subscription_required") {
      setMessage("Choose a membership plan to continue.");
    }

    if (billingReturn === "success" || billingReturn === "cancel") {
      if (billingReturn === "success") {
        setMessage("Payment complete. Your account is ready.");
      } else {
        setMessage("Checkout canceled. Choose a plan to continue.");
      }
      void refreshState();
    }
  }, [refreshState, searchParams]);

  const hasPlan = Boolean(billing?.hasPaidAccess);
  const tierPrices = TIER_DEFINITIONS[selectedTier].prices;
  async function openCheckout() {
    setWorking("checkout");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "subscription",
          tier: selectedTier,
          interval: selectedInterval,
          return_to: "dashboard",
        }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.url !== "string") {
        throw new Error(data?.error ?? "Could not create checkout session.");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setWorking(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}>
          Loading onboarding...
        </p>
      </div>
    );
  }

  const showPlanStep = !hasPlan;
  const showDoneStep = hasPlan;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <p
        className="text-xs font-semibold uppercase tracking-[0.18em]"
        style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}
      >
        Welcome to Dead Gossip
      </p>
      <h1
        className="mt-2 text-3xl font-semibold"
        style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}
      >
        Complete setup
      </h1>

      <div className="mt-6 rounded-lg border p-5" style={{ borderColor: "var(--dg-brown-border)", backgroundColor: "var(--dg-parchment)" }}>
        <p className="text-sm" style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}>
          Step {showPlanStep ? "2" : "4"} of 4
        </p>

        {showPlanStep ? (
          <>
            <h2 className="mt-2 text-xl font-semibold" style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}>
              Choose your membership
            </h2>
            <p className="mt-1 text-sm" style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}>
              Select a plan to unlock story generation and document analysis.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <select
                value={selectedTier}
                onChange={(e) => setSelectedTier(e.target.value as MembershipTier)}
                className="w-full rounded-md px-3 py-2"
                style={{ fontFamily: sans, border: "1px solid var(--dg-brown-border)", backgroundColor: "var(--dg-cream)" }}
              >
                {MEMBERSHIP_TIER_ORDER.map((tier) => (
                  <option key={tier} value={tier}>
                    {TIER_DEFINITIONS[tier].displayName}
                  </option>
                ))}
              </select>
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
            <button
              type="button"
              onClick={() => void openCheckout()}
              disabled={working !== null}
              className="mt-4 rounded-md px-4 py-2 text-sm font-semibold text-[var(--dg-primary-fg)]"
              style={{ fontFamily: sans, backgroundColor: "var(--dg-primary-bg)" }}
            >
              {working === "checkout" ? "Opening checkout..." : "Continue to secure checkout"}
            </button>
          </>
        ) : null}

        {showDoneStep ? (
          <>
            <h2 className="mt-2 text-xl font-semibold" style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}>
              You&apos;re all set
            </h2>
            <p className="mt-1 text-sm" style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}>
              Your account is active and ready.
            </p>
            <button
              type="button"
              onClick={() => router.replace("/dashboard")}
              className="mt-4 rounded-md px-4 py-2 text-sm font-semibold text-[var(--dg-primary-fg)]"
              style={{ fontFamily: sans, backgroundColor: "var(--dg-primary-bg)" }}
            >
              Enter dashboard
            </button>
          </>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm" style={{ fontFamily: sans, color: "var(--dg-error-text)" }}>
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-3 text-sm" style={{ fontFamily: sans, color: "var(--dg-brown-dark)" }}>
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
