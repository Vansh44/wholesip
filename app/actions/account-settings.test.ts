/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDbMock } from "./_test-helpers";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/auth/server-user", () => ({ getServerUser: vi.fn() }));

// The ported data layer: with* runners invoke the callback with the mock db.
const dbHolder = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/lib/db/client", () => ({
  withUser: vi.fn((_identity: any, fn: any) =>
    Promise.resolve(fn(dbHolder.current.db)),
  ),
  withService: vi.fn((fn: any) => Promise.resolve(fn(dbHolder.current.db))),
  withAnon: vi.fn((fn: any) => Promise.resolve(fn(dbHolder.current.db))),
}));

import {
  updateProfileName,
  changePassword,
  setVerifiedPhone,
} from "./account-settings";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/auth/server-user";

function makeFormData(fields: Record<string, string | null | undefined>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== undefined) fd.set(k, v);
  }
  return fd;
}

const serverUser = (overrides: Record<string, any> = {}) => ({
  id: "user-1",
  email: "admin@example.com",
  phone: "919876543210",
  phoneConfirmed: true,
  metadata: {},
  ...overrides,
});

// account-settings.ts — the signed-in admin editing their own profile row.
// Name/phone are own-row Drizzle updates (withUser); the password change stays
// a pure Supabase auth flow (Phase 6).
describe("account-settings", () => {
  let supabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    dbHolder.current = makeDbMock();
    supabase = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
        updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
      },
    };
    vi.mocked(createClient).mockResolvedValue(supabase);
    vi.mocked(getServerUser).mockResolvedValue(serverUser() as any);
  });

  describe("updateProfileName", () => {
    it("rejects empty first name", async () => {
      const result = await updateProfileName(makeFormData({ firstName: "  " }));
      expect(result.error).toMatch(/first name is required/i);
    });

    it("rejects unauthenticated callers", async () => {
      vi.mocked(getServerUser).mockResolvedValue(null);
      const result = await updateProfileName(
        makeFormData({ firstName: "Ada" }),
      );
      expect(result.error).toMatch(/not authenticated/i);
    });

    it("updates the name on the caller's own row", async () => {
      const result = await updateProfileName(
        makeFormData({ firstName: "  Ada  ", lastName: "  " }),
      );
      expect(result.success).toBe(true);
      expect(dbHolder.current.calls.set[0]).toEqual({
        firstName: "Ada",
        lastName: null,
      });
      expect(dbHolder.current.calls.where).toHaveLength(1);
    });

    it("returns an error when the update fails", async () => {
      dbHolder.current.db.update = vi.fn(() => {
        throw new Error("boom");
      });
      const result = await updateProfileName(
        makeFormData({ firstName: "Ada" }),
      );
      expect(result.error).toMatch(/couldn.?t save your name/i);
    });
  });

  describe("changePassword", () => {
    const validForm = {
      currentPassword: "oldpass123",
      newPassword: "newpass456",
      confirmPassword: "newpass456",
    };

    it("rejects an empty current password", async () => {
      const result = await changePassword(
        makeFormData({ ...validForm, currentPassword: "" }),
      );
      expect(result.error).toMatch(/current password/i);
    });

    it("rejects a new password shorter than 8 characters", async () => {
      const result = await changePassword(
        makeFormData({
          ...validForm,
          newPassword: "short",
          confirmPassword: "short",
        }),
      );
      expect(result.error).toMatch(/at least 8 characters/i);
    });

    it("rejects when the confirmation does not match", async () => {
      const result = await changePassword(
        makeFormData({ ...validForm, confirmPassword: "different1" }),
      );
      expect(result.error).toMatch(/do not match/i);
    });

    it("rejects when the new password equals the current one", async () => {
      const result = await changePassword(
        makeFormData({
          currentPassword: "samepass1",
          newPassword: "samepass1",
          confirmPassword: "samepass1",
        }),
      );
      expect(result.error).toMatch(/different from the current/i);
    });

    it("rejects when the caller has no email/session", async () => {
      vi.mocked(getServerUser).mockResolvedValue(null);
      const result = await changePassword(makeFormData(validForm));
      expect(result.error).toMatch(/not authenticated/i);
    });

    it("rejects when the current password is incorrect", async () => {
      supabase.auth.signInWithPassword = vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: "bad creds" } });
      const result = await changePassword(makeFormData(validForm));
      expect(result.error).toMatch(/current password is incorrect/i);
    });

    it("returns the auth error when updateUser fails", async () => {
      supabase.auth.updateUser = vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: "weak password" } });
      const result = await changePassword(makeFormData(validForm));
      expect(result.error).toMatch(/weak password/i);
    });

    it("re-verifies and updates the password on success", async () => {
      const result = await changePassword(makeFormData(validForm));
      expect(result.success).toBe(true);
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: "admin@example.com",
        password: "oldpass123",
      });
      expect(supabase.auth.updateUser).toHaveBeenCalledWith({
        password: "newpass456",
      });
    });
  });

  describe("setVerifiedPhone", () => {
    it("rejects unauthenticated callers", async () => {
      vi.mocked(getServerUser).mockResolvedValue(null);
      const result = await setVerifiedPhone("+919876543210");
      expect(result.error).toMatch(/not authenticated/i);
    });

    it("rejects a number that auth hasn't verified", async () => {
      const result = await setVerifiedPhone("+910000000000");
      expect(result.error).toMatch(/hasn.?t been verified/i);
    });

    it("persists the verified phone on the caller's row", async () => {
      const result = await setVerifiedPhone("+919876543210");
      expect(result.success).toBe(true);
      expect(dbHolder.current.calls.set[0]).toEqual({
        phone: "+919876543210",
      });
      expect(dbHolder.current.calls.where).toHaveLength(1);
    });

    it("returns an error when the update fails", async () => {
      dbHolder.current.db.update = vi.fn(() => {
        throw new Error("boom");
      });
      const result = await setVerifiedPhone("+919876543210");
      expect(result.error).toMatch(/couldn.?t save your phone/i);
    });
  });
});
