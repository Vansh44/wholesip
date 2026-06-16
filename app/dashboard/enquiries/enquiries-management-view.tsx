"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  updateEnquiryStatus,
  deleteEnquiry,
  type EnquiryStatus,
} from "@/app/actions/enquiry-actions";

export type Enquiry = {
  id: string;
  name: string;
  email: string;
  phone: string;
  subject: string | null;
  subject_detail: string | null;
  message: string;
  status: EnquiryStatus;
  created_at: string;
};

type FilterTab = "all" | EnquiryStatus;

const STATUS_META: Record<EnquiryStatus, { label: string; badge: string }> = {
  new: { label: "New", badge: "dash-badge-amber" },
  in_progress: { label: "In progress", badge: "dash-badge-blue" },
  resolved: { label: "Resolved", badge: "dash-badge-green" },
  archived: { label: "Archived", badge: "dash-badge-grey" },
};

// The dialog renders in a portal outside `.dashboard-shell`, so the scoped
// `dash-badge` classes don't apply there — use these portal-safe tones instead.
const STATUS_TONE: Record<EnquiryStatus, { color: string; bg: string }> = {
  new: { color: "#fbbf24", bg: "rgba(251,191,36,0.15)" },
  in_progress: { color: "#60a5fa", bg: "rgba(96,165,250,0.15)" },
  resolved: { color: "#4ade80", bg: "rgba(74,222,128,0.15)" },
  archived: { color: "#9ca3af", bg: "rgba(156,163,175,0.15)" },
};

const STATUS_ACTIONS: { status: EnquiryStatus; icon: string }[] = [
  { status: "new", icon: "🆕" },
  { status: "in_progress", icon: "🔄" },
  { status: "resolved", icon: "✅" },
  { status: "archived", icon: "🗄" },
];

type SortKey = "status" | "newest" | "oldest";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "status", label: "Status (New first)" },
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
];

// Priority for the default "Status" sort: New → In progress → Resolved → Archived.
const STATUS_ORDER: Record<EnquiryStatus, number> = {
  new: 0,
  in_progress: 1,
  resolved: 2,
  archived: 3,
};

const SORT_SELECT_STYLE: React.CSSProperties = {
  height: 40,
  borderRadius: 10,
  border: "1px solid var(--dash-border)",
  background:
    "var(--dash-surface) url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\") no-repeat right 12px center",
  color: "var(--dash-text)",
  fontSize: 13,
  fontWeight: 500,
  padding: "0 34px 0 12px",
  cursor: "pointer",
  appearance: "none",
  WebkitAppearance: "none",
};

