import Link from "next/link";
import Image from "next/image";
import type { LatestBlogsConfig } from "@/lib/homepage/section-types";

export interface BlogCardData {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  cover_image_url: string | null;
  author: string | null;
  published_at: string | null;
  reading_time: number | null;
  categories: string[] | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Presentational: receives already-resolved, ordered blog rows. Renders
// nothing when there are no posts so we never show an empty heading.
export function LatestBlogsSection({
  config,
  blogs,
}: {
  config: LatestBlogsConfig;
  blogs: BlogCardData[];
}) {
  if (blogs.length === 0) return null;

  return (
    <section className="home-section">
      {(config.heading || config.subheading) && (
        <div className="home-section-head">
          {config.heading && (
            <h2 className="home-section-title">{config.heading}</h2>
          )}
          {config.subheading && (
            <p className="home-section-sub">{config.subheading}</p>
          )}
        </div>
      )}
      <div className="home-blog-grid">
        {blogs.map((b) => (
          <Link
            key={b.id}
            href={`/pages/blogs/${b.slug}`}
            className="home-blog-card"
          >
            <div className="home-blog-img">
              {b.cover_image_url ? (
                <Image
                  src={b.cover_image_url}
                  alt={b.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 380px"
                  className="home-blog-img-el"
                />
              ) : (
                <div className="home-blog-img-placeholder">📝</div>
              )}
              {b.categories && b.categories.length > 0 && (
                <span className="home-blog-cat">{b.categories[0]}</span>
              )}
            </div>
            <div className="home-blog-body">
              <h3 className="home-blog-title">{b.title}</h3>
              {b.excerpt && <p className="home-blog-excerpt">{b.excerpt}</p>}
              <div className="home-blog-meta">
                {b.author && <span>{b.author}</span>}
                {b.author && b.published_at && (
                  <span className="home-blog-meta-dot" />
                )}
                {b.published_at && (
                  <time dateTime={b.published_at}>
                    {formatDate(b.published_at)}
                  </time>
                )}
                {b.reading_time ? (
                  <>
                    <span className="home-blog-meta-dot" />
                    <span>{b.reading_time} min read</span>
                  </>
                ) : null}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
