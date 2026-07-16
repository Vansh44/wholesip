import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { and, arrayOverlaps, desc, eq, ne } from "drizzle-orm";
import { withAnon, withUser, type Db } from "@/lib/db/client";
import { blogComments, blogs } from "@/drizzle/schema";
import { getServerUser } from "@/lib/auth/server-user";
import { requireStorefrontStoreId } from "@/lib/store/resolve";
import { getStoreBrand } from "@/lib/store/brand";
import { getStoreUrl } from "@/lib/site";
import { getStoreSetting } from "@/lib/settings/resolve";
import { sanitizeBlogContent } from "@/lib/sanitize";
import { getOgImageUrl } from "@/lib/og-image";
import { articleSchema, breadcrumbSchema } from "@/lib/seo/schema";
import { JsonLd } from "@/app/(storefront)/components/json-ld";
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
    // No status filter — RLS decides visibility. Anonymous visitors can only read
    // published blogs (so unpublished slugs 404 for them), while admins and a
    // blog's own submitter are allowed to read drafts / pending submissions. This
    // lets the dashboard "Preview" action work for blogs awaiting review.
    // Signed-in readers run withUser (their RLS branches apply); others withAnon.
    try {
      const run = (db: Db) =>
        db
          .select({
            id: blogs.id,
            title: blogs.title,
            slug: blogs.slug,
            excerpt: blogs.excerpt,
            content: blogs.content,
            cover_image_url: blogs.coverImageUrl,
            author: blogs.author,
            status: blogs.status,
            tags: blogs.tags,
            categories: blogs.categories,
            featured: blogs.featured,
            seo_title: blogs.seoTitle,
            seo_description: blogs.seoDescription,
            reading_time: blogs.readingTime,
            published_at: blogs.publishedAt,
            created_at: blogs.createdAt,
            updated_at: blogs.updatedAt,
          })
          .from(blogs)
          .where(and(eq(blogs.storeId, storeId), eq(blogs.slug, slug)))
          .limit(1);
      const user = await getServerUser();
      const rows = user
        ? await withUser({ uid: user.id, email: user.email }, run)
        : await withAnon(run);
      const row = rows[0];
      if (!row) return null;
      return { ...row, tags: row.tags ?? [] } as Blog;
    } catch (err) {
      console.error("getBlog:", err instanceof Error ? err.message : err);
      return null;
    }
  },
);

// Related posts render as cards only — never the article body, so don't pull
// the heavy `content` column the way `select("*")` did.
const RELATED_BLOG_COLUMNS = {
  id: blogs.id,
  title: blogs.title,
  slug: blogs.slug,
  excerpt: blogs.excerpt,
  cover_image_url: blogs.coverImageUrl,
  author: blogs.author,
  published_at: blogs.publishedAt,
  reading_time: blogs.readingTime,
  tags: blogs.tags,
  categories: blogs.categories,
};

async function getRelatedBlogs(blog: Blog, storeId: string): Promise<Blog[]> {
  // Public, published-only reads — the anonymous scope.
  // Fetch category matches and recent posts in parallel (no waterfall), then
  // merge: category matches first, topped up with recents, deduped, capped at 3.
  const hasCategories = !!blog.categories && blog.categories.length > 0;
  try {
    const [categoryRows, recentRows] = await withAnon((db) => {
      const base = () =>
        db
          .select(RELATED_BLOG_COLUMNS)
          .from(blogs)
          .orderBy(desc(blogs.publishedAt))
          .limit(3);
      const published = and(
        eq(blogs.storeId, storeId),
        eq(blogs.status, "published"),
        ne(blogs.id, blog.id),
      );
      return Promise.all([
        hasCategories
          ? base().where(
              and(published, arrayOverlaps(blogs.categories, blog.categories!)),
            )
          : Promise.resolve([]),
        base().where(published),
      ]);
    });

    const seen = new Set<string>([blog.id]);
    const related: Blog[] = [];
    for (const b of [
      ...(categoryRows as unknown as Blog[]),
      ...(recentRows as unknown as Blog[]),
    ]) {
      if (seen.has(b.id)) continue;
      seen.add(b.id);
      related.push(b);
      if (related.length >= 3) break;
    }
    return related;
  } catch (err) {
    console.error(
      "getRelatedBlogs:",
      err instanceof Error ? err.message : err,
    );
    return [];
  }
}

// Public comments for a blog, newest first. Empty if not migrated yet.
async function getComments(
  blogId: string,
  storeId: string,
): Promise<BlogComment[]> {
  try {
    return await withAnon((db) =>
      db
        .select({
          id: blogComments.id,
          user_id: blogComments.userId,
          author_name: blogComments.authorName,
          body: blogComments.body,
          created_at: blogComments.createdAt,
        })
        .from(blogComments)
        .where(
          and(
            eq(blogComments.storeId, storeId),
            eq(blogComments.blogId, blogId),
          ),
        )
        .orderBy(desc(blogComments.createdAt)),
    );
  } catch (err) {
    console.error("getComments:", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const blog = await getBlog(slug, await requireStorefrontStoreId());

  if (!blog) {
    return {
      title: "Blog not found",
    };
  }

  const brand = await getStoreBrand();
  const title = blog.seo_title || blog.title;
  const description =
    blog.seo_description ||
    blog.excerpt ||
    `Read this article on the ${brand.name} blog.`;

  const ogImageUrl = getOgImageUrl(blog.cover_image_url);

  return {
    // Layout templates as "%s | {brand}", so pass the bare article title.
    title,
    description,
    alternates: { canonical: `/blogs/${blog.slug}` },
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
              width: 1200,
              height: 630,
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
  const storeId = await requireStorefrontStoreId();
  const blog = await getBlog(slug, storeId);

  if (!blog) {
    notFound();
  }

  const [
    relatedBlogs,
    reactionCounts,
    comments,
    allowSubmissions,
    brand,
    siteUrl,
  ] = await Promise.all([
    getRelatedBlogs(blog, storeId),
    getBlogReactionCounts(blog.id),
    getComments(blog.id, storeId),
    getStoreSetting("blogs.customerSubmissions"),
    getStoreBrand(),
    getStoreUrl(),
  ]);
  // Never trust stored HTML at the render boundary — sanitize even though the
  // write path also sanitizes (defense in depth).
  const sanitizedContent = sanitizeBlogContent(blog.content);

  const hasCoverImage = !!blog.cover_image_url;
  // getBlog returns unpublished blogs only to admins / the author (RLS), so if
  // we got a non-published row here it's a preview, not a public view.
  const isPreview = blog.status !== "published";

  // Structured data only for the public (published) view — never for drafts/
  // previews (which are force-dynamic and not indexed anyway).
  const articleLd = isPreview
    ? null
    : articleSchema({
        siteUrl,
        brandName: brand.name,
        logoUrl: brand.logoUrl,
        title: blog.seo_title || blog.title,
        slug: blog.slug,
        description: blog.seo_description || blog.excerpt,
        image: blog.cover_image_url,
        authorName: blog.author,
        publishedAt: blog.published_at,
        updatedAt: blog.updated_at,
      });
  const breadcrumbLd = isPreview
    ? null
    : breadcrumbSchema(siteUrl, [
        { name: "Home", path: "/" },
        { name: "Blog", path: "/blogs" },
        { name: blog.title, path: `/blogs/${blog.slug}` },
      ]);

  return (
    <main>
      {articleLd && breadcrumbLd && <JsonLd data={[articleLd, breadcrumbLd]} />}
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
              {allowSubmissions && (
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
              )}
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
