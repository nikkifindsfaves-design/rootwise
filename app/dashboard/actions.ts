"use server";

import { createClient } from "@/lib/supabase/server";
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
  const middle_name = String(formData.get("middle_name") ?? "").trim() || null;
  const last_name = String(formData.get("last_name") ?? "").trim();
  const birthRaw = formData.get("birth_date");
  const deathRaw = formData.get("death_date");
  const gender = String(formData.get("gender") ?? "Unknown");
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
    redirect("/dashboard?error=Name+fields+are+required");
  }

  const { error } = await supabase.from("persons").insert({
    user_id: user.id,
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
      `/dashboard?error=${encodeURIComponent(error.message)}`
    );
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
