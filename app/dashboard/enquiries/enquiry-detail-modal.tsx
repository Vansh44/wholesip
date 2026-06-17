"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EnquiryDetail } from "./enquiry-detail";
import { formatDateTime, type Enquiry } from "./shared";

/**
 * Modal wrapper for the intercepted /dashboard/enquiries/[id] route. Closing
 * (X, overlay, Esc) calls router.back() so the URL returns to the list.
 */
export function EnquiryDetailModal({
  enquiry,
  canManage,
}: {
  enquiry: Enquiry;
  canManage: boolean;
}) {
  const router = useRouter();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    >
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Enquiry from {enquiry.name}</DialogTitle>
          <DialogDescription>
            Received {formatDateTime(enquiry.created_at)}
          </DialogDescription>
        </DialogHeader>
        <EnquiryDetail enquiry={enquiry} canManage={canManage} />
      </DialogContent>
    </Dialog>
  );
}
