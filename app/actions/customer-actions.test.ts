/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
  getActingStoreId: vi.fn(async () => "a0000000-0000-4000-8000-000000000001"),
}));

import { updateCustomer, deleteCustomer } from "./customer-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { revalidatePath } from "next/cache";
import { makeChain, makeSupabase } from "./_test-helpers";

const validInput = {
  firstName: "  Grace  ",
  lastName: "  Hopper  ",
  email: "grace@example.com",
};

// customer-actions.ts — dashboard CRUD over storefront customers via the
// service-role admin client. Guarded by the "users" manage permission.
describe("customer-actions", () => {
  let admin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    admin = makeSupabase({
      users: makeChain(
        // Store-scoped ownership pre-check (maybeSingle): the customer belongs
        // to the acting store, so mutations/deletes are allowed to proceed.
        { data: { id: "cust-1" }, error: null },
        { data: null, error: null },
      ),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
  });

  describe("updateCustomer", () => {
    // Permission gate.
    it("rejects when caller lacks users.manage", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await updateCustomer("id", validInput);
      expect(result.error).toMatch(/permission/i);
    });

    // First name is mandatory — whitespace-only counts as empty.
    it("rejects empty first name", async () => {
      const result = await updateCustomer("id", {
        ...validInput,
        firstName: "   ",
      });
      expect(result.error).toMatch(/first name is required/i);
    });

    // Email, when provided, must be well-formed.
    it("rejects an invalid email", async () => {
      const result = await updateCustomer("id", {
        ...validInput,
        email: "nope",
      });
      expect(result.error).toMatch(/valid email/i);
    });

    // Happy path — trims fields, updates by id, revalidates list + detail.
    it("updates the customer and revalidates", async () => {
      const result = await updateCustomer("cust-1", validInput);
      expect(result.success).toBe(true);
      expect(admin._tables.users.update).toHaveBeenCalledWith({
        first_name: "Grace",
        last_name: "Hopper",
        email: "grace@example.com",
      });
      expect(admin._tables.users.eq).toHaveBeenCalledWith("id", "cust-1");
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard/users");
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard/users/cust-1");
    });

    // An empty last name / email collapse to null rather than "".
    it("normalises blank last name and email to null", async () => {
      await updateCustomer("cust-1", {
        firstName: "Grace",
        lastName: "  ",
        email: "  ",
      });
      expect(admin._tables.users.update).toHaveBeenCalledWith({
        first_name: "Grace",
        last_name: null,
        email: null,
      });
    });

    // 23505 unique-violation (email already taken) → specific friendly message.
    it("returns a friendly error on unique-violation", async () => {
      admin._tables.users = makeChain(
        { data: null, error: null },
        { data: null, error: { code: "23505", message: "dup" } },
      );
      const result = await updateCustomer("id", validInput);
      expect(result.error).toMatch(/already used by another customer/i);
    });

    // Any other DB error → generic failure message.
    it("returns a generic error on other DB failures", async () => {
      admin._tables.users = makeChain(
        { data: null, error: null },
        { data: null, error: { code: "500", message: "boom" } },
      );
      const result = await updateCustomer("id", validInput);
      expect(result.error).toMatch(/failed to save changes/i);
    });
  });

  describe("deleteCustomer", () => {
    // Permission gate.
    it("rejects when caller lacks users.manage", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await deleteCustomer("id");
      expect(result.error).toMatch(/permission/i);
    });

    // Cross-store isolation: a customer that isn't in the acting store must not
    // be deletable by id. The service role bypasses RLS, so the app-layer
    // ownership check is the only thing preventing a cross-tenant account delete.
    it("refuses to delete a customer from another store", async () => {
      admin._tables.users = makeChain(
        { data: null, error: null }, // ownership pre-check finds no in-store row
        { data: null, error: null },
      );
      const result = await deleteCustomer("other-store-cust");
      expect(result.error).toMatch(/not found/i);
      expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
    });

    // Happy path — deleting the auth user cascades to the customer row.
    it("deletes the auth user and revalidates", async () => {
      const result = await deleteCustomer("cust-1");
      expect(result.success).toBe(true);
      expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith("cust-1");
      // No orphan-row fallback needed when the auth delete succeeds.
      expect(admin._tables.users.delete).not.toHaveBeenCalled();
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard/users");
    });

    // A real auth error (not "not found") aborts with a failure message.
    it("returns an error when the auth delete fails for real", async () => {
      admin.auth.admin.deleteUser = vi
        .fn()
        .mockResolvedValue({ error: { message: "database is on fire" } });
      const result = await deleteCustomer("cust-1");
      expect(result.error).toMatch(/failed to delete customer/i);
      expect(admin._tables.users.delete).not.toHaveBeenCalled();
    });

    // "Not found" auth error → fall back to deleting the orphaned row directly.
    it("falls back to deleting the orphaned row when auth user is missing", async () => {
      admin.auth.admin.deleteUser = vi
        .fn()
        .mockResolvedValue({ error: { message: "User not found" } });
      const result = await deleteCustomer("cust-1");
      expect(result.success).toBe(true);
      expect(admin._tables.users.delete).toHaveBeenCalled();
      expect(admin._tables.users.eq).toHaveBeenCalledWith("id", "cust-1");
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard/users");
    });

    // Orphan-row fallback itself fails → failure message.
    it("returns an error when the orphan-row fallback delete fails", async () => {
      admin.auth.admin.deleteUser = vi
        .fn()
        .mockResolvedValue({ error: { message: "not found" } });
      admin._tables.users = makeChain(
        { data: { id: "cust-1" }, error: null },
        { data: null, error: { message: "still here" } },
      );
      const result = await deleteCustomer("cust-1");
      expect(result.error).toMatch(/failed to delete customer/i);
    });
  });
});
