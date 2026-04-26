import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCreditSnapshotForUser } from "@/lib/billing/credits";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const snapshot = await getCreditSnapshotForUser(user.id);

  const { data: ledgerRows, error: ledgerError } = await supabase
    .from("credit_ledger")
    .select(
      "id, event_type, action_type, delta_subscription_credits, delta_addon_credits, source, metadata, created_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (ledgerError) {
    return NextResponse.json(
      { error: `Could not load credit ledger: ${ledgerError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    snapshot,
    ledger: ledgerRows ?? [],
  });
}
