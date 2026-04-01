"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

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

const modalColors = {
  parchment: "var(--dg-parchment)",
  brownBorder: "var(--dg-brown-border)",
  brownDark: "var(--dg-brown-dark)",
  brownMuted: "var(--dg-brown-muted)",
  brownOutline: "var(--dg-brown-outline)",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fullNameFromPersonRow(p: unknown): string {
  if (!isRecord(p)) return "";
  const parts = [p["first_name"], p["middle_name"] ?? "", p["last_name"]]
    .map((x) => String(x ?? "").trim())
    .filter(Boolean);
  return parts.join(" ");
}

/** Full names from API `people` array in the response object. */
function extractPeopleFullNames(data: unknown): string[] {
  if (!isRecord(data)) return [];
  const people = data["people"];
  if (!Array.isArray(people)) return [];
  return people.map(fullNameFromPersonRow).filter((s) => s.length > 0);
}

type DocumentUploadSectionProps = {
  /** When set, the record is tied to this tree (process-document + save-review). */
  treeId?: string;
  /** When set, extraction is anchored to this person (e.g. profile upload). */
  anchorPersonId?: string;
  /** Omit card chrome and heading when used inside another shell (e.g. a modal). */
  embedded?: boolean;
};

export default function DocumentUploadSection({
  treeId,
  anchorPersonId,
  embedded = false,
}: DocumentUploadSectionProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [recordType, setRecordType] = useState<(typeof RECORD_TYPES)[number]>(
    "Birth Record"
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [multiPersonModalOpen, setMultiPersonModalOpen] = useState(false);
  const [multiPersonNameQuery, setMultiPersonNameQuery] = useState("");
  const [pendingRecordId, setPendingRecordId] = useState<string | null>(null);
  const [pendingPeople, setPendingPeople] = useState<string[]>([]);
  const [multiPersonProcessing, setMultiPersonProcessing] = useState(false);

  const buildFormData = useCallback(
    (f: File, opts?: { anchorName?: string }) => {
      const formData = new FormData();
      formData.append("file", f);
      formData.append("record_type", recordType);
      if (treeId != null && treeId.trim() !== "") {
        formData.append("tree_id", treeId.trim());
      }
      const name = opts?.anchorName?.trim();
      if (name) {
        formData.append("anchor_person_name", name);
      } else if (anchorPersonId != null && anchorPersonId.trim() !== "") {
        formData.append("anchor_person_id", anchorPersonId.trim());
      }
      return formData;
    },
    [recordType, treeId, anchorPersonId]
  );

  /** Empty query → all extracted names; otherwise fuzzy token match on full name. */
  const multiPersonListShown = useMemo(() => {
    if (!multiPersonModalOpen) return [];
    const q = multiPersonNameQuery.trim();
    if (q === "") return pendingPeople;
    const tokens = q.split(/\s+/).filter(Boolean);
    return pendingPeople.filter((name) => {
      const lower = name.toLowerCase();
      return tokens.every((t) => lower.includes(t.toLowerCase()));
    });
  }, [multiPersonModalOpen, multiPersonNameQuery, pendingPeople]);

  function resetMultiPersonModal() {
    setError(null);
    setMultiPersonModalOpen(false);
    setPendingRecordId(null);
    setPendingPeople([]);
    setMultiPersonNameQuery("");
    setMultiPersonProcessing(false);
  }

  async function handleUpload() {
    if (!file) {
      setError("Please choose a file first.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const formData = buildFormData(file);

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

      const anchorSet =
        anchorPersonId != null && anchorPersonId.trim() !== "";
      const isMultiPerson = data?.is_multi_person === true;

      if (isMultiPerson && !anchorSet) {
        const names = extractPeopleFullNames(data);
        setPendingRecordId(recordId);
        setPendingPeople(names);
        setMultiPersonNameQuery("");
        setMultiPersonModalOpen(true);
        return;
      }

      router.push(`/review/${recordId}`);
    } catch {
      setError("Something went wrong while uploading your document.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSelectAnchorName(selectedName: string) {
    if (!file) {
      setError("Please choose a file first.");
      return;
    }

    setMultiPersonProcessing(true);
    setError(null);

    try {
      const formData = buildFormData(file, { anchorName: selectedName });

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

      const newRecordId = data?.recordId;
      if (typeof newRecordId !== "string" || newRecordId.length === 0) {
        setError("Missing record id in response.");
        return;
      }

      resetMultiPersonModal();
      router.push(`/review/${newRecordId}`);
    } catch {
      setError("Something went wrong while processing your document.");
    } finally {
      setMultiPersonProcessing(false);
    }
  }

  function handleUseTypedAnchorName() {
    const t = multiPersonNameQuery.trim();
    if (!t) return;
    void handleSelectAnchorName(t);
  }

  function handleSkipAllPeople() {
    if (pendingRecordId) {
      const id = pendingRecordId;
      resetMultiPersonModal();
      router.push(`/review/${id}`);
    }
  }

  const fields = (
    <div className={embedded ? "space-y-4" : "mt-4 space-y-4"}>
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

      {error && !multiPersonModalOpen ? (
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
  );

  const multiPersonModal =
    multiPersonModalOpen ? (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4"
        style={{ backgroundColor: "var(--dg-modal-backdrop)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="multi-person-modal-title"
        onClick={(e) => {
          if (e.target === e.currentTarget && !multiPersonProcessing) {
            resetMultiPersonModal();
          }
        }}
      >
        <div
          className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border p-6 shadow-xl"
          style={{
            backgroundColor: modalColors.parchment,
            borderColor: modalColors.brownBorder,
            boxShadow: "0 12px 40px rgb(var(--dg-shadow-rgb) / 0.2)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            id="multi-person-modal-title"
            className="text-2xl font-bold"
            style={{ fontFamily: serif, color: modalColors.brownDark }}
          >
            Who are you researching?
          </h2>
          <p
            className="mt-2 text-sm"
            style={{ fontFamily: sans, color: modalColors.brownMuted }}
          >
            We found multiple people on this document. Type a name to focus on
            the right one.
          </p>

          <label
            htmlFor="multi-person-search"
            className="mt-4 mb-1 block text-xs font-semibold uppercase tracking-wide"
            style={{ fontFamily: sans, color: modalColors.brownMuted }}
          >
            Search by name
          </label>
          <input
            id="multi-person-search"
            type="search"
            value={multiPersonNameQuery}
            onChange={(e) => setMultiPersonNameQuery(e.target.value)}
            placeholder="Search by name…"
            disabled={multiPersonProcessing}
            autoComplete="off"
            className="mb-2 w-full rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--dg-forest)_35%,transparent)]"
            style={{
              fontFamily: sans,
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: modalColors.brownBorder,
              backgroundColor: "var(--dg-bg-main)",
              color: modalColors.brownDark,
            }}
          />

          <button
            type="button"
            disabled={
              multiPersonProcessing || multiPersonNameQuery.trim() === ""
            }
            className="mb-4 w-full rounded-md px-4 py-2 text-sm font-semibold transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            style={{
              fontFamily: sans,
              backgroundColor: "var(--dg-primary-bg)",
              color: "var(--dg-primary-fg)",
            }}
            onClick={handleUseTypedAnchorName}
          >
            Use this name
          </button>

          {multiPersonProcessing ? (
            <p
              className="mb-4 text-sm italic"
              style={{ fontFamily: sans, color: modalColors.brownMuted }}
            >
              Re-processing with your selected person…
            </p>
          ) : null}

          {error ? (
            <p
              className="mb-4 rounded-md border px-3 py-2 text-sm"
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

          <ul className="mb-4 max-h-[40vh] space-y-2 overflow-y-auto pr-1">
            {multiPersonListShown.map((name, idx) => (
              <li key={`${idx}-${name}`}>
                <button
                  type="button"
                  disabled={multiPersonProcessing}
                  className="w-full rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    fontFamily: sans,
                    borderColor: modalColors.brownBorder,
                    backgroundColor: "var(--dg-cream)",
                    color: modalColors.brownDark,
                    cursor: "pointer",
                  }}
                  onClick={() => void handleSelectAnchorName(name)}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button
              type="button"
              disabled={multiPersonProcessing}
              className="rounded-md border-2 px-4 py-2 text-sm font-semibold transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                fontFamily: sans,
                borderColor: modalColors.brownOutline,
                color: modalColors.brownDark,
                backgroundColor: "transparent",
              }}
              onClick={() => resetMultiPersonModal()}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={multiPersonProcessing || !pendingRecordId}
              className="rounded-md border-2 px-4 py-2 text-sm font-semibold transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                fontFamily: sans,
                borderColor: modalColors.brownOutline,
                color: modalColors.brownDark,
                backgroundColor: "transparent",
              }}
              onClick={handleSkipAllPeople}
            >
              Skip — use all people
            </button>
          </div>
        </div>
      </div>
    ) : null;

  if (embedded) {
    return (
      <>
        {fields}
        {multiPersonModal}
      </>
    );
  }

  return (
    <>
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
        {fields}
      </section>
      {multiPersonModal}
    </>
  );
}
