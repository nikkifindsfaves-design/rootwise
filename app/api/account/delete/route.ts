import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RequestBody = {
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

  let body: RequestBody = {};
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    // optional body
  }

  const { error } = await supabase.from("account_deletion_requests").insert({
    user_id: user.id,
    reason: body.reason?.trim() || null,
    status: "requested",
  });

  if (error) {
    return NextResponse.json(
      { error: `Could not create deletion request: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
