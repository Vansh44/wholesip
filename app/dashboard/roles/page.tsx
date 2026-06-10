import { createClient } from "@/lib/supabase/server";
import { requireSectionAccess, type Role } from "../lib/access";
import { normalizePermissions } from "../lib/permissions";
import { RolesManagementView } from "./roles-management-view";

export default async function RolesPage() {
  const access = await requireSectionAccess("roles", "view");
  const canManage = access.can("roles", "manage");

  const supabase = await createClient();

  const { data: rolesRaw, error } = await supabase
    .from("roles")
    .select("*")
    .order("is_system", { ascending: false })
    .order("name", { ascending: true });

  if (error) {
    return (
      <div className="max-w-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <span>⚠️</span> Failed to load roles
        </div>
        <p className="leading-relaxed text-destructive/80">
          Make sure the <code>roles</code> table exists — run{" "}
          <code>supabase/roles_table.sql</code> in the Supabase SQL Editor.
        </p>
      </div>
    );
  }

  // Count how many admins hold each role (by slug).
  const { data: profiles } = await supabase.from("profiles").select("role");
  const counts = new Map<string, number>();
  for (const p of profiles ?? []) {
    if (p.role) counts.set(p.role, (counts.get(p.role) ?? 0) + 1);
  }

  const roles: (Role & { member_count: number })[] = (rolesRaw ?? []).map(
    (r) => ({
      ...(r as Role),
      permissions: normalizePermissions((r as Role).permissions),
      member_count: counts.get((r as Role).slug) ?? 0,
    }),
  );

  return <RolesManagementView roles={roles} canManage={canManage} />;
}
