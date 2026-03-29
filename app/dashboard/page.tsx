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

  const { data: allUserPhotos, error: primaryPhotosError } = await supabase
    .from("photos")
    .select(
      "person_id, file_url, is_primary, crop_x, crop_y, crop_zoom, natural_width, natural_height"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  type PrimaryPhotoPick = {
    file_url: string;
    crop_x?: number;
    crop_y?: number;
    crop_zoom?: number;
    natural_width?: number;
    natural_height?: number;
  };
  const preferredByPerson = new Map<string, PrimaryPhotoPick>();
  const firstByPerson = new Map<string, PrimaryPhotoPick>();

  if (!primaryPhotosError && allUserPhotos) {
    for (const row of allUserPhotos) {
      const r = row as {
        person_id?: string;
        file_url?: string | null;
        is_primary?: boolean;
        crop_x?: number | null;
        crop_y?: number | null;
        crop_zoom?: number | null;
        natural_width?: number | null;
        natural_height?: number | null;
      };
      const pid = r.person_id;
      const url = typeof r.file_url === "string" ? r.file_url.trim() : "";
      if (typeof pid !== "string" || pid === "" || url === "") continue;
      const pick: PrimaryPhotoPick = {
        file_url: url,
        ...(typeof r.crop_x === "number" ? { crop_x: r.crop_x } : {}),
        ...(typeof r.crop_y === "number" ? { crop_y: r.crop_y } : {}),
        ...(typeof r.crop_zoom === "number" ? { crop_zoom: r.crop_zoom } : {}),
        ...(typeof r.natural_width === "number" && r.natural_width > 0
          ? { natural_width: r.natural_width }
          : {}),
        ...(typeof r.natural_height === "number" && r.natural_height > 0
          ? { natural_height: r.natural_height }
          : {}),
      };
      if (!firstByPerson.has(pid)) firstByPerson.set(pid, pick);
      if (r.is_primary === true && !preferredByPerson.has(pid)) {
        preferredByPerson.set(pid, pick);
      }
    }
  }

  const personIds = (persons ?? []).map((p) => p.id);
  const tagPrimaryByPerson = new Map<string, PrimaryPhotoPick>();
  const tagFirstByPerson = new Map<string, PrimaryPhotoPick>();

  if (personIds.length > 0) {
    const { data: tagRows, error: tagErr } = await supabase
      .from("photo_tags")
      .select("person_id, photo_id, crop_x, crop_y, crop_zoom, is_primary")
      .eq("user_id", user.id)
      .in("person_id", personIds)
      .order("person_id", { ascending: true })
      .order("photo_id", { ascending: true });

    if (!tagErr && tagRows && tagRows.length > 0) {
      const photoIds = [
        ...new Set(
          tagRows
            .map((r) => (r as { photo_id?: string }).photo_id)
            .filter((id): id is string => typeof id === "string" && id !== "")
        ),
      ];
      if (photoIds.length > 0) {
        const { data: tagPhotoRows, error: tagPhotosErr } = await supabase
          .from("photos")
          .select("id, file_url, natural_width, natural_height")
          .eq("user_id", user.id)
          .in("id", photoIds);

        if (!tagPhotosErr && tagPhotoRows) {
          const photoMetaById = new Map<
            string,
            { file_url: string; natural_width?: number; natural_height?: number }
          >();
          for (const pr of tagPhotoRows) {
            const rec = pr as {
              id?: string;
              file_url?: string | null;
              natural_width?: number | null;
              natural_height?: number | null;
            };
            const id = rec.id;
            const u =
              typeof rec.file_url === "string" ? rec.file_url.trim() : "";
            if (typeof id === "string" && id !== "" && u !== "") {
              photoMetaById.set(id, {
                file_url: u,
                ...(typeof rec.natural_width === "number" && rec.natural_width > 0
                  ? { natural_width: rec.natural_width }
                  : {}),
                ...(typeof rec.natural_height === "number" &&
                rec.natural_height > 0
                  ? { natural_height: rec.natural_height }
                  : {}),
              });
            }
          }
          for (const row of tagRows) {
            const r = row as {
              person_id?: string;
              photo_id?: string;
              crop_x?: number | null;
              crop_y?: number | null;
              crop_zoom?: number | null;
              is_primary?: boolean | null;
            };
            const pid = r.person_id;
            const phid = r.photo_id;
            if (typeof pid !== "string" || pid === "") continue;
            if (typeof phid !== "string" || phid === "") continue;
            const meta = photoMetaById.get(phid);
            if (!meta) continue;
            const pick: PrimaryPhotoPick = {
              file_url: meta.file_url,
              ...(typeof r.crop_x === "number" ? { crop_x: r.crop_x } : {}),
              ...(typeof r.crop_y === "number" ? { crop_y: r.crop_y } : {}),
              ...(typeof r.crop_zoom === "number"
                ? { crop_zoom: r.crop_zoom }
                : {}),
              ...(meta.natural_width !== undefined
                ? { natural_width: meta.natural_width }
                : {}),
              ...(meta.natural_height !== undefined
                ? { natural_height: meta.natural_height }
                : {}),
            };
            if (!tagFirstByPerson.has(pid)) tagFirstByPerson.set(pid, pick);
            if (r.is_primary === true && !tagPrimaryByPerson.has(pid)) {
              tagPrimaryByPerson.set(pid, pick);
            }
          }
        }
      }
    }
  }

  const primaryPhotoByPersonId = new Map<string, PrimaryPhotoPick>();
  for (const pid of personIds) {
    const pick =
      preferredByPerson.get(pid) ??
      tagPrimaryByPerson.get(pid) ??
      firstByPerson.get(pid) ??
      tagFirstByPerson.get(pid);
    if (pick) primaryPhotoByPersonId.set(pid, pick);
  }

  const rows: PersonGridRow[] = (persons ?? []).map((p) => {
    const pick = primaryPhotoByPersonId.get(p.id);
    return {
      id: p.id,
      first_name: p.first_name,
      middle_name: p.middle_name,
      last_name: p.last_name,
      birth_date: p.birth_date ? formatDateString(p.birth_date) : null,
      death_date: p.death_date ? formatDateString(p.death_date) : null,
      photo_url:
        pick?.file_url ??
        (p as { photo_url?: string | null }).photo_url ??
        null,
      crop_x: pick?.crop_x,
      crop_y: pick?.crop_y,
      crop_zoom: pick?.crop_zoom,
      natural_width: pick?.natural_width,
      natural_height: pick?.natural_height,
    };
  });

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
