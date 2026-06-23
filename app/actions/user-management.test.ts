/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  changeUserRole,
  deleteUser,
  toggleUserSuspension,
} from "./user-management";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

describe("User Management Actions", () => {
  const mockAuthUser = { id: "superadmin-123" };
  const mockCallerProfile = { role: "superadmin" };

  let mockSupabase: any;
  let mockAdminClient: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: mockAuthUser },
        }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: mockCallerProfile,
            }),
          }),
        }),
      }),
    };

    vi.mocked(createClient).mockResolvedValue(mockSupabase);

    mockAdminClient = {
      auth: {
        admin: {
          deleteUser: vi.fn().mockResolvedValue({ error: null }),
          updateUserById: vi.fn().mockResolvedValue({ error: null }),
        },
      },
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        // Target-role lookup used by the last-superadmin guards. Default the
        // target to a non-superadmin so the guards don't trip.
        select: vi.fn().mockImplementation((_cols: string, opts?: any) => {
          if (opts?.head) {
            // Superadmin count query — only reached when target is superadmin.
            return {
              eq: vi.fn().mockResolvedValue({ count: 2, error: null }),
            };
          }
          return {
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { role: "member" } }),
              // Roles-table slug lookup in changeUserRole. Default to "not
              // found" so built-in roles pass and unknown roles are rejected.
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }),
          };
        }),
      }),
    };

    vi.mocked(createAdminClient).mockReturnValue(mockAdminClient);
  });

  describe("deleteUser", () => {
    it("should fail if caller is not authenticated", async () => {
      mockSupabase.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
      });

      const result = await deleteUser("user-1");

      expect(result.error).toBe("Not authenticated");
    });

    it("should fail if caller is not superadmin", async () => {
      mockSupabase.from.mockReturnValueOnce({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { role: "member" },
            }),
          }),
        }),
      });

      const result = await deleteUser("user-1");

      expect(result.error).toBe("Unauthorized");
    });

    it("should delete user if caller is superadmin", async () => {
      const result = await deleteUser("user-1");

      expect(result.success).toBe(true);
      expect(mockAdminClient.auth.admin.deleteUser).toHaveBeenCalledWith(
        "user-1",
      );
    });

    it("should not allow deleting your own account", async () => {
      const result = await deleteUser(mockAuthUser.id);

      expect(result.error).toBe("You cannot delete your own account.");
      expect(mockAdminClient.auth.admin.deleteUser).not.toHaveBeenCalled();
    });

    it("should not allow deleting the last superadmin", async () => {
      mockAdminClient.from.mockReturnValue({
        select: vi.fn().mockImplementation((_cols: string, opts?: any) => {
          if (opts?.head) {
            return {
              eq: vi.fn().mockResolvedValue({ count: 1, error: null }),
            };
          }
          return {
            eq: vi.fn().mockReturnValue({
              single: vi
                .fn()
                .mockResolvedValue({ data: { role: "superadmin" } }),
            }),
          };
        }),
      });

      const result = await deleteUser("user-1");

      expect(result.error).toBe("Cannot delete the last superadmin.");
      expect(mockAdminClient.auth.admin.deleteUser).not.toHaveBeenCalled();
    });
  });

  describe("changeUserRole", () => {
    it("should fail if role is invalid", async () => {
      const result = await changeUserRole("user-1", "invalid-role");

      expect(result.error).toBe("Invalid role");
    });

    it("should change role successfully", async () => {
      const result = await changeUserRole("user-1", "member");

      expect(result.success).toBe(true);
      expect(mockAdminClient.from).toHaveBeenCalledWith("admins");
    });
  });

  describe("toggleUserSuspension", () => {
    it("should toggle suspension successfully", async () => {
      const result = await toggleUserSuspension("user-1", true);

      expect(result.success).toBe(true);
      expect(mockAdminClient.from).toHaveBeenCalledWith("admins");
    });
  });
});
