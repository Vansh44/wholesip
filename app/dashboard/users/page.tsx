import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UsersManagementView } from "./users-management-view";

export interface Profile {
  id: string;
  email: string;
  role: string;
  force_password_reset: boolean;
  created_at: string;
}

export default async function UsersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="max-w-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <span>⚠️</span> Failed to load users
        </div>
        <p className="leading-relaxed text-destructive/80">
          Make sure you have superadmin access and the profiles table exists in
          your database.
        </p>
      </div>
    );
  }

  return (
    <UsersManagementView
      currentUserId={user.id}
      profiles={(profiles ?? []) as Profile[]}
    />
  );
}
