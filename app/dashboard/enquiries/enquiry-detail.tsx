"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Mail, Phone, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  deleteEnquiry,
  updateEnquiryStatus,
  type EnquiryStatus,
} from "@/app/actions/enquiry-actions";
import { STATUS_ACTIONS, STATUS_META, type Enquiry } from "./shared";

const LIGHT_TONE: Record<EnquiryStatus, { color: string; bg: string }> = {
  new: { color: "#b45309", bg: "#fef3c7" },
  in_progress: { color: "#1d4ed8", bg: "#dbeafe" },
  resolved: { color: "#15803d", bg: "#dcfce7" },
  archived: { color: "#4b5563", bg: "#f3f4f6" },
};

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
    `Re: ${enquiry.subject?.trim() || "Your enquiry"}`,
  )}`;

  const setStatus = (status: EnquiryStatus) =>
    startTransition(async () => {
      const result = await updateEnquiryStatus(enquiry.id, status);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(`Marked as ${STATUS_META[status].label.toLowerCase()}`);
      router.refresh();
    });

  const doDelete = () =>
    startTransition(async () => {
      const result = await deleteEnquiry(enquiry.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("Enquiry deleted");
      router.push("/dashboard/enquiries");
      router.refresh();
    });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/dashboard/enquiries/${enquiry.id}`,
      );
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const isOther = enquiry.subject === "Other" && !!enquiry.subject_detail;
  const subjectDisplay = isOther
    ? enquiry.subject_detail
    : enquiry.subject?.trim() || "-";

  return (
    <div className="enquiry-detail">
      <div className="enquiry-detail-grid">
        <div className="enquiry-detail-main">
          <div className="enquiry-detail-meta">
            <div>
              <span className="enquiry-detail-label">Contact</span>
              <strong>{enquiry.name}</strong>
            </div>
            <span
              className="enquiry-detail-status"
              style={{
                color: LIGHT_TONE[enquiry.status].color,
                background: LIGHT_TONE[enquiry.status].bg,
              }}
            >
              {STATUS_META[enquiry.status].label}
            </span>
          </div>

          <div className="enquiry-detail-fields">
            <a href={replyMailto} className="enquiry-detail-field">
              <Mail className="h-4 w-4" />
              <span>
                <small>Email</small>
                {enquiry.email}
              </span>
            </a>
            <div className="enquiry-detail-field">
              <Phone className="h-4 w-4" />
              <span>
                <small>Phone</small>
                <code>{enquiry.phone}</code>
              </span>
            </div>
            <div className="enquiry-detail-field enquiry-detail-field-wide">
              <Tag className="h-4 w-4" />
              <span>
                <small>Subject</small>
                {subjectDisplay}
                {isOther && <em>Other</em>}
              </span>
            </div>
          </div>

          <div className="enquiry-detail-message">
            <span className="enquiry-detail-label">Message</span>
            <p>{enquiry.message}</p>
          </div>
        </div>

        <aside className="enquiry-detail-actions">
          {canManage && (
            <div>
              <span className="enquiry-detail-label">Status</span>
              <div className="enquiry-detail-action-list">
                {STATUS_ACTIONS.filter(
                  (action) => action.status !== enquiry.status,
                ).map((action) => (
                  <Button
                    key={action.status}
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => setStatus(action.status)}
                    className="justify-start"
                  >
                    {STATUS_META[action.status].label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div>
            <span className="enquiry-detail-label">Actions</span>
            <div className="enquiry-detail-action-list">
              <Button
                variant="outline"
                size="sm"
                onClick={copyLink}
                className="justify-start"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy link
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(replyMailto, "_blank")}
                className="justify-start"
              >
                <Mail className="h-3.5 w-3.5" />
                Reply via email
              </Button>
            </div>
          </div>

          {canManage && (
            <div className="enquiry-detail-danger">
              {confirmDelete ? (
                <>
                  <span>Delete this enquiry?</span>
                  <div className="enquiry-detail-danger-row">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isPending}
                      onClick={doDelete}
                    >
                      {isPending ? "Deleting..." : "Confirm"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                  className="justify-start"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
