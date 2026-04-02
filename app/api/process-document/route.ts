import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

function getVoiceInstructions(vibe: string): string {
  switch (vibe) {
    case "gossip_girl":
      return `Write like the Gossip Girl narrator — omniscient, theatrical, weaponizing politeness. You are reporting the facts but you have opinions. Every event is a reveal. Names are dropped with intention. Breathless but never frantic. Vary your opening — sometimes it's the scene, sometimes a direct address to the reader, sometimes you lead with the most interesting person in the room. Use "our girl," "yours truly," and dramatic pauses sparingly but with full commitment when you do. Example story_short: "Della Mae Hutchins made her entrance in March 1887 — already fashionably late to the nineteenth century, and not yet done surprising people." Example story_full: "Well, well, well. A farmer named Roy Hutchins walked into the Pittsylvania County clerk's office in the spring of 1887 and announced that he and his wife Cora had produced a daughter. Her name: Della Mae. Her destiny: unwritten, which is frankly the most interesting kind. Roy handled the paperwork himself — a man who shows up, we respect that — while Cora, as history so often records it, is simply listed and left to our imagination. Watch this space, Della Mae. XOXO."`;

    case "old_timey":
      return `Write as though you are a learned gentleman of the 1800s recounting events aloud to a parlor full of people who have nowhere else to be. Expansive, self-important, full of asides and qualifications. You believe every detail is worth remarking upon. Rhetorical flourishes are not just permitted, they are expected. Vary your opening between a meditation on the place, a formal introduction of the subject, or a reflection on the significance of the occasion. Never use contractions. Take your time. Example story_short: "It is with no small measure of satisfaction that we record the birth of Miss Della Mae Hutchins, who arrived in Pittsylvania County, Virginia, on the fourth of March, 1887, as if she had always intended to." Example story_full: "On the fourth of March, in the year of our Lord eighteen hundred and eighty-seven, in that fine and storied county of Pittsylvania, Virginia, a daughter was born to Mr. Roy Hutchins — a man of agricultural pursuits and evident civic responsibility, for it was he who presented himself to the county clerk to ensure the matter was properly set down for posterity. The child was given the name Della Mae, a name well-suited to its time and place, and her mother Cora — of whom the record speaks briefly, though we may assume her contribution to the occasion was not inconsiderable — was duly noted alongside. Let it be known, then, that Della Mae Hutchins entered this world, and the world was the richer for it."`;

    case "southern_gothic":
      return `Write like a literary novelist from the American South — slow, atmospheric, a little haunted. Every birth is also a foreshadowing. Every name carries weight. Beauty and unease can coexist in the same sentence. Vary your opening between the landscape, the person, and the moment. Use specific sensory detail when the document provides it. Never rush. Never be cute. Example story_short: "Della Mae Hutchins came into the world in the red clay county of Pittsylvania, Virginia, in the early days of March 1887, when the ground was still cold and everything was beginning anyway." Example story_full: "It was the fourth of March, 1887, and in Pittsylvania County, Virginia, a farmer named Roy Hutchins went to the county clerk and said his daughter had been born. Her name was Della Mae. Her mother was Cora. The record does not say what the weather was, or whether the house was warm, or what Cora thought about any of it — only that the child arrived, and was named, and was written down, which is how the dead come to be known at all."`;

    case "gen_z":
      return `Write in a Gen Z tone but keep the focus entirely on the ancestor and what happened. Casual, direct, zero formality. Short punchy sentences. Lowercase is fine. Use "like" and "actually" and "so" as natural connective tissue, not as jokes. Dry observation over emotional reaction. The ancestor is the main character — the narrator has no feelings about this, they're just telling you what happened in the most unbothered way possible. Vary your opening every time. Example story_short: "della mae hutchins was born march 4, 1887 in pittsylvania county, virginia. her dad roy, a farmer, filed the paperwork. very normal start for someone's whole entire life." Example story_full: "so on march 4, 1887, della mae hutchins was born in pittsylvania county, virginia. her parents were roy hutchins, a farmer, and cora hutchins. roy actually went to the county clerk himself to get it all documented, which is how we know any of this. della mae came in, got a name, got written down. that's the origin story."`;

    case "classic":
    default:
      return `Write like a true-crime podcaster narrating a life moment — direct, occasionally dry, never sentimental. Lead with what happened. Don't editorialize excessively but let one sharp observation land per story. Vary your structure every time: sometimes open with place, sometimes with the person, sometimes drop straight into the event. Never use the same sentence construction twice in a row across stories. Example story_short: "Della Mae Hutchins arrived in Pittsylvania County on a Tuesday in March, 1887, and the paperwork was filed accordingly." Example story_full: "Della Mae Hutchins was born March 4, 1887, in Pittsylvania County, Virginia, the daughter of Roy Hutchins, a farmer, and Cora Hutchins. The record was filed with the county clerk — name, date, parents — the bare minimum a life requires to be made official. Roy was listed as the informant, which means he's the one who walked in and told them she existed."`;
  }
}

