import { requireSectionAccess } from "../../../lib/access";
import { getCustomer } from "../../data";
import { CustomerDetailModal } from "../../customer-detail-modal";

// Intercepts /dashboard/users/[id] during in-app navigation and renders the
// detail as a modal over the list. A direct visit / refresh bypasses this and
// renders ../[id]/page.tsx as a full page instead.
export default async function InterceptedCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await requireSectionAccess("users", "view");
  const canManage = access.can("users", "manage");
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) return null;
  return <CustomerDetailModal customer={customer} canManage={canManage} />;
}
