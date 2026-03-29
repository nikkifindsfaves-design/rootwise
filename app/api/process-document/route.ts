import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

const SYSTEM_PROMPT = `You are a genealogy expert. Analyze this document and extract all people, events and relationships you find. Return ONLY a JSON object with this exact structure:
{
  record_type: string,
  people: [{ first_name, middle_name, last_name, birth_date, death_date, gender, notes }],
  events: [{ person_name, event_type, event_date, event_place, description, story_short, story_full }],
  parent_events: [{ person_name, event_type, event_date, event_place, description, story_short, story_full }],
  relationships: [{ person_a, person_b, relationship_type }]
}

Story fields (Dead Gossip voice — direct, occasionally irreverent, like a true-crime podcaster narrating a life moment):
- story_short: one punchy sentence for the person the event is about.
- story_full: 2–3 sentences including every detail from the document: all people present, full location, time if stated, and any other context.

For each birth event, also add parent_events: one object per named parent. Each parent event uses event_type exactly "child born", the same event_date and event_place as the birth, person_name set to that parent's full name, description mentioning the child's name and the other parent if known, story_short one punchy sentence from the parent's perspective, story_full 2–3 sentences from the parent's perspective. Omit parent_events if parents are unknown.

Always populate the relationships array with parent/child links the document supports: use relationship_type exactly "parent" where person_a is the parent and person_b is the child (e.g. { person_a: 'John Smith', person_b: 'Baby Smith', relationship_type: 'parent' }). Never put relationship information only in notes.

Spouse relationships (relationship_type "spouse"): include ONLY when the source text explicitly states a marriage, wedding, or spousal bond (e.g. "married", "husband", "wife", "spouse", "wedding", "marriage certificate", wording that clearly indicates a legal or stated marital relationship). Do NOT add "spouse" entries solely because two people are both listed as parents of the same child on a birth, baptism, census, or similar record. Do NOT infer marriage from shared parentage, shared surname, or co-appearance as parents. If the document only names two parents without stating they are married, use only "parent" rows toward the child—no "spouse" between those parents unless marriage is explicitly stated.`;

const MODEL = "claude-sonnet-4-20250514";

function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  const raw = fence ? fence[1].trim() : trimmed;
  return JSON.parse(raw);
}

function inferImageMediaType(file: File): string {
  const t = file.type.toLowerCase();
  if (t && t.startsWith("image/")) {
    if (t === "image/jpg") return "image/jpeg";
    return t;
  }
  const n = file.name.toLowerCase();
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".gif")) return "image/gif";
  if (n.endsWith(".webp")) return "image/webp";
  return "";
}

function normalizeImageMediaType(
  mime: string
): "image/jpeg" | "image/png" | "image/gif" | "image/webp" | null {
  if (
    mime === "image/jpeg" ||
    mime === "image/png" ||
    mime === "image/gif" ||
    mime === "image/webp"
  ) {
    return mime;
  }
  return null;
}

