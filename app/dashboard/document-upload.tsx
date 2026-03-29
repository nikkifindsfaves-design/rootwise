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
        backgroundColor: "var(--dg-cream)",
        borderColor: "var(--dg-paper-border)",
        boxShadow: "0 4px 20px rgb(var(--dg-shadow-rgb) / 0.06)",
      }}
    >
      <h2
        className="text-xl font-bold"
        style={{ fontFamily: serif, color: "var(--dg-brown-dark)" }}
      >
        Upload a Record
      </h2>
      <p
        className="mt-1 text-sm"
        style={{ fontFamily: sans, color: "var(--dg-brown-muted)" }}
      >
        Upload a document and let Claude extract people, events, and
        relationships.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="record_file"
            className="mb-1 block text-sm font-medium"
            style={{ fontFamily: sans, color: "var(--dg-brown-mid)" }}
          >
            File (JPG, PNG, PDF)
          </label>
          <input
            id="record_file"
            type="file"
            accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full rounded-md px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--dg-primary-bg)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-[var(--dg-primary-fg)] hover:file:opacity-90"
            style={{
              fontFamily: sans,
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: "var(--dg-brown-border)",
              backgroundColor: "var(--dg-bg-main)",
              color: "var(--dg-brown-dark)",
            }}
          />
        </div>

        <div>
          <label
            htmlFor="record_type"
            className="mb-1 block text-sm font-medium"
            style={{ fontFamily: sans, color: "var(--dg-brown-mid)" }}
          >
            Record type
          </label>
          <select
            id="record_type"
            value={recordType}
            onChange={(event) =>
              setRecordType(event.target.value as (typeof RECORD_TYPES)[number])
            }
            className="w-full rounded-md px-3 py-2 outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--dg-forest)_35%,transparent)] sm:max-w-xs"
            style={{
              fontFamily: sans,
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: "var(--dg-brown-border)",
              backgroundColor: "var(--dg-bg-main)",
              color: "var(--dg-brown-dark)",
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
            backgroundColor: "var(--dg-primary-bg)",
            color: "var(--dg-primary-fg)",
          }}
        >
          Upload and Analyze
        </button>

        {isLoading ? (
          <p
            className="text-sm italic"
            style={{ fontFamily: sans, color: "var(--dg-brown-mid)" }}
          >
            Claude is reading your document…
          </p>
        ) : null}

        {error ? (
          <p
            className="rounded-md border px-3 py-2 text-sm"
            style={{
              fontFamily: sans,
              borderColor: "var(--dg-error-border)",
              backgroundColor: "var(--dg-error-bg)",
              color: "var(--dg-error-text)",
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
