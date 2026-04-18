import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import MyTreesShell, { type TreeWithCount } from "./my-trees-shell";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: trees, error: treesError } = await supabase
    .from("trees")
    .select("id, name, created_at, vibe, canvas_theme")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const { data: personTreeRows, error: personsError } = await supabase
    .from("persons")
    .select("tree_id")
    .eq("user_id", user.id);

  const countByTreeId = new Map<string, number>();
  if (!personsError && personTreeRows) {
    for (const row of personTreeRows) {
      const tid = (row as { tree_id?: string | null }).tree_id;
      if (typeof tid !== "string" || tid === "") continue;
      countByTreeId.set(tid, (countByTreeId.get(tid) ?? 0) + 1);
    }
  }

  const treesWithCounts: TreeWithCount[] = (trees ?? []).map((t) => {
    const rec = t as {
      id: string;
      name: string;
      created_at: string;
      vibe?: string | null;
      canvas_theme?: string | null;
    };
    return {
      id: rec.id,
      name: rec.name,
      created_at: rec.created_at,
      vibe: rec.vibe ?? "classic",
      canvas_theme: rec.canvas_theme ?? "string",
      ancestorCount: countByTreeId.get(rec.id) ?? 0,
    };
  });

  return (
    <MyTreesShell
      trees={treesWithCounts}
      treesErrorMessage={treesError?.message ?? null}
      personsErrorMessage={personsError?.message ?? null}
    />
  );
}
