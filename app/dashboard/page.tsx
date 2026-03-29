import { formatDateString } from "@/lib/utils/dates";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AddPersonForm from "./add-person-form";
import DeadGossipShell from "./dead-gossip-shell";
import DocumentUploadSection from "./document-upload";
import { type PersonGridRow } from "./people-grid";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const formError = params.error ?? null;

  const { data: persons, error: personsError } = await supabase
    .from("persons")
    .select(
      "id, first_name, middle_name, last_name, birth_date, death_date, photo_url"
    )
    .eq("user_id", user.id)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const primaryPhotoByPersonId = new Map<string, string>();
  const { data: allUserPhotos, error: primaryPhotosError } = await supabase
    .from("photos")
    .select("person_id, file_url, is_primary")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (!primaryPhotosError && allUserPhotos) {
    const preferredByPerson = new Map<string, string>();
    const firstByPerson = new Map<string, string>();
    for (const row of allUserPhotos) {
      const r = row as {
        person_id?: string;
        file_url?: string | null;
        is_primary?: boolean;
      };
      const pid = r.person_id;
      const url = typeof r.file_url === "string" ? r.file_url.trim() : "";
      if (typeof pid !== "string" || pid === "" || url === "") continue;
      if (!firstByPerson.has(pid)) firstByPerson.set(pid, url);
      if (r.is_primary === true && !preferredByPerson.has(pid)) {
        preferredByPerson.set(pid, url);
      }
    }
    for (const pid of new Set([
      ...preferredByPerson.keys(),
      ...firstByPerson.keys(),
    ])) {
      primaryPhotoByPersonId.set(
        pid,
        preferredByPerson.get(pid) ?? firstByPerson.get(pid)!
      );
    }
  }

  const rows: PersonGridRow[] = (persons ?? []).map((p) => ({
    id: p.id,
    first_name: p.first_name,
    middle_name: p.middle_name,
    last_name: p.last_name,
    birth_date: p.birth_date ? formatDateString(p.birth_date) : null,
    death_date: p.death_date ? formatDateString(p.death_date) : null,
    photo_url:
      primaryPhotoByPersonId.get(p.id) ??
      (p as { photo_url?: string | null }).photo_url ??
      null,
  }));

  return (
    <DeadGossipShell
      personCount={rows.length}
      people={rows}
      uploadSection={<DocumentUploadSection />}
      addPersonSection={<AddPersonForm />}
      formError={formError}
      personsErrorMessage={personsError?.message ?? null}
    />
  );
}
