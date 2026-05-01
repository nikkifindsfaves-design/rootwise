import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260501164500_require_tree_scoped_people_and_relationships.sql"
  ),
  "utf8"
).toLowerCase();

describe("tree isolation hardening migration", () => {
  it("removes resettable person and relationship rows without a valid tree", () => {
    expect(migrationSql).toContain("delete from public.relationships");
    expect(migrationSql).toContain("r.tree_id is null");
    expect(migrationSql).toContain("delete from public.persons");
    expect(migrationSql).toContain("p.tree_id is null");
  });

  it("requires future people and relationships to belong to a tree", () => {
    expect(migrationSql).toContain("alter column tree_id set not null");
    expect(migrationSql).toContain("foreign key (tree_id) references public.trees");
    expect(migrationSql).toContain("on delete cascade");
  });

  it("prevents relationships between people from different trees", () => {
    expect(migrationSql).toContain("foreign key (person_a_id, tree_id)");
    expect(migrationSql).toContain("foreign key (person_b_id, tree_id)");
    expect(migrationSql).toContain("references public.persons (id, tree_id)");
  });
});
