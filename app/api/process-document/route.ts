import Anthropic from "@anthropic-ai/sdk";
import {
  DEFAULT_VIBE,
  MANUAL_ENTRY_DOCUMENT_SUBTYPE,
} from "@/lib/constants/shared-values";
import { createClient } from "@/lib/supabase/server";
import { estimateCost } from "@/lib/utils/anthropic-cost";
import { parseJsonFromText } from "@/lib/utils/parse-json-from-text";
import { NextResponse, type NextRequest } from "next/server";

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

For each person extracted, also add a baptism event to the events array when the document states a baptism or christening date. The baptism event uses event_type exactly "baptism", the baptism date as event_date, the place of baptism as event_place (which may differ from the birth place — parse it separately if stated), and a description noting the church or officiant name if stated. Omit the baptism event entirely if no baptism or christening date is stated in the document. Do not produce a baptism event solely because the document is a church register — only produce it when a date is explicitly present.

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

function buildCensusRecordPrompt(
  vibe: string,
  anchorPersonName: string | null,
  householdSurname: string | null
): string {
  const anchorSuffix =
    anchorPersonName != null
      ? `\n\nANCHOR PERSON — STRICT EXTRACTION RULE: This document was uploaded to research "${anchorPersonName}".

If this is a census page with multiple households:
- Scan the document to find the household entry that contains "${anchorPersonName}"
- Extract ONLY the people within that household
- Do NOT extract people from any other household on the page

If this is a single-household document:
- Treat "${anchorPersonName}" as a member of the household as normal
- Extract all household members as usual`
      : "";

  const householdSurnameSuffix =
    householdSurname != null && householdSurname.trim() !== ""
      ? `\n\nHOUSEHOLD SURNAME — STRICT EXTRACTION RULE: The researcher specified this family surname: "${householdSurname.trim()}".

CRITICAL: Scan the ENTIRE document from top to bottom before extracting anyone. Do not stop at the first match. Identify ALL rows where the surname "${householdSurname.trim()}" appears anywhere on the page — they may appear in multiple separate groups, separated by other families or blank rows.

Once you have identified all matching rows:
- Extract every person in those rows and their immediate household members (spouse, children, others in the same numbered household entry)
- Include people in the same household cluster even if they have a different surname (for example a wife using a maiden name)
- Do NOT extract people from households where the surname does not match
- Set is_multi_person to false in your JSON because you are returning a single household group only`
      : "";

  return `You are a genealogy expert specializing in census records. Analyze this document and extract all people in the household, their relationships, and their residence event. Return ONLY a JSON object with this exact structure:
{
  is_multi_person: boolean,
  document_subtype: string,
  record_type: string,
  people: [{ first_name, middle_name, last_name, birth_date, gender, occupation, birth_place: { township, county, state, country }, notes }],
  events: [{ person_name, event_type, event_date, event_place: { township, county, state, country }, description }],
  parent_events: [],
  relationships: [{ person_a, person_b, relationship_type }]
}

PEOPLE — extract every person in the household who appears to be a family member. Exclude boarders, lodgers, and servants unless the document explicitly states a family relationship such as "nephew", "mother-in-law", or similar.
- first_name, middle_name, last_name: exactly as written. Spell out abbreviations.
- birth_date: calculate as census year minus stated age, returned as "YYYY" only. If age is not stated, return null.
- gender: read explicitly from document text only. Use indicators: male, female, M, F, son, daughter, his, her, husband, wife. Never infer gender from a name alone. Return null if not explicitly stated.
- occupation: exactly as written in the document. Return null if not stated.
- birth_place: the stated birthplace of this individual, parsed into { township, county, state, country }. Census records typically list only state or country — set township and county to null if not stated. country must reflect the political entity at the time of the record.
- notes: write a short phrase describing who this person lived with, using relationship labels, e.g. "Lived with wife Mary Smith, sons John Jr. and Thomas, and daughter Clara." Use the relationship roles from the document or inferred relationships — never use the word "sibling" for a spouse, parent, or child. Always populate this field for every person extracted.

EVENTS — produce exactly one residence event per person, no exceptions. Every single person in the people array must have a corresponding residence event in the events array. If you are uncertain about any detail for a person, still produce their residence event with whatever date and place information is available from the document. A person with no residence event is an extraction error.
- event_type: exactly "residence"
- event_date: the census year as "YYYY" only, e.g. "1880"
- event_place: the household location parsed into { township, county, state, country }. Use the same place rules as birth_place — spell out abbreviations, reflect the political entity at the time of the record.
- description: state the person's role in the household (head, wife, son, daughter, etc.) and their occupation if stated.
- person_name: the full name of the person this event belongs to.

parent_events must always be an empty array for census records.

RELATIONSHIPS — infer from the relationship column when present. When the relationship column is absent or unclear, infer from age and surname patterns:
- The first listed person is typically the head of household.
- A person of similar age with a different surname is likely a spouse.
- Younger people sharing the head's surname are likely children — use relationship_type "parent" with person_a as the parent and person_b as the child.
- Use relationship_type "spouse" only when the document states it or when strong inference supports it (similar age, different surname, co-head of household).
- Use relationship_type "sibling" when two people share a surname and appear to be the same generation.
Always populate relationships for every family member extracted. Never put relationship information only in notes.

is_multi_person: true if this census page contains multiple unrelated households. false if it contains a single household.
document_subtype: a short label for the specific format, e.g. "federal census", "state census", "census schedule".

Places — event_place on each event and birth_place on each person must always be an object with this exact shape: { township, county, state, country }. Never return a single string for a place. township, county, and state are each nullable; country is required.
Always spell out abbreviations fully — "Randolph County" not "Randolph Co.", "West Virginia" not "W. Va."${anchorSuffix}${householdSurnameSuffix}`;
}

