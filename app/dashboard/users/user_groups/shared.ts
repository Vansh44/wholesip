// Shared types + helpers for the User Groups section (segments of storefront
// customers). Pure module — importable by server components and client views.
// Reuses the customer display helpers from the parent Users section.

export type GroupColor = "grey" | "blue" | "green" | "amber" | "violet";

export const GROUP_COLORS: GroupColor[] = [
  "blue",
  "green",
  "amber",
  "violet",
  "grey",
];

export type UserGroup = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  created_at: string;
  updated_at: string;
  /** Customer ids in this group, joined in by the data layer. */
  member_ids: string[];
  member_count: number;
};

/** Lightweight customer record for the membership picker. */
export type GroupCustomer = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string;
};

const GROUP_BADGE_CLASS: Record<GroupColor, string> = {
  grey: "dash-badge-grey",
  blue: "dash-badge-blue",
  green: "dash-badge-green",
  amber: "dash-badge-amber",
  violet: "dash-role-super",
};

export function groupBadgeClass(color: string): string {
  return (
    GROUP_BADGE_CLASS[(color as GroupColor) ?? "blue"] ?? "dash-badge-blue"
  );
}
