import type { SupabaseClient } from "@supabase/supabase-js";

export type PhotoTaggablePerson = {
  id: string;
  first_name: string;
  last_name: string;
  middle_name?: string | null;
};

export function extFromImageFile(file: File): string {
  const t = (file.type || "").toLowerCase();
  if (t === "image/jpeg" || t === "image/jpg") return "jpg";
  if (t === "image/png") return "png";
  if (t === "image/webp") return "webp";
  if (t === "image/gif") return "gif";
  const n = file.name.toLowerCase();
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "jpg";
  if (n.endsWith(".png")) return "png";
  if (n.endsWith(".webp")) return "webp";
  if (n.endsWith(".gif")) return "gif";
  return "jpg";
}

export const getNaturalSize = (file: File): Promise<{ w: number; h: number }> => {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        URL.revokeObjectURL(url);
        resolve({ w, h });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve({ w: 0, h: 0 });
      };
      img.src = url;
    } catch {
      resolve({ w: 0, h: 0 });
    }
  });
};

export function displayTagPersonName(p: PhotoTaggablePerson): string {
  return [p.first_name, p.middle_name ?? "", p.last_name]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" ");
}

export function addUniqueTaggedPerson<T extends { id: string }>(
  people: T[],
  person: T
): T[] {
  return people.some((p) => p.id === person.id) ? people : [...people, person];
}

export function removeTaggedPersonById<T extends { id: string }>(
  people: T[],
  personId: string
): T[] {
  return people.filter((p) => p.id !== personId);
}

export function toggleTaggedPerson<T extends { id: string }>(
  people: T[],
  person: T
): T[] {
  return people.some((p) => p.id === person.id)
    ? people.filter((p) => p.id !== person.id)
    : [...people, person];
}

export async function createUploadedPhotoRecord(params: {
  supabase: SupabaseClient;
  userId: string;
  file: File;
  primaryPersonId: string;
  photoDate?: string | null;
  cleanupUploadOnInsertError?: boolean;
}): Promise<
  | {
      ok: true;
      photoId: string;
      path: string;
      naturalWidth: number;
      naturalHeight: number;
      fileUrl: string;
    }
  | { ok: false; error: string }
> {
  const {
    supabase,
    userId,
    file,
    primaryPersonId,
    photoDate = null,
    cleanupUploadOnInsertError = false,
  } = params;

  const { w: naturalWidth, h: naturalHeight } = await getNaturalSize(file);
  const ext = extFromImageFile(file);
  const path = `${userId}/${primaryPersonId}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage.from("photos").upload(path, file, {
    contentType: file.type || `image/${ext}`,
    upsert: false,
  });
  if (upErr) {
    return { ok: false, error: upErr.message };
  }

  const { data: pub } = supabase.storage.from("photos").getPublicUrl(path);
  const fileUrl = pub.publicUrl;

  const { data: insertedPhoto, error: insErr } = await supabase
    .from("photos")
    .insert({
      user_id: userId,
      file_url: fileUrl,
      photo_date: photoDate,
      ...(naturalWidth > 0 && naturalHeight > 0
        ? { natural_width: naturalWidth, natural_height: naturalHeight }
        : {}),
    })
    .select("id")
    .maybeSingle();

  if (insErr || !insertedPhoto) {
    if (cleanupUploadOnInsertError) {
      await supabase.storage.from("photos").remove([path]);
    }
    return { ok: false, error: insErr?.message ?? "Could not save photo." };
  }

  return {
    ok: true,
    photoId: String((insertedPhoto as { id: unknown }).id),
    path,
    naturalWidth,
    naturalHeight,
    fileUrl,
  };
}
