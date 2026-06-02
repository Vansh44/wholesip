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
  });

  describe("changeUserRole", () => {
    it("should fail if role is invalid", async () => {
      const result = await changeUserRole("user-1", "invalid-role");

      expect(result.error).toBe("Invalid role");
    });

    it("should change role successfully", async () => {
      const result = await changeUserRole("user-1", "member");

      expect(result.success).toBe(true);
      expect(mockAdminClient.from).toHaveBeenCalledWith("profiles");
    });
  });

  describe("toggleUserSuspension", () => {
    it("should toggle suspension successfully", async () => {
      const result = await toggleUserSuspension("user-1", true);

      expect(result.success).toBe(true);
      expect(mockAdminClient.from).toHaveBeenCalledWith("profiles");
    });
  });
});
