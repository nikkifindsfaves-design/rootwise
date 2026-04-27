import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_VIBE } from "@/lib/constants/shared-values";
import { createClient } from "@/lib/supabase/server";
import {
  debitCreditsForAction,
  getCreditSnapshotForUser,
  getSubscriptionAccessStateForUser,
} from "@/lib/billing/credits";
import {
  getIsCensusRecord,
  getIsLandRecord,
} from "@/lib/utils/review-visibility";
import {
  fetchLifeContextForPersonIds,
  fetchLifeSpineFromDatabase,
  parseLifeSpineFromRequestBody,
  type LifeSpineEntry,
} from "@/lib/story/life-spine";
import { estimateCost } from "@/lib/utils/anthropic-cost";
import { parseJsonFromText } from "@/lib/utils/parse-json-from-text";
import { getVoiceInstructions } from "@/lib/vibes/voice-instructions";

const MODEL = "claude-sonnet-4-20250514";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

function parseUuidArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (isUuid(t)) out.push(t);
  }
  return [...new Set(out)];
}

/** Stable hint so parallel requests don’t all pick the same opener. */
function openingModeHint(
  personName: string,
  eventType: string,
  eventDate: string | null
): string {
  const s = `${personName.trim().toLowerCase()}\0${eventType.trim().toLowerCase()}\0${(eventDate ?? "").trim()}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const modes = [
    "place-led",
    "person-led",
    "action-led",
    "document-led",
    "contrast-led",
    "relationship-led",
    "consequence-led",
  ] as const;
  return modes[Math.abs(h) % modes.length] ?? "person-led";
}

/** Rotates which “layer” leads so births don’t all read like the same certificate. */
function textureChannel(
  personName: string,
  eventType: string,
  eventDate: string | null
): "spine" | "notes" | "era" {
  const s = `${personName.trim().toLowerCase()}\0${eventType.trim().toLowerCase()}\0${(eventDate ?? "").trim()}\0texture`;
  let h = 3735928559;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 2654435761);
  }
  const channels = ["spine", "notes", "era"] as const;
  return channels[Math.abs(h >>> 0) % 3]!;
}

type RequestBody = {
  tree_id?: unknown;
  person_name?: unknown;
  event_type?: unknown;
  event_date?: unknown;
  event_place?: unknown;
  event_notes?: unknown;
  related_people?: unknown;
  /** When set, server loads timeline rows from the tree (same tree as tree_id). */
  anchor_person_id?: unknown;
  /** Client-built spine — used only when context_person_ids is not sent. */
  life_spine?: unknown;
  /** All people in the saved batch; server loads their events as spine. */
  context_person_ids?: unknown;
  /** Omit this event row from spine so the focal event is not duplicated in context. */
  exclude_event_id?: unknown;
  /** When this is a census or land **document**, timeline context is omitted (thin stories). */
  record_type_label?: unknown;
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
  const access = await getSubscriptionAccessStateForUser(user.id);
  if (!access.hasAccess) {
    return NextResponse.json(
      {
        error: "An active subscription is required to generate stories.",
        code: "membership_required",
      },
      { status: 402 }
    );
  }

  const snapshot = await getCreditSnapshotForUser(user.id);
  const debit = await debitCreditsForAction({
    userId: user.id,
    action: "story_regenerate",
    idempotencyKey: `regenerate-story:${user.id}:${crypto.randomUUID()}`,
    metadata: { route: "regenerate-story" },
  });

  if (!debit.ok) {
    return NextResponse.json(
      {
        error:
          debit.errorCode === "insufficient_credits"
            ? "You are out of credits for this month. Upgrade, buy add-on credits, or wait for refresh."
            : "Unable to charge credits for story regeneration.",
        code: debit.errorCode,
        billing: snapshot,
      },
      { status: debit.errorCode === "insufficient_credits" ? 402 : 500 }
    );
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

  const clientSpine = parseLifeSpineFromRequestBody(body.life_spine);
  const contextPersonIds = parseUuidArray(body.context_person_ids);
  const anchorPersonRaw = body.anchor_person_id;
  const anchorPersonId =
    typeof anchorPersonRaw === "string" ? anchorPersonRaw.trim() : "";
  const excludeEventRaw = body.exclude_event_id;
  const excludeEventId =
    typeof excludeEventRaw === "string" ? excludeEventRaw.trim() : "";
  const recordTypeLabel =
    typeof body.record_type_label === "string"
      ? body.record_type_label.trim()
      : "";
  const omitTimelineContext =
    getIsCensusRecord(recordTypeLabel) || getIsLandRecord(recordTypeLabel);

  let lifeSpine: LifeSpineEntry[] = [];
  if (!omitTimelineContext) {
    if (
      contextPersonIds.length > 0 &&
      anchorPersonId !== "" &&
      isUuid(anchorPersonId)
    ) {
      lifeSpine = await fetchLifeContextForPersonIds({
        supabase,
        userId: user.id,
        treeId,
        focalPersonId: anchorPersonId,
        contextPersonIds,
        excludeEventId:
          excludeEventId !== "" && isUuid(excludeEventId) ? excludeEventId : null,
      });
    } else if (clientSpine != null && clientSpine.length > 0) {
      lifeSpine = clientSpine;
    } else if (anchorPersonId !== "" && isUuid(anchorPersonId)) {
      lifeSpine = await fetchLifeSpineFromDatabase({
        supabase,
        userId: user.id,
        treeId,
        anchorPersonId,
      });
    }
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

  let vibe = DEFAULT_VIBE;
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

  const spineBlock =
    lifeSpine.length > 0
      ? `Life timeline context (chronological facts from the family tree). Facts below are fair game when they sharpen the beat; stay true to them and do not invent relatives or dates.
${JSON.stringify(lifeSpine, null, 2)}
`
      : "";

  const openingHint = openingModeHint(personName, eventType, eventDate);
  const texture = textureChannel(personName, eventType, eventDate);

  const systemPrompt = `You generate genealogy story JSON for one event.

Voice style:
${getVoiceInstructions(vibe)}

Return ONLY valid JSON with this exact shape:
{
  "story_full": "story text"
}

Requirements:
- Ground every claim in event details, related_people, and life timeline context (if provided). Never invent people, dates, places, or relationships.
- The user message sets a **story texture** (spine | notes | era). Treat it as the lead layer, not the only layer. If the chosen layer is weak, use the next-richest allowed layer without inventing.
- **spine**: household/timeline contrast from life timeline context. **notes**: a concrete event_notes detail (vary clause choice when notes repeat). **era**: a compact time/place atmosphere line (general only; no new names or dates).
- For event_type "birth" or "child born": avoid samey certificate wording. If texture is not **notes**, do not default to attending physician unless no better allowed hook exists.
- story_full must be 250 characters or fewer, including spaces.
- Keep the person the event is about as the subject.
- Never include markdown fences or extra keys.
- Do not start story_full with a date in any format.
- Do not restate the exact event_date in story_full unless it is required to disambiguate the event from another otherwise-identical event.
- Never open with stacked interjections ("well well well", "oh oh oh", "dear reader", etc.).
- Only use personal names that appear in event details, related_people, or subject_name entries in the life timeline context.
- You may use a person's full name, first name, or possessive form (for example, "Dorothy's"). If multiple people share the same first name, use full names for clarity.
- If event_type is "residence", use event_notes as the primary source for household relationship language. Additionally incorporate any relationships listed in related_people that are not already described in event_notes. Never use the word "sibling" unless event_notes or related_people explicitly states it.
- Opening mode vocabulary (pick one): place-led, person-led, action-led, document-led, contrast-led, relationship-led, consequence-led. Follow the user hint for this story.`;

  const baseUserPrompt = `Event details:
${JSON.stringify(eventJson, null, 2)}
${spineBlock}
People referenced in this story:
${relatedPeopleBlock}

Narrator: Open in **${openingHint}** style (see system list).

Story texture: **${texture}**. Lead with one strong hook from that layer first. Do not force all layers into one story.

Use only these people (and spine subject_name entries, when present) when naming someone in the story. You may use a full name, first name, or possessive form when unambiguous.`;

  const staleOpeningPatterns: RegExp[] = [
    /^in the verdant countryside of\b/i,
    /^in the [a-z]+ countryside of\b/i,
    /^in the quiet [a-z]+\b/i,
    /^in the [a-z]+\s+[a-z]+\s+of\b/i,
    /^(?:well[,.\s]+){2,}well\b/i,
    /^oh[,.\s]+oh[,.\s]+oh\b/i,
    /^dear reader\b/i,
  ];

  async function generateStoryText(extraInstruction?: string): Promise<string> {
    const userPrompt = extraInstruction
      ? `${baseUserPrompt}\n\nAdditional requirement for this retry:\n${extraInstruction}`
      : baseUserPrompt;
    const message = await anthropic.messages.create({
      model: MODEL,
      temperature: 0.92,
      max_tokens: 500,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    console.log("[DG] Story regen tokens — input:", message.usage.input_tokens, "| output:", message.usage.output_tokens, "| est. cost $:", estimateCost(message.usage.input_tokens, message.usage.output_tokens, MODEL));

    return message.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
  }

  const text = await generateStoryText();

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

  const startsWithDate =
    /^(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}(?:[/-]\d{1,2}(?:[/-]\d{1,2})?)?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{2,4})?)/i.test(
      storyFull
    );
  const startsWithStaleOpening = staleOpeningPatterns.some((pattern) =>
    pattern.test(storyFull)
  );

  if (startsWithDate || startsWithStaleOpening) {
    const retryText = await generateStoryText(
      `Do not begin with a date or year. Do not use cliche landscape openers. Do not open with repeated interjections ("well well well", etc.). Open in **${openingHint}** mode; keep story texture **${texture}** as the lead layer (see user message).`
    );
    if (retryText) {
      try {
        const retryParsed = parseJsonFromText(retryText);
        const retryRecord =
          typeof retryParsed === "object" && retryParsed !== null
            ? (retryParsed as Record<string, unknown>)
            : null;
        const retryStoryFull =
          retryRecord && typeof retryRecord.story_full === "string"
            ? retryRecord.story_full.trim()
            : "";
        if (
          retryStoryFull &&
          !/^(?:\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{4}(?:[/-]\d{1,2}(?:[/-]\d{1,2})?)?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:,\s*\d{2,4})?)/i.test(
            retryStoryFull
          ) &&
          !staleOpeningPatterns.some((pattern) => pattern.test(retryStoryFull))
        ) {
          return NextResponse.json({
            story_full: retryStoryFull,
          });
        }
      } catch {
        // Fall through to original valid output if retry JSON parse fails.
      }
    }
  }

  return NextResponse.json({
    story_full: storyFull,
  });
}
