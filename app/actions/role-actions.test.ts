/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getActingStoreId: vi.fn(async () => "a0000000-0000-4000-8000-000000000001"),
}));

import { createRole, updateRole, deleteRole } from "./role-actions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeChain, makeSupabase } from "./_test-helpers";

const validForm = {
  name: "Editor",
  description: "Can edit",
  color: "blue",
  permissions: { products: ["view", "manage"] as ("view" | "manage")[] },
};

function buildAdmin(overrides: Record<string, any> = {}) {
  const tables: Record<string, any> = {
    // Slug uniqueness lookup → no collisions by default.
    roles: makeChain({ data: [], error: null }),
    admins: makeChain({ data: null, error: null, count: 0 }),
    ...overrides,
  };
  const from = vi.fn((t: string) => {
    if (!tables[t]) tables[t] = makeChain();
    return tables[t];
  });
  return { from, _tables: tables } as any;
}

// role-actions.ts exposes create/update/delete for the Roles & Permissions
// section. Every call must pass through requireRolesManager() — only the
// superadmin or a role explicitly granted `roles.manage` can administer roles.
describe("role-actions", () => {
  let supabase: any;
  let admin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: caller IS a superadmin so the auth guard passes.
    supabase = makeSupabase({
      admins: makeChain({ data: { role: "superadmin" }, error: null }),
    });
    vi.mocked(createClient).mockResolvedValue(supabase);
    admin = buildAdmin();
    vi.mocked(createAdminClient).mockReturnValue(admin);
  });

  // The shared auth gate used by all three actions. Tested once here via
  // createRole — the logic applies equally to update and delete.
  describe("requireRolesManager", () => {
    // No session → no access.
    it("rejects unauthenticated callers", async () => {
      supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
      const result = await createRole(validForm);
      expect(result.error).toMatch(/permission/i);
    });

    // Authenticated but no profile row (e.g. a customer hitting the dashboard).
    it("rejects callers without a profile", async () => {
      supabase._tables.admins = makeChain({ data: null, error: null });
      const result = await createRole(validForm);
      expect(result.error).toMatch(/permission/i);
    });

    // A non-superadmin role without explicit roles.manage permission.
    it("rejects a role without roles.manage permission", async () => {
      supabase._tables.admins = makeChain({
        data: { role: "member" },
        error: null,
      });
      supabase._tables.roles = makeChain({
        data: { permissions: { products: ["view"] } },
        error: null,
      });
      const result = await createRole(validForm);
      expect(result.error).toMatch(/permission/i);
    });

    // A custom role that DOES include roles.manage — verifies the escape hatch
    // works for non-superadmins (delegation use case).
    it("allows a non-superadmin role with roles.manage", async () => {
      supabase._tables.admins = makeChain({
        data: { role: "manager" },
        error: null,
      });
      supabase._tables.roles = makeChain({
        data: { permissions: { roles: ["manage"] } },
        error: null,
      });
      admin._tables.roles = makeChain({ data: [], error: null });
      const result = await createRole(validForm);
      expect(result.success).toBe(true);
    });
  });

  // createRole(form) — validates the form, slugifies the name, and inserts.
  describe("createRole", () => {
    // Form validation: empty/whitespace name is rejected before any DB call.
    it("rejects an empty name", async () => {
      const result = await createRole({ ...validForm, name: "  " });
      expect(result.error).toMatch(/name is required/i);
    });

    // Field-length validation — keeps the badge UI from blowing out.
    it("rejects a name longer than 40 chars", async () => {
      const result = await createRole({ ...validForm, name: "x".repeat(41) });
      expect(result.error).toMatch(/too long/i);
    });

    // Only colors in the ROLE_COLORS enum are accepted (the badge classes
    // are hard-coded to that list).
    it("rejects an invalid color", async () => {
      const result = await createRole({ ...validForm, color: "rainbow" });
      expect(result.error).toMatch(/colour/i);
    });

    // Happy path — verifies slug is derived from the role name.
    it("inserts with a slug derived from the name", async () => {
      await createRole({ ...validForm, name: "Content Editor" });
      const insert = admin._tables.roles.insert.mock.calls[0][0];
      expect(insert.slug).toBe("content-editor");
      expect(insert.is_system).toBe(false);
    });

    // Slug collision handling — when "editor" and "editor-2" exist already,
    // the new role becomes "editor-3" (not the first taken one).
    it("appends a numeric suffix when the slug is taken", async () => {
      admin._tables.roles = makeChain(
        // .insert().select().single() returns a row on success.
        { data: { id: "r1" }, error: null },
        // .select("slug").like("slug", "editor%") returns the taken slugs.
        { data: [{ slug: "editor" }, { slug: "editor-2" }], error: null },
      );
      await createRole({ ...validForm, name: "Editor" });
      const insertArg = admin._tables.roles.insert.mock.calls[0][0];
      expect(insertArg.slug).toBe("editor-3");
    });

    // Postgres unique-violation (code 23505) → friendly user-facing message
    // instead of the raw "duplicate key" error.
    it("returns a friendly error on unique-violation insert", async () => {
      // The insert is awaited directly (no .select().single()), so the
      // unique-violation error has to live in the chain's listResult.
      admin._tables.roles = makeChain(
        { data: null, error: null },
        { data: null, error: { code: "23505", message: "dup" } },
      );
      const result = await createRole(validForm);
      expect(result.error).toMatch(/already exists/i);
    });
  });

  // updateRole(id, form) — looks up the existing row first, then either
  // applies a full update or (for the superadmin row) a name/colour-only one.
  describe("updateRole", () => {
    // Trying to edit a non-existent role surfaces a clear error.
    it("returns Role not found when the row is missing", async () => {
      admin._tables.roles = makeChain({ data: null, error: null });
      const result = await updateRole("missing", validForm);
      expect(result.error).toMatch(/not found/i);
    });

    // CRITICAL invariant: the superadmin role's permissions are enforced in
    // CODE, not in the DB. Edits must NOT include a permissions field —
    // otherwise an admin could weaken superadmin access.
    it("does not allow editing the superadmin role's permissions", async () => {
      const rolesChain = makeChain({
        data: { slug: "superadmin", is_system: true },
        error: null,
      });
      admin._tables.roles = rolesChain;
      const result = await updateRole("super-id", validForm);
      expect(result.success).toBe(true);
      const updatePayload = rolesChain.update.mock.calls[0][0];
      expect(updatePayload).not.toHaveProperty("permissions");
    });

    // The normal path — a custom role's permissions ARE updatable.
    it("updates permissions for a non-system role", async () => {
      const rolesChain = makeChain({
        data: { slug: "editor", is_system: false },
        error: null,
      });
      admin._tables.roles = rolesChain;
      const result = await updateRole("editor-id", validForm);
      expect(result.success).toBe(true);
      const updatePayload = rolesChain.update.mock.calls[0][0];
      expect(updatePayload).toHaveProperty("permissions");
    });
  });

  // deleteRole(id) — must not leave admins orphaned without a role.
  describe("deleteRole", () => {
    // Friendly error when the row doesn't exist (likely already deleted).
    it("rejects when the role is not found", async () => {
      admin._tables.roles = makeChain({ data: null, error: null });
      const result = await deleteRole("nope");
      expect(result.error).toMatch(/not found/i);
    });

    // System roles (superadmin, member) are never deletable — they're seed
    // rows that the app depends on by slug.
    it("refuses to delete system roles", async () => {
      admin._tables.roles = makeChain({
        data: { slug: "superadmin", is_system: true },
        error: null,
      });
      const result = await deleteRole("super-id");
      expect(result.error).toMatch(/system roles/i);
    });

    // Refuses while N admins still hold the role — surfacing the count so the
    // user knows to reassign first.
    it("blocks deletion when admins still hold the role", async () => {
      admin._tables.roles = makeChain({
        data: { slug: "editor", is_system: false },
        error: null,
      });
      // The count query is awaited directly (no .single()), so count must be
      // in listResult.
      admin._tables.admins = makeChain(
        { data: null, error: null },
        { data: null, count: 3, error: null },
      );
      const result = await deleteRole("editor-id");
      expect(result.error).toMatch(/3 admins still hold/i);
    });

    // Happy path — non-system role with no holders is deleted.
    it("deletes a deletable role with no holders", async () => {
      admin._tables.roles = makeChain({
        data: { slug: "editor", is_system: false },
        error: null,
      });
      admin._tables.admins = makeChain({ data: null, count: 0, error: null });
      const result = await deleteRole("editor-id");
      expect(result.success).toBe(true);
    });
  });
});