const DATE_INPUT_STYLE: React.CSSProperties = {
  height: 40,
  borderRadius: 10,
  border: "1px solid var(--dash-border)",
  background: "var(--dash-surface)",
  color: "var(--dash-text)",
  fontSize: 13,
  padding: "0 10px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const NO_SUBJECT = "__none__";

// Local-timezone YYYY-MM-DD key for date-range filtering. String comparison
// works for this format, sidestepping end-of-day timezone math.
function localDateKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

const DARK_OUTLINE_BTN =
  "border-[rgba(255,255,255,0.14)] bg-transparent text-[#e8ecf4] hover:border-[rgba(255,255,255,0.24)] hover:bg-[#252b3d] hover:text-white";

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
  const [viewTarget, setViewTarget] = useState<Enquiry | null>(null);

  // ── Filtering & Search ────────────────────────────────────
  const filtered = useMemo(() => {
    let result = [...enquiries];
    if (filter !== "all") result = result.filter((e) => e.status === filter);
    if (subjectFilter) {
      result =
        subjectFilter === NO_SUBJECT
          ? result.filter((e) => !e.subject?.trim())
          : result.filter((e) => (e.subject?.trim() || "") === subjectFilter);
    }
    if (fromDate) {
      result = result.filter((e) => localDateKey(e.created_at) >= fromDate);
    }
    if (toDate) {
      result = result.filter((e) => localDateKey(e.created_at) <= toDate);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.email.toLowerCase().includes(q) ||
          e.phone.toLowerCase().includes(q) ||
          (e.subject ?? "").toLowerCase().includes(q) ||
          (e.subject_detail ?? "").toLowerCase().includes(q) ||
          e.message.toLowerCase().includes(q),
      );
    }
    return result;
  }, [enquiries, filter, search, subjectFilter, fromDate, toDate]);

  const counts = useMemo(
    () => ({
      all: enquiries.length,
      new: enquiries.filter((e) => e.status === "new").length,
      in_progress: enquiries.filter((e) => e.status === "in_progress").length,
      resolved: enquiries.filter((e) => e.status === "resolved").length,
      archived: enquiries.filter((e) => e.status === "archived").length,
    }),
    [enquiries],
  );

  // Distinct subjects present in the data (subjects can be free-text via the
  // storefront "Other" option, so derive them rather than hardcode).
  const subjectOptions = useMemo(() => {
    const set = new Set<string>();
    let hasNone = false;
    for (const e of enquiries) {
      const s = e.subject?.trim();
      if (s) set.add(s);
      else hasNone = true;
    }
    return {
      subjects: Array.from(set).sort((a, b) => a.localeCompare(b)),
      hasNone,
    };
  }, [enquiries]);

  const anyFilterActive =
    !!search.trim() ||
    filter !== "all" ||
    !!subjectFilter ||
    !!fromDate ||
    !!toDate;

  // Apply the chosen ordering. Default groups by status (New → In progress →
  // Resolved → Archived), newest-first within each group.
  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sort === "newest") {
      arr.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    } else if (sort === "oldest") {
      arr.sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    } else {
      arr.sort((a, b) => {
        const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
        return byStatus !== 0
          ? byStatus
          : +new Date(b.created_at) - +new Date(a.created_at);
      });
    }
    return arr;
  }, [filtered, sort]);

  // ── Actions ───────────────────────────────────────────────
  const handleStatus = (enquiry: Enquiry, status: EnquiryStatus) => {
    startTransition(async () => {
      const result = await updateEnquiryStatus(enquiry.id, status);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Marked as ${STATUS_META[status].label.toLowerCase()}`);
        router.refresh();
      }
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    startTransition(async () => {
      const result = await deleteEnquiry(deleteTarget.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Enquiry deleted");
        setDeleteTarget(null);
        router.refresh();
      }
    });
  };

  // ── Helpers ───────────────────────────────────────────────
  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const formatDateTime = (s: string) =>
    new Date(s).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const replyMailto = (e: Enquiry) =>
    `mailto:${e.email}?subject=${encodeURIComponent(
      `Re: ${e.subject?.trim() || "Your enquiry to Soakd"}`,
    )}`;

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: `All (${counts.all})` },
    { key: "new", label: `New (${counts.new})` },
    { key: "in_progress", label: `In progress (${counts.in_progress})` },
    { key: "resolved", label: `Resolved (${counts.resolved})` },
    { key: "archived", label: `Archived (${counts.archived})` },
  ];

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="dash-page-enter">
      <header className="dash-page-header row">
        <div>
          <h1>📨 Enquiries</h1>
          <p>Messages submitted through the storefront enquiry form</p>
        </div>
      </header>

      {/* Toolbar: Tabs + Search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div className="dash-filter-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`dash-filter-tab${filter === tab.key ? " active" : ""}`}
              onClick={() => setFilter(tab.key)}
              style={
                tab.key === "new" && counts.new > 0
                  ? {
                      color: "#f59e0b",
                      borderColor: filter === "new" ? "#f59e0b" : undefined,
                    }
                  : undefined
              }
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <select
            aria-label="Order by"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            style={SORT_SELECT_STYLE}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                Sort: {o.label}
              </option>
            ))}
          </select>

          <div className="dash-search-bar" style={{ width: 260 }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ opacity: 0.5, flexShrink: 0 }}
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Search name, email, message…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Filters: subject + date range */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <select
          aria-label="Filter by subject"
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
          style={{ ...SORT_SELECT_STYLE, maxWidth: 240 }}
        >
          <option value="">All subjects</option>
          {subjectOptions.subjects.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
          {subjectOptions.hasNone && (
            <option value={NO_SUBJECT}>(No subject)</option>
          )}
        </select>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13, color: "var(--dash-text-3)" }}>
            Received
          </span>
          <input
            type="date"
            aria-label="From date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => setFromDate(e.target.value)}
            style={DATE_INPUT_STYLE}
          />
          <span style={{ fontSize: 13, color: "var(--dash-text-3)" }}>to</span>
          <input
            type="date"
            aria-label="To date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => setToDate(e.target.value)}
            style={DATE_INPUT_STYLE}
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
            Clear filters
          </button>
        )}
      </div>

      {/* Enquiries Table */}
      <div className="dash-card">
        <div className="dash-card-header">
          <div className="dash-card-title">
            Enquiries
            <span
              style={{
                fontWeight: 400,
                fontSize: 12,
                marginLeft: 8,
                opacity: 0.6,
              }}
            >
              {filtered.length} {filtered.length === 1 ? "message" : "messages"}
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
              {anyFilterActive
                ? "No enquiries match your filters"
                : "No enquiries yet"}
            </div>
            <div style={{ fontSize: 13, opacity: 0.6 }}>
              {anyFilterActive
                ? "Try adjusting your search or filter criteria"
                : "New submissions from the storefront will appear here."}
            </div>
          </div>
        ) : (
          <table className="dash-table">
            <thead>
              <tr>
                <th>From</th>
                <th>Phone</th>
                <th>Subject</th>
                <th>Message</th>
                <th>Status</th>
                <th>Received</th>
                {canManage && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => setViewTarget(e)}
                  style={{ cursor: "pointer" }}
                  title="View full enquiry"
                >
                  {/* From */}
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {e.name}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                      <a
                        href={replyMailto(e)}
                        onClick={(ev) => ev.stopPropagation()}
                        style={{ color: "inherit", textDecoration: "underline" }}
                      >
                        {e.email}
                      </a>
                    </div>
                  </td>

                  {/* Phone */}
                  <td
                    className="text-muted font-mono-dash"
                    style={{ fontSize: 12, whiteSpace: "nowrap" }}
                  >
                    {e.phone}
                  </td>

                  {/* Subject */}
                  <td
                    className="text-muted"
                    style={{
                      maxWidth: 150,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={e.subject ?? undefined}
                  >
                    {e.subject?.trim() || "—"}
                  </td>

                  {/* Message preview */}
                  <td style={{ maxWidth: 300 }}>
                    <div
                      style={{
                        fontSize: 12.5,
                        opacity: 0.85,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 300,
                      }}
                    >
                      {e.message}
                    </div>
                  </td>

                  {/* Status */}
                  <td>
                    <span className={`dash-badge ${STATUS_META[e.status].badge}`}>
                      {STATUS_META[e.status].label}
                    </span>
                  </td>

                  {/* Received */}
                  <td
                    className="text-dim font-mono-dash"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {formatDate(e.created_at)}
                  </td>

                  {/* Actions */}
                  {canManage && (
                    <td onClick={(ev) => ev.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="dash-btn dash-btn-ghost dash-btn-sm">
                          Actions
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="min-w-[190px] border-[rgba(255,255,255,0.08)] bg-[#1a1f2e] text-[#e8ecf4] shadow-[0_20px_40px_rgba(0,0,0,0.5)]"
                        >
                          <DropdownMenuItem
                            className="cursor-pointer text-[#e8ecf4] focus:bg-[#252b3d] focus:text-white"
                            onClick={() => setViewTarget(e)}
                          >
                            👁 View details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="cursor-pointer text-[#e8ecf4] focus:bg-[#252b3d] focus:text-white"
                            onClick={() => window.open(replyMailto(e), "_blank")}
                          >
                            ✉️ Reply via email
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-[rgba(255,255,255,0.08)]" />
                          {STATUS_ACTIONS.filter(
                            (a) => a.status !== e.status,
                          ).map((a) => (
                            <DropdownMenuItem
                              key={a.status}
                              className="cursor-pointer text-[#e8ecf4] focus:bg-[#252b3d] focus:text-white"
                              onClick={() => handleStatus(e, a.status)}
                              disabled={isPending}
                            >
                              {a.icon} Mark as{" "}
                              {STATUS_META[a.status].label.toLowerCase()}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator className="bg-[rgba(255,255,255,0.08)]" />
                          <DropdownMenuItem
                            className="cursor-pointer text-[#ef4444] focus:bg-[rgba(239,68,68,0.12)] focus:text-[#ef4444]"
                            onClick={() => setDeleteTarget(e)}
                          >
                            🗑 Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail View Dialog */}
      <Dialog
        open={viewTarget !== null}
        onOpenChange={(open) => !open && setViewTarget(null)}
      >
        <DialogContent className="border-[rgba(255,255,255,0.08)] bg-[#141720] text-[#e8ecf4] shadow-[0_20px_60px_rgba(0,0,0,0.6)] sm:max-w-[560px]">
          {viewTarget && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[#e8ecf4]">
                  Enquiry from {viewTarget.name}
                </DialogTitle>
                <DialogDescription className="text-[#8b93a8]">
                  Received {formatDateTime(viewTarget.created_at)}
                </DialogDescription>
              </DialogHeader>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "92px 1fr",
                  gap: "10px 14px",
                  fontSize: 13.5,
                  marginTop: 4,
                }}
              >
                <div style={{ opacity: 0.55 }}>Email</div>
                <div>
                  <a
                    href={replyMailto(viewTarget)}
                    style={{ color: "#93c5fd", textDecoration: "underline" }}
                  >
                    {viewTarget.email}
                  </a>
                </div>
                <div style={{ opacity: 0.55 }}>Phone</div>
                <div className="font-mono-dash">{viewTarget.phone}</div>
                <div style={{ opacity: 0.55 }}>Subject</div>
                <div>
                  {viewTarget.subject === "Other" && viewTarget.subject_detail ? (
                    <>
                      {viewTarget.subject_detail}{" "}
                      <span style={{ opacity: 0.5 }}>· Other</span>
                    </>
                  ) : (
                    viewTarget.subject?.trim() || "—"
                  )}
                </div>
                <div style={{ opacity: 0.55 }}>Status</div>
                <div>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "3px 10px",
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      color: STATUS_TONE[viewTarget.status].color,
                      background: STATUS_TONE[viewTarget.status].bg,
                    }}
                  >
                    {STATUS_META[viewTarget.status].label}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ opacity: 0.55, fontSize: 12, marginBottom: 6 }}>
                  Message
                </div>
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    maxHeight: 240,
                    overflowY: "auto",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 8,
                    padding: "12px 14px",
                  }}
                >
                  {viewTarget.message}
                </div>
              </div>

              {canManage && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ opacity: 0.55, fontSize: 12, marginBottom: 8 }}>
                    Update status
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {STATUS_ACTIONS.filter(
                      (a) => a.status !== viewTarget.status,
                    ).map((a) => (
                      <Button
                        key={a.status}
                        variant="outline"
                        size="sm"
                        className={DARK_OUTLINE_BTN}
                        disabled={isPending}
                        onClick={() => {
                          handleStatus(viewTarget, a.status);
                          setViewTarget(null);
                        }}
                      >
                        {STATUS_META[a.status].label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <DialogFooter className="border-[rgba(255,255,255,0.08)] bg-transparent">
                {canManage && (
                  <Button
                    variant="destructive"
                    disabled={isPending}
                    onClick={() => {
                      setDeleteTarget(viewTarget);
                      setViewTarget(null);
                    }}
                  >
                    Delete
                  </Button>
                )}
                <Button
                  variant="outline"
                  className={DARK_OUTLINE_BTN}
                  onClick={() => window.open(replyMailto(viewTarget), "_blank")}
                >
                  Reply via email
                </Button>
                <Button
                  variant="outline"
                  className={DARK_OUTLINE_BTN}
                  onClick={() => setViewTarget(null)}
                >
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent className="border-[rgba(255,255,255,0.08)] bg-[#141720] text-[#e8ecf4] shadow-[0_20px_60px_rgba(0,0,0,0.6)] sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-[#e8ecf4]">Delete enquiry</DialogTitle>
            <DialogDescription className="text-[#8b93a8]">
              Are you sure you want to delete the enquiry from{" "}
              {deleteTarget?.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="border-[rgba(255,255,255,0.08)] bg-transparent">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={isPending}
              className={DARK_OUTLINE_BTN}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
