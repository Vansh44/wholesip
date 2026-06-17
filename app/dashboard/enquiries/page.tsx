import { requireSectionAccess } from "../lib/access";
import { getEnquiries } from "./data";
import { EnquiriesManagementView } from "./enquiries-management-view";

export default async function EnquiriesPage() {
  const access = await requireSectionAccess("enquiries", "view");
  const canManage = access.can("enquiries", "manage");

  const { data: enquiries } = await getEnquiries();

  return (
    <EnquiriesManagementView enquiries={enquiries} canManage={canManage} />
  );
}
