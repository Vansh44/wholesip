/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from "vitest";

const STORE = "a0000000-0000-4000-8000-000000000001";
const USER = { id: "firebase-uid-1", email: "owner@example.com" };

// withService is the single DB seam these gates go through, so each test just
// decides what it does: resolve rows, or reject like an unreachable database.
const svc = vi.hoisted(() => ({ impl: null as any }));
vi.mock("@/lib/db/client", () => ({
  withService: vi.fn((fn: any) => svc.impl(fn)),
}));

const auth = vi.hoisted(() => ({ user: null as any }));
vi.mock("@/lib/auth/server-user", () => ({
  getServerUser: vi.fn(async () => auth.user),
}));

vi.mock("@/lib/store/resolve", () => ({
  getCurrentStoreId: vi.fn(async () => STORE),
}));

vi.mock("@/lib/observability/logger", () => ({ logError: vi.fn() }));

/** Rows returned per query, in call order (drizzle's builder is thenable). */
function resolveWith(...batches: unknown[][]) {
  let call = 0;
  svc.impl = async () => batches[Math.min(call++, batches.length - 1)];
}

function rejectWith(message: string) {
  svc.impl = async () => {
    throw new Error(message);
  };
}

/**
 * Succeed for the first `okCalls` queries, then fail. Needed to pin a SPECIFIC
 * lookup: failing every query would be caught by the first one (platform_admins)
 * and pass even if a later query still swallowed its own errors.
 */
function rejectAfter(okCalls: number, batches: unknown[][] = [[], []]) {
  let call = 0;
  svc.impl = async () => {
    if (call >= okCalls) throw new Error("ECONNRESET");
    return batches[Math.min(call++, batches.length - 1)];
  };
}

// getViewerContext is wrapped in React's cache(), which memoises per module
// instance — so each case imports a fresh copy rather than a stale answer.
async function freshAccess() {
  vi.resetModules();
  return import("./access");
}

// access.ts — the dashboard's authorisation gates. The invariant under test:
// a DB failure is NOT an access decision. These lookups used to swallow errors
// into an empty result, so an unreachable database rendered as "this account
// isn't a staff member of this store".
describe("dashboard access gates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = USER;
    resolveWith([]);
  });

  describe("getViewerContext", () => {
    it("flags a DB failure as dbError, not as no-access", async () => {
      rejectWith("ECONNRESET");
      const { getViewerContext } = await freshAccess();

      const ctx = await getViewerContext();

      expect(ctx?.dbError).toBe(true);
      expect(ctx?.profile).toBeNull();
      // Denied-by-outage must never read as denied-by-permission.
      expect(ctx?.isSuperadmin).toBe(false);
      expect(ctx?.isPlatformAdmin).toBe(false);
    });

    it("flags dbError when the ADMINS lookup specifically fails", async () => {
      // platform_admins succeeds (not an operator), admins then fails — the
      // exact shape of the 2026-07-22 outage, and the case that a `.catch(() =>
      // [])` on the admins query would silently turn into "no access".
      rejectAfter(1);
      const { getViewerContext } = await freshAccess();

      const ctx = await getViewerContext();

      expect(ctx?.dbError).toBe(true);
      expect(ctx?.profile).toBeNull();
    });

    it("leaves dbError unset when the user genuinely has no admin row", async () => {
      resolveWith([], []); // no platform_admins row, no admins row
      const { getViewerContext } = await freshAccess();

      const ctx = await getViewerContext();

      expect(ctx?.dbError).toBeUndefined();
      expect(ctx?.profile).toBeNull();
    });

    it("resolves a store admin's profile normally", async () => {
      resolveWith(
        [], // platform_admins: not an operator
        [
          {
            email: USER.email,
            role: "superadmin",
            first_name: "Owner",
            last_name: null,
            store_id: STORE,
          },
        ],
      );
      const { getViewerContext } = await freshAccess();

      const ctx = await getViewerContext();

      expect(ctx?.dbError).toBeUndefined();
      expect(ctx?.profile?.email).toBe(USER.email);
      expect(ctx?.isSuperadmin).toBe(true);
    });

    it("flags dbError when the ROLE lookup fails for a non-superadmin", async () => {
      let call = 0;
      svc.impl = async () => {
        call += 1;
        if (call === 1) return []; // platform_admins
        if (call === 2)
          return [
            {
              email: USER.email,
              role: "staff",
              first_name: null,
              last_name: null,
              store_id: STORE,
            },
          ];
        throw new Error("ECONNRESET"); // roles
      };
      const { getViewerContext } = await freshAccess();

      const ctx = await getViewerContext();

      // Unknown permissions must not render as an admin with zero rights.
      expect(ctx?.dbError).toBe(true);
      expect(ctx?.permissions).toEqual({});
    });

    it("returns null (→ login) when there is no session", async () => {
      auth.user = null;
      const { getViewerContext } = await freshAccess();

      expect(await getViewerContext()).toBeNull();
    });
  });

  describe("getManagerUserId", () => {
    it("throws on a DB failure instead of reporting 'not authorized'", async () => {
      rejectWith("ECONNRESET");
      const { getManagerUserId } = await freshAccess();

      await expect(getManagerUserId("orders")).rejects.toThrow("ECONNRESET");
    });

    it("throws when the ADMINS lookup specifically fails", async () => {
      rejectAfter(1); // platform_admins ok, admins down
      const { getManagerUserId } = await freshAccess();

      await expect(getManagerUserId("orders")).rejects.toThrow("ECONNRESET");
    });

    it("throws when the ROLES lookup specifically fails", async () => {
      rejectAfter(2, [[], [{ role: "staff" }]]);
      const { getManagerUserId } = await freshAccess();

      await expect(getManagerUserId("orders")).rejects.toThrow("ECONNRESET");
    });

    it("returns null when the caller really has no admin row", async () => {
      resolveWith([], []);
      const { getManagerUserId } = await freshAccess();

      expect(await getManagerUserId("orders")).toBeNull();
    });

    it("passes a store superadmin", async () => {
      resolveWith([], [{ role: "superadmin" }]);
      const { getManagerUserId } = await freshAccess();

      expect(await getManagerUserId("orders")).toBe(USER.id);
    });
  });
});
