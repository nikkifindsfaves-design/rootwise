import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ADDON_PACKS, getTierFromString } from "@/lib/billing/config";
import {
  getStripePriceIdForAddon,
  getStripePriceIdForTier,
  getStripeServerClient,
} from "@/lib/billing/stripe";

type RequestBody = {
  mode?: "subscription" | "addon";
  tier?: string;
  interval?: "monthly" | "annual";
  addon_pack?: keyof typeof ADDON_PACKS;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const mode = body.mode;
  if (mode !== "subscription" && mode !== "addon") {
    return NextResponse.json(
      { error: "mode must be subscription or addon" },
      { status: 400 }
    );
  }

  const stripe = getStripeServerClient();
  const origin = request.nextUrl.origin;

  const lineItems =
    mode === "subscription"
      ? [
          {
            price: getStripePriceIdForTier(
              getTierFromString(body.tier),
              body.interval ?? "monthly"
            ),
            quantity: 1,
          },
        ]
      : [
          {
            price: getStripePriceIdForAddon(body.addon_pack ?? "credits_250"),
            quantity: 1,
          },
        ];

  const session = await stripe.checkout.sessions.create({
    mode: mode === "subscription" ? "subscription" : "payment",
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    success_url: `${origin}/dashboard?billing=success`,
    cancel_url: `${origin}/dashboard?billing=cancel`,
    line_items: lineItems,
    metadata: {
      user_id: user.id,
      checkout_mode: mode,
      tier: mode === "subscription" ? getTierFromString(body.tier) : "",
      interval: mode === "subscription" ? body.interval ?? "monthly" : "",
      addon_pack: mode === "addon" ? body.addon_pack ?? "credits_250" : "",
    },
  });

  return NextResponse.json({ url: session.url });
}