function buildMilitaryRecordPrompt(vibe: string, anchorPersonName: string | null): string {
  const anchorSuffix =
    anchorPersonName != null
      ? `\n\nANCHOR PERSON — STRICT EXTRACTION RULE: This document was uploaded to research "${anchorPersonName}".

If this is a multi-person document (muster roll, personnel roster, roll, roster of dead, report of changes, or similar):
- Scan the document to find the entry that matches "${anchorPersonName}"
- Extract ONLY that person and any individuals directly named in relation to them in that entry
- Do NOT extract any other individuals from other entries on the document

If this is a single-subject document (draft card, discharge paper, award citation, etc.):
- Treat "${anchorPersonName}" as the primary subject as normal
- Extract all people and events as usual`
      : "";

  return `You are a genealogy expert specializing in military records. Analyze this document and extract all people, events, and relationships. Return ONLY a JSON object with this exact structure:
{
  is_multi_person: boolean,
  document_subtype: string,
  record_type: string,
  people: [{ first_name, middle_name, last_name, birth_date, death_date, gender, occupation, military_branch, service_number, birth_place: { township, county, state, country }, notes }],
  events: [{ person_name, event_type, event_date, event_place: { township, county, state, country }, description }],
  parent_events: [],
  relationships: [{ person_a, person_b, relationship_type }]
}

PEOPLE — extract the anchor person as the primary subject. Extract other named individuals only when the document explicitly states a relationship to the anchor person (next of kin, commanding officer, fellow crew member named in the same entry). Do not extract names that appear only incidentally.
- first_name, middle_name, last_name: exactly as written. Spell out abbreviations.
- birth_date: stated birth date in YYYY-MM-DD format, or year only as "YYYY". Null if not stated.
- death_date: stated death date in YYYY-MM-DD format. Null if not stated.
- gender: read explicitly from document text only. Use indicators: male, female, M, F, Mr., Mrs., his, her, he, she. Never infer gender from a name alone. Return null if not explicitly stated.
- occupation: civilian occupation if stated. Null if not stated.
- military_branch: the branch of military service stated in the document, e.g. "Army", "Navy", "Marine Corps", "Coast Guard", "Army Air Forces". Null if not stated.
- service_number: the service number, serial number, or military ID number exactly as written. Null if not stated.
- birth_place: where the person was born if stated, parsed into { township, county, state, country }. Null fields where not stated.
- notes: any additional biographical detail from the document not captured in other fields — rank, unit, ship or station name, next of kin name and address, civilian employer, or any other person-level detail. Null if nothing additional.

EVENTS — extract every event this document provides evidence for. A single document may produce multiple events. For example: a muster roll showing an enlistment date and a transfer date produces both an enlistment event and a military transfer event. A report of changes showing an action code and date produces the corresponding event. Do not limit yourself to one event per document — extract all events the document supports.

Use these event_type values. Choose the most specific type that fits:
- "enlistment" — the person entered military service on a stated date
- "deployment" — the person was deployed to a theater, base, or region
- "military transfer" — the person was transferred to a new unit, ship, or station
- "military award" — a decoration, medal, or commendation was received
- "discharge" — the person was separated from military service
- "missing in action" — the person was officially designated MIA
- "killed in action" — the person died in combat
- "prisoner of war" — the person was captured
- "military service" — general military service when no more specific type applies
- "other" — use only when the event clearly does not fit any above type

For each event:
- person_name: full name of the person this event belongs to
- event_type: exactly one of the values listed above
- event_date: the date of the event in YYYY-MM-DD format, or year only as "YYYY". Null if not stated.
- event_place: the location parsed into { township, county, state, country }. For ship-based events, put the ship or station name in the township field.
- description: include rank at the time of the event, unit or ship name, action code if present, and any other relevant detail from the document. Capture structured fields like enrollment location, action type, and vessel name here if not captured elsewhere.

parent_events must always be an empty array for military records.

RELATIONSHIPS — populate only when the document explicitly states a relationship between named individuals. Use the standard relationship types: parent, spouse, sibling. Never infer relationships from co-appearance alone.

is_multi_person: true if this document contains multiple individuals not all related to the anchor person (muster roll, personnel roster, roll, roster of dead, report of changes). false if it is a single-subject document (draft card, discharge paper, award citation, individual service record).

document_subtype: classify the document as one of: "Draft Registration", "Muster Roll", "Report of Changes", "Personnel Roll", "Roster of Dead", "Missing in Action Report", "Awards/Commendations", "Other".

Places — event_place on each event and birth_place on each person must always be an object with this exact shape: { township, county, state, country }. Never return a single string for a place. township, county, and state are each nullable; country is required.
- country must reflect the political entity at the time of the record. Records before 1776 in American colonies use "British Colonial America". Never default to "United States" for records that predate its existence.
Always spell out abbreviations fully — "Randolph County" not "Randolph Co.", "West Virginia" not "W. Va."${anchorSuffix}`;
}

