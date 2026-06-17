import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Enquiry } from "./shared";

// Enquiries RLS is locked down (admin client only) — see enquiries_table.sql.
const COLUMNS =
  "id, name, email, phone, subject, subject_detail, message, status, created_at";

/** Every enquiry, newest first. `error` is true if the table isn't migrated. */
export async function getEnquiries(): Promise<{
  data: Enquiry[];
  error: boolean;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("enquiries")
    .select(COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    console.error(
      "Failed to load enquiries (has supabase/enquiries_table.sql been applied?):",
      error,
    );
    return { data: [], error: true };
  }
  return { data: (data ?? []) as Enquiry[], error: false };
}

/** A single enquiry by id, or null if missing / table not migrated. */
export async function getEnquiry(id: string): Promise<Enquiry | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("enquiries")
    .select(COLUMNS)
    .eq("id", id)
    .single();
  if (error || !data) return null;
  return data as Enquiry;
}
