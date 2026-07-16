import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Supabase server client so we can drive getUser() outcomes.
const getUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}));

import { getServerUser, getServerUserId } from "./server-user";

describe("getServerUser", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when there is no session", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await getServerUser()).toBeNull();
    expect(await getServerUserId()).toBeNull();
  });

  it("maps the Supabase user onto the ServerUser shape", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "u-123",
          email: "a@b.com",
          phone: "+911234567890",
          phone_confirmed_at: "2026-01-01T00:00:00Z",
          user_metadata: { full_name: "Ada" },
        },
      },
    });

    expect(await getServerUser()).toEqual({
      id: "u-123",
      email: "a@b.com",
      phone: "+911234567890",
      phoneConfirmed: true,
      metadata: { full_name: "Ada" },
    });
  });

  it("normalises missing optional fields", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
    const u = await getServerUser();
    expect(u).toEqual({
      id: "u-1",
      email: null,
      phone: null,
      phoneConfirmed: false,
      metadata: {},
    });
  });

  it("phoneConfirmed is false when phone_confirmed_at is absent", async () => {
    getUser.mockResolvedValue({
      data: { user: { id: "u-1", phone: "+91999", phone_confirmed_at: null } },
    });
    expect((await getServerUser())?.phoneConfirmed).toBe(false);
  });

  it("getServerUserId returns just the id", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u-9" } } });
    expect(await getServerUserId()).toBe("u-9");
  });
});