function buildLandRecordPrompt(
  vibe: string,
  anchorPersonName: string | null,
  filterSurname: string | null
): string {
  const anchorSuffix =
    anchorPersonName != null
      ? `\n\nANCHOR PERSON — STRICT EXTRACTION RULE: The researcher typed "${anchorPersonName}" to identify who they are researching.

Determine which case applies:

CASE 1 — Full name provided (first and last name, e.g. "Elijah Garrett"):
- Scan the document and find the single row or entry where this exact person appears
- Extract ONLY that one person and their land event
- Do not extract anyone else from the document

CASE 2 — Surname only provided (e.g. "Garrett"):
- Scan the entire document from top to bottom
- Extract every person whose surname matches "${anchorPersonName}" or a historical spelling variation
- Each matching row becomes one person entry and one land event
- Do not extract anyone whose surname does not match

If this is a single-subject document like a deed or patent with only one named party, extract that person normally regardless of which case applies.

If you cannot find anyone matching "${anchorPersonName}" on the document, return an empty people array.`
      : "";

  const filterSurnameSuffix =
    filterSurname != null && filterSurname.trim() !== ""
      ? `\n\nSURNAME FILTER — THIS OVERRIDES ALL OTHER EXTRACTION INSTRUCTIONS:

The researcher wants ONLY people with the surname "${filterSurname.trim()}". This is a hard filter. Every person you extract must have this surname or a historical spelling variation of it. No exceptions.

BEFORE extracting anyone, do this:
1. Read every name on the document from top to bottom, left column then right column
2. Mark ONLY the rows where the surname is "${filterSurname.trim()}" (or a spelling variation such as ${filterSurname.trim().slice(0,4)}*)
3. Discard every other row entirely — do not include them in people, events, or relationships under any circumstances

People like "Elder William", "Hill William", "Kennedy John" or any name where the surname does not match "${filterSurname.trim()}" must NOT appear in your response at all. Not in people. Not in events. Not in relationships.

Each matching row becomes exactly one person entry and one land event. Set is_multi_person to false.

If you are uncertain whether a name matches, err on the side of excluding it.`
      : "";

  return `You are a genealogy expert specializing in land records. Analyze this document and extract all people, events, and relationships. Return ONLY a JSON object with this exact structure:
{
  is_multi_person: boolean,
  document_subtype: string,
  record_type: string,
  people: [{ first_name, middle_name, last_name, birth_date, gender, birth_place: { township, county, state, country }, notes }],
  events: [{ person_name, event_type, event_date, event_place: { township, county, state, country }, land_data: { acres: number | null, transaction_type: string | null } }],
  parent_events: [],
  relationships: [{ person_a, person_b, relationship_type }]
}

PEOPLE — extract every person named as a party to the transaction (grantor, grantee, taxpayer, patentee, surveyor's subject, etc.). Do not extract witnesses or officials unless they are also named as a party.
- first_name, middle_name, last_name: exactly as written. Spell out abbreviations — "William" not "Wm.", "Thomas" not "Thos."
- birth_date: null — land records rarely state birth dates. Return null unless explicitly present.
- gender: read explicitly from document text only using indicators: Mr., Mrs., his, her, he, she, husband, wife, widow, widower. Never infer gender from a name alone. Return null if not explicitly stated.
- birth_place: null unless explicitly stated in the document.
- notes: include role in the transaction (e.g. "Grantor", "Grantee", "Taxpayer") and any other relevant person-level detail. Never null — always state the role.

EVENTS — produce exactly one land event per person named as a party to the transaction.
- event_type: exactly "land"
- event_date: the date of the transaction in YYYY-MM-DD format, or year only as "YYYY". Null if not stated.
- event_place: the location of the land parcel, parsed into { township, county, state, country }. This is where the land is located, not where the document was recorded unless they are the same. township is the most local jurisdiction (town, township, hundred, district, parish). county is the county or county-equivalent. state is the state, province, or colony. country must reflect the political entity at the time of the record — records before 1776 in American colonies use "British Colonial America". Never default to "United States" for records that predate its existence. Spell out all abbreviations fully.
- land_data: an object with exactly two fields:
  - acres: the numeric acreage as a decimal number (e.g. 34.5 for thirty-four and a half acres). Parse written numbers to digits — "one hundred" becomes 100, "thirty-four and a half" becomes 34.5. Return null if acreage is not stated or cannot be confidently parsed to a number.
  - transaction_type: classify the transaction as one of exactly these values: "Acquired", "Sold", "Gifted", "Taxed", "Surveyed". Use "Acquired" for any purchase, grant, patent, or inheritance. Use "Gifted" for any deed of gift or will bequest transferring land out of the person's name. Use "Taxed" when the document is a tax list confirming ownership. Use "Surveyed" when the document is a survey or map naming the person as a landowner.

parent_events must always be an empty array for land records.

RELATIONSHIPS — populate only when the document explicitly states a relationship between named parties (e.g. husband and wife both named as grantors, a father deeding land to a son). Use relationship_type "spouse" or "parent" as appropriate. Never infer relationships from co-appearance alone.

is_multi_person: true if this document contains multiple unrelated transactions or individuals (e.g. a tax list, a deed book page with multiple entries). false if this is a single transaction document.

document_subtype: classify as one of: "Deed", "Deed of Gift", "Land Grant", "Tax List", "Survey", "Quitclaim Deed", "Indenture", "Patent", "Warrant", "Other".

Places — event_place on each event and birth_place on each person must always be an object with this exact shape: { township, county, state, country }. Never return a single string for a place. township, county, and state are each nullable; country is required.
- country must reflect the political entity at the time of the record. Records before 1776 in American colonies use "British Colonial America". Never default to "United States" for records that predate its existence.
Always spell out abbreviations fully — "Randolph County" not "Randolph Co.", "West River" not "W. River".${anchorSuffix}${filterSurnameSuffix}`;
}

