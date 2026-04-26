import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Resend } from "resend";

type RequestBody = {
  topic?: "General support" | "Billing question" | "Bug report";
  message?: string;
};

function destinationForTopic(topic: NonNullable<RequestBody["topic"]>): string {
  if (topic === "Billing question") return "billing@deadgossip.app";
  if (topic === "Bug report") return "bug@deadgossip.app";
  return "support@deadgossip.app";
}

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

  const topic = body.topic ?? "General support";
  const message = body.message?.trim() ?? "";
  const destinationEmail = destinationForTopic(topic);

  if (message === "") {
    return NextResponse.json(
      { error: "Please enter a message before submitting." },
      { status: 400 }
    );
  }

  const { data: insertedRow, error } = await supabase
    .from("support_requests")
    .insert({
      user_id: user.id,
      topic,
      destination_email: destinationEmail,
      message,
      status: "submitted",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: `Could not submit support request: ${error.message}` },
      { status: 500 }
    );
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Support request was saved, but email notifications are not configured (missing RESEND_API_KEY).",
      },
      { status: 500 }
    );
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const fromEmail = process.env.SUPPORT_FROM_EMAIL ?? "onboarding@resend.dev";
  const requestId =
    typeof insertedRow?.id === "string" ? insertedRow.id : "unknown";

  try {
    await resend.emails.send({
      from: fromEmail,
      to: [destinationEmail],
      replyTo: user.email ?? undefined,
      subject: `[Dead Gossip] ${topic} (${requestId.slice(0, 8)})`,
      text: [
        `Support request ID: ${requestId}`,
        `Topic: ${topic}`,
        `Submitted by user ID: ${user.id}`,
        `User email: ${user.email ?? "unknown"}`,
        "",
        "Message:",
        message,
      ].join("\n"),
    });
  } catch (sendError) {
    const reason =
      sendError instanceof Error ? sendError.message : "Unknown send error";
    return NextResponse.json(
      {
        error: `Support request saved, but email delivery failed: ${reason}`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
