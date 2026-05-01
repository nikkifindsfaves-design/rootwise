import { createClient } from "@/lib/supabase/server";
import {
  findOrCreateInReviewPlace,
  findOrCreatePlace,
  normalizePlaceFields,
  type PlaceFields,
} from "@/lib/utils/places";
import { inverseRelationshipType } from "@/lib/relationships/direction";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

type ManualEventPersonBody = {
  clientId?: unknown;
  existingPersonId?: unknown;
  first_name?: unknown;
  middle_name?: unknown;
  last_name?: unknown;
  birth_date?: unknown;
  death_date?: unknown;
  cause_of_death?: unknown;
  gender?: unknown;
  notes?: unknown;
  event?: unknown;
};

type ManualRelationshipBody = {
  fromClientId?: unknown;
  toClientId?: unknown;
  relationship_type?: unknown;
};

type ResolvedPerson = {
  clientId: string;
  personId: string;
  name: string;
};

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildFullName(row: {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
}): string {
  return [row.first_name, row.middle_name, row.last_name]
    .map((part) => (part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function parsePlaceFields(raw: unknown): PlaceFields | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return {
    township:
      typeof o.township === "string" || o.township === null
        ? (o.township as string | null)
        : null,
    county:
      typeof o.county === "string" || o.county === null
        ? (o.county as string | null)
        : null,
    state:
      typeof o.state === "string" || o.state === null
        ? (o.state as string | null)
        : null,
    country: typeof o.country === "string" ? o.country : "",
  };
}

function parsePlaceDisplayToFields(display: string): PlaceFields | null {
  const looksLikeCounty = (value: string): boolean =>
    /\b(county|co\.?|cnty\.?)\b/i.test(value);
  const parts = display
    .trim()
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) {
    return { township: null, county: null, state: null, country: parts[0]! };
  }
  if (parts.length === 2) {
    return { township: null, county: null, state: parts[0]!, country: parts[1]! };
  }
  if (parts.length === 3) {
    const first = parts[0]!;
    return {
      township: looksLikeCounty(first) ? null : first,
      county: looksLikeCounty(first) ? first : null,
      state: parts[1]!,
      country: parts[2]!,
    };
  }
  const country = parts[parts.length - 1]!;
  const state = parts[parts.length - 2]!;
  const county = parts[parts.length - 3]!;
  const township = parts.slice(0, -3).join(", ");
  return { township, county, state, country };
}

async function resolveEventPlaceId(
  supabase: SupabaseClient,
  event: Record<string, unknown>
): Promise<{ id: string | null; error: string | null }> {
  const rawId = stringValue(event.event_place_id);
  if (rawId) return { id: rawId, error: null };

  let fields = parsePlaceFields(event.event_place_fields);
  if (fields === null) {
    const display = stringValue(event.event_place_display);
    if (display) fields = parsePlaceDisplayToFields(display);
  }
  if (fields === null) return { id: null, error: null };

  const normalizedFields = normalizePlaceFields(fields);
  const placeResult = await findOrCreatePlace(supabase, normalizedFields, {
    allowCreate: false,
  });
  if (!placeResult.ok) return { id: null, error: placeResult.message };
  if (placeResult.id) return { id: placeResult.id, error: null };

  const rawInput =
    stringValue(event.event_place_display) ||
    JSON.stringify(event.event_place_fields ?? {});
  const reviewResult = await findOrCreateInReviewPlace(supabase, {
    ...normalizedFields,
    source_dataset: "manual_profile_event",
    source_ref: rawInput,
  });
  if (!reviewResult.ok) return { id: null, error: reviewResult.message };
  return { id: reviewResult.id, error: null };
}

function parseLandData(raw: unknown): {
  acres: number | null;
  transaction_type: string | null;
} | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const rawAcres = row.acres;
  const acres =
    typeof rawAcres === "number" && Number.isFinite(rawAcres)
      ? rawAcres
      : typeof rawAcres === "string" && rawAcres.trim() !== ""
        ? Number(rawAcres.trim())
        : null;
  return {
    acres: acres != null && Number.isFinite(acres) ? acres : null,
    transaction_type: stringValue(row.transaction_type) || null,
  };
}

async function rollbackManualEventSave(
  supabase: SupabaseClient,
  params: {
    userId: string;
    treeId: string;
    insertedEventIds: string[];
    insertedPersonIds: string[];
    insertedRelationshipIds: string[];
  }
) {
  if (params.insertedEventIds.length > 0) {
    await supabase
      .from("events")
      .delete()
      .eq("user_id", params.userId)
      .in("id", params.insertedEventIds);
  }
  if (params.insertedRelationshipIds.length > 0) {
    await supabase
      .from("relationships")
      .delete()
      .eq("user_id", params.userId)
      .eq("tree_id", params.treeId)
      .in("id", params.insertedRelationshipIds);
  }
  if (params.insertedPersonIds.length > 0) {
    await supabase
      .from("persons")
      .delete()
      .eq("user_id", params.userId)
      .eq("tree_id", params.treeId)
      .in("id", params.insertedPersonIds);
  }
}

