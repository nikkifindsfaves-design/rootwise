export type SignupOutcomeState =
  | "signup_idle"
  | "signup_submitting"
  | "signup_success_with_session"
  | "signup_requires_verification"
  | "signup_rate_limited"
  | "signup_recoverable_no_session"
  | "signup_error";

type SignupErrorLike = {
  code?: string | null;
  message?: string | null;
  status?: number;
};

function has(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle.toLowerCase());
}

export function classifyAuthError(error: SignupErrorLike | null | undefined): SignupOutcomeState {
  const message = error?.message ?? "";
  const code = error?.code ?? "";

  if (
    code === "over_request_rate_limit" ||
    has(message, "rate limit") ||
    has(message, "too many requests")
  ) {
    return "signup_rate_limited";
  }

  if (
    code === "email_not_confirmed" ||
    has(message, "confirm") ||
    has(message, "verification")
  ) {
    return "signup_requires_verification";
  }

  return "signup_error";
}

export function classifySignupOutcome(input: {
  hasSession: boolean;
  hasUser: boolean;
  error?: SignupErrorLike | null;
  confirmEmailFallback?: boolean;
}): SignupOutcomeState {
  if (input.error) {
    return classifyAuthError(input.error);
  }
  if (input.hasSession) {
    return "signup_success_with_session";
  }
  if (input.hasUser && input.confirmEmailFallback) {
    return "signup_requires_verification";
  }
  if (input.hasUser) {
    return "signup_recoverable_no_session";
  }
  return "signup_error";
}

