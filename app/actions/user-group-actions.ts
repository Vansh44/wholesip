"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";
import { getManagerUserId } from "@/app/dashboard/lib/access";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GroupFormData {
  name: string;
  description: string;
  color: string;
}

export interface ActionResult {
  success?: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

const UNIQUE_VIOLATION = "23505";

// User Groups live under the Users section, so they share its `manage` right.
async function getAdminUserId(): Promise<string | null> {
  return getManagerUserId("users");
}

function revalidateGroups() {
  revalidatePath("/dashboard/users/user_groups");
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createUserGroup(
  form: GroupFormData,
): Promise<ActionResult> {
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  const name = form.name.trim();
  if (!name) return { error: "Group name is required." };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("user_groups")
    .insert({
      name,
      description: form.description.trim() || null,
      color: form.color || "blue",
      created_by: userId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION)
      return { error: "A group with that name already exists." };
    console.error("createUserGroup error:", error);
    return { error: error.message };
  }

  revalidateGroups();
  return { success: true, data: data as Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateUserGroup(
  id: string,
  form: GroupFormData,
): Promise<ActionResult> {
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  const name = form.name.trim();
  if (!name) return { error: "Group name is required." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("user_groups")
    .update({
      name,
      description: form.description.trim() || null,
      color: form.color || "blue",
    })
    .eq("id", id);

  if (error) {
    if (error.code === UNIQUE_VIOLATION)
      return { error: "A group with that name already exists." };
    console.error("updateUserGroup error:", error);
    return { error: error.message };
  }

  revalidateGroups();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete (member rows + any coupon links cascade via FK ON DELETE CASCADE)
// ---------------------------------------------------------------------------

export async function deleteUserGroup(id: string): Promise<ActionResult> {
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  const admin = createAdminClient();
  const { error } = await admin.from("user_groups").delete().eq("id", id);

  if (error) {
    console.error("deleteUserGroup error:", error);
    return { error: error.message };
  }

  revalidateGroups();
  return { success: true };
}

// ---------------------------------------------------------------------------
// Membership — replace the group's whole membership with `customerIds`.
// Wholesale delete + insert keeps the dialog's checkbox state authoritative.
// ---------------------------------------------------------------------------

export async function setGroupMembers(
  groupId: string,
  customerIds: string[],
): Promise<ActionResult> {
  const userId = await getAdminUserId();
  if (!userId) return { error: "Not authenticated" };

  const admin = createAdminClient();

  const { error: delError } = await admin
    .from("user_group_members")
    .delete()
    .eq("group_id", groupId);

  if (delError) {
    console.error("setGroupMembers (clear) error:", delError);
    return { error: delError.message };
  }

  // De-dupe defensively; an empty selection just clears the group.
  const ids = Array.from(new Set(customerIds.filter(Boolean)));
  if (ids.length > 0) {
    const rows = ids.map((user_id) => ({
      group_id: groupId,
      user_id,
      added_by: userId,
    }));
    const { error: insError } = await admin
      .from("user_group_members")
      .insert(rows);
    if (insError) {
      console.error("setGroupMembers (insert) error:", insError);
      return { error: insError.message };
    }
  }

  revalidateGroups();
  return { success: true };
}
