import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import ReviewRecordClient from "./review-record-client";

const SIGNED_URL_EXPIRY_SEC = 3600;

/** Resolve object path inside the `documents` bucket from a stored Storage URL. */
function documentsObjectPathFromFileUrl(fileUrl: string): string | null {
  try {
    const url = new URL(fileUrl);
    const publicMarker = "/object/public/documents/";
    const publicIdx = url.pathname.indexOf(publicMarker);
    if (publicIdx !== -1) {
      return decodeURIComponent(
        url.pathname.slice(publicIdx + publicMarker.length)
      );
    }
    const signMarker = "/object/sign/documents/";
    const signIdx = url.pathname.indexOf(signMarker);
    if (signIdx !== -1) {
      return decodeURIComponent(url.pathname.slice(signIdx + signMarker.length));
    }
    const loose = url.pathname.match(/\/documents\/(.+)$/);
    if (loose) {
      return decodeURIComponent(loose[1]);
    }
  } catch {
    return null;
  }
  return null;
}

function recordTypeFromRow(row: {
  record_type?: string | null;
  ai_response: unknown;
}): string {
  if (row.record_type && String(row.record_type).trim() !== "") {
    return String(row.record_type);
  }
  const ai = row.ai_response as { record_type?: string } | null;
  if (ai && typeof ai.record_type === "string" && ai.record_type.trim() !== "") {
    return ai.record_type;
  }
  return "Unknown";
}

export default async function ReviewRecordPage({
  params,
}: {
  params: Promise<{ recordId: string }>;
}) {
  const { recordId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: record, error } = await supabase
    .from("records")
    .select("id, file_url, file_type, ai_response, record_type")
    .eq("id", recordId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !record) {
    notFound();
  }

  const label = recordTypeFromRow({
    record_type: record.record_type as string | null | undefined,
    ai_response: record.ai_response,
  });

  const fileUrl = record.file_url as string;
  let signedDocumentUrl: string | null = null;

  const objectPath = documentsObjectPathFromFileUrl(fileUrl);
  if (objectPath) {
    const { data: signed, error: signedError } = await supabase.storage
      .from("documents")
      .createSignedUrl(objectPath, SIGNED_URL_EXPIRY_SEC);

    if (!signedError && signed?.signedUrl) {
      signedDocumentUrl = signed.signedUrl;
    }
  }

  return (
    <ReviewRecordClient
      recordId={record.id}
      signedDocumentUrl={signedDocumentUrl}
      fileType={(record.file_type as string | null) ?? null}
      recordTypeLabel={label}
      aiResponse={record.ai_response}
    />
  );
}
