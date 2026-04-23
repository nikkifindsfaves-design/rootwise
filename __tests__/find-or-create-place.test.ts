/// <reference types="vitest/globals" />

import {
  findOrCreatePlace,
  normalizePlaceFields,
  type PlaceFields,
} from "@/lib/utils/places";

type PlaceRow = {
  id: string;
  place_identity_id: string;
  township: string | null;
  county: string | null;
  state: string | null;
  country: string;
  review_status?: "approved" | "in_review" | "rejected";
  valid_from: string | null;
  valid_to: string | null;
  historical_context: string | null;
  is_canonical_current: boolean;
};

type PlaceIdentityRow = {
  id: string;
  country: string;
  canonical_township: string | null;
  canonical_county: string | null;
  canonical_state: string | null;
  canonical_display_name: string;
};

type QueryResult<T> = { data: T; error: { message: string } | null };

class FakePlacesQuery {
  private readonly rows: PlaceRow[];
  private readonly placeInsertRef: { count: number; rows: PlaceRow[] };
  private readonly identityRows: PlaceIdentityRow[];
  private readonly identityInsertRef: { count: number; rows: PlaceIdentityRow[] };
  private table: "places" | "place_identities";
  private filters: Array<(row: PlaceRow) => boolean> = [];
  private identityFilters: Array<(row: PlaceIdentityRow) => boolean> = [];
  private selectedColumns = "";
  private limitCount: number | null = null;
  private placeInsertPayload: PlaceFields | null = null;
  private identityInsertPayload:
    | {
        country: string;
        canonical_township: string | null;
        canonical_county: string | null;
        canonical_state: string | null;
        canonical_display_name: string;
      }
    | null = null;

  constructor(
    table: "places" | "place_identities",
    rows: PlaceRow[],
    placeInsertRef: { count: number; rows: PlaceRow[] },
    identityRows: PlaceIdentityRow[],
    identityInsertRef: { count: number; rows: PlaceIdentityRow[] }
  ) {
    this.table = table;
    this.rows = rows;
    this.placeInsertRef = placeInsertRef;
    this.identityRows = identityRows;
    this.identityInsertRef = identityInsertRef;
  }

  select(columns: string) {
    this.selectedColumns = columns;
    return this;
  }

  eq(
    column:
      | keyof PlaceRow
      | keyof PlaceIdentityRow
      | "is_canonical_current"
      | "canonical_display_name",
    value: string | null | boolean
  ) {
    if (this.table === "places") {
      this.filters.push((row) => (row as Record<string, unknown>)[String(column)] === value);
      return this;
    }
    this.identityFilters.push(
      (row) => (row as Record<string, unknown>)[String(column)] === value
    );
    return this;
  }

  is(column: keyof PlaceRow | keyof PlaceIdentityRow, value: null) {
    if (this.table === "places") {
      this.filters.push((row) =>
        value === null
          ? (row as Record<string, unknown>)[String(column)] === null
          : (row as Record<string, unknown>)[String(column)] === value
      );
      return this;
    }
    this.identityFilters.push((row) =>
      value === null
        ? (row as Record<string, unknown>)[String(column)] === null
        : (row as Record<string, unknown>)[String(column)] === value
    );
    return this;
  }

  ilike(column: keyof PlaceRow, value: string) {
    const target = value.toLowerCase();
    this.filters.push((row) => String(row[column] ?? "").toLowerCase() === target);
    return this;
  }

  insert(payload: PlaceFields | Record<string, unknown>) {
    if (this.table === "places") {
      this.placeInsertPayload = payload as PlaceFields;
    } else {
      this.identityInsertPayload = payload as {
        country: string;
        canonical_township: string | null;
        canonical_county: string | null;
        canonical_state: string | null;
        canonical_display_name: string;
      };
    }
    return this;
  }

  limit(n: number) {
    this.limitCount = n;
    return this;
  }