function buildSystemPrompt(
  vibe: string,
  anchorPersonName: string | null
): string {
  const anchorSuffix =
    anchorPersonName != null
      ? `\n\nANCHOR PERSON — STRICT EXTRACTION RULE: This document was uploaded to research "${anchorPersonName}".

If this is a multi-person document (register page, list, bible record with multiple entries):
- Scan the document to find the entry or cluster that contains "${anchorPersonName}" — they may appear as a parent, child, or named individual in that entry
- Once you find the matching cluster, extract ALL people named within it — this includes the child who is the subject of the record, both parents, godparents, witnesses, and any other individuals named in that specific entry
- The anchor person is your search key to locate the right cluster, not a filter on who to extract — extract the complete entry
- Do NOT extract any other entries, families, or individuals from other clusters on the document
- The people array, events array, and relationships array must contain only people from that one matched entry cluster

If this is a single-subject document (certificate, obituary, etc.):
- Treat "${anchorPersonName}" as the primary subject as normal
- Extract all people and events as usual`
      : "";

  return `You are a genealogy expert. Analyze this document and extract all people, events and relationships you find. Return ONLY a JSON object with this exact structure:
{
  is_multi_person: boolean,
  document_subtype: string,
  record_type: string,
  people: [{ first_name, middle_name, last_name, birth_date, death_date, gender, birth_place: { township, county, state, country }, notes }],
  events: [{ person_name, event_type, event_date, event_place: { township, county, state, country }, description, story_short, story_full }],
  parent_events: [{ person_name, event_type, event_date, event_place: { township, county, state, country }, description, story_short, story_full }],
  relationships: [{ person_a, person_b, relationship_type }]
}

- is_multi_person: true if this document contains multiple unrelated or loosely related individuals (e.g. a church register page, parish record page, census page, family bible page with many entries). false if it is a single-subject document (e.g. a birth certificate, death certificate, obituary, draft card, marriage license).
- document_subtype: a short label for the specific document format detected, e.g. "birth certificate", "death certificate", "church register", "family bible", "census record", "newspaper announcement", "military record", "marriage record", "obituary". Use your best judgment from the document's appearance and content.
- Church registers and parish records are multi-person documents (is_multi_person: true), document_subtype: "church register". These typically show multiple family entries on a page, each with parents, child name, and birth/baptism dates. They are NOT family bibles.
- Family bibles are also multi-person (is_multi_person: true), document_subtype: "family bible". These are handwritten lists of births, marriages and deaths kept by a single family, usually with consistent surnames.
- Key difference: church registers contain multiple unrelated families on the same page. Family bibles contain one family's records across multiple pages.

Places — birth_place on each person and event_place on each event and parent_event must always be an object with this exact shape: { township, county, state, country }. Never return a single string for a place. township, county, and state are each nullable strings; country is required and must always be present as a string.
- township is the most local jurisdiction (town, township, parish, district, etc.) and may be null if not stated or not applicable.
- county is the county or county-equivalent and may be null if not stated or not applicable.
- state is the state, province, or colony and may be null if not stated or not applicable.
- country must reflect the political entity at the time of the record (historical accuracy). For example, records before 1776 in American colonies should use "British Colonial America"; Irish records should use "Ireland"; never default to "United States" for records that predate its existence.
Always parse place text from the document into these four separate fields rather than stuffing an undifferentiated string into one field. Spell out abbreviations fully in every field — for example "West River" not "W. River", "Randolph County" not "Randolph Co."
birth_place for each person is where that individual was born, taken from wherever the document states their personal birthplace — not the location of the event being recorded unless the document equates them. On a birth certificate, the child's birth_place is typically found in the upper left of the document showing township and county, with state listed separately; the father's birth_place and mother's birth_place are their own stated birthplaces, usually listed separately as biographical details about the parents.

Story fields — ${getVoiceInstructions(vibe)}

- story_short: one punchy sentence for the person the event is about.
- story_full: 2–3 sentences including every detail from the document: all people present, full location, time if stated, and any other context.

For each birth event, also add parent_events: one object per named parent. Each parent event uses event_type exactly "child born", the same event_date and event_place as the birth, person_name set to that parent's full name, description mentioning the child's name and the other parent if known, story_short one punchy sentence from the parent's perspective, story_full 2–3 sentences from the parent's perspective. Omit parent_events if parents are unknown.

Always populate the relationships array with parent/child links the document supports: use relationship_type exactly "parent" where person_a is the parent and person_b is the child (e.g. { person_a: 'John Smith', person_b: 'Baby Smith', relationship_type: 'parent' }). Never put relationship information only in notes.

Gender must be read explicitly from document text only. Use these indicators: 'male', 'female', 'son', 'daughter', 'his', 'her', 'he', 'she', 'Mr.', 'Mrs.', 'father', 'mother', 'husband', 'wife', 'brother', 'sister'. Never infer gender from a person's name alone. If the document contains no explicit gender indicator for a person, return null for gender.

Spouse relationships (relationship_type "spouse"): include ONLY when the source text explicitly states a marriage, wedding, or spousal bond (e.g. "married", "husband", "wife", "spouse", "wedding", "marriage certificate", wording that clearly indicates a legal or stated marital relationship). Do NOT add "spouse" entries solely because two people are both listed as parents of the same child on a birth, baptism, census, or similar record. Do NOT infer marriage from shared parentage, shared surname, or co-appearance as parents. If the document only names two parents without stating they are married, use only "parent" rows toward the child—no "spouse" between those parents unless marriage is explicitly stated.${anchorSuffix}`;
}

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

