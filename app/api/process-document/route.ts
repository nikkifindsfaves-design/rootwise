import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

const SYSTEM_PROMPT = `You are a genealogy expert. Analyze this document and extract all people, events and relationships you find. Return ONLY a JSON object with this exact structure:
{
  record_type: string,
  people: [{ first_name, middle_name, last_name, birth_date, death_date, gender, notes }],
  events: [{ person_name, event_type, event_date, event_place, description }],
  relationships: [{ person_a, person_b, relationship_type }]
}

For any document that shows family connections, always populate the relationships array with entries like { person_a: 'John Smith', person_b: 'Mary Smith', relationship_type: 'spouse' } or { person_a: 'John Smith', person_b: 'Baby Smith', relationship_type: 'parent' }. Never put relationship information only in notes.`;

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

  const { data: record, error: recordError } = await supabase
    .from("records")
    .insert({
      user_id: user.id,
      file_url: fileUrl,
      file_type: resolvedFileType,
      ai_response: parsed,
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
