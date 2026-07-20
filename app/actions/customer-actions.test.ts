/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDbMock } from "./_test-helpers";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/firebase-users", () => ({
  deleteAuthUser: vi.fn(async () => {}),
}));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
  getActingStoreId: vi.fn(async () => "a0000000-0000-4000-8000-000000000001"),
}));

// The ported data layer: with* runners invoke the callback with the mock db.
const dbHolder = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/lib/db/client", () => ({
  withUser: vi.fn((_identity: any, fn: any) =>
    Promise.resolve(fn(dbHolder.current.db)),
  ),
  withService: vi.fn((fn: any) => Promise.resolve(fn(dbHolder.current.db))),
  withAnon: vi.fn((fn: any) => Promise.resolve(fn(dbHolder.current.db))),
}));

import { updateCustomer, deleteCustomer } from "./customer-actions";
import { deleteAuthUser } from "@/lib/auth/firebase-users";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { revalidatePath } from "next/cache";

const validInput = {
  firstName: "  Grace  ",
  lastName: "  Hopper  ",
  email: "grace@example.com",
};

// customer-actions.ts — dashboard CRUD over storefront customers. Table ops run
// in the service scope with an explicit store filter; the Identity Platform
// login is removed via deleteAuthUser. Guarded by the "users" manage permission.
describe("customer-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ownership pre-check finds the in-store customer by default.
    dbHolder.current = makeDbMock({ selectQueue: [[{ id: "cust-1" }]] });
    vi.mocked(deleteAuthUser).mockResolvedValue();
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

    // Happy path — trims fields, updates by id + store, revalidates.
    it("updates the customer and revalidates", async () => {
      const result = await updateCustomer("cust-1", validInput);
      expect(result.success).toBe(true);
      expect(dbHolder.current.calls.set[0]).toEqual({
        firstName: "Grace",
        lastName: "Hopper",
        email: "grace@example.com",
      });
      expect(dbHolder.current.calls.where).toHaveLength(1);
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
      expect(dbHolder.current.calls.set[0]).toEqual({
        firstName: "Grace",
        lastName: null,
        email: null,
      });
    });

    // 23505 unique-violation (email already taken) → specific friendly message.
    it("returns a friendly error on unique-violation", async () => {
      dbHolder.current.db.update = vi.fn(() => {
        throw Object.assign(new Error("dup"), { code: "23505" });
      });
      const result = await updateCustomer("id", validInput);
      expect(result.error).toMatch(/already used by another customer/i);
    });

    // Any other DB error → generic failure message.
    it("returns a generic error on other DB failures", async () => {
      dbHolder.current.db.update = vi.fn(() => {
        throw new Error("boom");
      });
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
    // be deletable by id. The service scope bypasses RLS, so the app-layer
    // ownership check is the only thing preventing a cross-tenant account delete.
    it("refuses to delete a customer from another store", async () => {
      dbHolder.current = makeDbMock({ selectQueue: [[]] }); // no in-store row
      const result = await deleteCustomer("other-store-cust");
      expect(result.error).toMatch(/not found/i);
      expect(deleteAuthUser).not.toHaveBeenCalled();
      expect(dbHolder.current.calls.delete).toHaveLength(0);
    });

    // Happy path — removes BOTH the Cloud SQL row and the Identity Platform
    // login (no cross-system cascade to lean on anymore).
    it("deletes the customer row and the auth user, then revalidates", async () => {
      const result = await deleteCustomer("cust-1");
      expect(result.success).toBe(true);
      expect(dbHolder.current.calls.delete).toHaveLength(1);
      expect(deleteAuthUser).toHaveBeenCalledWith("cust-1");
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard/users");
    });

    // The authoritative profile-row delete runs first; if it fails, the login
    // is left alone and the caller sees an error.
    it("returns an error when the profile-row delete fails", async () => {
      dbHolder.current.db.delete = vi.fn(() => {
        throw new Error("still here");
      });
      const result = await deleteCustomer("cust-1");
      expect(result.error).toMatch(/failed to delete customer/i);
      expect(deleteAuthUser).not.toHaveBeenCalled();
    });

    // A genuine auth-delete failure (the wrapper already tolerates "not found")
    // aborts with a failure message.
    it("returns an error when the auth delete fails", async () => {
      vi.mocked(deleteAuthUser).mockRejectedValue(new Error("on fire"));
      const result = await deleteCustomer("cust-1");
      expect(result.error).toMatch(/failed to delete customer/i);
    });
  });
});
