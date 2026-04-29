import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function proxy(request: NextRequest) {
  const { url, anonKey } = getSupabaseEnv();
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    !user &&
    (request.nextUrl.pathname.startsWith("/dashboard") ||
      request.nextUrl.pathname.startsWith("/tree-select") ||
      request.nextUrl.pathname.startsWith("/review") ||
      request.nextUrl.pathname.startsWith("/onboarding"))
  ) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("reason", "auth_required");
    return NextResponse.redirect(redirectUrl);
  }

  if (
    user &&
    (request.nextUrl.pathname.startsWith("/dashboard") ||
      request.nextUrl.pathname.startsWith("/tree-select") ||
      request.nextUrl.pathname.startsWith("/review")) &&
    !request.nextUrl.pathname.startsWith("/dashboard/account")
  ) {
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    const status = (subscription?.status ?? "inactive") as string;
    const currentPeriodEnd =
      typeof subscription?.current_period_end === "string"
        ? Date.parse(subscription.current_period_end)
        : NaN;
    const now = new Date();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const hasAccess =
      status === "active" ||
      (Number.isFinite(currentPeriodEnd) && currentPeriodEnd >= startOfToday);

    if (!hasAccess) {
      const billingReturn = request.nextUrl.searchParams.get("billing");
      // Returning from Stripe Checkout before webhooks activate subscription — land on dashboard.
      if (
        billingReturn === "success" &&
        (request.nextUrl.pathname.startsWith("/dashboard") ||
          request.nextUrl.pathname.startsWith("/tree-select"))
      ) {
        return response;
      }
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/onboarding";
      if (!hasAccess) {
        redirectUrl.searchParams.set("paywall", "1");
        redirectUrl.searchParams.set("reason", "subscription_required");
      }
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