function buildSystemPrompt(
  vibe: string,
  anchorPersonName: string | null,
  recordType: string | null,
  censusHouseholdSurname: string | null
): string {
  const normalized = (recordType ?? "").toLowerCase().trim();
  if (normalized === "death record") return buildDeathRecordPrompt(vibe, anchorPersonName);
  if (normalized === "marriage record") return buildMarriageRecordPrompt(vibe, anchorPersonName);
  if (normalized === "census record")
    return buildCensusRecordPrompt(vibe, anchorPersonName, censusHouseholdSurname);
  if (normalized === "military record") return buildMilitaryRecordPrompt(vibe, anchorPersonName);
  if (normalized === "land record") return buildLandRecordPrompt(vibe, anchorPersonName, censusHouseholdSurname);
  return buildBirthRecordPrompt(vibe, anchorPersonName);
}

const MODEL = "claude-opus-4-5";

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

function formTruthySkipExtraction(raw: FormDataEntryValue | null): boolean {
  if (raw == null) return false;
  if (typeof raw === "string") {
    const t = raw.trim().toLowerCase();
    return t === "true" || t === "1" || t === "yes";
  }
  return false;
}

export async function POST(request: NextRequest) {
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

  const skipExtraction = formTruthySkipExtraction(
    formData.get("skip_extraction")
  );

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

  let resolvedVibe = DEFAULT_VIBE;
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

  const recordTypeField = formData.get("record_type");
  const recordTypeStr =
    recordTypeField != null && String(recordTypeField).trim() !== ""
      ? String(recordTypeField).trim()
      : null;

  if (skipExtraction) {
    const manualAiResponse: Record<string, unknown> = {
      record_type: recordTypeStr ?? "",
      people: [],
      events: [],
      parent_events: [],
      relationships: [],
      is_multi_person: false,
      document_subtype: MANUAL_ENTRY_DOCUMENT_SUBTYPE,
      extraction_skipped: true,
    };

    const { data: record, error: recordError } = await supabase
      .from("records")
      .insert({
        user_id: user.id,
        file_url: fileUrl,
        file_type: resolvedFileType,
        ai_response: manualAiResponse,
        ...(recordTypeStr ? { record_type: recordTypeStr } : {}),
        ...(resolvedTreeId != null ? { tree_id: resolvedTreeId } : {}),
        document_subtype: MANUAL_ENTRY_DOCUMENT_SUBTYPE,
      })
      .select("id")
      .maybeSingle();

    if (recordError) {
      return NextResponse.json(
        { error: `Failed to save record: ${recordError.message}` },
        { status: 500 }
      );
    }
    if (!record) {
      return NextResponse.json(
        { error: "Failed to save record: unknown" },
        { status: 500 }
      );
    }

    const recordId = record.id as string;
    return NextResponse.json({
      ...manualAiResponse,
      recordId,
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 }
    );
  }

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

  const censusSurnameRaw = formData.get("census_surname");
  const censusSurnameTrim =
    censusSurnameRaw != null && String(censusSurnameRaw).trim() !== ""
      ? String(censusSurnameRaw).trim()
      : "";
  const censusHouseholdSurnameForPrompt =
    recordTypeStr != null &&
    (recordTypeStr.toLowerCase().trim() === "census record" ||
      recordTypeStr.toLowerCase().trim() === "land record") &&
    censusSurnameTrim !== ""
      ? censusSurnameTrim
      : null;

  let message: Anthropic.Messages.Message;
  try {
    message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: buildSystemPrompt(
        resolvedVibe,
        anchorPersonName,
        recordTypeStr,
        censusHouseholdSurnameForPrompt
      ),
      messages: [{ role: "user", content: userContent }],
    });
    console.log("[DG] Extraction tokens — input:", message.usage.input_tokens, "| output:", message.usage.output_tokens, "| est. cost $:", estimateCost(message.usage.input_tokens, message.usage.output_tokens, MODEL));
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
    .maybeSingle();

  if (recordError) {
    return NextResponse.json(
      { error: `Failed to save record: ${recordError.message}` },
      { status: 500 }
    );
  }
  if (!record) {
    return NextResponse.json(
      { error: "Failed to save record: unknown" },
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
