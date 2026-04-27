import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = getSupabaseEnv();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch (error) {
          // Ignore cookie writes from Server Components; surface other cases in development.
          if (process.env.NODE_ENV !== "production") {
            console.debug("Supabase cookie write skipped in server context.", error);
          }
        }
      },
    },
  });
}

// Backward-compatible alias for existing imports.
export const createClient = createServerSupabaseClient;
