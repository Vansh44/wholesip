"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { withService } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import { users } from "@/drizzle/schema";
import { getManagerUserId, getActingStoreId } from "@/app/dashboard/lib/access";

export interface ActionResult {
  success?: boolean;
  error?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CustomerUpdateInput {
  firstName: string;
  lastName?: string;
  email?: string;
}

/**
 * Dashboard: edit a storefront customer's profile (name / email). Phone is the
 * customer's verified login identifier and is intentionally NOT editable here.
 * Guarded by the "users" section manage permission.
 */
export async function updateCustomer(
  id: string,
  input: CustomerUpdateInput,
): Promise<ActionResult> {
  const managerId = await getManagerUserId("users");
  if (!managerId) {
    return { error: "You don't have permission to manage users." };
  }

  const firstName = input.firstName?.trim();
  const lastName = input.lastName?.trim() || null;
  const email = input.email?.trim() || null;

  if (!firstName) return { error: "First name is required." };
  if (email && !EMAIL_RE.test(email)) {
    return { error: "Please enter a valid email address." };
  }

  // Scope by store_id: the service scope bypasses RLS, so without this a store
  // admin could edit ANY store's customer by passing its id.
  const storeId = await getActingStoreId();
  try {
    await withService((db) =>
      db
        .update(users)
        .set({ firstName, lastName, email })
        .where(and(eq(users.id, id), eq(users.storeId, storeId))),
    );
  } catch (err) {
    console.error("Failed to update customer:", err);
    // 23505 = unique_violation (email is UNIQUE on the users table).
    if (isUniqueViolation(err)) {
      return { error: "That email is already used by another customer." };
    }
    return { error: "Failed to save changes. Please try again." };
  }

  revalidatePath("/dashboard/users");
  revalidatePath(`/dashboard/users/${id}`);
  return { success: true };
}

/**
 * Dashboard: permanently delete a customer. Removing the auth user cascades to
 * the `users` row (id REFERENCES auth.users ON DELETE CASCADE) and to any
 * reviews / blog links keyed on the customer. Guarded by "users" manage.
 */
export async function deleteCustomer(id: string): Promise<ActionResult> {
  const managerId = await getManagerUserId("users");
  if (!managerId) {
    return { error: "You don't have permission to manage users." };
  }

  const storeId = await getActingStoreId();

  // Confirm the customer belongs to THIS store before touching the global auth
  // user. `deleteUser(id)` operates on auth.users directly (no store scoping), so
  // without this gate a store admin could delete any customer — or even another
  // store's admin / a platform operator — by id. The store-scoped users row is
  // the ownership record we check first.
  const target = await withService((db) =>
    db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, id), eq(users.storeId, storeId)))
      .limit(1),
  ).catch(() => []);
  if (!target[0]) return { error: "Customer not found." };

  // Delete the auth account first; the users row cascades from it. Auth stays
  // on Supabase until Phase 6. If the auth user is already gone, fall back to
  // deleting the (store-scoped) row.
  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.deleteUser(id);
  if (authError && !/not\s*found/i.test(authError.message)) {
    console.error("Failed to delete customer auth user:", authError);
    return { error: "Failed to delete customer. Please try again." };
  }

  if (authError) {
    try {
      await withService((db) =>
        db
          .delete(users)
          .where(and(eq(users.id, id), eq(users.storeId, storeId))),
      );
    } catch (err) {
      console.error("Failed to delete orphaned customer row:", err);
      return { error: "Failed to delete customer. Please try again." };
    }
  }

  revalidatePath("/dashboard/users");
  return { success: true };
}
