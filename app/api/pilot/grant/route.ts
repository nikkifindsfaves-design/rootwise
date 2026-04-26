import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BILLING_FLAGS } from "@/lib/billing/config";

type RequestBody = {
  grant_credits?: number;
};

export async function POST(request: NextRequest) {
  if (!BILLING_FLAGS.pilotModeEnabled) {
    return NextResponse.json(
      { error: "Pilot grants are disabled." },
      { status: 403 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody = {};
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    // allow empty body
  }

  const grantAmount = Math.max(0, Math.min(body.grant_credits ?? 350, 5000));
  const idempotencyKey = `pilot_grant:${user.id}:${new Date().toISOString().slice(0, 10)}`;

  const { data, error } = await supabase.rpc("grant_credits", {
    p_user_id: user.id,
    p_subscription_delta: grantAmount,
    p_addon_delta: 0,
    p_event_type: "pilot_grant",
    p_idempotency_key: idempotencyKey,
    p_source: "pilot",
    p_metadata: { grant_amount: grantAmount },
  });

  if (error) {
    return NextResponse.json(
      { error: `Could not apply pilot grant: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    grantAmount,
    result: Array.isArray(data) ? data[0] : data,
  });
}
