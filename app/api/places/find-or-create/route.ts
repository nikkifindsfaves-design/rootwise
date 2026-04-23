import { createClient } from "@/lib/supabase/server";
import {
  findOrCreatePlace,
  findOrCreateInReviewPlace,
  normalizePlaceFields,
} from "@/lib/utils/places";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type ParsedPlaceFields = {
  township: string | null;
  county: string | null;
  state: string | null;
  country: string;
  valid_from?: string | null;
  valid_to?: string | null;
  historical_context?: string | null;
  is_canonical_current?: boolean;
  source_dataset?: string | null;
  source_ref?: string | null;
};

function parseStructuredPlaceBody(body: unknown): ParsedPlaceFields | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (typeof o.country !== "string" && o.country !== null && o.country !== undefined) {
    return null;
  }
  const opt = (v: unknown): string | null => {
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t === "" ? null : t;
  };
  return {
    township: opt(o.township),
    county: opt(o.county),
    state: opt(o.state),
    country: typeof o.country === "string" ? o.country.trim() : "",
    valid_from: opt(o.valid_from),
    valid_to: opt(o.valid_to),
    historical_context: opt(o.historical_context),
    is_canonical_current:
      typeof o.is_canonical_current === "boolean" ? o.is_canonical_current : undefined,
    source_dataset: opt(o.source_dataset),
    source_ref: opt(o.source_ref),
  };
}

function parseDisplayToFields(display: string): ParsedPlaceFields | null {
  const looksLikeCounty = (value: string): boolean =>
    /\b(county|co\.?|cnty\.?)\b/i.test(value);
  const parts = display
    .trim()
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
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

export async function POST(request: NextRequest) {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const rawDisplay =
      body &&
      typeof body === "object" &&
      "display" in body &&
      typeof (body as { display: unknown }).display === "string"
        ? (body as { display: string }).display
        : null;

    const display = rawDisplay != null ? rawDisplay.trim() : "";

    let fields: ParsedPlaceFields | null =
      display !== "" ? parseDisplayToFields(display) : null;
    if (fields === null) {
      fields = parseStructuredPlaceBody(body);
    }
    if (fields === null) {
      return NextResponse.json(
        {
          error: "Provide a non-empty display string, or structured place fields.",
        },
        { status: 400 }
      );
    }

    const normalizedFields = normalizePlaceFields(fields);
    const placeResult = await findOrCreatePlace(supabase, normalizedFields, {
      allowCreate: false,
    });
    if (!placeResult.ok) {
      return NextResponse.json({ error: placeResult.message }, { status: 500 });
    }
    if (placeResult.id == null) {
      const rawInput = display || JSON.stringify(body);
      const inReviewRes = await findOrCreateInReviewPlace(supabase, {
        ...normalizedFields,
        source_dataset: "manual_review",
        source_ref: rawInput,
      });
      if (!inReviewRes.ok) {
        return NextResponse.json({ error: inReviewRes.message }, { status: 500 });
      }
      return NextResponse.json({ id: inReviewRes.id, needs_review: true }, { status: 200 });
    }

    return NextResponse.json({ id: placeResult.id, needs_review: false }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
