import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RequestBody = {
  subscription_delta?: number;
  addon_delta?: number;
  reason?: string;
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
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const subscriptionDelta = Math.trunc(body.subscription_delta ?? 0);
  const addonDelta = Math.trunc(body.addon_delta ?? 0);
  if (subscriptionDelta === 0 && addonDelta === 0) {
    return NextResponse.json(
      { error: "At least one delta must be non-zero." },
      { status: 400 }
    );
  }

  const idempotencyKey = `manual_adjustment:${user.id}:${crypto.randomUUID()}`;
  const { data, error } = await supabase.rpc("grant_credits", {
    p_user_id: user.id,
    p_subscription_delta: subscriptionDelta,
    p_addon_delta: addonDelta,
    p_event_type: "manual_adjustment",
    p_idempotency_key: idempotencyKey,
    p_source: "user_adjustment",
    p_metadata: { reason: body.reason?.trim() || "manual adjustment" },
  });

  if (error) {
    return NextResponse.json(
      { error: `Credit adjustment failed: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    result: Array.isArray(data) ? data[0] : data,
  });
}