async function resolveAnchorPersonName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personId: string,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("persons")
    .select("first_name, middle_name, last_name")
    .eq("id", personId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const r = data as {
    first_name?: string;
    middle_name?: string | null;
    last_name?: string;
  };
  return [r.first_name, r.middle_name ?? "", r.last_name]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
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

  const anchorIdRaw = formData.get("anchor_person_id");
  const anchorNameRaw = formData.get("anchor_person_name");
  const anchorIdTrim =
    anchorIdRaw != null && String(anchorIdRaw).trim() !== ""
      ? String(anchorIdRaw).trim()
      : "";

  let anchorPersonName: string | null = null;
  if (anchorIdTrim !== "") {
    anchorPersonName = await resolveAnchorPersonName(
      supabase,
      anchorIdTrim,
      user.id
    );
  } else {
    const anchorNameTrim =
      anchorNameRaw != null && String(anchorNameRaw).trim() !== ""
        ? String(anchorNameRaw).trim()
        : "";
    if (anchorNameTrim !== "") {
      anchorPersonName = anchorNameTrim;
    }
  }

  let resolvedVibe = "classic";
  if (resolvedTreeId !== null) {
    const { data: vibeRow, error: vibeErr } = await supabase
      .from("trees")
      .select("vibe")
      .eq("id", resolvedTreeId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!vibeErr && vibeRow) {
      const v = (vibeRow as { vibe?: string | null }).vibe;
      if (typeof v === "string" && v.trim() !== "") {
        resolvedVibe = v.trim();
      }
    }
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
      system: buildSystemPrompt(resolvedVibe, anchorPersonName),
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

  const payload: Record<string, unknown> =
    typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? { ...(parsed as Record<string, unknown>), recordId }
      : { extraction: parsed, recordId };

  if (isRecord(parsed)) {
    if (typeof parsed["is_multi_person"] === "boolean") {
      payload.is_multi_person = parsed["is_multi_person"];
    }
    if (typeof parsed["document_subtype"] === "string") {
      payload.document_subtype = parsed["document_subtype"];
    }
  }

  return NextResponse.json(payload);
}
