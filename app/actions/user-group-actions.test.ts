/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/app/dashboard/lib/access", () => ({
  getManagerUserId: vi.fn(),
  getActingStoreId: vi.fn(async () => "a0000000-0000-4000-8000-000000000001"),
}));

import {
  createUserGroup,
  updateUserGroup,
  deleteUserGroup,
  setGroupMembers,
} from "./user-group-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { getManagerUserId } from "@/app/dashboard/lib/access";
import { makeChain, makeSupabase } from "./_test-helpers";

const validForm = {
  name: "  VIPs  ",
  description: "  big spenders  ",
  color: "",
};

// user-group-actions.ts is admin-only CRUD over the user_groups table plus a
// membership replace (clear-then-insert). All writes go through the
// service-role admin client; the "users" section's manage right gates access.
describe("user-group-actions", () => {
  let admin: any;

  beforeEach(() => {
    vi.clearAllMocks();
    admin = makeSupabase({
      user_groups: makeChain({ data: { id: "g1" }, error: null }),
      user_group_members: makeChain({ data: null, error: null }),
    });
    vi.mocked(createAdminClient).mockReturnValue(admin);
    vi.mocked(getManagerUserId).mockResolvedValue("user-1");
  });

  describe("createUserGroup", () => {
    // Auth gate.
    it("rejects when caller lacks users.manage", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await createUserGroup(validForm);
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Empty / whitespace-only name is rejected before any DB call.
    it("rejects empty name", async () => {
      const result = await createUserGroup({ ...validForm, name: "   " });
      expect(result.error).toMatch(/group name is required/i);
    });

    // Happy path — trims name/description, defaults colour to blue, stamps
    // created_by with the caller.
    it("inserts a normalised row and returns the created data", async () => {
      const result = await createUserGroup(validForm);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: "g1" });
      const inserted = admin._tables.user_groups.insert.mock.calls[0][0];
      expect(inserted.name).toBe("VIPs");
      expect(inserted.description).toBe("big spenders");
      expect(inserted.color).toBe("blue");
      expect(inserted.created_by).toBe("user-1");
    });

    // An empty description becomes null rather than an empty string.
    it("stores a null description when blank", async () => {
      await createUserGroup({ ...validForm, description: "   " });
      const inserted = admin._tables.user_groups.insert.mock.calls[0][0];
      expect(inserted.description).toBeNull();
    });

    // 23505 duplicate-key → friendly message instead of raw DB error.
    it("returns friendly error on unique-violation", async () => {
      admin._tables.user_groups = makeChain({
        data: null,
        error: { code: "23505", message: "dup" },
      });
      const result = await createUserGroup(validForm);
      expect(result.error).toMatch(/already exists/i);
    });

    // Any other DB error surfaces its message verbatim.
    it("returns the raw message on a generic DB error", async () => {
      admin._tables.user_groups = makeChain({
        data: null,
        error: { code: "P0001", message: "boom" },
      });
      const result = await createUserGroup(validForm);
      expect(result.error).toBe("boom");
    });
  });

  describe("updateUserGroup", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await updateUserGroup("g1", validForm);
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Empty name is rejected on update too.
    it("rejects empty name", async () => {
      const result = await updateUserGroup("g1", { ...validForm, name: "  " });
      expect(result.error).toMatch(/group name is required/i);
    });

    // Happy path — updates the row by id with normalised fields.
    it("updates a normalised row by id", async () => {
      const result = await updateUserGroup("g1", validForm);
      expect(result.success).toBe(true);
      const updated = admin._tables.user_groups.update.mock.calls[0][0];
      expect(updated.name).toBe("VIPs");
      expect(updated.description).toBe("big spenders");
      expect(updated.color).toBe("blue");
      expect(admin._tables.user_groups.eq).toHaveBeenCalledWith("id", "g1");
    });

    // 23505 duplicate-key → friendly message.
    it("returns friendly error on unique-violation", async () => {
      admin._tables.user_groups = makeChain(
        {},
        {
          data: null,
          error: { code: "23505", message: "dup" },
        },
      );
      const result = await updateUserGroup("g1", validForm);
      expect(result.error).toMatch(/already exists/i);
    });

    // Generic DB error surfaces its message.
    it("returns the raw message on a generic DB error", async () => {
      admin._tables.user_groups = makeChain(
        {},
        {
          data: null,
          error: { code: "P0001", message: "boom" },
        },
      );
      const result = await updateUserGroup("g1", validForm);
      expect(result.error).toBe("boom");
    });
  });

  describe("deleteUserGroup", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await deleteUserGroup("g1");
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Happy path — deletes the row by id.
    it("deletes the group by id", async () => {
      const result = await deleteUserGroup("g1");
      expect(result.success).toBe(true);
      expect(admin._tables.user_groups.delete).toHaveBeenCalled();
      expect(admin._tables.user_groups.eq).toHaveBeenCalledWith("id", "g1");
    });

    // DB error surfaces its message.
    it("returns the raw message on a DB error", async () => {
      admin._tables.user_groups = makeChain(
        {},
        {
          data: null,
          error: { code: "P0001", message: "boom" },
        },
      );
      const result = await deleteUserGroup("g1");
      expect(result.error).toBe("boom");
    });
  });

  // setGroupMembers replaces the group's whole membership: clear all rows for
  // the group, then insert the (de-duped, truthy) selection.
  describe("setGroupMembers", () => {
    // Auth gate.
    it("rejects unauthorised callers", async () => {
      vi.mocked(getManagerUserId).mockResolvedValue(null);
      const result = await setGroupMembers("g1", ["c1"]);
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Happy path — clears then inserts one row per selected customer.
    it("clears existing members then inserts the selection", async () => {
      const result = await setGroupMembers("g1", ["c1", "c2"]);
      expect(result.success).toBe(true);
      expect(admin._tables.user_group_members.delete).toHaveBeenCalled();
      expect(admin._tables.user_group_members.eq).toHaveBeenCalledWith(
        "group_id",
        "g1",
      );
      const rows = admin._tables.user_group_members.insert.mock.calls[0][0];
      expect(rows).toEqual([
        {
          group_id: "g1",
          user_id: "c1",
          added_by: "user-1",
          store_id: "a0000000-0000-4000-8000-000000000001",
        },
        {
          group_id: "g1",
          user_id: "c2",
          added_by: "user-1",
          store_id: "a0000000-0000-4000-8000-000000000001",
        },
      ]);
    });

    // An empty selection just clears the group — no insert is attempted.
    it("clears only when the selection is empty", async () => {
      const result = await setGroupMembers("g1", []);
      expect(result.success).toBe(true);
      expect(admin._tables.user_group_members.delete).toHaveBeenCalled();
      expect(admin._tables.user_group_members.insert).not.toHaveBeenCalled();
    });

    // Falsy and duplicate ids are dropped before insert.
    it("de-dupes and drops falsy ids before insert", async () => {
      await setGroupMembers("g1", ["c1", "c1", "", "c2"]);
      const rows = admin._tables.user_group_members.insert.mock.calls[0][0];
      expect(rows).toEqual([
        {
          group_id: "g1",
          user_id: "c1",
          added_by: "user-1",
          store_id: "a0000000-0000-4000-8000-000000000001",
        },
        {
          group_id: "g1",
          user_id: "c2",
          added_by: "user-1",
          store_id: "a0000000-0000-4000-8000-000000000001",
        },
      ]);
    });

    // If the clear step fails the action bails before inserting.
    it("returns error when the clear step fails", async () => {
      admin._tables.user_group_members = makeChain(
        {},
        {
          data: null,
          error: { message: "delete failed" },
        },
      );
      const result = await setGroupMembers("g1", ["c1"]);
      expect(result.error).toBe("delete failed");
      expect(admin._tables.user_group_members.insert).not.toHaveBeenCalled();
    });

    // The insert chain is awaited directly (listResult); surface its error.
    it("returns error when the insert step fails", async () => {
      // First await (delete) succeeds; the insert await must fail. Drive both
      // off the same chain's listResult by overriding `then` after delete.
      const chain = makeChain();
      let call = 0;
      chain.then = (resolve: any) => {
        call += 1;
        const result =
          call === 1
            ? { data: null, error: null } // delete().eq()
            : { data: null, error: { message: "insert failed" } }; // insert()
        return Promise.resolve(result).then(resolve);
      };
      admin._tables.user_group_members = chain;
      const result = await setGroupMembers("g1", ["c1"]);
      expect(result.error).toBe("insert failed");
    });
  });
});
