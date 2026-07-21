import "server-only";

import { asc, desc, eq } from "drizzle-orm";
import { withService } from "@/lib/db/client";
import { userGroupMembers, userGroups, users } from "@/drizzle/schema";
import { getActingStoreId } from "@/app/dashboard/lib/access";
import type { GroupCustomer, UserGroup } from "./shared";

/**
 * Every user group (alphabetical) with its member ids + count, plus the full
 * lightweight customer list for the membership picker. All reads go through the
 * service scope: user_groups / user_group_members are admin-only under RLS, and
 * the users table is own-row-only. `error` is true when the read fails.
 */
export async function getUserGroupsData(): Promise<{
  groups: UserGroup[];
  customers: GroupCustomer[];
  error: boolean;
}> {
  const storeId = await getActingStoreId();

  try {
    return await withService(async (db) => {
      const groupRows = await db
        .select({
          id: userGroups.id,
          name: userGroups.name,
          description: userGroups.description,
          color: userGroups.color,
          created_at: userGroups.createdAt,
          updated_at: userGroups.updatedAt,
        })
        .from(userGroups)
        .where(eq(userGroups.storeId, storeId))
        .orderBy(asc(userGroups.name));
      const memberRows = await db
        .select({
          group_id: userGroupMembers.groupId,
          user_id: userGroupMembers.userId,
        })
        .from(userGroupMembers)
        .where(eq(userGroupMembers.storeId, storeId));
      const customerRows = await db
        .select({
          id: users.id,
          first_name: users.firstName,
          last_name: users.lastName,
          email: users.email,
          phone: users.phone,
        })
        .from(users)
        .where(eq(users.storeId, storeId))
        .orderBy(desc(users.createdAt));

      const byGroup = new Map<string, string[]>();
      for (const m of memberRows) {
        const list = byGroup.get(m.group_id) ?? [];
        list.push(m.user_id);
        byGroup.set(m.group_id, list);
      }

      const customers: GroupCustomer[] = customerRows.map((c) => ({
        id: c.id,
        first_name: c.first_name ?? "",
        last_name: c.last_name ?? null,
        email: c.email ?? null,
        phone: c.phone ?? "",
      }));

      const groups: UserGroup[] = groupRows.map((g) => {
        const ids = byGroup.get(g.id) ?? [];
        return {
          id: g.id,
          name: g.name,
          description: g.description ?? null,
          color: g.color ?? "blue",
          created_at: g.created_at,
          updated_at: g.updated_at,
          member_ids: ids,
          member_count: ids.length,
        };
      });

      return { groups, customers, error: false };
    });
  } catch (err) {
    console.error("Failed to load user_groups:", err);
    return { groups: [], customers: [], error: true };
  }
}
