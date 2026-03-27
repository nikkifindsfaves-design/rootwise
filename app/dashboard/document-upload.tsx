"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const RECORD_TYPES = [
  "Birth Record",
  "Death Record",
  "Marriage Record",
  "Census Record",
  "Church Record",
  "Military Record",
  "Land Record",
  "Court Record",
  "Story or Letter",
  "Other",
] as const;

export default function DocumentUploadSection() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [recordType, setRecordType] = useState<(typeof RECORD_TYPES)[number]>(
    "Birth Record"
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    if (!file) {
      setError("Please choose a file first.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("record_type", recordType);

      const response = await fetch("/api/process-document", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        const message =
          typeof data?.error === "string"
            ? data.error
            : "Upload or processing failed.";
        setError(message);
        return;
      }

      const recordId = data?.recordId;
      if (typeof recordId !== "string" || recordId.length === 0) {
        setError("Missing record id in response.");
        return;
      }

      router.push(`/review/${recordId}`);
    } catch {
      setError("Something went wrong while uploading your document.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-medium text-zinc-900">Upload a Record</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Upload a document and let Claude extract people, events, and
        relationships.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="record_file"
            className="mb-1 block text-sm font-medium text-zinc-700"
          >
            File (JPG, PNG, PDF)
          </label>
          <input
            id="record_file"
            type="file"
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800"
          />
        </div>

        <div>
          <label
            htmlFor="record_type"
            className="mb-1 block text-sm font-medium text-zinc-700"
          >
            Record type
          </label>
          <select
            id="record_type"
            value={recordType}
            onChange={(event) =>
              setRecordType(event.target.value as (typeof RECORD_TYPES)[number])
            }
            className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-indigo-500 focus:ring-2 sm:max-w-xs"
          >
            {RECORD_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleUpload}
          disabled={isLoading}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70"
        >
          Upload and Analyze
        </button>

        {isLoading ? (
          <p className="text-sm text-zinc-700">Claude is reading your document...</p>
        ) : null}

        {error ? (
          <p
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
