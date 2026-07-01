import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSectionAccess, getActingStoreId } from "../lib/access";
import { UsersManagementView } from "./users-management-view";

export interface RoleOption {
  slug: string;
  name: string;
  color: string;
}

export interface Profile {
  id: string;
  email: string;
  first_name: string;
  last_name: string | null;
  role: string;
  force_password_reset: boolean;
  is_suspended: boolean;
  created_at: string;
}

export default async function UsersPage() {
  const access = await requireSectionAccess("admins", "view");
  const canManage = access.can("admins", "manage");
  const storeId = await getActingStoreId();

  const supabase = await createClient();

  // The admins (staff) table is RLS-scoped to own-row reads for the session
  // client, so cross-row listing goes through the service-role admin client —
  // same pattern as the Users (customers) list. The page is already gated by
  // requireSectionAccess("admins", "view") above.
  const admin = createAdminClient();

  const { data: profiles, error } = await admin
    .from("admins")
    .select("*")
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  const { data: rolesData } = await supabase
    .from("roles")
    .select("slug, name, color")
    .order("is_system", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to load admins:", error);
    return (
      <div className="max-w-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <span>⚠️</span> Failed to load users
        </div>
        <p className="leading-relaxed text-destructive/80">
          Make sure you have superadmin access and the admins table exists in
          your database.
        </p>
      </div>
    );
  }

  // Fall back to the two built-in roles if the roles table isn't seeded yet.
  const roleOptions: RoleOption[] =
    rolesData && rolesData.length > 0
      ? (rolesData as RoleOption[])
      : [
          { slug: "superadmin", name: "Superadmin", color: "violet" },
          { slug: "member", name: "Member", color: "blue" },
        ];

  return (
    <UsersManagementView
      currentUserId={access.userId}
      profiles={(profiles ?? []) as Profile[]}
      roleOptions={roleOptions}
      canManage={canManage}
    />
  );
}
