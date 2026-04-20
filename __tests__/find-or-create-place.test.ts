/// <reference types="vitest/globals" />

import { findOrCreatePlace, type PlaceFields } from "@/lib/utils/places";

type PlaceRow = {
  id: string;
  township: string | null;
  county: string | null;
  state: string | null;
  country: string;
};

type QueryResult<T> = { data: T; error: { message: string } | null };

class FakePlacesQuery {
  private readonly rows: PlaceRow[];
  private readonly insertedRef: { count: number; rows: PlaceRow[] };
  private filters: Array<(row: PlaceRow) => boolean> = [];
  private selectedColumns = "";
  private limitCount: number | null = null;
  private insertPayload: PlaceFields | null = null;

  constructor(rows: PlaceRow[], insertedRef: { count: number; rows: PlaceRow[] }) {
    this.rows = rows;
    this.insertedRef = insertedRef;
  }

  select(columns: string) {
    this.selectedColumns = columns;
    return this;
  }

  eq(column: keyof PlaceRow, value: string | null) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  is(column: keyof PlaceRow, value: null) {
    this.filters.push((row) => (value === null ? row[column] === null : row[column] === value));
    return this;
  }

  ilike(column: keyof PlaceRow, value: string) {
    const target = value.toLowerCase();
    this.filters.push((row) => String(row[column] ?? "").toLowerCase() === target);
    return this;
  }

  insert(payload: PlaceFields) {
    this.insertPayload = payload;
    return this;
  }

  limit(n: number) {
    this.limitCount = n;
    return this;
  }

  async maybeSingle(): Promise<QueryResult<{ id: string } | null>> {
    if (this.insertPayload == null) {
      const rows = this.filteredRows();
      const first = rows[0];
      return { data: first ? { id: first.id } : null, error: null };
    }

    const newRow: PlaceRow = {
      id: "new-place-id",
      township: this.insertPayload.township,
      county: this.insertPayload.county,
      state: this.insertPayload.state,
      country: this.insertPayload.country,
    };
    this.insertedRef.count += 1;
    this.insertedRef.rows.push(newRow);
    return { data: { id: newRow.id }, error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult<Array<{ id: string } | PlaceRow>>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    const rows = this.filteredRows();
    const projected = this.projectRows(rows);
    return Promise.resolve({ data: projected, error: null } as QueryResult<
      Array<{ id: string } | PlaceRow>
    >).then(onfulfilled ?? undefined, onrejected ?? undefined);
  }

  private filteredRows(): PlaceRow[] {
    const out = this.rows.filter((row) => this.filters.every((fn) => fn(row)));
    if (this.limitCount == null) return out;
    return out.slice(0, this.limitCount);
  }

  private projectRows(rows: PlaceRow[]): Array<{ id: string } | PlaceRow> {
    if (this.selectedColumns === "id") {
      return rows.map((row) => ({ id: row.id }));
    }
    return rows;
  }
}

function makeFakeSupabase(seedRows: PlaceRow[]) {
  const insertedRef = { count: 0, rows: [] as PlaceRow[] };
  const supabase = {
    from(table: string) {
      if (table !== "places") {
        throw new Error(`Unexpected table ${table}`);
      }
      return new FakePlacesQuery(seedRows, insertedRef);
    },
  };
  return { supabase, insertedRef };
}

describe("findOrCreatePlace", () => {
  it("reuses an existing place via fuzzy match when exact match is not found", async () => {
    const seedRows: PlaceRow[] = [
      {
        id: "place-1",
        township: "Springfeld",
        county: "Sangamon",
        state: "illinois",
        country: "United States",
      },
      {
        id: "place-2",
        township: "Albany",
        county: "Albany County",
        state: "New York",
        country: "United States",
      },
    ];
    const { supabase, insertedRef } = makeFakeSupabase(seedRows);

    const result = await findOrCreatePlace(supabase as never, {
      township: "Springfield",
      county: "Sangamon",
      state: "Illinois",
      country: "United States",
    });

    expect(result).toEqual({ ok: true, id: "place-1" });
    expect(insertedRef.count).toBe(0);
  });

  it("creates a new place when no exact or fuzzy candidate is strong enough", async () => {
    const seedRows: PlaceRow[] = [
      {
        id: "place-a",
        township: "Paris",
        county: "Lamar County",
        state: "Texas",
        country: "United States",
      },
    ];
    const { supabase, insertedRef } = makeFakeSupabase(seedRows);

    const result = await findOrCreatePlace(supabase as never, {
      township: "Portland",
      county: "Multnomah County",
      state: "Oregon",
      country: "United States",
    });

    expect(result).toEqual({ ok: true, id: "new-place-id" });
    expect(insertedRef.count).toBe(1);
    expect(insertedRef.rows[0]).toMatchObject({
      township: "Portland",
      county: "Multnomah County",
      state: "Oregon",
      country: "United States",
    });
  });
});