async function insertRelationshipIfMissing(
  supabase: SupabaseClient,
  params: {
    userId: string;
    treeId: string;
    personAId: string;
    personBId: string;
    relationshipType: string;
  }
): Promise<{ id: string | null; error: string | null }> {
  let existingQuery = supabase
    .from("relationships")
    .select("id")
    .eq("user_id", params.userId)
    .eq("person_a_id", params.personAId)
    .eq("person_b_id", params.personBId)
    .eq("relationship_type", params.relationshipType);
  existingQuery = params.treeId
    ? existingQuery.eq("tree_id", params.treeId)
    : existingQuery.is("tree_id", null);
  const { data: existingRows, error: existingError } = await existingQuery.limit(1);
  if (existingError) return { id: null, error: existingError.message };
  const existing = existingRows?.[0] as { id?: string } | undefined;
  if (existing?.id) return { id: null, error: null };

  const insertRow: Record<string, unknown> = {
    user_id: params.userId,
    tree_id: params.treeId || null,
    person_a_id: params.personAId,
    person_b_id: params.personBId,
    relationship_type: params.relationshipType,
  };
  const { data, error } = await supabase
    .from("relationships")
    .insert(insertRow)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return { id: null, error: error?.message ?? "Failed to create relationship." };
  }
  return { id: (data as { id: string }).id, error: null };
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Expected JSON object" }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const treeId = stringValue(payload.treeId);
  const peopleRaw = Array.isArray(payload.people) ? payload.people : [];
  const relationshipsRaw = Array.isArray(payload.relationships)
    ? payload.relationships
    : [];

  if (peopleRaw.length === 0) {
    return NextResponse.json(
      { error: "At least one person is required." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (treeId) {
    const { data: treeRow, error: treeErr } = await supabase
      .from("trees")
      .select("id")
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
  } else {
    return NextResponse.json(
      { error: "Tree context is required to save people and events." },
      { status: 400 }
    );
  }

  const people = peopleRaw.filter(
    (item): item is ManualEventPersonBody =>
      typeof item === "object" && item !== null
  );
  const relationships = relationshipsRaw.filter(
    (item): item is ManualRelationshipBody =>
      typeof item === "object" && item !== null
  );

  const insertedPersonIds: string[] = [];
  const insertedEventIds: string[] = [];
  const insertedRelationshipIds: string[] = [];
  const resolvedPeople: ResolvedPerson[] = [];
  const clientIdToPersonId = new Map<string, string>();

  const failAfterWrites = async (error: string, status = 500) => {
    await rollbackManualEventSave(supabase, {
      userId: user.id,
      treeId,
      insertedEventIds,
      insertedPersonIds,
      insertedRelationshipIds,
    });
    return NextResponse.json({ error }, { status });
  };

  for (let i = 0; i < people.length; i++) {
    const person = people[i]!;
    const clientId = stringValue(person.clientId) || `person-${i}`;
    if (clientIdToPersonId.has(clientId)) {
      return failAfterWrites("Each attached person must have a unique client id.", 400);
    }

    const existingPersonId = stringValue(person.existingPersonId);
    if (existingPersonId) {
      const { data, error } = await supabase
        .from("persons")
        .select("id, tree_id, first_name, middle_name, last_name")
        .eq("id", existingPersonId)
        .eq("user_id", user.id)
        .eq("tree_id", treeId)
        .maybeSingle();
      if (error) return failAfterWrites(error.message);
      if (!data) {
        return failAfterWrites(`Person not found: ${existingPersonId}`, 400);
      }
      const row = data as {
        id: string;
        tree_id?: string | null;
        first_name: string | null;
        middle_name: string | null;
        last_name: string | null;
      };
      if ((row.tree_id ?? "").trim() !== treeId) {
        return failAfterWrites(
          `Person does not belong to the active tree: ${existingPersonId}`,
          400
        );
      }
      clientIdToPersonId.set(clientId, row.id);
      resolvedPeople.push({
        clientId,
        personId: row.id,
        name: buildFullName(row),
      });
      continue;
    }

    const firstName = stringValue(person.first_name);
    const middleName = stringValue(person.middle_name);
    const lastName = stringValue(person.last_name);
    if (!firstName && !lastName) {
      return failAfterWrites(
        "At least a first or last name is required for each new person.",
        400
      );
    }

    const insertRow: Record<string, unknown> = {
      user_id: user.id,
      tree_id: treeId || null,
      first_name: firstName,
      middle_name: middleName || null,
      last_name: lastName,
      birth_date: stringValue(person.birth_date) || null,
      death_date: stringValue(person.death_date) || null,
      gender: stringValue(person.gender) || null,
      notes: stringValue(person.notes) || null,
    };

    const { data, error } = await supabase
      .from("persons")
      .insert(insertRow)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      return failAfterWrites(error?.message ?? "Failed to create person.");
    }

    const personId = (data as { id: string }).id;
    insertedPersonIds.push(personId);
    clientIdToPersonId.set(clientId, personId);
    resolvedPeople.push({
      clientId,
      personId,
      name: buildFullName({
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
      }),
    });
  }

  for (const relationship of relationships) {
    const fromClientId = stringValue(relationship.fromClientId);
    const toClientId = stringValue(relationship.toClientId);
    const relationshipType =
      stringValue(relationship.relationship_type).toLowerCase() || "other";
    if (!fromClientId || !toClientId || fromClientId === toClientId) continue;

    const personAId = clientIdToPersonId.get(fromClientId);
    const personBId = clientIdToPersonId.get(toClientId);
    if (!personAId || !personBId) {
      return failAfterWrites("Relationship references an unknown person.", 400);
    }

    const forward = await insertRelationshipIfMissing(supabase, {
      userId: user.id,
      treeId,
      personAId,
      personBId,
      relationshipType,
    });
    if (forward.error) return failAfterWrites(forward.error);
    if (forward.id) insertedRelationshipIds.push(forward.id);

    const inverse = await insertRelationshipIfMissing(supabase, {
      userId: user.id,
      treeId,
      personAId: personBId,
      personBId: personAId,
      relationshipType: inverseRelationshipType(relationshipType),
    });
    if (inverse.error) return failAfterWrites(inverse.error);
    if (inverse.id) insertedRelationshipIds.push(inverse.id);
  }

  const savedEvents: Array<{
    personIndex: number;
    eventIndex: number;
    personId: string;
    eventId: string;
  }> = [];

  for (let i = 0; i < people.length; i++) {
    const person = people[i]!;
    const clientId = stringValue(person.clientId) || `person-${i}`;
    const personId = clientIdToPersonId.get(clientId);
    if (!personId || typeof person.event !== "object" || person.event === null) {
      continue;
    }
    const event = person.event as Record<string, unknown>;
    const eventType = stringValue(event.event_type) || "other";
    const placeResult = await resolveEventPlaceId(supabase, event);
    if (placeResult.error) return failAfterWrites(placeResult.error);
    const eventDate = stringValue(event.event_date) || null;

    const { data, error } = await supabase
      .from("events")
      .insert({
        user_id: user.id,
        person_id: personId,
        event_type: eventType,
        event_date: eventDate,
        event_place_id: placeResult.id,
        notes: stringValue(event.notes) || null,
        story_full: stringValue(event.story_full) || null,
        land_data: parseLandData(event.land_data),
      })
      .select("id")
      .maybeSingle();
    if (error || !data) {
      return failAfterWrites(error?.message ?? "Failed to create event.");
    }
    const eventId = (data as { id: string }).id;
    insertedEventIds.push(eventId);
    const normalizedEventType = eventType.trim().toLowerCase();
    if (
      normalizedEventType === "birth" ||
      normalizedEventType === "death" ||
      normalizedEventType === "child died"
    ) {
      const vitalUpdates: Record<string, string> = {};
      if (normalizedEventType === "birth") {
        if (eventDate) vitalUpdates.birth_date = eventDate;
        if (placeResult.id) vitalUpdates.birth_place_id = placeResult.id;
      } else {
        if (eventDate) vitalUpdates.death_date = eventDate;
        if (placeResult.id) vitalUpdates.death_place_id = placeResult.id;
        const causeOfDeath = stringValue(person.cause_of_death);
        if (causeOfDeath) vitalUpdates.cause_of_death = causeOfDeath;
      }
      if (Object.keys(vitalUpdates).length > 0) {
        const { error: vitalErr } = await supabase
          .from("persons")
          .update(vitalUpdates)
          .eq("id", personId)
          .eq("user_id", user.id)
          .eq("tree_id", treeId);
        if (vitalErr) return failAfterWrites(vitalErr.message);
      }
    }
    savedEvents.push({
      personIndex: i,
      eventIndex: 0,
      personId,
      eventId,
    });
  }

  return NextResponse.json({
    success: true,
    personIds: resolvedPeople.map((row) => row.personId),
    people: resolvedPeople,
    savedEvents,
  });
}
