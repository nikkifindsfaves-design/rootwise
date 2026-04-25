import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_CANVAS_THEME_ID,
  isCanvasThemeId,
  type CanvasThemeId,
} from "@/lib/themes/canvas-themes";
import { redirect } from "next/navigation";
import TreeCanvas, {
  type TreeCanvasPerson,
  type TreeCanvasRelationship,
} from "./tree-canvas";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TreeCanvasPage({
  params,
}: {
  params: Promise<{ treeId: string }>;
}) {
  const { treeId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!UUID_RE.test(treeId)) {
    redirect("/dashboard");
  }

  const { data: tree, error: treeError } = await supabase
    .from("trees")
    .select("id, name, canvas_theme")
    .eq("id", treeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (treeError || !tree) {
    redirect("/dashboard");
  }

  const treeName = (tree as { name: string }).name;
  const rawCanvasTheme = (tree as { canvas_theme?: string | null }).canvas_theme;
  const canvasTheme: CanvasThemeId = isCanvasThemeId(rawCanvasTheme)
    ? rawCanvasTheme
    : DEFAULT_CANVAS_THEME_ID;

  const { data: personsRows, error: personsError } = await supabase
    .from("persons")
    .select(
      "id, first_name, middle_name, last_name, birth_date, death_date, photo_url, gender"
    )
    .eq("tree_id", treeId)
    .eq("user_id", user.id);

  const { data: relRows, error: relError } = await supabase
    .from("relationships")
    .select("person_a_id, person_b_id, relationship_type")
    .eq("tree_id", treeId)
    .eq("user_id", user.id);

  if (personsError) {
    console.error("tree canvas persons", personsError.message);
  }
  if (relError) {
    console.error("tree canvas relationships", relError.message);
  }

  const persons: TreeCanvasPerson[] = (personsRows ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      first_name: String(r.first_name ?? ""),
      middle_name:
        r.middle_name === null || r.middle_name === undefined
          ? null
          : String(r.middle_name),
      last_name: String(r.last_name ?? ""),
      birth_date:
        r.birth_date === null || r.birth_date === undefined
          ? null
          : String(r.birth_date),
      death_date:
        r.death_date === null || r.death_date === undefined
          ? null
          : String(r.death_date),
      photo_url:
        r.photo_url === null || r.photo_url === undefined
          ? null
          : String(r.photo_url),
      gender:
        r.gender === null || r.gender === undefined
          ? null
          : String(r.gender),
    };
  });

  const relationships: TreeCanvasRelationship[] = (relRows ?? []).map(
    (row) => {
      const r = row as Record<string, unknown>;
      return {
        person_a_id: String(r.person_a_id ?? ""),
        person_b_id: String(r.person_b_id ?? ""),
        relationship_type: String(r.relationship_type ?? ""),
      };
    }
  );

  return (
    <TreeCanvas
      treeId={treeId}
      treeName={treeName}
      canvasTheme={canvasTheme}
      persons={persons}
      relationships={relationships}
    />
  );
}
