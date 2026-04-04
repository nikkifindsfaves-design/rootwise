import { createClient } from "@/lib/supabase/server";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PHOTOS_BUCKET = "photos";

/** Extract storage object path from a public file URL in the photos bucket. */
function storagePathFromPhotosFileUrl(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl);
    const pub = "/object/public/photos/";
    const pi = url.pathname.indexOf(pub);
    if (pi !== -1) {
      return decodeURIComponent(
        url.pathname.slice(pi + pub.length).split("?")[0] ?? ""
      );
    }
    const loose = url.pathname.indexOf("/photos/");
    if (loose !== -1) {
      return decodeURIComponent(
        url.pathname.slice(loose + "/photos/".length).split("?")[0] ?? ""
      );
    }
  } catch {
    return null;
  }
  return null;
}

type RouteContext = { params: Promise<{ treeId: string }> };

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
): Promise<NextResponse> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { error: "Supabase environment variables are not configured" },
      { status: 500 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { treeId: treeIdRaw } = await context.params;
  const treeId = (treeIdRaw ?? "").trim();
  if (!treeId || !UUID_RE.test(treeId)) {
    return NextResponse.json(
      { error: "Invalid or missing tree id." },
      { status: 400 }
    );
  }

  const { data: treeRow, error: treeErr } = await supabase
    .from("trees")
    .select("id")
    .eq("id", treeId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (treeErr) {
    return NextResponse.json(
      { error: `Could not verify tree ownership: ${treeErr.message}` },
      { status: 500 }
    );
  }
  if (!treeRow) {
    return NextResponse.json(
      { error: "Tree not found or access denied." },
      { status: 403 }
    );
  }

  // Equivalent to:
  // select photo_id from photo_tags
  // where person_id in (select id from persons where tree_id = :treeId)
  const { data: personRows, error: personsErr } = await supabase
    .from("persons")
    .select("id")
    .eq("tree_id", treeId);

  if (personsErr) {
    return NextResponse.json(
      { error: `Could not list persons for tree: ${personsErr.message}` },
      { status: 500 }
    );
  }

  const personIds = (personRows ?? []).map((p: { id: string }) => p.id);

  let photoTagRows: { photo_id: string }[] = [];
  if (personIds.length > 0) {
    const { data: tagRows, error: tagsErr } = await supabase
      .from("photo_tags")
      .select("photo_id")
      .in("person_id", personIds);

    if (tagsErr) {
      return NextResponse.json(
        { error: `Could not list photo tags for tree: ${tagsErr.message}` },
        { status: 500 }
      );
    }
    photoTagRows = (tagRows ?? []) as { photo_id: string }[];
  }

  const uniquePhotoIds = [
    ...new Set(
      photoTagRows
        .map((r) => (r.photo_id != null ? String(r.photo_id).trim() : ""))
        .filter(Boolean)
    ),
  ];

  if (uniquePhotoIds.length > 0) {
    const { data: photoRows, error: photosFetchErr } = await supabase
      .from("photos")
      .select("id, file_url")
      .in("id", uniquePhotoIds)
      .eq("user_id", user.id);

    if (photosFetchErr) {
      return NextResponse.json(
        { error: `Could not load photo records: ${photosFetchErr.message}` },
        { status: 500 }
      );
    }

    const paths: string[] = [];
    for (const row of photoRows ?? []) {
      const rec = row as { id?: string; file_url?: string | null };
      const url = rec.file_url;
      if (typeof url === "string" && url.trim() !== "") {
        const path = storagePathFromPhotosFileUrl(url);
        if (path) paths.push(path);
      }
    }

    if (paths.length > 0) {
      const { error: storageErr } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .remove(paths);
      if (storageErr) {
        return NextResponse.json(
          { error: `Failed to delete photo files from storage: ${storageErr.message}` },
          { status: 500 }
        );
      }
    }

    // Remove tags for this tree's persons so photos rows can be deleted before the tree
    // (tree delete would CASCADE these anyway, but we delete photos first).
    const { error: delTagsErr } = await supabase
      .from("photo_tags")
      .delete()
      .in("person_id", personIds);

    if (delTagsErr) {
      return NextResponse.json(
        { error: `Could not remove photo tags for tree: ${delTagsErr.message}` },
        { status: 500 }
      );
    }

    const { error: delPhotosErr } = await supabase
      .from("photos")
      .delete()
      .in("id", uniquePhotoIds)
      .eq("user_id", user.id);

    if (delPhotosErr) {
      return NextResponse.json(
        { error: `Could not delete photo records: ${delPhotosErr.message}` },
        { status: 500 }
      );
    }
  }

  const { error: delTreeErr } = await supabase
    .from("trees")
    .delete()
    .eq("id", treeId)
    .eq("user_id", user.id);

  if (delTreeErr) {
    return NextResponse.json(
      { error: `Could not delete tree: ${delTreeErr.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
