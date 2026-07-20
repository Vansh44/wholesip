import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { admins } from "@/drizzle/schema";
import { getServerUser } from "@/lib/auth/server-user";
import { AccountSettingsView } from "./account-settings-view";

type Tab = "profile" | "security";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; focus?: string }>;
}) {
  const { tab, focus } = await searchParams;

  const user = await getServerUser();
  if (!user) redirect("/auth/login");

  const rows = await withService((db) =>
    db
      .select({
        first_name: admins.firstName,
        last_name: admins.lastName,
        role: admins.role,
        email: admins.email,
        phone: admins.phone,
      })
      .from(admins)
      .where(eq(admins.id, user.id))
      .limit(1),
  ).catch(() => []);
  const profile = rows[0];

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
