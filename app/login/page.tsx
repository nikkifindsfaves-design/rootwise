"use client";

import {
  FormEvent,
  Suspense,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  classifySignupOutcome,
  type SignupOutcomeState,
} from "@/lib/auth/signup-outcome";

const leftBg = "#100d0b";
const goldMuted = "#a08060";
const cream = "var(--dg-cream)";
const creamMuted = "color-mix(in srgb, var(--dg-cream) 72%, transparent)";

function GoldDots() {
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      <span className="h-2 w-2 rounded-full bg-[#8b6b3a]" />
      <span className="h-2 w-2 rounded-full bg-[#c4a882]" />
      <span className="h-2 w-2 rounded-full bg-[#e8dcc8]" />
    </div>
  );
}

function LeftPanel() {
  return (
    <div
      className="dg-login-left-panel flex min-w-0 flex-col px-6 py-8 text-[color:var(--dg-cream)] sm:px-8 sm:py-10 lg:min-h-[100dvh] lg:px-12 lg:py-12"
      style={{ backgroundColor: leftBg }}
    >
      <header className="mb-8 flex w-full shrink-0 items-start justify-between gap-4 sm:mb-10 lg:mb-10">
        <div className="min-w-0 flex-1">
          <p
            className="text-[clamp(1.75rem,5vw+0.5rem,2.75rem)] leading-[1.05] tracking-tight sm:text-4xl"
            style={{ fontFamily: "var(--font-playfair), Georgia, serif" }}
          >
            Dead Gossip
          </p>
          <p
            className="mt-2 text-sm italic sm:text-base"
            style={{ color: creamMuted }}
          >
            The good, the bad, the buried.
          </p>
          <p
            className="mt-8 text-[0.65rem] font-semibold uppercase tracking-[0.2em]"
            style={{ color: "var(--dg-paper-border)" }}
          >
            AI-powered genealogy
          </p>
        </div>
        <Link
          href="/learn-more"
          className="dg-login-learn-more-pill shrink-0 rounded-full px-3.5 py-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] transition hover:opacity-[0.92] active:opacity-[0.88]"
          style={{
            alignSelf: "flex-start",
            border: `1px solid ${goldMuted}`,
            color: "var(--dg-paper-border)",
            backgroundColor: "rgba(255, 252, 247 / 0.06)",
          }}
        >
          Learn more
        </Link>
      </header>

      <div className="-mt-[40px] flex min-w-0 shrink-0 flex-col gap-8 py-2 sm:-mt-[70px] sm:gap-10 sm:py-4 lg:gap-10 lg:py-6">
        <div className="min-w-0">
          <h1
            className="mt-3 max-w-xl text-2xl leading-[1.12] text-balance sm:text-3xl md:text-4xl lg:text-[2.35rem] lg:leading-[1.15]"
            style={{
              fontFamily: "var(--font-heirloom-body), Georgia, serif",
              color: cream,
            }}
          >
            Your family had secrets. Find them.
          </h1>
          <p
            className="mt-4 max-w-md text-sm leading-relaxed sm:text-[0.9375rem]"
            style={{ color: creamMuted }}
          >
            Dead Gossip turns historical records, census files and handwritten
            documents into stories your family actually wants to read.
          </p>
        </div>

        <ol className="max-w-lg min-w-0 space-y-8">
          <li className="flex gap-3 sm:gap-4">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              style={{
                border: `1px solid ${goldMuted}`,
                color: "var(--dg-paper-border)",
              }}
            >
              1
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[color:var(--dg-cream)]">
                Stories in your voice
              </h2>
              <p
                className="mt-1.5 text-sm leading-relaxed"
                style={{ color: creamMuted }}
              >
                Choose how your ancestors are narrated — from cold case file to
                scandalous reveal
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[
                  "Case File",
                  "Dead Gossip",
                  "Hearthside",
                  "Southern Gothic",
                  "Gen Z",
                ].map(
                  (label) => (
                    <span
                      key={label}
                      className="rounded-full border px-2.5 py-0.5 text-[0.65rem] font-medium uppercase tracking-wide"
                      style={{
                        borderColor: goldMuted,
                        color: "var(--dg-paper-border)",
                        backgroundColor: "rgb(255 252 247 / 0.06)",
                      }}
                    >
                      {label}
                    </span>
                  ),
                )}
              </div>
            </div>
          </li>
          <li className="flex gap-3 sm:gap-4">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              style={{
                border: `1px solid ${goldMuted}`,
                color: "var(--dg-paper-border)",
              }}
            >
              2
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[color:var(--dg-cream)]">
                Upload any document
              </h2>
              <p
                className="mt-1.5 text-sm leading-relaxed"
                style={{ color: creamMuted }}
              >
                Census records, land deeds, church registers. AI reads them so
                you don&apos;t have to squint.
              </p>
            </div>
          </li>
          <li className="flex gap-3 sm:gap-4">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              style={{
                border: `1px solid ${goldMuted}`,
                color: "var(--dg-paper-border)",
              }}
            >
              3
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[color:var(--dg-cream)]">
                A canvas that fits the story
              </h2>
              <p
                className="mt-1.5 text-sm leading-relaxed"
                style={{ color: creamMuted }}
              >
                Evidence Board, Dead Gossip, Heirloom — three visual worlds for
                your family tree.
              </p>
            </div>
          </li>
        </ol>
      </div>

      <p
        className="mt-[2px] shrink-0 text-balance text-xs italic leading-relaxed sm:mt-[10px] lg:-mt-[6px]"
        style={{ color: creamMuted }}
      >
        Built by a genealogist, for people who think family history should be
        more interesting than a spreadsheet.
      </p>
    </div>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const signInMode = searchParams.get("signin") === "1";
  const signUpMode = searchParams.get("signup") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [signupState, setSignupState] =
    useState<SignupOutcomeState>("signup_idle");

  const [wlName, setWlName] = useState("");
  const [wlEmail, setWlEmail] = useState("");
  const [wlInterest, setWlInterest] = useState("");
  const [wlSubmitting, setWlSubmitting] = useState(false);
  const [wlError, setWlError] = useState<string | null>(null);
  const [wlSuccess, setWlSuccess] = useState(false);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setIsAuthLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsAuthLoading(false);

    if (signInError) {
      setAuthError(signInError.message);
      return;
    }

    router.push("/dashboard");
  }

  async function resendVerificationForSignup() {
    setAuthError(null);
    setAuthSuccess(null);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/onboarding`,
      },
    });
    if (error) {
      setAuthError(error.message);
      return;
    }
    setAuthSuccess("Verification email sent. Use the link, then continue.");
  }

  async function sendMagicLinkForSignup() {
    setAuthError(null);
    setAuthSuccess(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/onboarding`,
      },
    });
    if (error) {
      setAuthError(error.message);
      return;
    }
    setAuthSuccess("Magic link sent. Open it to continue onboarding.");
  }

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setIsAuthLoading(true);
    setSignupState("signup_submitting");

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        },
        emailRedirectTo: `${window.location.origin}/onboarding`,
      },
    });

    const outcome = classifySignupOutcome({
      hasSession: Boolean(data.session),
      hasUser: Boolean(data.user),
      error,
      confirmEmailFallback: false,
    });
    console.info("[auth] signup_outcome", {
      outcome,
      hasSession: Boolean(data.session),
      hasUser: Boolean(data.user),
      code: error?.code ?? null,
      message: error?.message ?? null,
    });

    setIsAuthLoading(false);
    setSignupState(outcome);
    if (error) {
      setAuthError(error.message);
      return;
    }

    if (outcome === "signup_success_with_session") {
      router.push("/onboarding?signup_state=session");
      return;
    }

    if (outcome === "signup_requires_verification") {
      setAuthSuccess("Account created. Verify your email to continue.");
      return;
    }
    if (outcome === "signup_rate_limited") {
      setAuthError("Too many attempts right now. Please wait a minute and retry.");
      return;
    }
    if (outcome === "signup_recoverable_no_session") {
      setAuthError("Your account exists, but we could not start your session.");
      return;
    }

    setAuthError("Signup could not complete. Please retry.");
  }

  async function handleWaitlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWlError(null);
    setWlSubmitting(true);

    const normalizedEmail = wlEmail.trim().toLowerCase();
    const { error } = await supabase.from("waitlist").insert({
      name: wlName.trim(),
      email: normalizedEmail,
      research_interest: wlInterest.trim() || null,
      status: "requested",
    });

    setWlSubmitting(false);

    if (error) {
      const dup =
        error.code === "23505" ||
        /duplicate key|unique constraint/i.test(error.message ?? "");
      if (dup) {
        setWlError("That email is already on the waitlist.");
        return;
      }
      setWlError(error.message || "Something went wrong. Please try again.");
      return;
    }

    setWlSuccess(true);
  }

  return (
    <div
      className="grid min-h-[100dvh] min-w-0 grid-cols-1 overflow-x-hidden bg-[var(--dg-bg-main)] lg:grid-cols-2 lg:items-stretch"
    >
      <LeftPanel />

      <div
        className="flex min-w-0 flex-col px-6 py-8 sm:px-8 sm:py-10 lg:min-h-[100dvh] lg:px-12 lg:py-12"
        style={{ backgroundColor: "var(--dg-cream)" }}
      >
        {signInMode || signUpMode ? (
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <GoldDots />
              <span className="min-w-0 text-pretty text-xs font-medium text-[var(--dg-brown-muted)]">
                Welcome back
              </span>
            </div>
            <h1
              className="mt-6 text-2xl font-semibold text-[var(--dg-brown-dark)]"
              style={{ fontFamily: "var(--font-heirloom-body), Georgia, serif" }}
            >
              {signUpMode ? "Create account" : "Sign in"}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--dg-brown-muted)]">
              {signUpMode
                ? "Create your Dead Gossip account, then choose a membership plan."
                : "Use the email and password for your Dead Gossip account."}
            </p>

            <form
              onSubmit={signUpMode ? handleSignUp : handleSignIn}
              className="mt-8 flex flex-1 flex-col"
            >
              <div className="space-y-4">
                {signUpMode ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="auth-first-name"
                        className="mb-1 block text-sm font-medium text-[var(--dg-brown-dark)]"
                      >
                        First name
                      </label>
                      <input
                        id="auth-first-name"
                        type="text"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        required
                        autoComplete="given-name"
                        className="w-full rounded-md border border-[var(--dg-paper-border)] bg-white px-3 py-2 text-sm text-[var(--dg-brown-dark)] outline-none ring-[var(--dg-brown-outline)] placeholder:text-[var(--dg-brown-muted)] focus:ring-2"
                        placeholder="First"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="auth-last-name"
                        className="mb-1 block text-sm font-medium text-[var(--dg-brown-dark)]"
                      >
                        Last name
                      </label>
                      <input
                        id="auth-last-name"
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        required
                        autoComplete="family-name"
                        className="w-full rounded-md border border-[var(--dg-paper-border)] bg-white px-3 py-2 text-sm text-[var(--dg-brown-dark)] outline-none ring-[var(--dg-brown-outline)] placeholder:text-[var(--dg-brown-muted)] focus:ring-2"
                        placeholder="Last"
                      />
                    </div>
                  </div>
                ) : null}
                <div>
                  <label
                    htmlFor="auth-email"
                    className="mb-1 block text-sm font-medium text-[var(--dg-brown-dark)]"
                  >
                    Email
                  </label>
                  <input
                    id="auth-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="w-full rounded-md border border-[var(--dg-paper-border)] bg-white px-3 py-2 text-sm text-[var(--dg-brown-dark)] outline-none ring-[var(--dg-brown-outline)] placeholder:text-[var(--dg-brown-muted)] focus:ring-2"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label
                    htmlFor="auth-password"
                    className="mb-1 block text-sm font-medium text-[var(--dg-brown-dark)]"
                  >
                    Password
                  </label>
                  <input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full rounded-md border border-[var(--dg-paper-border)] bg-white px-3 py-2 text-sm text-[var(--dg-brown-dark)] outline-none ring-[var(--dg-brown-outline)] placeholder:text-[var(--dg-brown-muted)] focus:ring-2"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {authError ? (
                <p className="mt-4 text-sm text-[var(--dg-error-text)]">
                  {authError}
                </p>
              ) : null}
              {authSuccess ? (
                <p className="mt-4 text-sm text-[var(--dg-brown-dark)]">
                  {authSuccess}
                </p>
              ) : null}
              {(signupState === "signup_requires_verification" ||
                signupState === "signup_recoverable_no_session") &&
              !isAuthLoading ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void resendVerificationForSignup()}
                    className="rounded-md border px-3 py-1.5 text-xs font-semibold"
                    style={{
                      borderColor: "var(--dg-brown-border)",
                      color: "var(--dg-brown-dark)",
                    }}
                  >
                    Resend verification
                  </button>
                  <button
                    type="button"
                    onClick={() => void sendMagicLinkForSignup()}
                    className="rounded-md border px-3 py-1.5 text-xs font-semibold"
                    style={{
                      borderColor: "var(--dg-brown-border)",
                      color: "var(--dg-brown-dark)",
                    }}
                  >
                    Send magic link
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/login?signin=1")}
                    className="rounded-md border px-3 py-1.5 text-xs font-semibold"
                    style={{
                      borderColor: "var(--dg-brown-border)",
                      color: "var(--dg-brown-dark)",
                    }}
                  >
                    Sign in now
                  </button>
                </div>
              ) : null}

              <div className="mt-6">
                <button
                  type="submit"
                  disabled={isAuthLoading}
                  className="w-full rounded-md px-4 py-2.5 text-sm font-medium text-[var(--dg-primary-fg)] transition disabled:cursor-not-allowed disabled:opacity-70"
                  style={{ backgroundColor: "var(--dg-primary-bg)" }}
                >
                  {isAuthLoading
                    ? "Please wait…"
                    : signUpMode
                      ? "Create account"
                      : "Sign in"}
                </button>
              </div>
            </form>

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--dg-parchment-deep)]" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wide">
                <span
                  className="bg-[var(--dg-cream)] px-3 text-[var(--dg-brown-muted)]"
                  style={{ fontFamily: "var(--font-geist-sans), system-ui" }}
                >
                  or
                </span>
              </div>
            </div>

            <p className="text-center text-sm">
              <Link
                href={signUpMode ? "/login?signin=1" : "/login?signup=1"}
                className="font-medium text-[var(--dg-brown-outline)] underline decoration-[var(--dg-paper-border)] underline-offset-4 hover:text-[var(--dg-brown-dark)]"
              >
                {signUpMode ? "Sign in to your account" : "Create an account"}
              </Link>
            </p>
          </div>
        ) : (
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <GoldDots />
              <span className="min-w-0 text-pretty text-xs font-medium text-[var(--dg-brown-muted)]">
                Early access — limited spots available.
              </span>
            </div>

            <h1
              id="waitlist"
              className="mt-6 text-2xl font-semibold text-[var(--dg-brown-dark)] sm:text-3xl"
              style={{ fontFamily: "var(--font-heirloom-body), Georgia, serif" }}
            >
              Join the waitlist
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--dg-brown-muted)]">
              Be first in when Dead Gossip opens. No spam, just a heads up when
              your spot is ready.
            </p>

            {wlSuccess ? (
              <div
                className="mt-8 rounded-lg border border-[var(--dg-paper-border)] bg-[var(--dg-parchment)] px-4 py-5 text-sm text-[var(--dg-brown-dark)]"
                role="status"
              >
                <p className="font-medium">You&apos;re on the list.</p>
                <p className="mt-2 leading-relaxed text-[var(--dg-brown-muted)]">
                  We&apos;ll email you when early access opens. Thank you for
                  your interest in Dead Gossip.
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleWaitlist}
                className="mt-8 flex flex-col gap-5"
              >
                <div>
                  <label
                    htmlFor="wl-name"
                    className="mb-1 block text-sm font-medium text-[var(--dg-brown-dark)]"
                  >
                    Your name
                  </label>
                  <input
                    id="wl-name"
                    type="text"
                    value={wlName}
                    onChange={(e) => {
                      setWlName(e.target.value);
                      setWlError(null);
                    }}
                    required
                    autoComplete="name"
                    className="w-full rounded-md border border-[var(--dg-paper-border)] bg-white px-3 py-2 text-sm text-[var(--dg-brown-dark)] outline-none ring-[var(--dg-brown-outline)] placeholder:text-[var(--dg-brown-muted)] focus:ring-2"
                    placeholder="First and last name."
                  />
                </div>
                <div>
                  <label
                    htmlFor="wl-email"
                    className="mb-1 block text-sm font-medium text-[var(--dg-brown-dark)]"
                  >
                    Email address
                  </label>
                  <input
                    id="wl-email"
                    type="email"
                    value={wlEmail}
                    onChange={(e) => {
                      setWlEmail(e.target.value);
                      setWlError(null);
                    }}
                    required
                    autoComplete="email"
                    className="w-full rounded-md border border-[var(--dg-paper-border)] bg-white px-3 py-2 text-sm text-[var(--dg-brown-dark)] outline-none ring-[var(--dg-brown-outline)] placeholder:text-[var(--dg-brown-muted)] focus:ring-2"
                    placeholder="you@example.com"
                  />
                  {wlError ? (
                    <p className="mt-2 text-sm text-[var(--dg-error-text)]">
                      {wlError}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label
                    htmlFor="wl-interest"
                    className="mb-1 block text-sm font-medium text-[var(--dg-brown-dark)]"
                  >
                    What brings you here?{" "}
                    <span className="font-normal text-[var(--dg-brown-muted)]">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    id="wl-interest"
                    value={wlInterest}
                    onChange={(e) => {
                      setWlInterest(e.target.value);
                      setWlError(null);
                    }}
                    rows={3}
                    className="w-full resize-none rounded-md border border-[var(--dg-paper-border)] bg-white px-3 py-2 text-sm text-[var(--dg-brown-dark)] outline-none ring-[var(--dg-brown-outline)] placeholder:text-[var(--dg-brown-muted)] focus:ring-2"
                    placeholder="e.g. I research colonial American lines"
                  />
                </div>

                <button
                  type="submit"
                  disabled={wlSubmitting}
                  className="w-full rounded-md px-4 py-3 text-sm font-semibold text-[var(--dg-primary-fg)] transition disabled:cursor-not-allowed disabled:opacity-70"
                  style={{ backgroundColor: "var(--dg-primary-bg)" }}
                >
                  {wlSubmitting ? "Sending…" : "Request early access"}
                </button>
              </form>
            )}

            <div className="relative my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--dg-parchment-deep)]" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-wide">
                <span
                  className="bg-[var(--dg-cream)] px-3 text-[var(--dg-brown-muted)]"
                  style={{ fontFamily: "var(--font-geist-sans), system-ui" }}
                >
                  or
                </span>
              </div>
            </div>

            <p className="text-center text-sm">
              <Link
                href="/login?signin=1"
                className="font-medium text-[var(--dg-brown-outline)] underline decoration-[var(--dg-paper-border)] underline-offset-4 hover:text-[var(--dg-brown-dark)]"
              >
                Sign in to your account
              </Link>
            </p>
            <p className="mt-3 text-center text-sm">
              <Link
                href="/login?signup=1"
                className="font-medium text-[var(--dg-brown-outline)] underline decoration-[var(--dg-paper-border)] underline-offset-4 hover:text-[var(--dg-brown-dark)]"
              >
                Create an account
              </Link>
            </p>

            <p className="mt-auto pt-10 text-center text-[0.7rem] leading-relaxed text-[var(--dg-brown-muted)] lg:pt-8">
              By joining you agree to receive occasional updates about Dead
              Gossip. Nothing else, ever.
            </p>
          </div>
        )}
        <p className="mt-6 text-center text-[0.75rem] text-[var(--dg-brown-muted)]">
          <Link
            href="/terms"
            className="underline decoration-[var(--dg-paper-border)] underline-offset-4 hover:text-[var(--dg-brown-dark)]"
          >
            Terms of Service
          </Link>
          {" · "}
          <Link
            href="/privacy"
            className="underline decoration-[var(--dg-paper-border)] underline-offset-4 hover:text-[var(--dg-brown-dark)]"
          >
            Privacy Policy
          </Link>
          {" · "}
          <Link
            href="/cookies"
            className="underline decoration-[var(--dg-paper-border)] underline-offset-4 hover:text-[var(--dg-brown-dark)]"
          >
            Cookie Policy
          </Link>
        </p>
      </div>
    </div>
  );
}

function LoginPageFallback() {
  return (
    <div
      className="grid min-h-0 animate-pulse grid-cols-1 lg:grid-cols-2"
      style={{ height: "100dvh", maxHeight: "100dvh" }}
    >
      <div style={{ backgroundColor: leftBg }} />
      <div style={{ backgroundColor: "var(--dg-cream)" }} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
