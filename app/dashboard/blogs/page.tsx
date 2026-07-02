import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSectionAccess, getActingStoreId } from "../lib/access";
import {
  DASHBOARD_PAGE_SIZE,
  ilikeOr,
  pickPage,
  pickParam,
  sanitizeSearch,
} from "../lib/list-params";
import { RealtimeRefresher } from "../components/realtime-refresher";
import { fetchBlogTaxonomy } from "@/lib/blog-taxonomy";
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

export type BlogFilter =
  | "all"
  | "published"
  | "drafts"
  | "featured"
  | "pending";
const FILTER_TABS: BlogFilter[] = [
  "all",
  "published",
  "drafts",
  "featured",
  "pending",
];

export interface BlogCounts {
  all: number;
  published: number;
  drafts: number;
  featured: number;
  pending: number;
}

// Everything except the heavy `content` HTML — the list never renders it, and
// the editor re-fetches the full post (getBlogForEditor) when opening one.
const LIST_COLUMNS =
  "id, title, slug, excerpt, cover_image_url, author, status, tags, categories, featured, seo_title, seo_description, reading_time, created_by, updated_by, published_at, created_at, updated_at, submitted_by, is_customer_submission";

export default async function BlogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireSectionAccess("blogs", "view");
  const canManage = access.can("blogs", "manage");

  const sp = await searchParams;
  const page = pickPage(sp.page);
  const q = pickParam(sp.q);
  const filterParam = pickParam(sp.filter) as BlogFilter;
  const filter = FILTER_TABS.includes(filterParam) ? filterParam : "all";
  const pageSize = DASHBOARD_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const supabase = await createClient();
  const storeId = await getActingStoreId();

  let listQuery = supabase
    .from("blogs")
    .select(LIST_COLUMNS, { count: "exact" })
    .eq("store_id", storeId)
    .order("created_at", { ascending: false });

  if (filter === "published") listQuery = listQuery.eq("status", "published");
  else if (filter === "drafts") listQuery = listQuery.eq("status", "draft");
  else if (filter === "pending")
    listQuery = listQuery.eq("status", "pending_review");
  else if (filter === "featured") listQuery = listQuery.eq("featured", true);

  const term = sanitizeSearch(q);
  if (term)
    listQuery = listQuery.or(
      ilikeOr(["title", "slug", "excerpt", "author"], term),
    );

  const countQuery = () =>
    supabase
      .from("blogs")
      .select("id", { count: "exact", head: true })
      .eq("store_id", storeId);

  const [
    { data: blogs, error, count },
    allRes,
    publishedRes,
    draftsRes,
    featuredRes,
    pendingRes,
    taxonomy,
  ] = await Promise.all([
    listQuery.range(offset, offset + pageSize - 1),
    countQuery(),
    countQuery().eq("status", "published"),
    countQuery().eq("status", "draft"),
    countQuery().eq("featured", true),
    countQuery().eq("status", "pending_review"),
    // This store's category/tag options for the editor dialog.
    fetchBlogTaxonomy(supabase, storeId),
  ]);

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

  const counts: BlogCounts = {
    all: allRes.count ?? 0,
    published: publishedRes.count ?? 0,
    drafts: draftsRes.count ?? 0,
    featured: featuredRes.count ?? 0,
    pending: pendingRes.count ?? 0,
  };

  // Resolve submitter names for the customer submissions ON THIS PAGE only.
  const blogsWithSubmitters = (blogs ?? []) as Blog[];
  const submitterIds = [
    ...new Set(
      blogsWithSubmitters
        .filter((b) => b.submitted_by)
        .map((b) => b.submitted_by as string),
    ),
  ];

  if (submitterIds.length > 0) {
    // Use the service-role client: `users` RLS only lets a customer read their
    // own row, so the admin session can't resolve submitter names.
    const adminClient = createAdminClient();
    const { data: customers } = await adminClient
      .from("users")
      .select("id, first_name, last_name")
      .in("id", submitterIds);

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
        counts={counts}
        total={count ?? 0}
        page={page}
        pageSize={pageSize}
        query={q}
        filter={filter}
        categoryOptions={taxonomy.categories.map((c) => c.name)}
        tagOptions={taxonomy.tags.map((t) => t.name)}
      />
    </>
  );
}
