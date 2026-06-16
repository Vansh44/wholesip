import { requireSectionAccess } from "../lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EnquiriesManagementView,
  type Enquiry,
} from "./enquiries-management-view";

export default async function EnquiriesPage() {
  const access = await requireSectionAccess("enquiries", "view");
  const canManage = access.can("enquiries", "manage");

  // Enquiries RLS is own-row only, so cross-row dashboard reads go through the
  // service-role admin client (access is already enforced above). Mirrors how
  // the customers table is read across the dashboard.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("enquiries")
    .select(
      "id, name, email, phone, subject, subject_detail, message, status, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) {
    console.error(
      "Failed to load enquiries (has supabase/enquiries_table.sql been applied?):",
      error,
    );
  }

  const enquiries = (data ?? []) as Enquiry[];

  return (
    <EnquiriesManagementView enquiries={enquiries} canManage={canManage} />
  );
}
