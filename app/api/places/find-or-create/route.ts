import { createClient } from "@/lib/supabase/server";
import { findOrCreatePlace } from "@/lib/utils/places";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type ParsedPlaceFields = {
  township: string | null;
  county: string | null;
  state: string | null;
  country: string;
};

function parseStructuredPlaceBody(body: unknown): ParsedPlaceFields | null {
  if (body === null || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (typeof o.country !== "string" || o.country.trim() === "") return null;
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
    country: o.country.trim(),
  };
}

function parseDisplayToFields(display: string): ParsedPlaceFields | null {
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
    return {
      township: null,
      county: parts[0]!,
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
    if (fields === null || fields.country.trim() === "") {
      return NextResponse.json(
        {
          error:
            "Provide a non-empty display string, or structured place fields including country.",
        },
        { status: 400 }
      );
    }

    const placeResult = await findOrCreatePlace(supabase, fields);
    if (!placeResult.ok) {
      return NextResponse.json({ error: placeResult.message }, { status: 500 });
    }

    return NextResponse.json({ id: placeResult.id }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
