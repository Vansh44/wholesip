import Link from "next/link";
import { ArrowUpRight, Inbox } from "lucide-react";
import type { EnquiryStatus } from "@/app/actions/enquiry-actions";
import { getEnquiries } from "../enquiries/data";
import { STATUS_META } from "../enquiries/shared";

const RECENT_LIMIT = 6;

const STATUS_ORDER: EnquiryStatus[] = [
  "new",
  "in_progress",
  "resolved",
  "archived",
];

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

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Dashboard-home enquiry tracker: a status-count strip (each tile deep-links to
 * the filtered list) plus the most recent enquiries. Reads through the
 * service-role admin client (enquiries RLS is own-row only); renders nothing if
 * the table isn't migrated yet so the home page still loads.
 */
export async function EnquiriesOverview() {
  const { data: enquiries, error } = await getEnquiries();
  if (error) return null;

  const counts: Record<EnquiryStatus, number> = {
    new: 0,
    in_progress: 0,
    resolved: 0,
    archived: 0,
  };
  for (const enquiry of enquiries) counts[enquiry.status] += 1;

  const recent = enquiries.slice(0, RECENT_LIMIT);

  return (
    <div className="dash-card overflow-hidden">
      <div className="dash-card-header">
        <div>
          <div className="dash-card-title">Enquiries</div>
          <div className="dash-card-sub">
            {enquiries.length} total · track by status
          </div>
        </div>
        <Link
          href="/dashboard/enquiries"
          className="dash-btn dash-btn-ghost dash-btn-sm"
        >
          View all
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="dash-status-strip">
        {STATUS_ORDER.map((status) => (
          <Link
            key={status}
            href={`/dashboard/enquiries?status=${status}`}
            className={`dash-status-pill ${status}`}
          >
            <strong>{counts[status]}</strong>
            <span>{STATUS_META[status].label}</span>
          </Link>
        ))}
      </div>

      {recent.length === 0 ? (
        <div className="dash-empty">
          <span className="dash-empty-icon">
            <Inbox className="h-5 w-5" />
          </span>
          <div className="dash-empty-title">No enquiries yet</div>
          <p className="dash-empty-text">
            New storefront messages will appear here.
          </p>
        </div>
      ) : (
        <table className="dash-table">
          <thead>
            <tr>
              <th>From</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Received</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((enquiry) => (
              <tr key={enquiry.id}>
                <td>
                  <Link
                    href={`/dashboard/enquiries/${enquiry.id}`}
                    className="dash-flex-row no-underline"
                  >
                    <span className="dash-user-avatar">
                      {initials(enquiry.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="dash-cell-title truncate">
                        {enquiry.name}
                      </div>
                      <div className="dash-cell-sub truncate">
                        {enquiry.email}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="text-muted max-w-[160px] truncate">
                  {enquiry.subject?.trim() || "—"}
                </td>
                <td>
                  <span
                    className={`dash-badge ${STATUS_META[enquiry.status].badge}`}
                  >
                    {STATUS_META[enquiry.status].label}
                  </span>
                </td>
                <td className="text-dim font-mono-dash whitespace-nowrap">
                  {formatDate(enquiry.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
