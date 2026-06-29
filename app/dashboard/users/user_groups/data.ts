import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getActingStoreId } from "@/app/dashboard/lib/access";
import type { GroupCustomer, UserGroup } from "./shared";

/**
 * Every user group (alphabetical) with its member ids + count, plus the full
 * lightweight customer list for the membership picker. All reads go through the
 * service-role admin client: user_groups / user_group_members are admin-only
 * under RLS, and the customers table is own-row-only. `error` is true when the
 * user_groups table hasn't been migrated yet.
 */
export async function getUserGroupsData(): Promise<{
  groups: UserGroup[];
  customers: GroupCustomer[];
  error: boolean;
}> {
  const admin = createAdminClient();
  const storeId = await getActingStoreId();

  const { data: groupRows, error } = await admin
    .from("user_groups")
    .select("id, name, description, color, created_at, updated_at")
    .eq("store_id", storeId)
    .order("name", { ascending: true });

  if (error) {
    console.error(
      "Failed to load user_groups (has supabase/user_groups_table.sql been applied?):",
      error,
    );
    return { groups: [], customers: [], error: true };
  }

  const [membersRes, customersRes] = await Promise.all([
    admin
      .from("user_group_members")
      .select("group_id, user_id")
      .eq("store_id", storeId),
    admin
      .from("users")
      .select("id, first_name, last_name, email, phone")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false }),
  ]);

  const byGroup = new Map<string, string[]>();
  for (const m of membersRes.data ?? []) {
    const gid = m.group_id as string;
    const list = byGroup.get(gid) ?? [];
    list.push(m.user_id as string);
    byGroup.set(gid, list);
  }

  const customers: GroupCustomer[] = (customersRes.data ?? []).map((c) => ({
    id: c.id as string,
    first_name: (c.first_name as string) ?? "",
    last_name: (c.last_name as string | null) ?? null,
    email: (c.email as string | null) ?? null,
    phone: (c.phone as string) ?? "",
  }));

  const groups: UserGroup[] = (groupRows ?? []).map((g) => {
    const ids = byGroup.get(g.id as string) ?? [];
    return {
      id: g.id as string,
      name: g.name as string,
      description: (g.description as string | null) ?? null,
      color: (g.color as string) ?? "blue",
      created_at: g.created_at as string,
      updated_at: g.updated_at as string,
      member_ids: ids,
      member_count: ids.length,
    };
  });

  return { groups, customers, error: false };
}
