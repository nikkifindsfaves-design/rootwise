import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { addPerson } from "./actions";
import DocumentUploadSection from "./document-upload";

type PersonRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  birth_date: string | null;
  death_date: string | null;
};

function formatDate(value: string | null) {
  return value ?? "—";
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const params = await searchParams;
  const formError = params.error;

  const { data: persons, error: personsError } = await supabase
    .from("persons")
    .select("id, first_name, middle_name, last_name, birth_date, death_date")
    .eq("user_id", user.id)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const rows: PersonRow[] = persons ?? [];

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10">
      <div className="mx-auto max-w-3xl space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-zinc-900">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Add people to your tree and review everyone you have saved.
          </p>
        </header>

        {formError ? (
          <p
            className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            role="alert"
          >
            {formError}
          </p>
        ) : null}

        {personsError ? (
          <p
            className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
            role="alert"
          >
            Could not load persons: {personsError.message}
          </p>
        ) : null}

        <DocumentUploadSection />

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-zinc-900">Add a person</h2>
          <form action={addPerson} className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="first_name"
                  className="mb-1 block text-sm font-medium text-zinc-700"
                >
                  First name
                </label>
                <input
                  id="first_name"
                  name="first_name"
                  type="text"
                  required
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 outline-none ring-indigo-500 focus:ring-2"
                  placeholder="Given name"
                />
              </div>
              <div>
                <label
                  htmlFor="middle_name"
                  className="mb-1 block text-sm font-medium text-zinc-700"
                >
                  Middle name
                </label>
                <input
                  id="middle_name"
                  name="middle_name"
                  type="text"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 outline-none ring-indigo-500 focus:ring-2"
                  placeholder="Optional"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="last_name"
                className="mb-1 block text-sm font-medium text-zinc-700"
              >
                Last name
              </label>
              <input
                id="last_name"
                name="last_name"
                type="text"
                required
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 outline-none ring-indigo-500 focus:ring-2"
                placeholder="Family name"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="birth_date"
                  className="mb-1 block text-sm font-medium text-zinc-700"
                >
                  Birth date
                </label>
                <input
                  id="birth_date"
                  name="birth_date"
                  type="date"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 outline-none ring-indigo-500 focus:ring-2"
                />
              </div>
              <div>
                <label
                  htmlFor="death_date"
                  className="mb-1 block text-sm font-medium text-zinc-700"
                >
                  Death date
                </label>
                <input
                  id="death_date"
                  name="death_date"
                  type="date"
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 outline-none ring-indigo-500 focus:ring-2"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="gender"
                className="mb-1 block text-sm font-medium text-zinc-700"
              >
                Gender
              </label>
              <select
                id="gender"
                name="gender"
                defaultValue="Unknown"
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-indigo-500 focus:ring-2 sm:max-w-xs"
              >
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Unknown">Unknown</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="notes"
                className="mb-1 block text-sm font-medium text-zinc-700"
              >
                Notes
              </label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                className="w-full resize-y rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 outline-none ring-indigo-500 focus:ring-2"
                placeholder="Optional details"
              />
            </div>

            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
            >
              Add person
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-medium text-zinc-900">Your people</h2>
          {rows.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">
              No people yet. Add someone above to get started.
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[320px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-zinc-600">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Birth date</th>
                    <th className="py-2 font-medium">Death date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-zinc-100 last:border-0"
                    >
                      <td className="py-2 pr-4 text-zinc-900">
                        {[p.first_name, p.middle_name, p.last_name]
                          .filter((v): v is string => Boolean(v))
                          .join(" ")}
                      </td>
                      <td className="py-2 pr-4 text-zinc-700">
                        {formatDate(p.birth_date)}
                      </td>
                      <td className="py-2 text-zinc-700">
                        {formatDate(p.death_date)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
