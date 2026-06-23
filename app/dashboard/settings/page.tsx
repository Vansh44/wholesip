import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AccountSettingsView } from "./account-settings-view";

type Tab = "profile" | "security";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; focus?: string }>;
}) {
  const { tab, focus } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("admins")
    .select("first_name, last_name, role, email, phone")
    .eq("id", user.id)
    .single();

  const initialTab: Tab = tab === "security" ? "security" : "profile";

  return (
    <AccountSettingsView
      email={profile?.email ?? user.email ?? ""}
      role={profile?.role ?? ""}
      firstName={profile?.first_name ?? ""}
      lastName={profile?.last_name ?? ""}
      phone={profile?.phone ?? (user.phone ? `+${user.phone}` : "")}
      initialTab={initialTab}
      initialFocus={
        focus === "phone" ? "phone" : focus === "password" ? "password" : null
      }
    />
  );
}
