import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [{ data: usageRows, error: usageError }, { data: debitRows, error: debitError }] =
    await Promise.all([
      supabase
        .from("usage_events")
        .select("credits_charged")
        .eq("user_id", user.id),
      supabase
        .from("credit_ledger")
        .select("delta_subscription_credits, delta_addon_credits")
        .eq("user_id", user.id)
        .eq("event_type", "usage_debit"),
    ]);

  if (usageError || debitError) {
    return NextResponse.json(
      {
        error:
          usageError?.message ??
          debitError?.message ??
          "Could not run reconciliation.",
      },
      { status: 500 }
    );
  }

  const usageTotal = (usageRows ?? []).reduce(
    (sum, row) => sum + Number((row as { credits_charged?: number }).credits_charged ?? 0),
    0
  );
  const ledgerDebitTotal = Math.abs(
    (debitRows ?? []).reduce((sum, row) => {
      const r = row as {
        delta_subscription_credits?: number;
        delta_addon_credits?: number;
      };
      return (
        sum +
        Number(r.delta_subscription_credits ?? 0) +
        Number(r.delta_addon_credits ?? 0)
      );
    }, 0)
  );

  return NextResponse.json({
    usageTotal,
    ledgerDebitTotal,
    isBalanced: usageTotal === ledgerDebitTotal,
    delta: usageTotal - ledgerDebitTotal,
  });
}
