import { requireSectionAccess } from "../../../lib/access";
import { getEnquiry } from "../../data";
import { EnquiryDetailModal } from "../../enquiry-detail-modal";

// Intercepts /dashboard/enquiries/[id] during in-app navigation and renders the
// detail as a modal over the list. A direct visit / refresh bypasses this and
// renders ../[id]/page.tsx as a full page instead.
export default async function InterceptedEnquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await requireSectionAccess("enquiries", "view");
  const canManage = access.can("enquiries", "manage");
  const { id } = await params;
  const enquiry = await getEnquiry(id);
  if (!enquiry) return null;
  return <EnquiryDetailModal enquiry={enquiry} canManage={canManage} />;
}
