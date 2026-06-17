import type { EnquiryStatus } from "@/app/actions/enquiry-actions";

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

export const STATUS_META: Record<
  EnquiryStatus,
  { label: string; badge: string }
> = {
  new: { label: "New", badge: "dash-badge-amber" },
  in_progress: { label: "In progress", badge: "dash-badge-blue" },
  resolved: { label: "Resolved", badge: "dash-badge-green" },
  archived: { label: "Archived", badge: "dash-badge-grey" },
};

export const STATUS_ACTIONS: { status: EnquiryStatus; icon: string }[] = [
  { status: "new", icon: "🆕" },
  { status: "in_progress", icon: "🔄" },
  { status: "resolved", icon: "✅" },
  { status: "archived", icon: "🗄" },
];

export function formatDateTime(s: string): string {
  return new Date(s).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
