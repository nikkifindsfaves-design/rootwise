import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountSettingsShell from "./settings-shell";

export default async function AccountSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <AccountSettingsShell />;
}
