"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import PeopleGrid, { type PersonGridRow } from "./people-grid";

const serif = "var(--font-dg-display), 'Playfair Display', Georgia, serif";

const colors = {
  brownDark: "#3D2914",
  brownMid: "#5C3D2E",
  brownMuted: "#7A6654",
  brownBorder: "#A08060",
  brownOutline: "#6B4423",
  parchment: "#F3EBE0",
  parchmentDeep: "#E8DCC8",
  cream: "#FFFCF7",
  forest: "#2C4A3E",
};

export default function DeadGossipShell({
  personCount,
  people,
  uploadSection,
  addPersonSection,
  formError,
  personsErrorMessage,
}: {
  personCount: number;
  people: PersonGridRow[];
  uploadSection: ReactNode;
  addPersonSection: ReactNode;
  formError: string | null;
  personsErrorMessage: string | null;
}) {
  const router = useRouter();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const formattedCount = new Intl.NumberFormat("en-US").format(personCount);

  const heroBtnBase: React.CSSProperties = {
    fontFamily: "var(--font-dg-body), Lato, sans-serif",
    borderWidth: 2,
    borderStyle: "solid",
    borderColor: colors.brownOutline,
    color: colors.brownDark,
    backgroundColor: "transparent",
    padding: "0.75rem 1.5rem",
    borderRadius: 4,
    fontSize: "0.9375rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "background-color 0.2s, color 0.2s, border-color 0.2s",
  };

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .dg-hero-btn:hover {
              background-color: ${colors.parchmentDeep} !important;
              border-color: ${colors.brownDark} !important;
            }
            .dg-signout:hover {
              background-color: ${colors.parchment} !important;
              border-color: ${colors.brownBorder} !important;
            }
          `,
        }}
      />

      <nav
        className="border-b px-4 py-4 sm:px-6"
        style={{
          backgroundColor: colors.cream,
          borderColor: `${colors.brownBorder}55`,
        }}
      >
        <div className="mx-auto flex max-w-6xl items-start justify-between gap-4">
          <div>
            <p
              className="text-2xl font-bold tracking-tight sm:text-3xl"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Dead Gossip
            </p>
            <p
              className="mt-0.5 text-xs sm:text-sm"
              style={{
                fontFamily: "var(--font-dg-body), Lato, sans-serif",
                fontStyle: "italic",
                color: colors.brownMuted,
              }}
            >
              The good, the bad, the buried.
            </p>
          </div>
          <button
            type="button"
            className="dg-signout shrink-0 rounded-md border px-3 py-2 text-sm"
            style={{
              fontFamily: "var(--font-dg-body), Lato, sans-serif",
              borderColor: `${colors.brownBorder}99`,
              color: colors.brownMid,
              backgroundColor: colors.cream,
            }}
            onClick={() => void handleSignOut()}
          >
            Sign out
          </button>
        </div>
      </nav>

      <header
        className="border-b px-4 py-10 sm:px-6 sm:py-14"
        style={{
          backgroundColor: colors.parchment,
          borderColor: `${colors.brownBorder}44`,
          backgroundImage:
            "linear-gradient(180deg, rgba(255,252,247,0.5) 0%, transparent 100%)",
        }}
      >
        <div className="mx-auto max-w-3xl text-center">
          <h1
            className="text-3xl leading-tight sm:text-4xl md:text-[2.75rem]"
            style={{ fontFamily: serif, color: colors.brownDark }}
          >
            Your family&apos;s story, unfiltered.
          </h1>
          <p
            className="mt-5 text-lg sm:text-xl md:text-2xl"
            style={{
              fontFamily: serif,
              color: colors.brownMid,
              fontWeight: 600,
            }}
          >
            {formattedCount}{" "}
            {personCount === 1 ? "ancestor" : "ancestors"} and counting
          </p>
          <div className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              className="dg-hero-btn"
              style={heroBtnBase}
              aria-expanded={uploadOpen}
              onClick={() => setUploadOpen((o) => !o)}
            >
              Upload a Record
            </button>
            <button
              type="button"
              className="dg-hero-btn"
              style={heroBtnBase}
              aria-expanded={addOpen}
              onClick={() => setAddOpen((o) => !o)}
            >
              Add a Person
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {formError ? (
          <p
            className="mb-6 rounded-lg border px-4 py-3 text-sm"
            style={{
              borderColor: "#C45C5C",
              backgroundColor: "#FDF2F2",
              color: "#7A2E2E",
              fontFamily: "var(--font-dg-body), Lato, sans-serif",
            }}
            role="alert"
          >
            {formError}
          </p>
        ) : null}

        {personsErrorMessage ? (
          <p
            className="mb-6 rounded-lg border px-4 py-3 text-sm"
            style={{
              borderColor: colors.brownBorder,
              backgroundColor: colors.parchment,
              color: colors.brownDark,
              fontFamily: "var(--font-dg-body), Lato, sans-serif",
            }}
            role="alert"
          >
            Could not load persons: {personsErrorMessage}
          </p>
        ) : null}

        {uploadOpen ? (
          <div className="mb-8">{uploadSection}</div>
        ) : null}
        {addOpen ? <div className="mb-10">{addPersonSection}</div> : null}

        <PeopleGrid people={people} forestAccent={colors.forest} />
      </div>
    </>
  );
}
