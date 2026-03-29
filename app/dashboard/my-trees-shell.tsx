"use client";

import { useTheme } from "@/lib/theme/theme-context";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";

const serif = "var(--font-dg-display), 'Playfair Display', Georgia, serif";
const sans = "var(--font-dg-body), Lato, sans-serif";

const colors = {
  brownDark: "var(--dg-brown-dark)",
  brownMid: "var(--dg-brown-mid)",
  brownMuted: "var(--dg-brown-muted)",
  brownBorder: "var(--dg-brown-border)",
  brownOutline: "var(--dg-brown-outline)",
  parchment: "var(--dg-parchment)",
  cream: "var(--dg-cream)",
};

export type TreeWithCount = {
  id: string;
  name: string;
  created_at: string;
  ancestorCount: number;
};

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export default function MyTreesShell({
  trees,
  treesErrorMessage,
  personsErrorMessage,
}: {
  trees: TreeWithCount[];
  treesErrorMessage: string | null;
  personsErrorMessage: string | null;
}) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [newTreeName, setNewTreeName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleSignOut = useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }, [router]);

  const heroBtnBase: CSSProperties = {
    fontFamily: sans,
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

  const openTreeCardBtnStyle: CSSProperties = {
    ...heroBtnBase,
    fontSize: "1rem",
    width: "100%",
    boxSizing: "border-box",
  };

  const inputStyle: CSSProperties = {
    fontFamily: sans,
    color: colors.brownDark,
    backgroundColor: colors.cream,
    borderColor: colors.brownBorder,
    borderWidth: 1,
    borderStyle: "solid",
    padding: "0.65rem 0.75rem",
    fontSize: "1rem",
    borderRadius: 2,
    width: "100%",
    maxWidth: "24rem",
    boxSizing: "border-box",
    outlineColor: colors.brownOutline,
  };

  async function handleCreateTree(e: FormEvent) {
    e.preventDefault();
    const name = newTreeName.trim();
    if (name === "") {
      setCreateError("Give your tree a name—the ledger needs a title.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setCreateError("Not signed in.");
        return;
      }
      const { data, error } = await supabase
        .from("trees")
        .insert({ user_id: user.id, name })
        .select("id")
        .single();
      if (error) {
        setCreateError(error.message);
        return;
      }
      const id = (data as { id: string }).id;
      setNewTreeName("");
      router.push(`/dashboard/${id}`);
      router.refresh();
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .dg-hero-btn:hover:not(:disabled) {
              background-color: var(--dg-parchment-deep) !important;
              border-color: var(--dg-brown-dark) !important;
            }
            .dg-signout:hover {
              background-color: var(--dg-parchment) !important;
              border-color: var(--dg-brown-border) !important;
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
        <div className="mx-auto flex w-full max-w-6xl items-start gap-4">
          <div>
            <p
              className="text-2xl font-bold tracking-tight sm:text-3xl"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              Dead Gossip
            </p>
            <p
              className="mt-0.5"
              style={{
                fontFamily: sans,
                fontStyle: "italic",
                fontSize: "1rem",
                color: "var(--dg-brown-mid)",
              }}
            >
              The good, the bad, the buried.
            </p>
          </div>
          <button
            type="button"
            className="ml-auto shrink-0"
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            style={{
              fontFamily: sans,
              fontSize: "1.2rem",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "0.4rem 0.6rem",
              borderRadius: 4,
            }}
            onClick={toggleTheme}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
          <button
            type="button"
            className="dg-signout shrink-0 rounded-md border px-3 py-2 text-sm"
            style={{
              fontFamily: sans,
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
            "linear-gradient(180deg, var(--dg-gradient-hero-top) 0%, transparent 100%)",
        }}
      >
        <div className="mx-auto max-w-3xl text-center">
          <h1
            className="text-3xl leading-tight sm:text-4xl md:text-[2.75rem]"
            style={{ fontFamily: serif, color: colors.brownDark }}
          >
            Your Family Trees
          </h1>
          <p
            className="mt-5"
            style={{
              fontFamily: sans,
              fontSize: "1.25rem",
              color: colors.brownMid,
              fontStyle: "italic",
              lineHeight: 1.55,
            }}
          >
            Each tree keeps its own whispers—open one to chart the names, the
            dates, and what the parish register left out.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {treesErrorMessage ? (
          <p
            className="mb-6 rounded-lg border px-4 py-3 text-sm"
            style={{
              borderColor: colors.brownBorder,
              backgroundColor: colors.parchment,
              color: colors.brownDark,
              fontFamily: sans,
            }}
            role="alert"
          >
            Could not load trees: {treesErrorMessage}
          </p>
        ) : null}

        {personsErrorMessage ? (
          <p
            className="mb-6 rounded-lg border px-4 py-3 text-sm"
            style={{
              borderColor: colors.brownBorder,
              backgroundColor: colors.parchment,
              color: colors.brownDark,
              fontFamily: sans,
            }}
            role="alert"
          >
            Ancestor counts may be incomplete: {personsErrorMessage}
          </p>
        ) : null}

        <section
          className="mb-10 rounded-lg border p-6"
          style={{
            borderColor: colors.brownBorder,
            backgroundColor: colors.parchment,
            boxShadow: "0 8px 28px rgb(var(--dg-shadow-rgb) / 0.08)",
          }}
        >
          <h2
            className="mb-4 text-xl font-bold sm:text-2xl"
            style={{ fontFamily: serif, color: colors.brownDark }}
          >
            Create New Tree
          </h2>
          <p
            className="mb-4"
            style={{
              fontFamily: sans,
              fontSize: "1.1rem",
              color: "var(--dg-brown-mid)",
            }}
          >
            A fresh ledger for a new line—name it whatever the cousins would
            argue over at Sunday dinner.
          </p>
          <form
            className="flex flex-col"
            onSubmit={(e) => void handleCreateTree(e)}
          >
            <label
              htmlFor="new-tree-name"
              className="mb-1 block font-bold uppercase tracking-wide"
              style={{
                fontFamily: sans,
                fontSize: "0.85rem",
                color: colors.brownMuted,
              }}
            >
              Tree name
            </label>
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                <input
                  id="new-tree-name"
                  type="text"
                  value={newTreeName}
                  onChange={(e) => setNewTreeName(e.target.value)}
                  placeholder="e.g. The Holloway line"
                  disabled={creating}
                  autoComplete="off"
                  style={{ ...inputStyle, maxWidth: "none" }}
                />
              </div>
              <button
                type="submit"
                className="dg-hero-btn min-w-[10rem] shrink-0"
                style={heroBtnBase}
                disabled={creating}
              >
                {creating ? "Creating…" : "Create tree"}
              </button>
            </div>
          </form>
          {createError ? (
            <p
              className="mt-3 text-sm"
              style={{ fontFamily: sans, color: "#8B3A3A" }}
              role="alert"
            >
              {createError}
            </p>
          ) : null}
        </section>

        <h2
          className="mb-4 font-bold"
          style={{
            fontFamily: serif,
            fontSize: "1.6rem",
            color: colors.brownDark,
          }}
        >
          Your trees
        </h2>

        {trees.length === 0 ? (
          <div
            className="rounded-lg border px-6 py-12 text-center"
            style={{
              borderColor: colors.brownBorder,
              backgroundColor: colors.cream,
            }}
          >
            <p
              className="text-lg"
              style={{ fontFamily: serif, color: colors.brownDark }}
            >
              No trees yet—nothing to gossip about.
            </p>
            <p
              className="mx-auto mt-3 max-w-md text-sm"
              style={{ fontFamily: sans, color: colors.brownMuted }}
            >
              Spin up your first tree above. Once it exists, you&apos;ll open it
              here and start filling in the names they swore were lost to time.
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trees.map((tree) => (
              <li
                key={tree.id}
                className="flex flex-col rounded-lg border p-8"
                style={{
                  borderColor: colors.brownBorder,
                  backgroundColor: colors.cream,
                  boxShadow: "0 4px 16px rgb(var(--dg-shadow-rgb) / 0.06)",
                }}
              >
                <h3
                  className="font-bold leading-snug"
                  style={{
                    fontFamily: serif,
                    fontSize: "1.4rem",
                    color: colors.brownDark,
                  }}
                >
                  {tree.name}
                </h3>
                <p
                  className="mt-2"
                  style={{
                    fontFamily: sans,
                    fontSize: "1rem",
                    color: "var(--dg-brown-mid)",
                  }}
                >
                  {tree.ancestorCount}{" "}
                  {tree.ancestorCount === 1 ? "ancestor" : "ancestors"}
                </p>
                <p
                  className="mt-1"
                  style={{
                    fontFamily: sans,
                    fontSize: "1rem",
                    color: "var(--dg-brown-mid)",
                  }}
                >
                  Created {formatCreatedAt(tree.created_at)}
                </p>
                <div
                  className="mt-4 h-px w-full shrink-0"
                  style={{ backgroundColor: `${colors.brownBorder}66` }}
                  aria-hidden
                />
                <Link
                  href={`/dashboard/${tree.id}`}
                  className="dg-hero-btn mt-4 inline-flex w-full items-center justify-center text-center no-underline"
                  style={openTreeCardBtnStyle}
                >
                  Open Tree
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
