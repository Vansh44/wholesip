import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/store/resolve", () => ({
  getCurrentStoreId: vi.fn(async () => STORE),
}));

import {
  getMyAddresses,
  saveAddress,
  upsertAddress,
  setDefaultAddress,
  deleteAddress,
} from "./address-actions";
import { createClient } from "@/lib/supabase/server";
import { makeChain, makeSupabase } from "./_test-helpers";

const STORE = "a0000000-0000-4000-8000-000000000001";

const validInput = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "9999999999",
  addressLine1: "1 Analytical Engine Rd",
  city: "London",
  state: "England",
  postalCode: "SW1",
  country: "UK",
};

describe("address-actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getMyAddresses", () => {
    it("returns an empty list when signed out", async () => {
      vi.mocked(createClient).mockResolvedValue(makeSupabase({}, null));
      expect(await getMyAddresses()).toEqual([]);
    });

    it("returns the caller's own addresses", async () => {
      const supabase = makeSupabase(
        {
          customer_addresses: makeChain(undefined, {
            data: [{ id: "a1", city: "London" }],
            error: null,
          }),
        },
        { id: "user-1" },
      );
      vi.mocked(createClient).mockResolvedValue(supabase);

      const result = await getMyAddresses();
      expect(result).toEqual([{ id: "a1", city: "London" }]);
      expect(supabase._tables.customer_addresses.eq).toHaveBeenCalledWith(
        "user_id",
        "user-1",
      );
    });
  });

  describe("saveAddress", () => {
    it("rejects when signed out", async () => {
      vi.mocked(createClient).mockResolvedValue(makeSupabase({}, null));
      const result = await saveAddress(validInput);
      expect(result.error).toMatch(/signed in/i);
    });

    it("rejects a missing required field", async () => {
      vi.mocked(createClient).mockResolvedValue(
        makeSupabase({}, { id: "user-1" }),
      );
      const result = await saveAddress({ ...validInput, city: "  " });
      expect(result.error).toMatch(/city is required/i);
    });

    it("inserts a new address as the default and clears the old default", async () => {
      const addresses = makeChain(undefined, { error: null });
      addresses.maybeSingle.mockResolvedValue({ data: null, error: null });
      addresses.single.mockResolvedValue({ data: { id: "new" }, error: null });
      const supabase = makeSupabase(
        { customer_addresses: addresses },
        { id: "user-1" },
      );
      vi.mocked(createClient).mockResolvedValue(supabase);

      const result = await saveAddress(validInput);
      expect(result.success).toBe(true);
      expect(result.id).toBe("new");
      // Old defaults cleared for this user first.
      expect(addresses.update).toHaveBeenCalledWith({ is_default: false });
      // New row inserted, marked default, scoped to the user + store.
      const inserted = addresses.insert.mock.calls[0][0];
      expect(inserted).toMatchObject({
        user_id: "user-1",
        store_id: STORE,
        is_default: true,
        city: "London",
      });
    });

    it("updates an identical existing address instead of duplicating it", async () => {
      const addresses = makeChain(undefined, { error: null });
      addresses.maybeSingle.mockResolvedValue({
        data: { id: "existing" },
        error: null,
      });
      const supabase = makeSupabase(
        { customer_addresses: addresses },
        { id: "user-1" },
      );
      vi.mocked(createClient).mockResolvedValue(supabase);

      const result = await saveAddress(validInput);
      expect(result.success).toBe(true);
      expect(result.id).toBe("existing");
      expect(addresses.insert).not.toHaveBeenCalled();
      // Two updates: clear-default + the dedup update on the existing row.
      expect(addresses.eq).toHaveBeenCalledWith("id", "existing");
    });
  });

  describe("upsertAddress", () => {
    it("rejects when signed out", async () => {
      vi.mocked(createClient).mockResolvedValue(makeSupabase({}, null));
      const result = await upsertAddress(validInput);
      expect(result.error).toMatch(/signed in/i);
    });

    it("rejects a missing required field", async () => {
      vi.mocked(createClient).mockResolvedValue(
        makeSupabase({}, { id: "user-1" }),
      );
      const result = await upsertAddress({ ...validInput, state: "" });
      expect(result.error).toMatch(/state is required/i);
    });

    it("adds a first address as the default", async () => {
      const addresses = makeChain(undefined, { count: 0, error: null });
      addresses.single.mockResolvedValue({ data: { id: "new" }, error: null });
      const supabase = makeSupabase(
        { customer_addresses: addresses },
        { id: "user-1" },
      );
      vi.mocked(createClient).mockResolvedValue(supabase);

      const result = await upsertAddress(validInput);
      expect(result.success).toBe(true);
      expect(addresses.insert.mock.calls[0][0].is_default).toBe(true);
    });

    it("adds a subsequent address as non-default", async () => {
      const addresses = makeChain(undefined, { count: 2, error: null });
      addresses.single.mockResolvedValue({ data: { id: "new2" }, error: null });
      const supabase = makeSupabase(
        { customer_addresses: addresses },
        { id: "user-1" },
      );
      vi.mocked(createClient).mockResolvedValue(supabase);

      await upsertAddress(validInput);
      expect(addresses.insert.mock.calls[0][0].is_default).toBe(false);
    });

    it("edits an existing address by id without inserting", async () => {
      const addresses = makeChain(undefined, { error: null });
      const supabase = makeSupabase(
        { customer_addresses: addresses },
        { id: "user-1" },
      );
      vi.mocked(createClient).mockResolvedValue(supabase);

      const result = await upsertAddress(validInput, "addr-9");
      expect(result.success).toBe(true);
      expect(result.id).toBe("addr-9");
      expect(addresses.insert).not.toHaveBeenCalled();
      expect(addresses.eq).toHaveBeenCalledWith("id", "addr-9");
      expect(addresses.eq).toHaveBeenCalledWith("user_id", "user-1");
    });
  });

  describe("setDefaultAddress", () => {
    it("rejects when signed out", async () => {
      vi.mocked(createClient).mockResolvedValue(makeSupabase({}, null));
      const result = await setDefaultAddress("a1");
      expect(result.error).toMatch(/signed in/i);
    });

    it("clears the old default and sets the chosen one, scoped to the owner", async () => {
      const supabase = makeSupabase(
        { customer_addresses: makeChain(undefined, { error: null }) },
        { id: "user-1" },
      );
      vi.mocked(createClient).mockResolvedValue(supabase);

      const result = await setDefaultAddress("a1");
      expect(result.success).toBe(true);
      expect(supabase._tables.customer_addresses.update).toHaveBeenCalledWith({
        is_default: false,
      });
      expect(supabase._tables.customer_addresses.update).toHaveBeenCalledWith({
        is_default: true,
      });
      expect(supabase._tables.customer_addresses.eq).toHaveBeenCalledWith(
        "id",
        "a1",
      );
      expect(supabase._tables.customer_addresses.eq).toHaveBeenCalledWith(
        "user_id",
        "user-1",
      );
    });
  });

  describe("deleteAddress", () => {
    it("rejects an empty id", async () => {
      vi.mocked(createClient).mockResolvedValue(
        makeSupabase({}, { id: "user-1" }),
      );
      const result = await deleteAddress("  ");
      expect(result.error).toMatch(/invalid/i);
    });

    it("rejects when signed out", async () => {
      vi.mocked(createClient).mockResolvedValue(makeSupabase({}, null));
      const result = await deleteAddress("a1");
      expect(result.error).toMatch(/signed in/i);
    });

    it("deletes an address scoped to the owner", async () => {
      const supabase = makeSupabase(
        { customer_addresses: makeChain(undefined, { error: null }) },
        { id: "user-1" },
      );
      vi.mocked(createClient).mockResolvedValue(supabase);

      const result = await deleteAddress("a1");
      expect(result.success).toBe(true);
      expect(supabase._tables.customer_addresses.eq).toHaveBeenCalledWith(
        "id",
        "a1",
      );
      expect(supabase._tables.customer_addresses.eq).toHaveBeenCalledWith(
        "user_id",
        "user-1",
      );
    });
  });
});