type ExtractedPerson = {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  gender?: string | null;
  notes?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 }
    );
  }
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.json(
      { error: "Supabase environment variables are not configured" },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: 'Missing file field "file"' },
      { status: 400 }
    );
  }

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const treeIdRaw = formData.get("tree_id");
  let resolvedTreeId: string | null = null;
  if (treeIdRaw != null && String(treeIdRaw).trim() !== "") {
    const tid = String(treeIdRaw).trim();
    if (!UUID_RE.test(tid)) {
      return NextResponse.json(
        { error: "Invalid tree_id" },
        { status: 400 }
      );
    }
    const { data: treeRow, error: treeErr } = await supabase
      .from("trees")
      .select("id")
      .eq("id", tid)
      .eq("user_id", user.id)
      .maybeSingle();
    if (treeErr) {
      return NextResponse.json(
        { error: treeErr.message },
        { status: 500 }
      );
    }
    if (!treeRow) {
      return NextResponse.json(
        { error: "Tree not found or access denied." },
        { status: 403 }
      );
    }
    resolvedTreeId = tid;
  }

  const arrayBuffer = await file.arrayBuffer();
  if (arrayBuffer.byteLength === 0) {
    return NextResponse.json({ error: "Empty file" }, { status: 400 });
  }

  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString("base64");

  const mime = file.type.toLowerCase();
  const isPdf =
    mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  const inferredImage = inferImageMediaType(file);
  const imageMedia = normalizeImageMediaType(inferredImage);

  if (!isPdf && !imageMedia) {
    return NextResponse.json(
      {
        error:
          "Unsupported file type. Upload a PDF or an image (JPEG, PNG, GIF, or WebP).",
      },
      { status: 415 }
    );
  }

  const resolvedFileType =
    mime || (isPdf ? "application/pdf" : imageMedia ?? "application/octet-stream");

  const safeBase = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${user.id}/${Date.now()}-${safeBase}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, buffer, {
      contentType: resolvedFileType,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = supabase.storage
    .from("documents")
    .getPublicUrl(storagePath);

  const fileUrl = publicUrlData.publicUrl;

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const userContent: Anthropic.Messages.MessageCreateParams["messages"][number]["content"] =
    isPdf
      ? [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          },
          {
            type: "text",
            text: "Analyze this document and respond with JSON only as specified in your instructions.",
          },
        ]
      : [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: imageMedia!,
              data: base64,
            },
          },
          {
            type: "text",
            text: "Analyze this image and respond with JSON only as specified in your instructions.",
          },
        ];

  let message: Anthropic.Messages.Message;
  try {
    message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Anthropic request failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return NextResponse.json(
      { error: "No text response from model" },
      { status: 502 }
    );
  }

  let parsed: unknown;
  try {
    parsed = parseJsonFromText(textBlock.text);
  } catch {
    return NextResponse.json(
      {
        error: "Model did not return valid JSON",
        raw: textBlock.text,
      },
      { status: 502 }
    );
  }

  const recordTypeField = formData.get("record_type");
  const recordTypeStr =
    recordTypeField != null && String(recordTypeField).trim() !== ""
      ? String(recordTypeField).trim()
      : null;

  // Sole `records` row for this upload: `tree_id` comes from multipart field
  // `tree_id` (validated above). Omit when null/missing so non-tree uploads unchanged.
  const { data: record, error: recordError } = await supabase
    .from("records")
    .insert({
      user_id: user.id,
      file_url: fileUrl,
      file_type: resolvedFileType,
      ai_response: parsed,
      ...(recordTypeStr ? { record_type: recordTypeStr } : {}),
      ...(resolvedTreeId != null ? { tree_id: resolvedTreeId } : {}),
    })
    .select("id")
    .single();

  if (recordError || !record) {
    return NextResponse.json(
      { error: `Failed to save record: ${recordError?.message ?? "unknown"}` },
      { status: 500 }
    );
  }

  const recordId = record.id as string;

  let people: ExtractedPerson[] = [];
  if (isRecord(parsed)) {
    const rawPeople = parsed["people"];
    if (Array.isArray(rawPeople)) {
      people = rawPeople as ExtractedPerson[];
    }
  }

  if (people.length > 0) {
    const rows = people.map((p) => ({
      user_id: user.id,
      record_id: recordId,
      first_name: p.first_name ?? null,
      middle_name: p.middle_name ?? null,
      last_name: p.last_name ?? null,
      birth_date: p.birth_date ?? null,
      death_date: p.death_date ?? null,
      gender: p.gender ?? null,
      notes: p.notes ?? null,
      status: "pending",
    }));

    const { error: pendingError } = await supabase
      .from("pending_persons")
      .insert(rows);

    if (pendingError) {
      return NextResponse.json(
        {
          error: `Failed to save pending persons: ${pendingError.message}`,
        },
        { status: 500 }
      );
    }
  }

  const payload =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? { ...(parsed as Record<string, unknown>), recordId }
      : { extraction: parsed, recordId };

  return NextResponse.json(payload);
}
