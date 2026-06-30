import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentStoreId } from "@/lib/store/resolve";
import { sanitizeBlogContent } from "@/lib/sanitize";
import { getOgImageUrl } from "@/lib/og-image";
import { BlogCard } from "../blog-listing-client";
import { ShareButtons } from "@/app/(storefront)/components/share-buttons";
import { getBlogReactionCounts } from "@/app/actions/blog-social";
import { BlogReactions } from "./blog-reactions";
import { BlogComments, type BlogComment } from "./blog-comments";
import "../blogs.css";

// Stays dynamic: getBlog has NO status filter and leans on RLS so admins and a
// post's own author can preview drafts / pending submissions (the dashboard
// "Preview" action) while anonymous visitors only see published posts. That is
// per-user, so it must use the cookie-bound client and cannot be cached/static.
export const dynamic = "force-dynamic";

interface Blog {
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
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

type Props = {
  params: Promise<{ slug: string }>;
};

// React.cache dedupes the two calls per request (generateMetadata + the page
// body) so the full-content row is fetched once instead of twice.
const getBlog = cache(
  async (slug: string, storeId: string): Promise<Blog | null> => {
    const supabase = await createClient();
    // No status filter — RLS decides visibility. Anonymous visitors can only read
    // published blogs (so unpublished slugs 404 for them), while admins and a
    // blog's own submitter are allowed to read drafts / pending submissions. This
    // lets the dashboard "Preview" action work for blogs awaiting review.
    const { data } = await supabase
      .from("blogs")
      .select("*")
      .eq("store_id", storeId)
      .eq("slug", slug)
      .maybeSingle();
    return data;
  },
);

// Related posts render as cards only — never the article body, so don't pull
// the heavy `content` column the way `select("*")` did.
const RELATED_BLOG_COLUMNS =
  "id, title, slug, excerpt, cover_image_url, author, published_at, reading_time, tags, categories";

async function getRelatedBlogs(blog: Blog, storeId: string): Promise<Blog[]> {
  // Public, published-only reads — use the cookie-free anon client.
  const supabase = createPublicClient();

  // Fetch category matches and recent posts in parallel (no waterfall), then
  // merge: category matches first, topped up with recents, deduped, capped at 3.
  const hasCategories = !!blog.categories && blog.categories.length > 0;
  const [categoryRes, recentRes] = await Promise.all([
    hasCategories
      ? supabase
          .from("blogs")
          .select(RELATED_BLOG_COLUMNS)
          .eq("store_id", storeId)
          .eq("status", "published")
          .neq("id", blog.id)
          .overlaps("categories", blog.categories!)
          .order("published_at", { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase
      .from("blogs")
      .select(RELATED_BLOG_COLUMNS)
      .eq("store_id", storeId)
      .eq("status", "published")
      .neq("id", blog.id)
      .order("published_at", { ascending: false })
      .limit(3),
  ]);

  const seen = new Set<string>([blog.id]);
  const related: Blog[] = [];
  for (const b of [
    ...((categoryRes.data ?? []) as unknown as Blog[]),
    ...((recentRes.data ?? []) as unknown as Blog[]),
  ]) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    related.push(b);
    if (related.length >= 3) break;
  }
  return related;
}

// Public comments for a blog, newest first. Empty if not migrated yet.
async function getComments(
  blogId: string,
  storeId: string,
): Promise<BlogComment[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("blog_comments")
    .select("id, user_id, author_name, body, created_at")
    .eq("store_id", storeId)
    .eq("blog_id", blogId)
    .order("created_at", { ascending: false });
  return (data ?? []) as BlogComment[];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const blog = await getBlog(slug, await getCurrentStoreId());

  if (!blog) {
    return {
      title: "Blog Not Found | WholeSip",
    };
  }

  const title = blog.seo_title || blog.title;
  const description =
    blog.seo_description ||
    blog.excerpt ||
    "Read this article on WholeSip Blog.";

  const ogImageUrl = getOgImageUrl(blog.cover_image_url);

  return {
    title: `${title} | WholeSip`,
    description,
    openGraph: {
      title,
      description,
      url: `/blogs/${blog.slug}`,
      type: "article",
      publishedTime: blog.published_at ?? undefined,
      authors: blog.author ? [blog.author] : undefined,
      images: ogImageUrl
        ? [
            {
              url: ogImageUrl,
              width: 800,
              height: 420,
              alt: blog.title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImageUrl ? [ogImageUrl] : undefined,
    },
  };
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function BackLink() {
  return (
    <Link href="/blogs" className="blog-back-link" id="blog-back-link">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
        />
      </svg>
      Back to Blog
    </Link>
  );
}

export default async function BlogDetailPage({ params }: Props) {
  const { slug } = await params;
  const storeId = await getCurrentStoreId();
  const blog = await getBlog(slug, storeId);

  if (!blog) {
    notFound();
  }

  const [relatedBlogs, reactionCounts, comments] = await Promise.all([
    getRelatedBlogs(blog, storeId),
    getBlogReactionCounts(blog.id),
    getComments(blog.id, storeId),
  ]);
  // Never trust stored HTML at the render boundary — sanitize even though the
  // write path also sanitizes (defense in depth).
  const sanitizedContent = sanitizeBlogContent(blog.content);

  const hasCoverImage = !!blog.cover_image_url;
  // getBlog returns unpublished blogs only to admins / the author (RLS), so if
  // we got a non-published row here it's a preview, not a public view.
  const isPreview = blog.status !== "published";

  return (
    <main>
      <section className="blog-detail-page-section">
        <div className="blog-detail-content-container">
          {isPreview && (
            <div
              style={{
                background: "#fef3c7",
                border: "1px solid #fcd34d",
                color: "#92400e",
                padding: "12px 16px",
                borderRadius: 8,
                marginBottom: 24,
                fontSize: 14,
                fontWeight: 500,
                textAlign: "center",
              }}
            >
              👁 Preview — this post is{" "}
              <strong>
                {blog.status === "pending_review"
                  ? "pending review"
                  : "a draft"}
              </strong>{" "}
              and is not publicly visible yet.
            </div>
          )}

          <div className="blog-detail-toolbar">
            <BackLink />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <ShareButtons title={blog.title} />
              <Link
                href="/blogs/write"
                className="blog-publish-cta-btn"
                id="blog-detail-post-cta"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  width={18}
                  height={18}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
                Post your own blog
              </Link>
            </div>
          </div>

          {hasCoverImage && (
            <div className="blog-detail-cover">
              <Image
                src={blog.cover_image_url!}
                alt={blog.title}
                fill
                sizes="(max-width: 720px) 100vw, 720px"
                style={{ objectFit: "cover" }}
                priority
              />
            </div>
          )}

          <div className="blog-detail-header">
            {blog.categories && blog.categories.length > 0 && (
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  justifyContent: "center",
                  marginBottom: "20px",
                  flexWrap: "wrap",
                }}
              >
                {blog.categories.map((c) => (
                  <span
                    key={c}
                    className="blog-detail-category"
                    style={{ marginBottom: 0 }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}

            <h1 className="blog-detail-title">{blog.title}</h1>

            <div className="blog-detail-meta">
              {blog.author && (
                <span className="blog-detail-meta-author">{blog.author}</span>
              )}
              {blog.author && blog.published_at && (
                <span className="blog-detail-meta-divider" />
              )}
              {blog.published_at && (
                <time dateTime={blog.published_at}>
                  {formatDate(blog.published_at)}
                </time>
              )}
              {blog.reading_time && (
                <>
                  <span className="blog-detail-meta-divider" />
                  <span>{blog.reading_time} min read</span>
                </>
              )}
            </div>
          </div>

          {sanitizedContent && (
            <article
              className="blog-prose"
              id="blog-content"
              dangerouslySetInnerHTML={{ __html: sanitizedContent }}
            />
          )}

          <BlogReactions blogId={blog.id} initialCounts={reactionCounts} />

          {/* Tags */}
          {blog.tags && blog.tags.length > 0 && (
            <div className="blog-detail-tags" id="blog-detail-tags">
              {blog.tags.map((tag) => (
                <span key={tag} className="blog-detail-tag">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <BlogComments blogId={blog.id} slug={blog.slug} comments={comments} />
        </div>
      </section>

      {/* Related Posts */}
      {relatedBlogs.length > 0 && (
        <section className="blog-related-section" id="blog-related-section">
          <div className="blog-related-container">
            <div className="blog-related-header">
              <p className="blog-related-kicker">Keep Reading</p>
              <h2 className="blog-related-title">You May Also Like</h2>
            </div>

            <div className="blog-related-grid">
              {relatedBlogs.map((relatedBlog) => (
                <BlogCard key={relatedBlog.id} blog={relatedBlog} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Bottom Navigation */}
      <section className="blog-bottom-nav">
        <div className="blog-bottom-nav-container">
          <BackLink />
        </div>
      </section>
    </main>
  );
}
