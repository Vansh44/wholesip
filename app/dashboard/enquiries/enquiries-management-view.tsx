"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  CheckCircle2,
  Clock3,
  Eye,
  Mail,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Trash2,
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
import {
  deleteEnquiry,
  updateEnquiryStatus,
  type EnquiryStatus,
} from "@/app/actions/enquiry-actions";
import { STATUS_ACTIONS, STATUS_META, type Enquiry } from "./shared";

type FilterTab = "all" | EnquiryStatus;
type SortKey = "status" | "newest" | "oldest";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "status", label: "Status: new first" },
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
];

const STATUS_ORDER: Record<EnquiryStatus, number> = {
  new: 0,
  in_progress: 1,
  resolved: 2,
  archived: 3,
};

const NO_SUBJECT = "__none__";

const STATUS_ICONS: Record<EnquiryStatus, React.ReactNode> = {
  new: <Clock3 className="h-4 w-4" />,
  in_progress: <SlidersHorizontal className="h-4 w-4" />,
  resolved: <CheckCircle2 className="h-4 w-4" />,
  archived: <Archive className="h-4 w-4" />,
};

function localDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function EnquiriesManagementView({
  enquiries,
  canManage = true,
}: {
  enquiries: Enquiry[];
  canManage?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("status");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Enquiry | null>(null);

  const openDetail = (enquiry: Enquiry) =>
    router.push(`/dashboard/enquiries/${enquiry.id}`);

  const counts = useMemo(
    () => ({
      all: enquiries.length,
      new: enquiries.filter((enquiry) => enquiry.status === "new").length,
      in_progress: enquiries.filter(
        (enquiry) => enquiry.status === "in_progress",
      ).length,
      resolved: enquiries.filter((enquiry) => enquiry.status === "resolved")
        .length,
      archived: enquiries.filter((enquiry) => enquiry.status === "archived")
        .length,
    }),
    [enquiries],
  );

  const subjectOptions = useMemo(() => {
    const subjects = new Set<string>();
    let hasNone = false;

    for (const enquiry of enquiries) {
      const subject = enquiry.subject?.trim();
      if (subject) subjects.add(subject);
      else hasNone = true;
    }

    return {
      subjects: Array.from(subjects).sort((a, b) => a.localeCompare(b)),
      hasNone,
    };
  }, [enquiries]);

  const filtered = useMemo(() => {
    let result = [...enquiries];

    if (filter !== "all") {
      result = result.filter((enquiry) => enquiry.status === filter);
    }

    if (subjectFilter) {
      result =
        subjectFilter === NO_SUBJECT
          ? result.filter((enquiry) => !enquiry.subject?.trim())
          : result.filter(
              (enquiry) => (enquiry.subject?.trim() || "") === subjectFilter,
            );
    }

    if (fromDate) {
      result = result.filter(
        (enquiry) => localDateKey(enquiry.created_at) >= fromDate,
      );
    }

    if (toDate) {
      result = result.filter(
        (enquiry) => localDateKey(enquiry.created_at) <= toDate,
      );
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (enquiry) =>
          enquiry.name.toLowerCase().includes(q) ||
          enquiry.email.toLowerCase().includes(q) ||
          enquiry.phone.toLowerCase().includes(q) ||
          (enquiry.subject ?? "").toLowerCase().includes(q) ||
          (enquiry.subject_detail ?? "").toLowerCase().includes(q) ||
          enquiry.message.toLowerCase().includes(q),
      );
    }

    return result;
  }, [enquiries, filter, fromDate, search, subjectFilter, toDate]);

  const sorted = useMemo(() => {
    const result = [...filtered];

    if (sort === "newest") {
      result.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    } else if (sort === "oldest") {
      result.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    } else {
      result.sort((a, b) => {
        const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        return byStatus !== 0
          ? byStatus
          : +new Date(b.created_at) - +new Date(a.created_at);
      });
    }

    return result;
  }, [filtered, sort]);

  const anyFilterActive =
    !!search.trim() ||
    filter !== "all" ||
    !!subjectFilter ||
    !!fromDate ||
    !!toDate;

  const handleStatus = (enquiry: Enquiry, status: EnquiryStatus) => {
    startTransition(async () => {
      const result = await updateEnquiryStatus(enquiry.id, status);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`Marked as ${STATUS_META[status].label.toLowerCase()}`);
      router.refresh();
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;

    startTransition(async () => {
      const result = await deleteEnquiry(deleteTarget.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Enquiry deleted");
      setDeleteTarget(null);
      router.refresh();
    });
  };

  const formatDate = (value: string) =>
    new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const replyMailto = (enquiry: Enquiry) =>
    `mailto:${enquiry.email}?subject=${encodeURIComponent(
      `Re: ${enquiry.subject?.trim() || "Your enquiry to Soakd"}`,
    )}`;

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "new", label: "New", count: counts.new },
    { key: "in_progress", label: "In progress", count: counts.in_progress },
    { key: "resolved", label: "Resolved", count: counts.resolved },
    { key: "archived", label: "Archived", count: counts.archived },
  ];

  const metrics: { key: EnquiryStatus; label: string; value: number }[] = [
    { key: "new", label: "New", value: counts.new },
    { key: "in_progress", label: "In progress", value: counts.in_progress },
    { key: "resolved", label: "Resolved", value: counts.resolved },
    { key: "archived", label: "Archived", value: counts.archived },
  ];

  return (
    <div className="dash-page-enter enquiries-workspace">
      <header className="dash-page-header row enquiries-header">
        <div>
          <h1>Enquiries</h1>
          <p>Messages submitted through the storefront enquiry form</p>
        </div>
        <div className="enquiries-total">
          <span>{counts.all}</span>
          <small>Total</small>
        </div>
      </header>

      <section
        className="enquiries-metrics"
        aria-label="Enquiry status summary"
      >
        {metrics.map((metric) => (
          <button
            key={metric.key}
            type="button"
            className={`enquiry-metric enquiry-metric-${metric.key}${
              filter === metric.key ? " active" : ""
            }`}
            onClick={() => setFilter(metric.key)}
          >
            <span className="enquiry-metric-icon">
              {STATUS_ICONS[metric.key]}
            </span>
            <span>
              <strong>{metric.value}</strong>
              <small>{metric.label}</small>
            </span>
          </button>
        ))}
      </section>

      <section className="enquiries-command">
        <div className="dash-filter-tabs enquiries-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`dash-filter-tab${filter === tab.key ? " active" : ""}`}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
              <span>{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="enquiries-command-actions">
          <label className="enquiries-search">
            <Search className="h-4 w-4" />
            <input
              type="text"
              placeholder="Search name, email, message..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <select
            aria-label="Order by"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="enquiries-select"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="enquiries-filters">
        <select
          aria-label="Filter by subject"
          value={subjectFilter}
          onChange={(event) => setSubjectFilter(event.target.value)}
          className="enquiries-select enquiries-subject-select"
        >
          <option value="">All subjects</option>
          {subjectOptions.subjects.map((subject) => (
            <option key={subject} value={subject}>
              {subject}
            </option>
          ))}
          {subjectOptions.hasNone && (
            <option value={NO_SUBJECT}>(No subject)</option>
          )}
        </select>

        <div className="enquiries-date-range">
          <span>Received</span>
          <input
            type="date"
            aria-label="From date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(event) => setFromDate(event.target.value)}
          />
          <span>to</span>
          <input
            type="date"
            aria-label="To date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(event) => setToDate(event.target.value)}
          />
        </div>

        {anyFilterActive && (
          <button
            type="button"
            className="dash-btn dash-btn-ghost dash-btn-sm"
            onClick={() => {
              setFilter("all");
              setSearch("");
              setSubjectFilter("");
              setFromDate("");
              setToDate("");
            }}
          >
            Clear
          </button>
        )}
      </section>

      <div className="dash-card enquiries-table-card">
        <div className="dash-card-header enquiries-table-head">
          <div>
            <div className="dash-card-title">Inbox</div>
            <div className="dash-card-sub">
              {sorted.length} {sorted.length === 1 ? "message" : "messages"}{" "}
              shown
            </div>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div className="enquiries-empty">
            <div>No enquiries found</div>
            <p>
              {anyFilterActive
                ? "Adjust the filters or search term."
                : "New storefront messages will appear here."}
            </p>
          </div>
        ) : (
          <div className="enquiries-table-wrap">
            <table className="dash-table enquiries-table">
              <thead>
                <tr>
                  <th>From</th>
                  <th>Phone</th>
                  <th>Subject</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th>Received</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {sorted.map((enquiry) => (
                  <tr
                    key={enquiry.id}
                    onClick={() => openDetail(enquiry)}
                    title="View full enquiry"
                  >
                    <td>
                      <div className="enquiries-person">
                        <span>{initials(enquiry.name)}</span>
                        <div>
                          <strong>{enquiry.name}</strong>
                          <a
                            href={replyMailto(enquiry)}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {enquiry.email}
                          </a>
                        </div>
                      </div>
                    </td>

                    <td className="text-muted font-mono-dash enquiries-phone">
                      {enquiry.phone}
                    </td>

                    <td
                      className="text-muted enquiries-subject"
                      title={enquiry.subject ?? undefined}
                    >
                      {enquiry.subject?.trim() || "-"}
                    </td>

                    <td className="enquiries-message">
                      <span>{enquiry.message}</span>
                    </td>

                    <td>
                      <span
                        className={`dash-badge ${STATUS_META[enquiry.status].badge}`}
                      >
                        {STATUS_META[enquiry.status].label}
                      </span>
                    </td>

                    <td className="text-dim font-mono-dash enquiries-date">
                      {formatDate(enquiry.created_at)}
                    </td>

                    {canManage && (
                      <td onClick={(event) => event.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="enquiries-row-menu">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="min-w-[190px]"
                          >
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() => openDetail(enquiry)}
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="cursor-pointer"
                              onClick={() =>
                                window.open(replyMailto(enquiry), "_blank")
                              }
                            >
                              <Mail className="mr-2 h-4 w-4" />
                              Reply via email
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {STATUS_ACTIONS.filter(
                              (action) => action.status !== enquiry.status,
                            ).map((action) => (
                              <DropdownMenuItem
                                key={action.status}
                                className="cursor-pointer"
                                onClick={() =>
                                  handleStatus(enquiry, action.status)
                                }
                                disabled={isPending}
                              >
                                <span className="mr-2 inline-flex h-4 w-4 items-center justify-center">
                                  {STATUS_ICONS[action.status]}
                                </span>
                                Mark as{" "}
                                {STATUS_META[action.status].label.toLowerCase()}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="cursor-pointer text-[#dc2626] focus:text-[#dc2626]"
                              onClick={() => setDeleteTarget(enquiry)}
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

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="enquiry-confirm-dialog sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete enquiry</DialogTitle>
            <DialogDescription>
              Delete the enquiry from {deleteTarget?.name}? This action cannot
              be undone.
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
