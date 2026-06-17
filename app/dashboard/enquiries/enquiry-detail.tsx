"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  updateEnquiryStatus,
  deleteEnquiry,
  type EnquiryStatus,
} from "@/app/actions/enquiry-actions";
import { STATUS_META, STATUS_ACTIONS, type Enquiry } from "./shared";

// Light, hardcoded tones so the badge renders correctly BOTH on the full page
// (inside .dashboard-shell) and in the modal (which portals outside that scope,
// where the scoped dash-* classes/vars don't apply).
const LIGHT_TONE: Record<EnquiryStatus, { color: string; bg: string }> = {
  new: { color: "#b45309", bg: "#fef3c7" },
  in_progress: { color: "#1d4ed8", bg: "#dbeafe" },
  resolved: { color: "#15803d", bg: "#dcfce7" },
  archived: { color: "#4b5563", bg: "#f3f4f6" },
};

const LABEL: React.CSSProperties = { color: "#6b7280" };

/**
 * The enquiry detail body, shared by the intercepted modal and the full page.
 * Self-contained: status changes refresh in place; delete navigates back to the
 * list. Uses theme-token Buttons + hardcoded light neutrals so it looks correct
 * in both the portaled modal and the in-shell page.
 */
export function EnquiryDetail({
  enquiry,
  canManage,
}: {
  enquiry: Enquiry;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const replyMailto = `mailto:${enquiry.email}?subject=${encodeURIComponent(
    `Re: ${enquiry.subject?.trim() || "Your enquiry to Soakd"}`,
  )}`;

  const setStatus = (status: EnquiryStatus) =>
    startTransition(async () => {
      const r = await updateEnquiryStatus(enquiry.id, status);
      if (r.error) toast.error(r.error);
      else {
        toast.success(`Marked as ${STATUS_META[status].label.toLowerCase()}`);
        router.refresh();
      }
    });

  const doDelete = () =>
    startTransition(async () => {
      const r = await deleteEnquiry(enquiry.id);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Enquiry deleted");
        router.push("/dashboard/enquiries");
        router.refresh();
      }
    });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/dashboard/enquiries/${enquiry.id}`,
      );
      toast.success("Link copied — share it with your team");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const isOther = enquiry.subject === "Other" && !!enquiry.subject_detail;
  const subjectDisplay = isOther
    ? enquiry.subject_detail
    : enquiry.subject?.trim() || "—";

  return (
    <div style={{ color: "#1f2937" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "92px 1fr",
          gap: "10px 14px",
          fontSize: 14,
        }}
      >
        <div style={LABEL}>Email</div>
        <div>
          <a
            href={replyMailto}
            style={{ color: "#4f46e5", textDecoration: "underline" }}
          >
            {enquiry.email}
          </a>
        </div>
        <div style={LABEL}>Phone</div>
        <div
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {enquiry.phone}
        </div>
        <div style={LABEL}>Subject</div>
        <div>
          {subjectDisplay}
          {isOther && <span style={{ color: "#9ca3af" }}> · Other</span>}
        </div>
        <div style={LABEL}>Status</div>
        <div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "3px 10px",
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              color: LIGHT_TONE[enquiry.status].color,
              background: LIGHT_TONE[enquiry.status].bg,
            }}
          >
            {STATUS_META[enquiry.status].label}
          </span>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ ...LABEL, fontSize: 12, marginBottom: 6 }}>Message</div>
        <div
          style={{
            whiteSpace: "pre-wrap",
            fontSize: 14,
            lineHeight: 1.6,
            background: "#f9fafb",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            padding: "12px 14px",
          }}
        >
          {enquiry.message}
        </div>
      </div>

      {canManage && (
        <div style={{ marginTop: 18 }}>
          <div style={{ ...LABEL, fontSize: 12, marginBottom: 8 }}>
            Update status
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {STATUS_ACTIONS.filter((a) => a.status !== enquiry.status).map(
              (a) => (
                <Button
                  key={a.status}
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => setStatus(a.status)}
                >
                  {STATUS_META[a.status].label}
                </Button>
              ),
            )}
          </div>
        </div>
      )}

      <div
        style={{
          marginTop: 20,
          paddingTop: 16,
          borderTop: "1px solid #e5e7eb",
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <Button variant="outline" size="sm" onClick={copyLink}>
          Copy link
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(replyMailto, "_blank")}
        >
          Reply via email
        </Button>
        {canManage && (
          <div style={{ marginLeft: "auto" }}>
            {confirmDelete ? (
              <span
                style={{ display: "inline-flex", gap: 8, alignItems: "center" }}
              >
                <span style={{ fontSize: 13, color: "#b91c1c" }}>
                  Delete this enquiry?
                </span>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isPending}
                  onClick={doDelete}
                >
                  {isPending ? "Deleting…" : "Confirm"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isPending}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </span>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
