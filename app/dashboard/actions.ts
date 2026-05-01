"use server";

import { createClient } from "@/lib/supabase/server";
import { DEFAULT_GENDER, normalizeGender } from "@/lib/utils/gender";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function addPerson(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const first_name = String(formData.get("first_name") ?? "").trim();
  const treeId = String(formData.get("tree_id") ?? "").trim();
  const middle_name = String(formData.get("middle_name") ?? "").trim() || null;
  const last_name = String(formData.get("last_name") ?? "").trim();
  const birthRaw = formData.get("birth_date");
  const deathRaw = formData.get("death_date");
  const gender = normalizeGender(String(formData.get("gender") ?? DEFAULT_GENDER));
  const notes = String(formData.get("notes") ?? "").trim();

  // Date inputs submit as "YYYY-MM-DD" strings. Keep null when blank.
  const birth_date =
    birthRaw != null && String(birthRaw).trim() !== ""
      ? String(birthRaw)
      : null;
  const death_date =
    deathRaw != null && String(deathRaw).trim() !== ""
      ? String(deathRaw)
      : null;

  if (!first_name || !last_name) {
    redirect("/tree-select?error=Name+fields+are+required");
  }

  if (!treeId) {
    redirect("/tree-select?error=Choose+a+tree+before+adding+people");
  }

  const { data: treeRow, error: treeErr } = await supabase
    .from("trees")
    .select("id")
    .eq("id", treeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (treeErr || !treeRow) {
    redirect("/tree-select?error=Tree+not+found");
  }

  const { error } = await supabase.from("persons").insert({
    user_id: user.id,
    tree_id: treeId,
    first_name,
    middle_name,
    last_name,
    birth_date,
    death_date,
    gender,
    notes: notes || null,
  });

  if (error) {
    redirect(
      `/dashboard/${treeId}?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath(`/dashboard/${treeId}`);
  revalidatePath("/tree-select");
  redirect(`/dashboard/${treeId}`);
}
