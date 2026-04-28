"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TIER_DEFINITIONS, type BillingInterval, type MembershipTier } from "@/lib/billing/config";

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
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval>("monthly");
  const [checkoutTier, setCheckoutTier] = useState<MembershipTier | null>(null);
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

  async function openCheckout(tier: MembershipTier) {
    setCheckoutTier(tier);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "subscription",
          tier,
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
      setCheckoutTier(null);
    }
  }

  function formatCredits(n: number) {
    return n.toLocaleString("en-US");
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
    <div className={`mx-auto px-6 py-10 ${showPlanStep ? "max-w-7xl" : "max-w-3xl"}`}>
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
            <h2
              className="mt-2 font-semibold uppercase tracking-[0.2em]"
              style={{ fontFamily: sans, fontSize: "0.8125rem", color: "var(--dg-brown-dark)" }}
            >
              Choose your membership
            </h2>
            <p className="mt-2 max-w-xl text-sm" style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}>
              Select a plan to unlock document analysis and story generation.
            </p>

            <div className="mt-6 inline-flex rounded-md border p-1" style={{ borderColor: "var(--dg-brown-border)", backgroundColor: "var(--dg-cream)" }}>
              <button
                type="button"
                onClick={() => setSelectedInterval("monthly")}
                className="rounded px-4 py-1.5 text-sm font-semibold transition-colors"
                style={{
                  fontFamily: sans,
                  backgroundColor:
                    selectedInterval === "monthly" ? "var(--dg-primary-bg)" : "transparent",
                  color:
                    selectedInterval === "monthly"
                      ? "var(--dg-primary-fg)"
                      : "var(--dg-brown-muted)",
                }}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setSelectedInterval("annual")}
                className="rounded px-4 py-1.5 text-sm font-semibold transition-colors"
                style={{
                  fontFamily: sans,
                  backgroundColor:
                    selectedInterval === "annual" ? "var(--dg-primary-bg)" : "transparent",
                  color:
                    selectedInterval === "annual"
                      ? "var(--dg-primary-fg)"
                      : "var(--dg-brown-muted)",
                }}
              >
                Annual
                <span
                  className="ml-1.5 rounded px-1.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide"
                  style={{
                    backgroundColor:
                      selectedInterval === "annual" ? "rgba(139,100,35,0.35)" : "var(--dg-parchment-deep)",
                    color: "var(--dg-brown-dark)",
                  }}
                >
                  save 20%
                </span>
              </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {/* Curious */}
              <div
                className="relative flex flex-col rounded-lg border p-4 pt-5"
                style={{ borderColor: "var(--dg-brown-border)", backgroundColor: "var(--dg-cream)" }}
              >
                <h3 className="text-lg font-semibold" style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}>
                  Curious
                </h3>
                <div className="mt-3" style={{ fontFamily: sans, color: "var(--dg-brown-dark)" }}>
                  <span className="text-2xl font-bold">
                    ${TIER_DEFINITIONS.basic.prices[selectedInterval]}
                  </span>
                  <span className="text-sm text-[var(--dg-brown-muted)]">
                    /{selectedInterval === "monthly" ? "mo" : "yr"}
                  </span>
                </div>
                <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm" style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-[var(--dg-forest)]" aria-hidden>
                      ✓
                    </span>
                    Story generation
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-[var(--dg-forest)]" aria-hidden>
                      ✓
                    </span>
                    Manual data entry
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-[var(--dg-forest)]" aria-hidden>
                      ✓
                    </span>
                    Search & organize
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-[var(--dg-forest)]" aria-hidden>
                      ✓
                    </span>
                    {formatCredits(TIER_DEFINITIONS.basic.monthlyCredits)} credits/month
                  </li>
                </ul>
                <p className="mt-4 text-xs italic" style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}>
                  Stories only — no AI extraction.
                </p>
                <button
                  type="button"
                  onClick={() => void openCheckout("basic")}
                  disabled={checkoutTier !== null}
                  className="mt-4 w-full rounded-md border-2 px-3 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
                  style={{
                    fontFamily: sans,
                    borderColor: "var(--dg-brown-outline)",
                    color: "var(--dg-brown-dark)",
                    backgroundColor: "transparent",
                  }}
                >
                  {checkoutTier === "basic" ? "Opening checkout..." : "Select"}
                </button>
              </div>

              {/* Devoted — featured */}
              <div
                className="relative flex flex-col rounded-lg border-2 p-4 pt-5 shadow-sm"
                style={{
                  borderColor: "var(--dg-primary-bg)",
                  backgroundColor: "var(--dg-cream)",
                  boxShadow: "0 2px 12px rgb(var(--dg-shadow-rgb) / 0.12)",
                }}
              >
                <span
                  className="absolute -top-3 left-1/2 max-w-[calc(100%-1rem)] -translate-x-1/2 rounded-full px-3 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide"
                  style={{
                    fontFamily: sans,
                    backgroundColor: "color-mix(in srgb, var(--dg-primary-bg) 70%, transparent)",
                    color: "var(--dg-primary-fg)",
                  }}
                >
                  Most popular
                </span>
                <h3 className="text-lg font-semibold" style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}>
                  Devoted
                </h3>
                <div className="mt-3" style={{ fontFamily: sans, color: "var(--dg-brown-dark)" }}>
                  <span className="text-2xl font-bold">
                    ${TIER_DEFINITIONS.pro.prices[selectedInterval]}
                  </span>
                  <span className="text-sm text-[var(--dg-brown-muted)]">
                    /{selectedInterval === "monthly" ? "mo" : "yr"}
                  </span>
                </div>
                <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm" style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-[var(--dg-forest)]" aria-hidden>
                      ✓
                    </span>
                    Everything in Curious
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-[var(--dg-forest)]" aria-hidden>
                      ✓
                    </span>
                    AI extraction
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-[var(--dg-forest)]" aria-hidden>
                      ✓
                    </span>
                    {formatCredits(TIER_DEFINITIONS.pro.monthlyCredits)} credits/month
                  </li>
                </ul>
                <button
                  type="button"
                  onClick={() => void openCheckout("pro")}
                  disabled={checkoutTier !== null}
                  className="mt-8 w-full rounded-md px-3 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
                  style={{
                    fontFamily: sans,
                    backgroundColor: "var(--dg-primary-bg)",
                    color: "var(--dg-primary-fg)",
                  }}
                >
                  {checkoutTier === "pro" ? "Opening checkout..." : "Get started"}
                </button>
              </div>

              {/* Obsessed */}
              <div
                className="relative flex flex-col rounded-lg border p-4 pt-5"
                style={{ borderColor: "var(--dg-brown-border)", backgroundColor: "var(--dg-cream)" }}
              >
                <h3 className="text-lg font-semibold" style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}>
                  Obsessed
                </h3>
                <div className="mt-3" style={{ fontFamily: sans, color: "var(--dg-brown-dark)" }}>
                  <span className="text-2xl font-bold">
                    ${TIER_DEFINITIONS.max.prices[selectedInterval]}
                  </span>
                  <span className="text-sm text-[var(--dg-brown-muted)]">
                    /{selectedInterval === "monthly" ? "mo" : "yr"}
                  </span>
                </div>
                <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm" style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-[var(--dg-forest)]" aria-hidden>
                      ✓
                    </span>
                    Everything in Devoted
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-[var(--dg-forest)]" aria-hidden>
                      ✓
                    </span>
                    {formatCredits(TIER_DEFINITIONS.max.monthlyCredits)} credits/month
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-[var(--dg-forest)]" aria-hidden>
                      ✓
                    </span>
                    Exclusive early access to new features
                  </li>
                </ul>
                <button
                  type="button"
                  onClick={() => void openCheckout("max")}
                  disabled={checkoutTier !== null}
                  className="mt-8 w-full rounded-md border-2 px-3 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
                  style={{
                    fontFamily: sans,
                    borderColor: "var(--dg-brown-outline)",
                    color: "var(--dg-brown-dark)",
                    backgroundColor: "transparent",
                  }}
                >
                  {checkoutTier === "max" ? "Opening checkout..." : "Select"}
                </button>
              </div>

              {/* Possessed */}
              <div
                className="relative flex flex-col rounded-lg border p-4 pt-5"
                style={{ borderColor: "var(--dg-brown-border)", backgroundColor: "var(--dg-cream)" }}
              >
                <h3 className="text-lg font-semibold" style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}>
                  Possessed
                </h3>
                <div className="mt-3" style={{ fontFamily: sans, color: "var(--dg-brown-dark)" }}>
                  <span className="text-2xl font-bold">
                    ${TIER_DEFINITIONS.possessed.prices[selectedInterval]}
                  </span>
                  <span className="text-sm text-[var(--dg-brown-muted)]">
                    /{selectedInterval === "monthly" ? "mo" : "yr"}
                  </span>
                </div>
                <ul className="mt-4 flex flex-1 flex-col gap-2 text-sm" style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-[var(--dg-forest)]" aria-hidden>
                      ✓
                    </span>
                    Everything in Obsessed
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-[var(--dg-forest)]" aria-hidden>
                      ✓
                    </span>
                    {formatCredits(TIER_DEFINITIONS.possessed.monthlyCredits)} credits/month
                  </li>
                  <li className="flex gap-2">
                    <span className="mt-0.5 shrink-0 text-[var(--dg-forest)]" aria-hidden>
                      ✓
                    </span>
                    Best per-credit rate
                  </li>
                </ul>
                <button
                  type="button"
                  onClick={() => void openCheckout("possessed")}
                  disabled={checkoutTier !== null}
                  className="mt-8 w-full rounded-md border-2 px-3 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
                  style={{
                    fontFamily: sans,
                    borderColor: "var(--dg-brown-outline)",
                    color: "var(--dg-brown-dark)",
                    backgroundColor: "transparent",
                  }}
                >
                  {checkoutTier === "possessed" ? "Opening checkout..." : "Select"}
                </button>
              </div>
            </div>
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
