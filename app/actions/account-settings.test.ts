/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import {
  updateProfileName,
  changePassword,
  setVerifiedPhone,
} from "./account-settings";
import { createClient } from "@/lib/supabase/server";
import { makeChain, makeSupabase } from "./_test-helpers";

function makeFormData(fields: Record<string, string | null | undefined>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== null && v !== undefined) fd.set(k, v);
  }
  return fd;
}

// account-settings.ts — the signed-in admin editing their own profile row:
// display name, password (re-verified via signInWithPassword) and a phone
// number that auth has already recorded as verified.
describe("account-settings", () => {
  let supabase: any;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = makeSupabase(
      {
        admins: makeChain(
          { data: null, error: null },
          { data: null, error: null },
        ),
      },
      { id: "user-1", email: "admin@example.com", phone: "919876543210" },
    );
    supabase.auth.signInWithPassword = vi
      .fn()
      .mockResolvedValue({ data: {}, error: null });
    vi.mocked(createClient).mockResolvedValue(supabase);
  });

  describe("updateProfileName", () => {
    // First name is mandatory.
    it("rejects empty first name", async () => {
      const result = await updateProfileName(makeFormData({ firstName: "  " }));
      expect(result.error).toMatch(/first name is required/i);
    });

    // Anonymous callers cannot edit a profile.
    it("rejects unauthenticated callers", async () => {
      supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
      const result = await updateProfileName(
        makeFormData({ firstName: "Ada" }),
      );
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Happy path — trims and persists, last name collapses to null when blank.
    it("updates the name on the caller's own row", async () => {
      const result = await updateProfileName(
        makeFormData({ firstName: "  Ada  ", lastName: "  " }),
      );
      expect(result.success).toBe(true);
      expect(supabase._tables.admins.update).toHaveBeenCalledWith({
        first_name: "Ada",
        last_name: null,
      });
      expect(supabase._tables.admins.eq).toHaveBeenCalledWith("id", "user-1");
    });

    // DB error path.
    it("returns an error when the update fails", async () => {
      supabase._tables.admins = makeChain(
        { data: null, error: null },
        { data: null, error: { message: "boom" } },
      );
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

    // Current password must be supplied.
    it("rejects an empty current password", async () => {
      const result = await changePassword(
        makeFormData({ ...validForm, currentPassword: "" }),
      );
      expect(result.error).toMatch(/current password/i);
    });

    // New password must be at least 8 characters.
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

    // New + confirm must match.
    it("rejects when the confirmation does not match", async () => {
      const result = await changePassword(
        makeFormData({ ...validForm, confirmPassword: "different1" }),
      );
      expect(result.error).toMatch(/do not match/i);
    });

    // New password must differ from the current one.
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

    // Authenticated user with an email is required.
    it("rejects when the caller has no email/session", async () => {
      supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
      const result = await changePassword(makeFormData(validForm));
      expect(result.error).toMatch(/not authenticated/i);
    });

    // Wrong current password → signInWithPassword fails the re-verification.
    it("rejects when the current password is incorrect", async () => {
      supabase.auth.signInWithPassword = vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: "bad creds" } });
      const result = await changePassword(makeFormData(validForm));
      expect(result.error).toMatch(/current password is incorrect/i);
    });

    // updateUser failure → surfaces the auth message.
    it("returns the auth error when updateUser fails", async () => {
      supabase.auth.updateUser = vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: "weak password" } });
      const result = await changePassword(makeFormData(validForm));
      expect(result.error).toMatch(/weak password/i);
    });

    // Happy path — re-verifies then updates the password.
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
    // Anonymous callers cannot set a phone.
    it("rejects unauthenticated callers", async () => {
      supabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } });
      const result = await setVerifiedPhone("+919876543210");
      expect(result.error).toMatch(/not authenticated/i);
    });

    // The submitted number must match what auth recorded as verified.
    it("rejects a number that auth hasn't verified", async () => {
      const result = await setVerifiedPhone("+910000000000");
      expect(result.error).toMatch(/hasn.?t been verified/i);
    });

    // Happy path — accepts the matching number (auth stores it without "+").
    it("persists the verified phone on the caller's row", async () => {
      const result = await setVerifiedPhone("+919876543210");
      expect(result.success).toBe(true);
      expect(supabase._tables.admins.update).toHaveBeenCalledWith({
        phone: "+919876543210",
      });
      expect(supabase._tables.admins.eq).toHaveBeenCalledWith("id", "user-1");
    });

    // DB error path.
    it("returns an error when the update fails", async () => {
      supabase._tables.admins = makeChain(
        { data: null, error: null },
        { data: null, error: { message: "boom" } },
      );
      const result = await setVerifiedPhone("+919876543210");
      expect(result.error).toMatch(/couldn.?t save your phone/i);
    });
  });
});
