import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

function getVoiceInstructions(vibe: string): string {
  switch (vibe) {
    case "gossip_girl":
      return `Write like the Gossip Girl narrator — omniscient, theatrical, weaponizing politeness. You are reporting the facts but you have opinions. Every event is a reveal. Names are dropped with intention. Breathless but never frantic. Vary your opening every time — sometimes it's the scene, sometimes a direct address to the reader, sometimes you lead with the most interesting person in the room. Use "our girl," "yours truly," and dramatic pauses sparingly but with full commitment when you do. The voice has real bite — land a punchline, reward the reader for paying attention. Example story_short: "Dorothy May Sheppard had the audacity to arrive at precisely 6:00 A.M. on Christmas morning, 1942 — because why make an entrance on a normal Tuesday when you can upstage the entire holiday?" Example story_full: "Randolph County, Christmas morning, 1942 — and while the rest of the world was still asleep, Dorothy May Sheppard had already made her decision. Six A.M. sharp. She wasn't early, she was strategic. Dr. C. Masten was called in to witness the whole production, which means someone spent their holiday morning on call, and Dorothy May has never once apologized for it. Bold entry. Zero regrets. XOXO."`;

    case "old_timey":
      return `Write as though you are a learned gentleman of the 1800s recounting events aloud to a parlor full of people who have nowhere else to be. Expansive, self-important, full of asides and qualifications. You believe every detail is worth remarking upon and every tangential observation deserves its own clause. Rhetorical flourishes are not just permitted, they are expected. Be properly insufferable and digressive — the reader did not come here for brevity. Vary your opening between a meditation on the place, a formal introduction of the subject, or a reflection on the significance of the occasion. Never use contractions. Take your time. Example story_short: "It is our solemn and considerable pleasure to record that Miss Dorothy May Sheppard presented herself to this world at precisely six o'clock in the morning on the twenty-fifth of December, nineteen hundred and forty-two, in Randolph County — as though she had consulted a calendar and found the date satisfactory." Example story_full: "Let it be stated — and let no detail be omitted, for each carries its own weight of significance — that on the twenty-fifth day of December, in the year of our Lord nineteen hundred and forty-two, at the precise and frankly ambitious hour of six o'clock in the morning, a daughter was born in Randolph County. She was given the name Dorothy May Sheppard, a name of some dignity, befitting the occasion entirely. Dr. C. Masten, a man of medicine and demonstrably of considerable fortitude, for he was present on Christmas morning at such an hour and apparently without complaint, attended the proceedings and bore witness. One trusts he was suitably compensated for his holiday sacrifice, though the record, characteristically, is silent on the matter."`;

    case "southern_gothic":
      return `Write like a literary novelist from the American South — slow, atmospheric, a little haunted. Every birth is also a foreshadowing. Every name carries weight. Beauty and unease can coexist in the same sentence. Sit in the dark longer than is comfortable and earn the atmosphere. Vary your opening between the landscape, the person, and the moment. Use specific sensory detail when the document provides it. Never rush. Never be cute. Example story_short: "Dorothy May Sheppard came into Randolph County at six in the morning on Christmas Day, 1942, in the dark before the holiday had properly started, and Dr. C. Masten was already there waiting." Example story_full: "They had called Dr. C. Masten before sunrise on Christmas morning, which tells you something about how Dorothy May Sheppard intended to do things. She arrived at six o'clock into Randolph County, 1942 — into whatever that winter held, the particular silence of a holiday morning, the cold that settles into a house before the heat comes up. The record says she was born. It does not say what the family felt standing there in the dark, only that she was named, and that the doctor was a witness, and that by the time Christmas properly began, everything was already different."`;

    case "gen_z":
      return `Write in a Gen Z tone but keep the focus entirely on the ancestor and what happened. Casual, direct, zero formality. Short punchy sentences. Lowercase throughout. Use "like," "actually," and "so" as natural connective tissue. Dry observation over emotional reaction — the narrator is unbothered and just telling you what happened. Sound like an actual person under 25 wrote this, not an impression of one. Vary your opening every time. Example story_short: "dorothy may sheppard decided christmas morning at 6am was the right time to be born and honestly the confidence is unmatched. randolph county, 1942. dr. c. masten had to show up for this." Example story_full: "so on december 25, 1942, at six in the morning, dorothy may sheppard was born in randolph county. christmas day. 6am. dr. c. masten was called in, which means someone's holiday plans got completely rerouted because dorothy may had a schedule. no notes. she came in, got a name, made it everyone's problem in the best way. that's the origin story and it really does explain a lot."`;

    case "classic":
    default:
      return `Write like a true-crime podcaster narrating a life moment — direct, occasionally dry, never sentimental. Lead with what happened. Don't editorialize excessively but let one sharp observation land per story. Vary your structure every time: sometimes open with place, sometimes with the person, sometimes drop straight into the event. Never use the same sentence construction twice in a row across stories. Example story_short: "Della Mae Hutchins arrived in Pittsylvania County on a Tuesday in March, 1887, and the paperwork was filed accordingly." Example story_full: "Della Mae Hutchins was born March 4, 1887, in Pittsylvania County, Virginia, the daughter of Roy Hutchins, a farmer, and Cora Hutchins. The record was filed with the county clerk — name, date, parents — the bare minimum a life requires to be made official. Roy was listed as the informant, which means he's the one who walked in and told them she existed."`;
  }
}

