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

const sans = "var(--font-dg-body), Lato, sans-serif";
const serif = "var(--font-dg-display), 'Playfair Display', Georgia, serif";

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
    <section
      className="rounded-xl border p-6 shadow-sm"
      style={{
        backgroundColor: "#FFFCF7",
        borderColor: "#C4A882",
        boxShadow: "0 4px 20px rgba(61, 41, 20, 0.06)",
      }}
    >
      <h2
        className="text-xl font-bold"
        style={{ fontFamily: serif, color: "#3D2914" }}
      >
        Upload a Record
      </h2>
      <p
        className="mt-1 text-sm"
        style={{ fontFamily: sans, color: "#7A6654" }}
      >
        Upload a document and let Claude extract people, events, and
        relationships.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="record_file"
            className="mb-1 block text-sm font-medium"
            style={{ fontFamily: sans, color: "#5C3D2E" }}
          >
            File (JPG, PNG, PDF)
          </label>
          <input
            id="record_file"
            type="file"
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full rounded-md px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[#3D2914] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[#FFFCF7] hover:file:opacity-90"
            style={{
              fontFamily: sans,
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: "#A08060",
              backgroundColor: "#FAF7F2",
              color: "#3D2914",
            }}
          />
        </div>

        <div>
          <label
            htmlFor="record_type"
            className="mb-1 block text-sm font-medium"
            style={{ fontFamily: sans, color: "#5C3D2E" }}
          >
            Record type
          </label>
          <select
            id="record_type"
            value={recordType}
            onChange={(event) =>
              setRecordType(event.target.value as (typeof RECORD_TYPES)[number])
            }
            className="w-full rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-[#2C4A3E]/35 sm:max-w-xs"
            style={{
              fontFamily: sans,
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: "#A08060",
              backgroundColor: "#FAF7F2",
              color: "#3D2914",
            }}
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
          className="rounded-md px-4 py-2 text-sm font-semibold transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            fontFamily: sans,
            backgroundColor: "#3D2914",
            color: "#FFFCF7",
          }}
        >
          Upload and Analyze
        </button>

        {isLoading ? (
          <p className="text-sm italic" style={{ fontFamily: sans, color: "#5C3D2E" }}>
            Claude is reading your document…
          </p>
        ) : null}

        {error ? (
          <p
            className="rounded-md border px-3 py-2 text-sm"
            style={{
              fontFamily: sans,
              borderColor: "#C45C5C",
              backgroundColor: "#FDF2F2",
              color: "#7A2E2E",
            }}
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
