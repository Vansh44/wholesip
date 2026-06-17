import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSectionAccess } from "../../lib/access";
import { getEnquiry } from "../data";
import { EnquiryDetail } from "../enquiry-detail";
import { formatDateTime } from "../shared";

// Full-page detail — rendered on a direct visit / refresh / shared link
// (when the @modal interceptor does NOT apply).
export default async function EnquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await requireSectionAccess("enquiries", "view");
  const canManage = access.can("enquiries", "manage");
  const { id } = await params;
  const enquiry = await getEnquiry(id);
  if (!enquiry) notFound();

  return (
    <div className="dash-page-enter">
      <div style={{ marginBottom: 12 }}>
        <Link
          href="/dashboard/enquiries"
          className="dash-btn dash-btn-ghost dash-btn-sm"
        >
          ← Back to enquiries
        </Link>
      </div>
      <div className="dash-card" style={{ padding: 24, maxWidth: 720 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
          Enquiry from {enquiry.name}
        </h1>
        <p
          style={{
            color: "var(--dash-text-3)",
            fontSize: 13,
            marginBottom: 18,
          }}
        >
          Received {formatDateTime(enquiry.created_at)}
        </p>
        <EnquiryDetail enquiry={enquiry} canManage={canManage} />
      </div>
    </div>
  );
}
