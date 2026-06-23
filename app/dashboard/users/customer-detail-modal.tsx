"use client";

import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CustomerDetail } from "./customer-detail";
import {
  customerName,
  formatDateTime,
  type CustomerDetail as CustomerDetailType,
} from "./shared";

/**
 * Modal wrapper for the intercepted /dashboard/users/[id] route. Closing
 * (X, overlay, Esc) calls router.back() so the URL returns to the list.
 */
export function CustomerDetailModal({
  customer,
  canManage,
}: {
  customer: CustomerDetailType;
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
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{customerName(customer)}</DialogTitle>
          <DialogDescription>
            User since {formatDateTime(customer.created_at)}
          </DialogDescription>
        </DialogHeader>
        <CustomerDetail customer={customer} canManage={canManage} />
      </DialogContent>
    </Dialog>
  );
}
