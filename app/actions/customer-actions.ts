"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // Scope by store_id: the service-role client bypasses RLS, so without this a
  // store admin could edit ANY store's customer by passing its id.
  const admin = createAdminClient();
  const { error } = await admin
    .from("users")
    .update({ first_name: firstName, last_name: lastName, email })
    .eq("id", id)
    .eq("store_id", await getActingStoreId());

  if (error) {
    console.error("Failed to update customer:", error);
    // 23505 = unique_violation (email is UNIQUE on the customers table).
    if (error.code === "23505") {
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
 * the `customers` row (id REFERENCES auth.users ON DELETE CASCADE) and to any
 * reviews / blog links keyed on the customer. Guarded by "users" manage.
 */
export async function deleteCustomer(id: string): Promise<ActionResult> {
  const managerId = await getManagerUserId("users");
  if (!managerId) {
    return { error: "You don't have permission to manage users." };
  }

  const admin = createAdminClient();
  const storeId = await getActingStoreId();

  // Confirm the customer belongs to THIS store before touching the global auth
  // user. `deleteUser(id)` operates on auth.users directly (no store scoping), so
  // without this gate a store admin could delete any customer — or even another
  // store's admin / a platform operator — by id. The store-scoped users row is
  // the ownership record we check first.
  const { data: target } = await admin
    .from("users")
    .select("id")
    .eq("id", id)
    .eq("store_id", storeId)
    .maybeSingle();
  if (!target) return { error: "Customer not found." };

  // Delete the auth account first; the customers row cascades from it. If the
  // auth user is already gone, fall back to deleting the (store-scoped) row.
  const { error: authError } = await admin.auth.admin.deleteUser(id);
  if (authError && !/not\s*found/i.test(authError.message)) {
    console.error("Failed to delete customer auth user:", authError);
    return { error: "Failed to delete customer. Please try again." };
  }

  if (authError) {
    const { error } = await admin
      .from("users")
      .delete()
      .eq("id", id)
      .eq("store_id", storeId);
    if (error) {
      console.error("Failed to delete orphaned customer row:", error);
      return { error: "Failed to delete customer. Please try again." };
    }
  }

  revalidatePath("/dashboard/users");
  return { success: true };
}
