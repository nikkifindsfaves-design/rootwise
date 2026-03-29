"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type PersonGridRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  birth_date: string | null;
  death_date: string | null;
  photo_url: string | null;
};

const serif = "var(--font-dg-display), 'Playfair Display', Georgia, serif";
const sans = "var(--font-dg-body), Lato, sans-serif";

const defaultForest = "var(--dg-forest)";

function initialsForPerson(p: PersonGridRow): string {
  const f = p.first_name.trim();
  const l = p.last_name.trim();
  const fi = f[0];
  const li = l[0];
  if (fi && li) return (fi + li).toUpperCase();
  if (li) return li.toUpperCase();
  if (fi) return (fi + (f[1] ?? "")).slice(0, 2).toUpperCase();
  return "?";
}

function matchesSearch(p: PersonGridRow, q: string): boolean {
  if (!q) return true;
  const n = q.trim().toLowerCase();
  if (!n) return true;
  return (
    p.first_name.toLowerCase().includes(n) ||
    p.last_name.toLowerCase().includes(n) ||
    (p.middle_name ?? "").toLowerCase().includes(n)
  );
}

export default function PeopleGrid({
  people,
  forestAccent = defaultForest,
}: {
  people: PersonGridRow[];
  forestAccent?: string;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => people.filter((p) => matchesSearch(p, query)),
    [people, query]
  );

  const total = people.length;

  const cream = "var(--dg-cream)";
  const paperBorder = "var(--dg-paper-border)";
  const brownDark = "var(--dg-brown-dark)";
  const brownMid = "var(--dg-brown-mid)";
  const brownMuted = "var(--dg-brown-muted)";
  const avatarBg = "var(--dg-avatar-bg)";
  const avatarRing = "var(--dg-brown-border)";

  return (
    <section className="space-y-5">
      <h2
        className="text-2xl font-bold tracking-tight"
        style={{ fontFamily: serif, color: brownDark }}
      >
        Your ancestors
      </h2>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by first, middle, or last name…"
        aria-label="Search people"
        className="w-full rounded-lg px-4 py-3 text-sm shadow-sm outline-none transition placeholder:italic placeholder:text-[var(--dg-brown-border)]"
        style={{
          fontFamily: sans,
          backgroundColor: cream,
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: paperBorder,
          color: brownDark,
        }}
        onFocus={(e) => {
          e.target.style.boxShadow = `0 0 0 3px ${forestAccent}33`;
          e.target.style.borderColor = forestAccent;
        }}
        onBlur={(e) => {
          e.target.style.boxShadow = "";
          e.target.style.borderColor = paperBorder;
        }}
      />

      {total === 0 ? (
        <p
          className="rounded-xl border border-dashed px-4 py-10 text-center text-sm"
          style={{
            fontFamily: sans,
            borderColor: `${paperBorder}99`,
            backgroundColor: `${cream}cc`,
            color: brownMuted,
          }}
        >
          No ancestors yet. Use{" "}
          <span style={{ fontWeight: 600, color: brownMid }}>
            Add a Person
          </span>{" "}
          above to begin your tree.
        </p>
      ) : filtered.length === 0 ? (
        <p
          className="rounded-xl border px-4 py-10 text-center text-sm"
          style={{
            fontFamily: sans,
            borderColor: paperBorder,
            backgroundColor: cream,
            color: brownMuted,
          }}
        >
          No names match your search.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {filtered.map((p) => {
            const last = p.last_name.trim() || "—";
            const firstMid = [p.first_name, p.middle_name ?? ""]
              .map((s) => s.trim())
              .filter(Boolean)
              .join(" ");

            return (
              <li key={p.id}>
                <Link
                  href={`/person/${p.id}`}
                  className="group block h-full rounded-xl border p-3 transition duration-200 ease-out hover:-translate-y-1"
                  style={{
                    backgroundColor: cream,
                    borderColor: paperBorder,
                    boxShadow:
                      "0 2px 8px rgb(var(--dg-shadow-rgb) / 0.06), 0 1px 2px rgb(var(--dg-shadow-rgb) / 0.04)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow =
                      "0 12px 28px rgb(var(--dg-shadow-rgb) / 0.12), 0 4px 8px rgb(var(--dg-shadow-rgb) / 0.06)";
                    e.currentTarget.style.borderColor = `${avatarRing}`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow =
                      "0 2px 8px rgb(var(--dg-shadow-rgb) / 0.06), 0 1px 2px rgb(var(--dg-shadow-rgb) / 0.04)";
                    e.currentTarget.style.borderColor = paperBorder;
                  }}
                >
                  <div className="flex gap-3">
                    <div
                      className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full ring-2 ring-[color-mix(in_srgb,var(--dg-brown-border)_25%,transparent)] transition group-hover:ring-[3px] group-hover:ring-[color-mix(in_srgb,var(--dg-brown-border)_40%,transparent)]"
                      style={{
                        backgroundColor: avatarBg,
                      }}
                    >
                      {p.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.photo_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span
                          className="flex h-full w-full items-center justify-center text-sm font-bold"
                          style={{
                            fontFamily: serif,
                            color: brownMid,
                          }}
                        >
                          {initialsForPerson(p)}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-lg font-bold leading-tight"
                        style={{ fontFamily: serif, color: brownDark }}
                      >
                        {last}
                      </p>
                      {firstMid ? (
                        <p
                          className="mt-0.5 text-base leading-snug"
                          style={{ fontFamily: serif, color: brownDark }}
                        >
                          {firstMid}
                        </p>
                      ) : null}
                      {p.birth_date ? (
                        <p
                          className="mt-1 text-sm italic"
                          style={{
                            fontFamily: sans,
                            color: brownMid,
                          }}
                        >
                          b. {p.birth_date}
                        </p>
                      ) : null}
                      {p.death_date ? (
                        <p
                          className="mt-0.5 text-sm italic"
                          style={{
                            fontFamily: sans,
                            color: brownMid,
                          }}
                        >
                          d. {p.death_date}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
