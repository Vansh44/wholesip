import { requireSectionAccess } from "../lib/access";
import {
  getCustomers,
  getCustomerStats,
  type CustomerFilter,
  type CustomerSort,
} from "./data";
import { CustomersManagementView } from "./customers-management-view";

const FILTERS: CustomerFilter[] = ["all", "recent", "reviewers", "with_email"];
const SORTS: CustomerSort[] = ["newest", "oldest", "name", "active"];

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireSectionAccess("users", "view");
  const canManage = access.can("users", "manage");

  const sp = await searchParams;
  const page = Math.max(1, parseInt(one(sp.page) || "1", 10) || 1);
  const q = one(sp.q);
  const filterParam = one(sp.filter) as CustomerFilter;
  const sortParam = one(sp.sort) as CustomerSort;
  const filter = FILTERS.includes(filterParam) ? filterParam : "all";
  const sort = SORTS.includes(sortParam) ? sortParam : "newest";

  const [{ data, error, total, pageSize }, stats] = await Promise.all([
    getCustomers({ page, q, filter, sort }),
    getCustomerStats(),
  ]);

  if (error) {
    return (
      <div className="max-w-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <span>⚠️</span> Failed to load users
        </div>
        <p className="leading-relaxed text-destructive/80">
          Make sure the <code>users</code> table and the{" "}
          <code>customer_admin</code> view exist (apply{" "}
          <code>supabase/users_table.sql</code> and{" "}
          <code>supabase/customer_admin_view.sql</code>).
        </p>
      </div>
    );
  }

  return (
    <CustomersManagementView
      customers={data}
      canManage={canManage}
      stats={stats}
      total={total}
      page={page}
      pageSize={pageSize}
      query={q}
      filter={filter}
      sort={sort}
    />
  );
}
