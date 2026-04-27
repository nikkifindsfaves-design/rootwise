function requireValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} must be configured.`);
  }
  return value;
}

export function getSupabaseEnv() {
  return {
    // Use static env references so Next can inline NEXT_PUBLIC_* in client bundles.
    url: requireValue(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: requireValue(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    ),
  };
}

export function getSupabaseAdminEnv() {
  return {
    // Keep admin URL aligned with app URL to avoid cross-project writes.
    url: requireValue(process.env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"),
    serviceRoleKey: requireValue(process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY"),
  };
}
