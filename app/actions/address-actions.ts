"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentStoreId } from "@/lib/store/resolve";

// Saved shipping addresses for the storefront checkout address book. All reads
// and writes run on the shopper's own session (RLS-scoped to user_id), so a
// customer can only ever see or change their own addresses.

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

const ADDRESS_COLUMNS =
  "id, first_name, last_name, email, phone, address_line1, address_line2, city, state, postal_code, country, is_default";

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
    user_id: userId,
    store_id: storeId,
    first_name: clean(input.firstName),
    last_name: clean(input.lastName) || null,
    email: clean(input.email) || null,
    phone: clean(input.phone) || null,
    address_line1: clean(input.addressLine1),
    address_line2: clean(input.addressLine2) || null,
    city: clean(input.city),
    state: clean(input.state),
    postal_code: clean(input.postalCode),
    country: clean(input.country),
  };
}

export async function getMyAddresses(): Promise<SavedAddress[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("customer_addresses")
    .select(ADDRESS_COLUMNS)
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("getMyAddresses:", error.message);
    return [];
  }
  return (data ?? []) as SavedAddress[];
}

// Checkout "remember this address": dedups by content and makes it the default
// so it prefills next time.
export async function saveAddress(
  input: AddressInput,
): Promise<{ success?: boolean; error?: string; id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const invalid = requiredError(input);
  if (invalid) return { error: invalid };

  const storeId = await getCurrentStoreId();
  const row = { ...toAddressRow(input, user.id, storeId), is_default: true };

  // The address just used becomes the default; clear the flag on the others so
  // it prefills next time.
  await supabase
    .from("customer_addresses")
    .update({ is_default: false })
    .eq("user_id", user.id);

  // Dedup: update an identical existing address rather than inserting a copy.
  const { data: existing } = await supabase
    .from("customer_addresses")
    .select("id")
    .eq("user_id", user.id)
    .eq("address_line1", row.address_line1)
    .eq("city", row.city)
    .eq("postal_code", row.postal_code)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("customer_addresses")
      .update(row)
      .eq("id", existing.id);
    if (error) {
      console.error("saveAddress update:", error.message);
      return { error: "Could not save address." };
    }
    return { success: true, id: existing.id as string };
  }

  const { data: inserted, error } = await supabase
    .from("customer_addresses")
    .insert(row)
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("saveAddress insert:", error?.message);
    return { error: "Could not save address." };
  }
  return { success: true, id: inserted.id as string };
}

// Address-book add (no id) or edit (id) — explicit, no content dedup. A brand
// new address becomes the default only when it's the customer's first one.
export async function upsertAddress(
  input: AddressInput,
  addressId?: string,
): Promise<{ success?: boolean; error?: string; id?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const invalid = requiredError(input);
  if (invalid) return { error: invalid };

  const storeId = await getCurrentStoreId();
  const row = toAddressRow(input, user.id, storeId);

  if (addressId) {
    const { error } = await supabase
      .from("customer_addresses")
      .update(row)
      .eq("id", addressId)
      .eq("user_id", user.id);
    if (error) {
      console.error("upsertAddress update:", error.message);
      return { error: "Could not save address." };
    }
    return { success: true, id: addressId };
  }

  // First address for this customer defaults to true so checkout can prefill.
  const { count } = await supabase
    .from("customer_addresses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const isFirst = (count ?? 0) === 0;

  const { data: inserted, error } = await supabase
    .from("customer_addresses")
    .insert({ ...row, is_default: isFirst })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("upsertAddress insert:", error?.message);
    return { error: "Could not save address." };
  }
  return { success: true, id: inserted.id as string };
}

export async function setDefaultAddress(
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  if (typeof id !== "string" || !id.trim())
    return { error: "Invalid address." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  // Clear every default for this customer, then set the chosen one (own-row).
  await supabase
    .from("customer_addresses")
    .update({ is_default: false })
    .eq("user_id", user.id);

  const { error } = await supabase
    .from("customer_addresses")
    .update({ is_default: true })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("setDefaultAddress:", error.message);
    return { error: "Could not update default address." };
  }
  return { success: true };
}

export async function deleteAddress(
  id: string,
): Promise<{ success?: boolean; error?: string }> {
  if (typeof id !== "string" || !id.trim())
    return { error: "Invalid address." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in." };

  const { error } = await supabase
    .from("customer_addresses")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("deleteAddress:", error.message);
    return { error: "Could not delete address." };
  }
  return { success: true };
}
