/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./firebase-admin", () => ({ getFirebaseAdminAuth: vi.fn() }));

import {
  authErrorCode,
  createAuthUser,
  deleteAuthUser,
  updateAuthUser,
  verifyPassword,
  generatePasswordResetLink,
} from "./firebase-users";
import { getFirebaseAdminAuth } from "./firebase-admin";

function makeAuth() {
  return {
    createUser: vi.fn().mockResolvedValue({ uid: "new-uid" }),
    deleteUser: vi.fn().mockResolvedValue(undefined),
    updateUser: vi.fn().mockResolvedValue(undefined),
    generatePasswordResetLink: vi.fn().mockResolvedValue("https://reset/link"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("authErrorCode", () => {
  it("extracts the string code, else undefined", () => {
    expect(authErrorCode({ code: "auth/user-not-found" })).toBe(
      "auth/user-not-found",
    );
    expect(authErrorCode(new Error("x"))).toBeUndefined();
    expect(authErrorCode(null)).toBeUndefined();
  });
});

describe("createAuthUser", () => {
  it("creates a user and returns the uid", async () => {
    const auth = makeAuth();
    vi.mocked(getFirebaseAdminAuth).mockReturnValue(auth as any);
    const uid = await createAuthUser({
      email: "a@b.com",
      password: "pw",
      emailVerified: true,
    });
    expect(uid).toBe("new-uid");
    expect(auth.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "a@b.com",
        password: "pw",
        emailVerified: true,
      }),
    );
  });

  it("throws when Identity Platform isn't configured (never silently no-ops)", async () => {
    vi.mocked(getFirebaseAdminAuth).mockReturnValue(null);
    await expect(createAuthUser({ email: "a@b.com" })).rejects.toThrow(
      /not configured/i,
    );
  });
});

describe("deleteAuthUser", () => {
  it("deletes the user", async () => {
    const auth = makeAuth();
    vi.mocked(getFirebaseAdminAuth).mockReturnValue(auth as any);
    await deleteAuthUser("uid-1");
    expect(auth.deleteUser).toHaveBeenCalledWith("uid-1");
  });

  it("tolerates an already-deleted user", async () => {
    const auth = makeAuth();
    auth.deleteUser.mockRejectedValue({ code: "auth/user-not-found" });
    vi.mocked(getFirebaseAdminAuth).mockReturnValue(auth as any);
    await expect(deleteAuthUser("gone")).resolves.toBeUndefined();
  });

  it("rethrows a real error", async () => {
    const auth = makeAuth();
    auth.deleteUser.mockRejectedValue({ code: "auth/internal-error" });
    vi.mocked(getFirebaseAdminAuth).mockReturnValue(auth as any);
    await expect(deleteAuthUser("uid-1")).rejects.toBeTruthy();
  });

  it("no-ops when unconfigured", async () => {
    vi.mocked(getFirebaseAdminAuth).mockReturnValue(null);
    await expect(deleteAuthUser("uid-1")).resolves.toBeUndefined();
  });
});

describe("updateAuthUser", () => {
  it("maps phone → phoneNumber and forwards the rest", async () => {
    const auth = makeAuth();
    vi.mocked(getFirebaseAdminAuth).mockReturnValue(auth as any);
    await updateAuthUser("uid-1", { password: "pw", phone: "+15551234567" });
    expect(auth.updateUser).toHaveBeenCalledWith("uid-1", {
      password: "pw",
      phoneNumber: "+15551234567",
    });
  });

  it("throws when unconfigured", async () => {
    vi.mocked(getFirebaseAdminAuth).mockReturnValue(null);
    await expect(updateAuthUser("uid-1", { email: "a@b.com" })).rejects.toThrow(
      /not configured/i,
    );
  });
});

describe("verifyPassword", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.FIREBASE_API_KEY;
    delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  });

  it("returns false when no API key is configured", async () => {
    expect(await verifyPassword("a@b.com", "pw")).toBe(false);
  });

  it("returns true on a 200 from the sign-in endpoint", async () => {
    process.env.FIREBASE_API_KEY = "key";
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true }) as any;
    expect(await verifyPassword("a@b.com", "pw")).toBe(true);
  });

  it("returns false on a rejected credential", async () => {
    process.env.FIREBASE_API_KEY = "key";
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: false }) as any;
    expect(await verifyPassword("a@b.com", "wrong")).toBe(false);
  });
});

describe("generatePasswordResetLink", () => {
  it("returns the link when configured", async () => {
    const auth = makeAuth();
    vi.mocked(getFirebaseAdminAuth).mockReturnValue(auth as any);
    expect(await generatePasswordResetLink("a@b.com")).toBe(
      "https://reset/link",
    );
  });

  it("returns null when unconfigured or on failure", async () => {
    vi.mocked(getFirebaseAdminAuth).mockReturnValue(null);
    expect(await generatePasswordResetLink("a@b.com")).toBeNull();

    const auth = makeAuth();
    auth.generatePasswordResetLink.mockRejectedValue(new Error("no user"));
    vi.mocked(getFirebaseAdminAuth).mockReturnValue(auth as any);
    expect(await generatePasswordResetLink("a@b.com")).toBeNull();
  });
});
