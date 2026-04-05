import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MODEL = "claude-sonnet-4-20250514";

function getVoiceInstructions(vibe: string): string {
  switch (vibe) {
    case "gossip_girl":
      return `Write like the Gossip Girl narrator — omniscient, theatrical, weaponizing politeness. You are reporting the facts but you have opinions. Every event is a reveal. Names are dropped with intention. Breathless but never frantic. Vary your opening — sometimes it's the scene, sometimes a direct address to the reader, sometimes you lead with the most interesting person in the room. Use "our girl," "yours truly," and dramatic pauses sparingly but with full commitment when you do.`;
    case "old_timey":
      return `Write as though you are a learned gentleman of the 1800s recounting events aloud to a parlor full of people who have nowhere else to be. Expansive, self-important, full of asides and qualifications. You believe every detail is worth remarking upon. Rhetorical flourishes are not just permitted, they are expected. Vary your opening between a meditation on the place, a formal introduction of the subject, or a reflection on the significance of the occasion. Never use contractions. Take your time.`;
    case "southern_gothic":
      return `Write like a literary novelist from the American South — slow, atmospheric, a little haunted. Every birth is also a foreshadowing. Every name carries weight. Beauty and unease can coexist in the same sentence. Vary your opening between the landscape, the person, and the moment. Use specific sensory detail when the document provides it. Never rush. Never be cute.`;
    case "gen_z":
      return `Write in a Gen Z tone but keep the focus entirely on the ancestor and what happened. Casual, direct, zero formality. Short punchy sentences. Lowercase is fine. Use "like" and "actually" and "so" as natural connective tissue, not as jokes. Dry observation over emotional reaction. The ancestor is the main character — the narrator has no feelings about this, they're just telling you what happened in the most unbothered way possible. Vary your opening every time.`;
    case "classic":
    default:
      return `Write like a true-crime podcaster narrating a life moment — direct, occasionally dry, never sentimental. Lead with what happened. Don't editorialize excessively but let one sharp observation land per story. Vary your structure every time: sometimes open with place, sometimes with the person, sometimes drop straight into the event. Never use the same sentence construction twice in a row across stories.`;
  }
}

function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  const raw = fence ? fence[1].trim() : trimmed;
  return JSON.parse(raw);
}

type RequestBody = {
  tree_id?: unknown;
  person_name?: unknown;
  event_type?: unknown;
  event_date?: unknown;
  event_place?: unknown;
  event_notes?: unknown;
  related_people?: unknown;
};

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
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

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const treeId = typeof body.tree_id === "string" ? body.tree_id.trim() : "";
  const personName =
    typeof body.person_name === "string" ? body.person_name.trim() : "";
  const eventType =
    typeof body.event_type === "string" ? body.event_type.trim() : "";
  const eventDate =
    typeof body.event_date === "string" ? body.event_date.trim() || null : null;
  const eventPlace =
    typeof body.event_place === "string" ? body.event_place.trim() || null : null;
  const eventNotes =
    typeof body.event_notes === "string" ? body.event_notes.trim() || null : null;
  const relatedPeople = Array.isArray(body.related_people)
    ? body.related_people
        .map((entry) => {
          if (!entry || typeof entry !== "object") return null;
          const row = entry as Record<string, unknown>;
          const name = typeof row.name === "string" ? row.name.trim() : "";
          const relationshipType =
            typeof row.relationship_type === "string"
              ? row.relationship_type.trim()
              : "";
          if (!name) return null;
          return { name, relationship_type: relationshipType || "other" };
        })
        .filter(
          (rp): rp is { name: string; relationship_type: string } => rp !== null
        )
    : [];

  if (!treeId || !personName || !eventType) {
    return NextResponse.json(
      { error: "tree_id, person_name, and event_type are required." },
      { status: 400 }
    );
  }

  const { data: treeRow, error: treeErr } = await supabase
    .from("trees")
    .select("vibe")
    .eq("id", treeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (treeErr) {
    return NextResponse.json({ error: treeErr.message }, { status: 500 });
  }
  if (!treeRow) {
    return NextResponse.json(
      { error: "Tree not found or access denied." },
      { status: 403 }
    );
  }

  let vibe = "classic";
  const storedVibe = (treeRow as { vibe?: string | null }).vibe;
  if (typeof storedVibe === "string" && storedVibe.trim() !== "") {
    vibe = storedVibe.trim();
  }

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const eventJson = {
    person_name: personName,
    event_type: eventType,
    event_date: eventDate,
    event_place: eventPlace,
    event_notes: eventNotes,
  };
  const relatedPeopleBlock =
    relatedPeople.length > 0
      ? relatedPeople
          .map((p) => `- ${p.name} (${p.relationship_type})`)
          .join("\n")
      : "- (none provided)";

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: `You generate genealogy story fields for a single event.

Voice style:
${getVoiceInstructions(vibe)}

Return ONLY valid JSON with this exact shape:
{
  "story_full": "2-3 sentences"
}

Requirements:
- Use only the provided event details; do not invent facts.
- story_full must be 2-3 sentences.
- Keep the person the event is about as the subject.
- Never include markdown fences or extra keys.`,
    messages: [
      {
        role: "user",
        content: `Event details:
${JSON.stringify(eventJson, null, 2)}

People referenced in this story:
${relatedPeopleBlock}

Use these exact names when referring to these people in the story. Do not use any other names.`,
      },
    ],
  });

  console.log("[DG] Story regen tokens — input:", message.usage.input_tokens, "| output:", message.usage.output_tokens, "| est. cost $:", ((message.usage.input_tokens * 3 + message.usage.output_tokens * 15) / 1_000_000).toFixed(5));

  const text = message.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) {
    return NextResponse.json(
      { error: "Model returned empty response." },
      { status: 502 }
    );
  }

  let parsed: unknown;
  try {
    parsed = parseJsonFromText(text);
  } catch {
    return NextResponse.json(
      { error: "Model returned invalid JSON." },
      { status: 502 }
    );
  }

  const record =
    typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  const storyFull =
    record && typeof record.story_full === "string"
      ? record.story_full.trim()
      : "";

  if (!storyFull) {
    return NextResponse.json(
      { error: "Model did not return required story fields." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    story_full: storyFull,
  });
}
