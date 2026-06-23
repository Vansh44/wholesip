import { requireSectionAccess } from "../lib/access";
import { getCustomers } from "./data";
import { CustomersManagementView } from "./customers-management-view";

export default async function UsersPage() {
  const access = await requireSectionAccess("users", "view");
  const canManage = access.can("users", "manage");

  const {
    data: customers,
    error,
    recentCount,
    recentCutoff,
  } = await getCustomers();

  if (error) {
    return (
      <div className="max-w-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <span>⚠️</span> Failed to load users
        </div>
        <p className="leading-relaxed text-destructive/80">
          Make sure the <code>customers</code> table exists in your database
          (apply <code>supabase/customers_table.sql</code>).
        </p>
      </div>
    );
  }

  return (
    <CustomersManagementView
      customers={customers}
      canManage={canManage}
      recentCount={recentCount}
      recentCutoff={recentCutoff}
    />
  );
}
