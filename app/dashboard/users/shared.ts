// Shared types + display helpers for the Users (storefront customers) section.
// "Users" here are end-customers from the storefront `customers` table —
// distinct from dashboard staff (see /dashboard/admins). Pure module so it can
// be imported by both server components and the client views.

export type Customer = {
  id: string;
  phone: string;
  email: string | null;
  first_name: string;
  last_name: string | null;
  created_at: string;
  updated_at: string;
  /** Activity rollups, joined in by the data layer. */
  review_count: number;
  blog_count: number;
};

export type CustomerReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  product_id: string;
  product_name: string | null;
};

export type CustomerBlog = {
  id: string;
  title: string;
  slug: string;
  status: string;
  created_at: string;
};

/** A single customer plus their authored content, for the detail view. */
export type CustomerDetail = Customer & {
  reviews: CustomerReview[];
  blogs: CustomerBlog[];
};

/** Full name, falling back to the email local-part, then "Customer". */
export function customerName(c: {
  first_name: string;
  last_name: string | null;
  email: string | null;
}): string {
  const full = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  if (full) return full;
  if (c.email) return c.email.split("@")[0];
  return "Customer";
}

export function initials(c: {
  first_name: string;
  last_name: string | null;
  email: string | null;
}): string {
  const name = customerName(c);
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

/** Deterministic avatar gradient seeded by the customer id. */
const AVATAR_BACKGROUNDS = [
  "linear-gradient(135deg, var(--dash-accent), var(--dash-accent-2))",
  "var(--dash-green)",
  "var(--dash-amber)",
  "#6366f1",
  "#0ea5e9",
  "#e11d48",
];

export function avatarBackground(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_BACKGROUNDS[Math.abs(hash) % AVATAR_BACKGROUNDS.length];
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
