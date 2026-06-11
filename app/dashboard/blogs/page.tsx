import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSectionAccess } from "../lib/access";
import { RealtimeRefresher } from "../components/realtime-refresher";
import { BlogsManagementView } from "./blogs-management-view";

export interface Blog {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  cover_image_url: string | null;
  author: string | null;
  status: "draft" | "published" | "pending_review";
  tags: string[];
  categories: string[] | null;
  featured: boolean;
  seo_title: string | null;
  seo_description: string | null;
  reading_time: number | null;
  created_by: string | null;
  updated_by: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  submitted_by: string | null;
  is_customer_submission: boolean;
  // Joined field
  submitter_name?: string | null;
}

type FilterTab = "all" | "published" | "drafts" | "featured" | "pending";
const FILTER_TABS: FilterTab[] = [
  "all",
  "published",
  "drafts",
  "featured",
  "pending",
];

export default async function BlogsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const access = await requireSectionAccess("blogs", "view");
  const canManage = access.can("blogs", "manage");

  const { filter } = await searchParams;
  const initialFilter: FilterTab = FILTER_TABS.includes(filter as FilterTab)
    ? (filter as FilterTab)
    : "all";

  const supabase = await createClient();

  const { data: blogs, error } = await supabase
    .from("blogs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="max-w-md border border-destructive/20 bg-destructive/5 p-6 text-sm text-destructive">
        <div className="mb-1 flex items-center gap-2 font-semibold">
          <span>⚠️</span> Failed to load blogs
        </div>
        <p className="leading-relaxed text-destructive/80">
          Make sure you have the correct permissions and the blogs table exists
          in your database.
        </p>
      </div>
    );
  }

  // Fetch submitter names for customer submissions
  const blogsWithSubmitters = (blogs ?? []) as Blog[];
  const submitterIds = blogsWithSubmitters
    .filter((b) => b.submitted_by)
    .map((b) => b.submitted_by as string);

  if (submitterIds.length > 0) {
    const uniqueIds = [...new Set(submitterIds)];
    // Use the service-role client: `customers` RLS only lets a customer read
    // their own row, so the admin session can't resolve submitter names.
    const adminClient = createAdminClient();
    const { data: customers } = await adminClient
      .from("customers")
      .select("id, first_name, last_name")
      .in("id", uniqueIds);

    if (customers) {
      const nameMap = new Map(
        customers.map((c) => [
          c.id,
          [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unknown",
        ]),
      );
      blogsWithSubmitters.forEach((blog) => {
        if (blog.submitted_by) {
          blog.submitter_name = nameMap.get(blog.submitted_by) ?? null;
        }
      });
    }
  }

  return (
    <>
      <RealtimeRefresher tables={["blogs"]} />
      <BlogsManagementView
        blogs={blogsWithSubmitters}
        canManage={canManage}
        initialFilter={initialFilter}
      />
    </>
  );
}
