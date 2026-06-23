"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizePermissions,
  SUPERADMIN_SLUG,
  type RolePermissions,
  ROLE_COLORS,
} from "@/app/dashboard/lib/permissions";

export interface RoleFormData {
  name: string;
  description: string;
  color: string;
  permissions: RolePermissions;
}

export interface RoleActionResult {
  success?: boolean;
  error?: string;
}

const UNIQUE_VIOLATION = "23505";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Only a superadmin (or a role granted roles.manage) may administer roles.
// Returns the caller's id when allowed, else null.
async function requireRolesManager(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("admins")
    .select("role")
    .eq("id", user.id)
    .single();

  const slug = profile?.role;
  if (!slug) return null;
  if (slug === SUPERADMIN_SLUG) return user.id;

  const { data: role } = await supabase
    .from("roles")
    .select("permissions")
    .eq("slug", slug)
    .single();

  const perms = normalizePermissions(role?.permissions);
  if (perms.roles?.includes("manage")) return user.id;
  return null;
}

function validate(form: RoleFormData): string | null {
  if (!form.name.trim()) return "Role name is required.";
  if (form.name.trim().length > 40) return "Role name is too long.";
  if (!ROLE_COLORS.includes(form.color as (typeof ROLE_COLORS)[number])) {
    return "Invalid colour.";
  }
  return null;
}

async function resolveUniqueSlug(
  admin: ReturnType<typeof createAdminClient>,
  base: string,
): Promise<string> {
  const safeBase = base || "role";
  const { data } = await admin
    .from("roles")
    .select("slug")
    .like("slug", `${safeBase}%`);
  const taken = new Set((data ?? []).map((r: { slug: string }) => r.slug));
  if (!taken.has(safeBase)) return safeBase;
  let n = 2;
  while (taken.has(`${safeBase}-${n}`)) n++;
  return `${safeBase}-${n}`;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createRole(
  form: RoleFormData,
): Promise<RoleActionResult> {
  const callerId = await requireRolesManager();
  if (!callerId)
    return { error: "You do not have permission to manage roles." };

  const invalid = validate(form);
  if (invalid) return { error: invalid };

  const admin = createAdminClient();
  const slug = await resolveUniqueSlug(admin, slugify(form.name));

  const { error } = await admin.from("roles").insert({
    name: form.name.trim(),
    slug,
    description: form.description.trim() || null,
    color: form.color,
    permissions: normalizePermissions(form.permissions),
    is_system: false,
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { error: "A role with that name already exists." };
    }
    console.error("createRole error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/roles");
  revalidatePath("/dashboard/admins");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateRole(
  id: string,
  form: RoleFormData,
): Promise<RoleActionResult> {
  const callerId = await requireRolesManager();
  if (!callerId)
    return { error: "You do not have permission to manage roles." };

  const invalid = validate(form);
  if (invalid) return { error: invalid };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("roles")
    .select("slug, is_system")
    .eq("id", id)
    .single();

  if (!existing) return { error: "Role not found." };

  // System roles keep their slug and stay non-deletable, but their name,
  // description, colour and permissions can be tuned — except the superadmin
  // role, whose all-access is enforced in code and must not be weakened here.
  if (existing.slug === SUPERADMIN_SLUG) {
    const { error } = await admin
      .from("roles")
      .update({
        name: form.name.trim(),
        description: form.description.trim() || null,
        color: form.color,
      })
      .eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/dashboard/roles");
    return { success: true };
  }

  const { error } = await admin
    .from("roles")
    .update({
      name: form.name.trim(),
      description: form.description.trim() || null,
      color: form.color,
      permissions: normalizePermissions(form.permissions),
    })
    .eq("id", id);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { error: "A role with that name already exists." };
    }
    console.error("updateRole error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/roles");
  revalidatePath("/dashboard/admins");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteRole(id: string): Promise<RoleActionResult> {
  const callerId = await requireRolesManager();
  if (!callerId)
    return { error: "You do not have permission to manage roles." };

  const admin = createAdminClient();

  const { data: role } = await admin
    .from("roles")
    .select("slug, is_system")
    .eq("id", id)
    .single();

  if (!role) return { error: "Role not found." };
  if (role.is_system) {
    return { error: "System roles cannot be deleted." };
  }

  // Block deletion while admins still hold this role — they'd be left with
  // no permissions. Surface the count so the user knows to reassign first.
  const { count } = await admin
    .from("admins")
    .select("id", { count: "exact", head: true })
    .eq("role", role.slug);

  if ((count ?? 0) > 0) {
    return {
      error: `${count} admin${count === 1 ? "" : "s"} still hold${count === 1 ? "s" : ""} this role. Reassign them before deleting.`,
    };
  }

  const { error } = await admin.from("roles").delete().eq("id", id);
  if (error) {
    console.error("deleteRole error:", error);
    return { error: error.message };
  }

  revalidatePath("/dashboard/roles");
  revalidatePath("/dashboard/admins");
  return { success: true };
}
