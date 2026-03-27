"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push("/dashboard");
  }

  async function handleSignUp() {
    setError(null);
    setMessage(null);
    setIsLoading(true);

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    setIsLoading(false);

    if (signUpError) {
      setError(signUpError.message);
      return;
    }

    setMessage("Sign up successful. Check your email to confirm your account.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <form
        onSubmit={handleSignIn}
        className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-2xl font-semibold text-zinc-900">Login</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Sign in to continue to your dashboard.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 outline-none ring-indigo-500 placeholder:text-zinc-400 focus:ring-2"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-zinc-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 outline-none ring-indigo-500 placeholder:text-zinc-400 focus:ring-2"
              placeholder="••••••••"
            />
          </div>
        </div>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        {message ? (
          <p className="mt-4 text-sm text-emerald-600">{message}</p>
        ) : null}

        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? "Please wait..." : "Sign In"}
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={handleSignUp}
            className="flex-1 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-70"
          >
            Sign Up
          </button>
        </div>
      </form>
    </div>
  );
}
