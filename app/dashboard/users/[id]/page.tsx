import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSectionAccess } from "../../lib/access";
import { getCustomer } from "../data";
import { CustomerDetail } from "../customer-detail";
import { customerName, formatDateTime } from "../shared";

// Full-page detail — rendered on a direct visit / refresh / shared link
// (when the @modal interceptor does NOT apply).
export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await requireSectionAccess("users", "view");
  const canManage = access.can("users", "manage");
  const { id } = await params;
  const customer = await getCustomer(id);
  if (!customer) notFound();

  return (
    <div className="dash-page-enter">
      <div style={{ marginBottom: 12 }}>
        <Link
          href="/dashboard/users"
          className="dash-btn dash-btn-ghost dash-btn-sm"
        >
          ← Back to users
        </Link>
      </div>
      <div className="dash-card" style={{ padding: 24, maxWidth: 820 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
          {customerName(customer)}
        </h1>
        <p
          style={{
            color: "var(--dash-text-3)",
            fontSize: 13,
            marginBottom: 18,
          }}
        >
          User since {formatDateTime(customer.created_at)}
        </p>
        <CustomerDetail customer={customer} canManage={canManage} />
      </div>
    </div>
  );
}
