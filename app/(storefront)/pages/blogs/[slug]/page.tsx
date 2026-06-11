import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { sanitizeBlogContent } from "@/lib/sanitize";
import { getOgImageUrl } from "@/lib/og-image";
import { BlogCard } from "../blog-listing-client";
import "../blogs.css";

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

async function getBlog(slug: string): Promise<Blog | null> {
  const supabase = await createClient();
  // No status filter — RLS decides visibility. Anonymous visitors can only read
  // published blogs (so unpublished slugs 404 for them), while admins and a
  // blog's own submitter are allowed to read drafts / pending submissions. This
  // lets the dashboard "Preview" action work for blogs awaiting review.
  const { data } = await supabase
    .from("blogs")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return data;
}

async function getRelatedBlogs(blog: Blog): Promise<Blog[]> {
  const supabase = await createClient();

  // Try to find related blogs by same category or shared tags
  let related: Blog[] = [];

  if (blog.categories && blog.categories.length > 0) {
    const { data: categoryBlogs } = await supabase
      .from("blogs")
      .select("*")
      .eq("status", "published")
      .neq("id", blog.id)
      .overlaps("categories", blog.categories)
      .order("published_at", { ascending: false })
      .limit(3);

    if (categoryBlogs) {
      related = categoryBlogs;
    }
  }

  // If not enough results, supplement with recent blogs
  if (related.length < 3) {
    const existingIds = [blog.id, ...related.map((b) => b.id)];
    const { data: recentBlogs } = await supabase
      .from("blogs")
      .select("*")
      .eq("status", "published")
      .not("id", "in", `(${existingIds.join(",")})`)
      .order("published_at", { ascending: false })
      .limit(3 - related.length);

    if (recentBlogs) {
      related = [...related, ...recentBlogs];
    }
  }

  return related.slice(0, 3);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const blog = await getBlog(slug);

  if (!blog) {
    return {
      title: "Blog Not Found | Soakd",
    };
  }

  const title = blog.seo_title || blog.title;
  const description =
    blog.seo_description || blog.excerpt || "Read this article on Soakd Blog.";

  const ogImageUrl = getOgImageUrl(blog.cover_image_url);

  return {
    title: `${title} | Soakd`,
    description,
    openGraph: {
      title,
      description,
      url: `/pages/blogs/${blog.slug}`,
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
    <Link href="/pages/blogs" className="blog-back-link" id="blog-back-link">
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
  const blog = await getBlog(slug);

  if (!blog) {
    notFound();
  }

  const relatedBlogs = await getRelatedBlogs(blog);
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
            <Link
              href="/pages/blogs/write"
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
