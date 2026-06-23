"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Eye,
  Mail,
  MoreHorizontal,
  Pencil,
  Search,
  Star,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { deleteCustomer, updateCustomer } from "@/app/actions/customer-actions";
import {
  avatarBackground,
  customerName,
  formatDate,
  initials,
  type Customer,
} from "./shared";

type SortKey = "newest" | "oldest" | "name" | "active";
type FilterKey = "all" | "recent" | "reviewers" | "with_email";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "name", label: "Name A–Z" },
  { key: "active", label: "Most active" },
];

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All users" },
  { key: "recent", label: "New (30 days)" },
  { key: "reviewers", label: "Reviewers" },
  { key: "with_email", label: "Has email" },
];

export function CustomersManagementView({
  customers,
  canManage = true,
  recentCount,
  recentCutoff,
}: {
  customers: Customer[];
  canManage?: boolean;
  /** Sign-ups in the last 30 days — computed server-side to keep render pure. */
  recentCount: number;
  /** Epoch ms cut-off for the "New (30 days)" filter (computed server-side). */
  recentCutoff: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [editTarget, setEditTarget] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  // Controlled edit-form fields.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");

  const openDetail = (customer: Customer) =>
    router.push(`/dashboard/users/${customer.id}`);

  const openEdit = (customer: Customer) => {
    setFirstName(customer.first_name ?? "");
    setLastName(customer.last_name ?? "");
    setEmail(customer.email ?? "");
    setEditTarget(customer);
  };

  const stats = useMemo(
    () => ({
      total: customers.length,
      withEmail: customers.filter((c) => !!c.email).length,
      reviewers: customers.filter((c) => c.review_count > 0).length,
      recent: recentCount,
    }),
    [customers, recentCount],
  );

  const filtered = useMemo(() => {
    let result = [...customers];

    if (filter === "recent") {
      result = result.filter(
        (c) => new Date(c.created_at).getTime() >= recentCutoff,
      );
    } else if (filter === "reviewers") {
      result = result.filter((c) => c.review_count > 0);
    } else if (filter === "with_email") {
      result = result.filter((c) => !!c.email);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          customerName(c).toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q),
      );
    }

    return result;
  }, [customers, filter, recentCutoff, search]);

  const sorted = useMemo(() => {
    const result = [...filtered];
    if (sort === "oldest") {
      result.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    } else if (sort === "name") {
      result.sort((a, b) => customerName(a).localeCompare(customerName(b)));
    } else if (sort === "active") {
      result.sort(
        (a, b) =>
          b.review_count + b.blog_count - (a.review_count + a.blog_count),
      );
    } else {
      result.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    }
    return result;
  }, [filtered, sort]);

  const anyFilterActive = !!search.trim() || filter !== "all";

  const handleSave = () => {
    if (!editTarget) return;
    startTransition(async () => {
      const result = await updateCustomer(editTarget.id, {
        firstName,
        lastName,
        email,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("User updated");
      setEditTarget(null);
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteCustomer(deleteTarget.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("User deleted");
      setDeleteTarget(null);
      router.refresh();
    });
  };

  // Each metric doubles as a filter toggle. `key` styles the icon tint;
  // `filterKey` is the filter it applies (clicking an active one resets to all).
  const metrics: {
    key: string;
    filterKey: FilterKey;
    label: string;
    value: number;
    icon: React.ReactNode;
  }[] = [
    {
      key: "total",
      filterKey: "all",
      label: "Total users",
      value: stats.total,
      icon: <Users className="h-4 w-4" />,
    },
    {
      key: "recent",
      filterKey: "recent",
      label: "New (30 days)",
      value: stats.recent,
      icon: <UserPlus className="h-4 w-4" />,
    },
    {
      key: "reviewers",
      filterKey: "reviewers",
      label: "Reviewers",
      value: stats.reviewers,
      icon: <Star className="h-4 w-4" />,
    },
    {
      key: "withEmail",
      filterKey: "with_email",
      label: "With email",
      value: stats.withEmail,
      icon: <Mail className="h-4 w-4" />,
    },
  ];

  return (
    <div className="dash-page-enter customers-workspace">
      <header className="dash-page-header row customers-header">
        <div>
          <h1>Users</h1>
          <p>Storefront users who created an account</p>
        </div>
        <div className="customers-total">
          <span>{stats.total}</span>
          <small>Total</small>
        </div>
      </header>

      <section className="customers-metrics" aria-label="Filter users">
        {metrics.map((metric) => {
          const active =
            metric.filterKey === "all"
              ? filter === "all"
              : filter === metric.filterKey;
          return (
            <button
              key={metric.key}
              type="button"
              className={`customer-metric customer-metric-${metric.key}${
                active ? " active" : ""
              }`}
              aria-pressed={active}
              onClick={() =>
                setFilter(
                  metric.filterKey === "all" || active
                    ? "all"
                    : metric.filterKey,
                )
              }
            >
              <span className="customer-metric-icon">{metric.icon}</span>
              <span>
                <strong>{metric.value}</strong>
                <small>{metric.label}</small>
              </span>
            </button>
          );
        })}
      </section>

      <section className="customers-command">
        <label className="customers-search">
          <Search className="h-4 w-4" />
          <input
            type="text"
            placeholder="Search name, email, phone..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <select
          aria-label="Filter users"
          value={filter}
          onChange={(event) => setFilter(event.target.value as FilterKey)}
          className="customers-select"
        >
          {FILTER_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Order by"
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          className="customers-select"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>

        {anyFilterActive && (
          <button
            type="button"
            className="dash-btn dash-btn-ghost dash-btn-sm"
            onClick={() => {
              setSearch("");
              setFilter("all");
            }}
          >
            Clear
          </button>
        )}
      </section>

      <div className="dash-card customers-table-card">
        <div className="dash-card-header customers-table-head">
          <div>
            <div className="dash-card-title">Users</div>
            <div className="dash-card-sub">
              {sorted.length} {sorted.length === 1 ? "user" : "users"} shown
            </div>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="customers-empty">
            <div>No users found</div>
            <p>
              {anyFilterActive
                ? "Adjust the filters or search term."
                : "Users who sign up on the storefront will appear here."}
            </p>
          </div>
        ) : (
          <div className="customers-table-wrap">
            <table className="dash-table customers-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Phone</th>
                  <th>Activity</th>
                  <th>Joined</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {sorted.map((customer) => (
                  <tr
                    key={customer.id}
                    onClick={() => openDetail(customer)}
                    title="View user"
                  >
                    <td>
                      <div className="customers-person">
                        <span
                          style={{ background: avatarBackground(customer.id) }}
                        >
                          {initials(customer)}
                        </span>
                        <div>
                          <strong>{customerName(customer)}</strong>
                          {customer.email ? (
                            <a
                              href={`mailto:${customer.email}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              {customer.email}
                            </a>
                          ) : (
                            <span className="customers-noemail">No email</span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="text-muted font-mono-dash customers-phone">
                      {customer.phone}
                    </td>

                    <td>
                      <div className="customers-activity">
                        <span title="Reviews written">
                          <Star className="h-3.5 w-3.5" />
                          {customer.review_count}
                        </span>
                        <span title="Blog submissions">
                          <Pencil className="h-3.5 w-3.5" />
                          {customer.blog_count}
                        </span>
                      </div>
                    </td>

                    <td className="text-dim font-mono-dash customers-date">
                      {formatDate(customer.created_at)}
                    </td>

                    {canManage && (
                      <td onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="customers-row-menu">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="min-w-[180px]"
                          >
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => openDetail(customer)}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => openEdit(customer)}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            {customer.email && (
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onClick={() =>
                                  window.open(
                                    `mailto:${customer.email}`,
                                    "_blank",
                                  )
                                }
                              >
                                <Mail className="mr-2 h-4 w-4" />
                                Email customer
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              className="cursor-pointer"
                              onClick={() => setDeleteTarget(customer)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit customer */}
      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => !open && setEditTarget(null)}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>
              Update this user&apos;s name and email. Their phone number is
              their verified login and can&apos;t be changed here.
            </DialogDescription>
          </DialogHeader>

          <div className="customers-form">
            <label>
              <span>First name</span>
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First name"
              />
            </label>
            <label>
              <span>Last name</span>
              <input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last name (optional)"
              />
            </label>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com (optional)"
              />
            </label>
            <p className="customers-form-phone">
              Phone: <code>{editTarget?.phone}</code>
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditTarget(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
            <DialogDescription>
              Permanently delete{" "}
              {deleteTarget ? customerName(deleteTarget) : "this user"} and
              their account? Their reviews and blog submissions will also be
              removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
