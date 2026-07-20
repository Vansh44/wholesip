"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { deleteAuthUser } from "@/lib/auth/firebase-users";
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
 * Dashboard: permanently delete a customer — the Cloud SQL `users` row (which
 * cascades to reviews / blog links keyed on the customer) AND the Identity
 * Platform login. Both are removed explicitly: auth and profile now live in
 * separate systems, so there's no `auth.users` cascade to lean on. Guarded by
 * "users" manage.
 */
export async function deleteCustomer(id: string): Promise<ActionResult> {
  const managerId = await getManagerUserId("users");
  if (!managerId) {
    return { error: "You don't have permission to manage users." };
  }

  const storeId = await getActingStoreId();

  // Confirm the customer belongs to THIS store before deleting anything. The
  // auth account (deleteAuthUser) is global/unscoped, so without this gate a
  // store admin could delete any customer — or another store's user — by id.
  // The store-scoped users row is the ownership record we check first.
  const target = await withService((db) =>
    db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, id), eq(users.storeId, storeId)))
      .limit(1),
  ).catch(() => []);
  if (!target[0]) return { error: "Customer not found." };

  // Delete the store-scoped profile row (authoritative), then the login.
  try {
    await withService((db) =>
      db.delete(users).where(and(eq(users.id, id), eq(users.storeId, storeId))),
    );
  } catch (err) {
    console.error("Failed to delete customer row:", err);
    return { error: "Failed to delete customer. Please try again." };
  }

  try {
    await deleteAuthUser(id); // best-effort; tolerates an already-gone account
  } catch (err) {
    console.error("Failed to delete customer auth user:", err);
    return { error: "Failed to delete customer. Please try again." };
  }

  revalidatePath("/dashboard/users");
  return { success: true };
}