  async maybeSingle(): Promise<QueryResult<{ id: string } | null>> {
    if (this.table === "place_identities") {
      if (this.identityInsertPayload == null) {
        const rows = this.filteredIdentityRows();
        const first = rows[0];
        return { data: first ? { id: first.id } : null, error: null };
      }
      const newIdentity: PlaceIdentityRow = {
        id: `identity-${this.identityRows.length + this.identityInsertRef.rows.length + 1}`,
        country: this.identityInsertPayload.country,
        canonical_township: this.identityInsertPayload.canonical_township,
        canonical_county: this.identityInsertPayload.canonical_county,
        canonical_state: this.identityInsertPayload.canonical_state,
        canonical_display_name: this.identityInsertPayload.canonical_display_name,
      };
      this.identityInsertRef.count += 1;
      this.identityInsertRef.rows.push(newIdentity);
      return { data: { id: newIdentity.id }, error: null };
    }

    if (this.placeInsertPayload == null) {
      const rows = this.filteredPlaceRows();
      const first = rows[0];
      return { data: first ? { id: first.id } : null, error: null };
    }

    const newRow: PlaceRow = {
      id: `place-${this.rows.length + this.placeInsertRef.rows.length + 1}`,
      place_identity_id:
        (this.placeInsertPayload as unknown as { place_identity_id?: string }).place_identity_id ??
        "identity-unknown",
      township: this.placeInsertPayload.township,
      county: this.placeInsertPayload.county,
      state: this.placeInsertPayload.state,
      country: this.placeInsertPayload.country,
      review_status:
        (this.placeInsertPayload as unknown as { review_status?: "approved" | "in_review" | "rejected" })
          .review_status ?? "approved",
      valid_from: this.placeInsertPayload.valid_from ?? null,
      valid_to: this.placeInsertPayload.valid_to ?? null,
      historical_context: this.placeInsertPayload.historical_context ?? null,
      is_canonical_current: this.placeInsertPayload.is_canonical_current ?? true,
    };
    this.placeInsertRef.count += 1;
    this.placeInsertRef.rows.push(newRow);
    return { data: { id: newRow.id }, error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<Array<{ id: string } | PlaceRow>>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    const projected =
      this.table === "places"
        ? this.projectPlaceRows(this.filteredPlaceRows())
        : this.projectIdentityRows(this.filteredIdentityRows());
    return Promise.resolve({ data: projected, error: null } as QueryResult<
      Array<{ id: string } | PlaceRow | PlaceIdentityRow>
    >).then(onfulfilled ?? undefined, onrejected ?? undefined);
  }

  private filteredPlaceRows(): PlaceRow[] {
    const out = this.rows.filter((row) => this.filters.every((fn) => fn(row)));
    if (this.limitCount == null) return out;
    return out.slice(0, this.limitCount);
  }

  private filteredIdentityRows(): PlaceIdentityRow[] {
    const out = this.identityRows.filter((row) =>
      this.identityFilters.every((fn) => fn(row))
    );
    if (this.limitCount == null) return out;
    return out.slice(0, this.limitCount);
  }

  private projectPlaceRows(rows: PlaceRow[]): Array<{ id: string } | PlaceRow> {
    if (this.selectedColumns === "id") {
      return rows.map((row) => ({ id: row.id }));
    }
    return rows;
  }

  private projectIdentityRows(
    rows: PlaceIdentityRow[]
  ): Array<{ id: string } | PlaceIdentityRow> {
    if (this.selectedColumns === "id") {
      return rows.map((row) => ({ id: row.id }));
    }
    return rows;
  }
}

function makeFakeSupabase(seedRows: PlaceRow[]) {
  const placeInsertedRef = { count: 0, rows: [] as PlaceRow[] };
  const identityRows: PlaceIdentityRow[] = [];
  const identityInsertedRef = { count: 0, rows: [] as PlaceIdentityRow[] };
  const supabase = {
    from(table: string) {
      if (table !== "places" && table !== "place_identities") {
        throw new Error(`Unexpected table ${table}`);
      }
      return new FakePlacesQuery(
        table as "places" | "place_identities",
        seedRows,
        placeInsertedRef,
        identityRows,
        identityInsertedRef
      );
    },
  };
  return {
    supabase,
    placeInsertedRef,
    identityInsertedRef,
  };
}

describe("findOrCreatePlace", () => {
  it("normalizes abbreviation variants before matching", async () => {
    const seedRows: PlaceRow[] = [
      {
        id: "place-1",
        place_identity_id: "identity-1",
        township: "West River",
        county: "Randolph County",
        state: "Indiana",
        country: "United States",
        review_status: "approved",
        valid_from: null,
        valid_to: null,
        historical_context: null,
        is_canonical_current: true,
      },
    ];
    const { supabase, placeInsertedRef } = makeFakeSupabase(seedRows);

    const result = await findOrCreatePlace(supabase as never, {
      township: "west river",
      county: "randolph co",
      state: "in",
      country: "usa",
    });

    expect(result).toEqual({ ok: true, id: "place-1", matched: true });
    expect(placeInsertedRef.count).toBe(0);
  });

  it("creates a new current canonical place version when no candidate is strong enough", async () => {
    const seedRows: PlaceRow[] = [
      {
        id: "place-a",
        place_identity_id: "identity-a",
        township: "Paris",
        county: "Lamar County",
        state: "Texas",
        country: "United States",
        review_status: "approved",
        valid_from: null,
        valid_to: null,
        historical_context: null,
        is_canonical_current: true,
      },
    ];
    const { supabase, placeInsertedRef, identityInsertedRef } = makeFakeSupabase(seedRows);

    const result = await findOrCreatePlace(supabase as never, {
      township: "Portland",
      county: "Multnomah County",
      state: "Oregon",
      country: "United States",
    });

    expect(result).toEqual({ ok: true, id: "place-2", matched: false });
    expect(identityInsertedRef.count).toBe(0);
    expect(placeInsertedRef.count).toBe(1);
    expect(placeInsertedRef.rows[0]).toMatchObject({
      township: "Portland",
      county: "Multnomah County",
      state: "Oregon",
      country: "United States",
      is_canonical_current: true,
      valid_from: null,
      valid_to: null,
    });
  });

  it("creates a historical place version with date window fields", async () => {
    const seedRows: PlaceRow[] = [];
    const { supabase, placeInsertedRef } = makeFakeSupabase(seedRows);

    const result = await findOrCreatePlace(supabase as never, {
      township: "St. Louis",
      county: "St. Louis County",
      state: "Missouri",
      country: "United States",
      valid_from: "1850-01-01",
      valid_to: "1900-12-31",
      historical_context: "Historic county-era naming",
      is_canonical_current: false,
      source_dataset: "newberry",
      source_ref: "MO_STLOUIS_1850_1900",
    });

    expect(result).toEqual({ ok: true, id: "place-1", matched: false });
    expect(placeInsertedRef.count).toBe(1);
    expect(placeInsertedRef.rows[0]).toMatchObject({
      township: "St. Louis",
      county: "St. Louis County",
      state: "Missouri",
      country: "United States",
      valid_from: "1850-01-01",
      valid_to: "1900-12-31",
      historical_context: "Historic county-era naming",
      is_canonical_current: false,
    });
  });

  it("returns unmatched without creating when allowCreate is false", async () => {
    const { supabase, placeInsertedRef, identityInsertedRef } = makeFakeSupabase([]);
    const result = await findOrCreatePlace(
      supabase as never,
      {
        township: "Unknown",
        county: null,
        state: "IN",
        country: "",
      },
      { allowCreate: false }
    );

    expect(result).toEqual({ ok: true, id: null, matched: false });
    expect(identityInsertedRef.count).toBe(0);
    expect(placeInsertedRef.count).toBe(0);
  });

  it("matches by township/county/state when country is missing and unique", async () => {
    const seedRows: PlaceRow[] = [
      {
        id: "place-1",
        place_identity_id: "identity-1",
        township: "West River",
        county: "Randolph County",
        state: "Indiana",
        country: "United States",
        review_status: "approved",
        valid_from: null,
        valid_to: null,
        historical_context: null,
        is_canonical_current: true,
      },
    ];
    const { supabase } = makeFakeSupabase(seedRows);
    const result = await findOrCreatePlace(
      supabase as never,
      {
        township: "west river",
        county: "randolph co",
        state: "in",
        country: "",
      },
      { allowCreate: false }
    );
    expect(result).toEqual({ ok: true, id: "place-1", matched: true });
  });
});

describe("normalizePlaceFields", () => {
  it("expands common abbreviations", () => {
    const normalized = normalizePlaceFields({
      township: "west river",
      county: "randolph co",
      state: "in",
      country: "usa",
    });
    expect(normalized).toMatchObject({
      township: "West River",
      county: "Randolph County",
      state: "Indiana",
      country: "United States",
    });
  });
});