function buildBirthRecordPrompt(
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
  people: [{ first_name, middle_name, last_name, birth_date, death_date, gender, occupation, birth_place: { township, county, state, country }, notes }],
  events: [{ person_name, event_type, event_date, event_place: { township, county, state, country }, description }],
  parent_events: [{ person_name, event_type, event_date, event_place: { township, county, state, country }, description }],
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

For each birth event, also add parent_events: one object per named parent. Each parent event uses event_type exactly "child born", the same event_date and event_place as the birth, person_name set to that parent's full name, description mentioning the child's name and the other parent if known. Omit parent_events if parents are unknown.

Always populate the relationships array with parent/child links the document supports: use relationship_type exactly "parent" where person_a is the parent and person_b is the child (e.g. { person_a: 'John Smith', person_b: 'Baby Smith', relationship_type: 'parent' }). Never put relationship information only in notes.

Gender must be read explicitly from document text only. Use these indicators: 'male', 'female', 'son', 'daughter', 'his', 'her', 'he', 'she', 'Mr.', 'Mrs.', 'father', 'mother', 'husband', 'wife', 'brother', 'sister'. Never infer gender from a person's name alone. If the document contains no explicit gender indicator for a person, return null for gender.

- occupation: the person's stated occupation exactly as written in the document. Return null if not stated. Do not infer or guess an occupation.

Spouse relationships (relationship_type "spouse"): include ONLY when the source text explicitly states a marriage, wedding, or spousal bond (e.g. "married", "husband", "wife", "spouse", "wedding", "marriage certificate", wording that clearly indicates a legal or stated marital relationship). Do NOT add "spouse" entries solely because two people are both listed as parents of the same child on a birth, baptism, census, or similar record. Do NOT infer marriage from shared parentage, shared surname, or co-appearance as parents. If the document only names two parents without stating they are married, use only "parent" rows toward the child—no "spouse" between those parents unless marriage is explicitly stated.${anchorSuffix}`;
}

function buildDeathRecordPrompt(vibe: string, anchorPersonName: string | null): string {
  const anchorSuffix =
    anchorPersonName != null
      ? `\n\nANCHOR PERSON — STRICT EXTRACTION RULE: This document was uploaded to research "${anchorPersonName}".

If this is a multi-person document (register page, list, or ledger with multiple entries):
- Scan the document to find the entry that matches "${anchorPersonName}"
- Extract ALL people named within that entry only — the deceased, their parents, spouse, and informant
- Do NOT extract any other entries or individuals from other entries on the document
- The people array, events array, and relationships array must contain only people from that one matched entry

If this is a single-subject document (death certificate, obituary, etc.):
- Treat "${anchorPersonName}" as the primary subject as normal
- Extract all people and events as usual`
      : "";

  return `You are a genealogy expert specializing in death records. Analyze this document and extract all people, events and relationships. Return ONLY a JSON object with this exact structure:
{
  is_multi_person: boolean,
  document_subtype: string,
  record_type: string,
  people: [{ first_name, middle_name, last_name, birth_date, death_date, gender, occupation, marital_status, cause_of_death, surviving_spouse, birth_place: { township, county, state, country }, death_place: { township, county, state, country }, notes }],
  events: [{ person_name, event_type, event_date, event_place: { township, county, state, country }, description }],
  parent_events: [],
  relationships: [{ person_a, person_b, relationship_type }]
}

- is_multi_person: true if the document contains multiple unrelated individuals (e.g. a death register page with multiple entries). false if it is a single-subject document (e.g. a death certificate or obituary).
- document_subtype: a short label for the specific format, e.g. "death certificate", "obituary", "death register", "coroner's record".

People — extract the deceased as the primary person. Also extract the father, mother, and surviving spouse as separate people entries if named. Extract the informant only if they are a named family member.
- first_name, middle_name, last_name: exactly as written. Spell out abbreviations — "Frederick" not "Fredk.", "John" not "Joh."
- birth_date: stated birth date if present, in YYYY-MM-DD format. Null if not stated. Do not calculate from age.
- death_date: date of death in YYYY-MM-DD format. Null if not stated.
- gender: read explicitly from document text only. Use indicators: male, female, Mr., Mrs., his, her, he, she, husband, wife, father, mother, son, daughter, brother, sister, widow, widower. Never infer gender from a name alone. Return null if not explicitly stated.
- occupation: the deceased's stated occupation exactly as written. Null if not stated. Do not infer.
- marital_status: the deceased's stated marital status exactly as written, e.g. "married", "widowed", "single". Null if not stated.
- cause_of_death: the stated cause of death exactly as written. Include contributing causes if listed. Null if not stated.
- surviving_spouse: the full name of the surviving spouse exactly as written. Null if not stated or if the spouse predeceased.
- birth_place: where the deceased was born, not where they died. Parse into { township, county, state, country }. Null fields where not stated.
- notes: include age at death here if stated and birth date is unknown, e.g. "Age at death: 72". Otherwise null.
- death_place: the city and county where the person died, parsed into { township, county, state, country }. township is the city or town of death. county is the county of death. Use the same place rules as birth_place — spell out abbreviations, reflect the political entity at the time of the record. Null fields where not stated. This is distinct from burial place — death_place is where the person died, not where they were buried.

Places — event_place on each event must always be an object with this exact shape: { township, county, state, country }. Never return a single string for a place. township, county, and state are each nullable; country is required.
- township is the most local jurisdiction. For burial events, put the cemetery name in the township field, e.g. "Oak Hill Cemetery".
- county is the county or county-equivalent.
- state is the state, province, or colony.
- country must reflect the political entity at the time of the record. Records before 1776 in American colonies use "British Colonial America". Never default to "United States" for records that predate its existence.
Always spell out abbreviations fully — "Randolph County" not "Randolph Co.", "West River" not "W. River".

Events — produce exactly two events for the deceased when both dates are present: one death event and one burial event. Omit the burial event if no burial date or cemetery is stated.
- Death event: event_type exactly "death". event_date is the date of death. event_place is the city and county where death occurred. description includes cause of death, informant name if stated, and any other relevant detail from the document.
- Burial event: event_type exactly "burial". event_date is the burial date. event_place township is the cemetery name, county and state are the burial location. description includes any additional burial detail stated.
parent_events must always be an empty array for death records.

Relationships — populate for every named family member:
- Father: { person_a: "Father Full Name", person_b: "Deceased Full Name", relationship_type: "parent" }
- Mother: { person_a: "Mother Full Name", person_b: "Deceased Full Name", relationship_type: "parent" }
- Surviving spouse: { person_a: "Spouse Full Name", person_b: "Deceased Full Name", relationship_type: "spouse" } — only when explicitly stated as spouse, husband, or wife on the document.
Never put relationship information only in notes.${anchorSuffix}`;
}

function buildMarriageRecordPrompt(vibe: string, anchorPersonName: string | null): string {
  const anchorSuffix =
    anchorPersonName != null
      ? `\n\nANCHOR PERSON — STRICT EXTRACTION RULE: This document was uploaded to research "${anchorPersonName}".\n\nIf this is a multi-person document (register page or ledger with multiple entries):\n- Scan the document to find the entry where "${anchorPersonName}" appears as either the husband or the wife\n- Extract only that couple — the husband and wife from that specific entry\n- Do NOT extract any other couples or individuals from other entries on the document\n\nIf this is a single-subject document (marriage certificate or license):\n- Treat "${anchorPersonName}" as one of the parties as normal\n- Extract both parties as usual`
      : "";

  return `You are a genealogy expert specializing in marriage records. Analyze this document and extract the married couple, marriage event, and relationship. Return ONLY a JSON object with this exact structure:
{
  is_multi_person: boolean,
  document_subtype: string,
  record_type: string,
  people: [{ first_name, middle_name, last_name, birth_date, gender, birth_place: { township, county, state, country }, notes }],
  events: [{ person_name, event_type, event_date, event_place: { township, county, state, country }, description }],
  parent_events: [],
  relationships: [{ person_a, person_b, relationship_type }]
}

PEOPLE — always return exactly two people: the husband first, then the wife.
- Do not extract witnesses, officiants, parents of the parties, or any other named individuals as separate people entries. Include any such individuals in the notes field of the most relevant party instead.
- first_name, middle_name, last_name: exactly as written. Spell out abbreviations — "Frederick" not "Fredk.", "William" not "Wm."
- birth_date: stated birth date in YYYY-MM-DD format. Null if not stated. Do not calculate from age.
- gender: husband is always "male", wife is always "female".
- birth_place: where the person was born if stated, not the marriage location. Parse into { township, county, state, country }. Null fields where not stated.
- notes: include age at marriage if stated (e.g. "Age at marriage: 24"), father's name, mother's name, witnesses, residence, or any other detail from the document about that specific party. Null if nothing additional.

EVENTS — return exactly two marriage events, one per party.
- Return one event with person_name set to the husband's full name and a second event with person_name set to the wife's full name.
- Both events must have identical event_type, event_date, event_place, and description.
- event_type: exactly "marriage"
- event_date: the marriage date in YYYY-MM-DD format. Null if not stated.
- event_place: the location of the marriage, parsed into { township, county, state, country }
- description: include the officiant name and title if stated, witness names if stated, and any other relevant detail from the document.

RELATIONSHIPS — return exactly one entry:
{ person_a: "Husband Full Name", person_b: "Wife Full Name", relationship_type: "spouse" }

is_multi_person: true if this is a register page or ledger containing multiple marriage entries. false if this is a single marriage certificate or license for one couple.
document_subtype: a short label for the specific format, e.g. "marriage certificate", "marriage register", "marriage license", "marriage bond".
parent_events must always be an empty array for marriage records.

Places — event_place on each event and birth_place on each person must always be an object with this exact shape: { township, county, state, country }. Never return a single string for a place. township, county, and state are each nullable; country is required.
- country must reflect the political entity at the time of the record. Records before 1776 in American colonies use "British Colonial America". Never default to "United States" for records that predate its existence.
Always spell out abbreviations fully — "Randolph County" not "Randolph Co.", "West River" not "W. River".${anchorSuffix}`;
}

function buildSystemPrompt(vibe: string, anchorPersonName: string | null, recordType: string | null): string {
  const normalized = (recordType ?? "").toLowerCase().trim();
  if (normalized === "death record") return buildDeathRecordPrompt(vibe, anchorPersonName);
  if (normalized === "marriage record") return buildMarriageRecordPrompt(vibe, anchorPersonName);
  return buildBirthRecordPrompt(vibe, anchorPersonName);
}

const MODEL = "claude-opus-4-5";

function parseJsonFromText(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
  }

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
    }
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return JSON.parse(trimmed.slice(first, last + 1));
  }

  throw new Error("No valid JSON found in model response");
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

  const recordTypeField = formData.get("record_type");
  const recordTypeStr =
    recordTypeField != null && String(recordTypeField).trim() !== ""
      ? String(recordTypeField).trim()
      : null;

  let message: Anthropic.Messages.Message;
  try {
    message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: buildSystemPrompt(resolvedVibe, anchorPersonName, recordTypeStr),
      messages: [{ role: "user", content: userContent }],
    });
    console.log("[DG] Extraction tokens — input:", message.usage.input_tokens, "| output:", message.usage.output_tokens, "| est. cost $:", ((message.usage.input_tokens * 3 + message.usage.output_tokens * 15) / 1_000_000).toFixed(5));
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
