import { redirect } from "next/navigation";

function searchParamsToQuerySuffix(
  sp: Record<string, string | string[] | undefined>
): string {
  const u = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) u.append(key, v);
    } else {
      u.set(key, value);
    }
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** Legacy entry; app hub is `/tree-select`. */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams !== undefined ? await searchParams : {};
  redirect(`/tree-select${searchParamsToQuerySuffix(sp)}`);
}
