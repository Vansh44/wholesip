"use server";

import { and, count, desc, eq } from "drizzle-orm";
import { withUser } from "@/lib/db/client";
import { customerAddresses } from "@/drizzle/schema";
import { getServerUser } from "@/lib/auth/server-user";
import { getCurrentStoreId } from "@/lib/store/resolve";

// Saved shipping addresses for the storefront checkout address book. All reads
// and writes run under the shopper's own identity (RLS-scoped to user_id), so
// a customer can only ever see or change their own addresses.

export interface AddressInput {
  firstName: string;
  lastName?: string;
  email?: string;
  phone?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface SavedAddress {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
}

// Aliased select preserving the snake_case shape the checkout/profile expect.
const ADDRESS_COLUMNS = {
  id: customerAddresses.id,
  first_name: customerAddresses.firstName,
  last_name: customerAddresses.lastName,
  email: customerAddresses.email,
  phone: customerAddresses.phone,
  address_line1: customerAddresses.addressLine1,
  address_line2: customerAddresses.addressLine2,
  city: customerAddresses.city,
  state: customerAddresses.state,
  postal_code: customerAddresses.postalCode,
  country: customerAddresses.country,
  is_default: customerAddresses.isDefault,
};

const MAX_LEN = 200;
function clean(value: string | undefined, max = MAX_LEN): string {
  return (value ?? "").toString().trim().slice(0, max);
}

// Server-side required-field check (mirrors the checkout form's `required`).
function requiredError(input: AddressInput): string | null {
  const required: Array<[keyof AddressInput, string]> = [
    ["firstName", "First name"],
    ["addressLine1", "Address"],
    ["city", "City"],
    ["state", "State"],
    ["postalCode", "Postal code"],
    ["country", "Country"],
  ];
  for (const [key, label] of required) {
    if (!clean(input[key] as string)) return `${label} is required.`;
  }
  return null;
}

// Cleaned, length-capped row WITHOUT the is_default flag (callers set that).
function toAddressRow(input: AddressInput, userId: string, storeId: string) {
  return {
    userId,
    storeId,
    firstName: clean(input.firstName),
    lastName: clean(input.lastName) || null,
    email: clean(input.email) || null,
    phone: clean(input.phone) || null,
    addressLine1: clean(input.addressLine1),
    addressLine2: clean(input.addressLine2) || null,
    city: clean(input.city),
    state: clean(input.state),
    postalCode: clean(input.postalCode),
    country: clean(input.country),
  };
}

export async function getMyAddresses(): Promise<SavedAddress[]> {
  const user = await getServerUser();
  if (!user) return [];

  try {
    return await withUser({ uid: user.id }, (db) =>
      db
        .select(ADDRESS_COLUMNS)
        .from(customerAddresses)
        .where(eq(customerAddresses.userId, user.id))
        .orderBy(
          desc(customerAddresses.isDefault),
          desc(customerAddresses.updatedAt),
        ),
    );
  } catch (err) {
    console.error("getMyAddresses:", err instanceof Error ? err.message : err);
    return [];
  }
}

// Checkout "remember this address": dedups by content and makes it the default
// so it prefills next time.
export async function saveAddress(
  input: AddressInput,
): Promise<{ success?: boolean; error?: string; id?: string }> {
  const user = await getServerUser();
  if (!user) return { error: "You must be signed in." };

  const invalid = requiredError(input);
  if (invalid) return { error: invalid };

  const storeId = await getCurrentStoreId();
  const row = { ...toAddressRow(input, user.id, storeId), isDefault: true };

  try {
    // One transaction: clear the old default, dedup, then update-or-insert —
    // the whole address-book mutation lands (or rolls back) atomically.
    const id = await withUser({ uid: user.id }, async (db) => {
      // The address just used becomes the default; clear the flag on the
      // others so it prefills next time.
      await db
        .update(customerAddresses)
        .set({ isDefault: false })
        .where(eq(customerAddresses.userId, user.id));

      // Dedup: update an identical existing address rather than inserting a copy.
      const existingRows = await db
        .select({ id: customerAddresses.id })
        .from(customerAddresses)
        .where(
          and(
            eq(customerAddresses.userId, user.id),
            eq(customerAddresses.addressLine1, row.addressLine1),
            eq(customerAddresses.city, row.city),
            eq(customerAddresses.postalCode, row.postalCode),
          ),
        )
        .limit(1);
      const existing = existingRows[0];

      if (existing) {
        await db
          .update(customerAddresses)
          .set(row)
          .where(eq(customerAddresses.id, existing.id));
        return existing.id;
      }

      const [inserted] = await db
        .insert(customerAddresses)
        .values(row)
        .returning({ id: customerAddresses.id });
      return inserted.id;
    });
    return { success: true, id };
  } catch (err) {
    console.error("saveAddress:", err instanceof Error ? err.message : err);
    return { error: "Could not save address." };
  }
}

// Address-book add (no id) or edit (id) — explicit, no content dedup. A brand
// new address becomes the default only when it's the customer's first one.
export async function upsertAddress(
  input: AddressInput,
  addressId?: string,
): Promise<{ success?: boolean; error?: string; id?: string }> {
  const user = await getServerUser();
  if (!user) return { error: "You must be signed in." };

  const invalid = requiredError(input);
  if (invalid) return { error: invalid };

  const storeId = await getCurrentStoreId();
  const row = toAddressRow(input, user.id, storeId);

  if (addressId) {
    try {
      await withUser({ uid: user.id }, (db) =>
        db
          .update(customerAddresses)
          .set(row)
          .where(
            and(
              eq(customerAddresses.id, addressId),
              eq(customerAddresses.userId, user.id),
            ),
          ),
      );
      return { success: true, id: addressId };
    } catch (err) {
      console.error(
        "upsertAddress update:",
        err instanceof Error ? err.message : err,
      );
      return { error: "Could not save address." };
    }
  }

  try {
    const id = await withUser({ uid: user.id }, async (db) => {
      // First address for this customer defaults to true so checkout can prefill.
      const [countRow] = await db
        .select({ n: count() })
        .from(customerAddresses)
        .where(eq(customerAddresses.userId, user.id));
      const isFirst = (countRow?.n ?? 0) === 0;

      const [inserted] = await db
        .insert(customerAddresses)
        .values({ ...row, isDefault: isFirst })
        .returning({ id: customerAddresses.id });
      return inserted.id;
    });
    return { success: true, id };
  } catch (err) {
    console.error(
      "upsertAddress insert:",
      err instanceof Error ? err.message : err,
    );
    return { error: "Could not save address." };
  }
}

export async function setDefaultAddress(
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  if (typeof id !== "string" || !id.trim())
    return { error: "Invalid address." };

  const user = await getServerUser();
  if (!user) return { error: "You must be signed in." };

  try {
    // Clear every default for this customer, then set the chosen one
    // (own-row) — atomically, so there is never a moment with two defaults.
    await withUser({ uid: user.id }, async (db) => {
      await db
        .update(customerAddresses)
        .set({ isDefault: false })
        .where(eq(customerAddresses.userId, user.id));
      await db
        .update(customerAddresses)
        .set({ isDefault: true })
        .where(
          and(
            eq(customerAddresses.id, id),
            eq(customerAddresses.userId, user.id),
          ),
        );
    });
    return { success: true };
  } catch (err) {
    console.error(
      "setDefaultAddress:",
      err instanceof Error ? err.message : err,
    );
    return { error: "Could not update default address." };
  }
}

export async function deleteAddress(
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  if (typeof id !== "string" || !id.trim())
    return { error: "Invalid address." };

  const user = await getServerUser();
  if (!user) return { error: "You must be signed in." };

  try {
    await withUser({ uid: user.id }, (db) =>
      db
        .delete(customerAddresses)
        .where(
          and(
            eq(customerAddresses.id, id),
            eq(customerAddresses.userId, user.id),
          ),
        ),
    );
    return { success: true };
  } catch (err) {
    console.error("deleteAddress:", err instanceof Error ? err.message : err);
    return { error: "Could not delete address." };
  }
}
