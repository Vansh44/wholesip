import type { EnquiryStatus } from "@/app/actions/enquiry-actions";
import { requireSectionAccess } from "../lib/access";
import { getEnquiries } from "./data";
import { EnquiriesManagementView } from "./enquiries-management-view";

const FILTERS: ("all" | EnquiryStatus)[] = [
  "all",
  "new",
  "in_progress",
  "resolved",
  "archived",
];

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const access = await requireSectionAccess("enquiries", "view");
  const canManage = access.can("enquiries", "manage");

  const { status } = await searchParams;
  const initialFilter = FILTERS.includes(status as "all" | EnquiryStatus)
    ? (status as "all" | EnquiryStatus)
    : "all";

  const { data: enquiries } = await getEnquiries();

  return (
    <EnquiriesManagementView
      enquiries={enquiries}
      canManage={canManage}
      initialFilter={initialFilter}
    />
  );
}
