"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";

interface Blog {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  cover_image_url: string | null;
  author: string | null;
  status: "draft" | "published";
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

interface BlogListingClientProps {
  blogs: Blog[];
  categories: string[];
  allTags: string[];
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function BlogCard({ blog }: { blog: Blog }) {
  return (
    <Link
      href={`/pages/blogs/${blog.slug}`}
      className="blog-card"
      id={`blog-card-${blog.slug}`}
    >
      <div className="blog-card-image-wrapper">
        {blog.cover_image_url ? (
          <Image
            src={blog.cover_image_url}
            alt={blog.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <div className="blog-card-image-placeholder">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
              />
            </svg>
          </div>
        )}
        {blog.categories && blog.categories.length > 0 && (
          <span className="blog-card-category">{blog.categories[0]}</span>
        )}
      </div>

      <div className="blog-card-body">
        <h3 className="blog-card-title">{blog.title}</h3>

        {blog.excerpt && <p className="blog-card-excerpt">{blog.excerpt}</p>}

        {blog.tags && blog.tags.length > 0 && (
          <div className="blog-card-tags">
            {blog.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="blog-card-tag">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="blog-card-meta">
          {blog.author && (
            <span className="blog-card-author">{blog.author}</span>
          )}
          {blog.author && blog.published_at && (
            <span className="blog-card-meta-divider" />
          )}
          {blog.published_at && (
            <time dateTime={blog.published_at}>
              {formatDate(blog.published_at)}
            </time>
          )}
          {blog.reading_time && (
            <>
              <span className="blog-card-meta-divider" />
              <span>{blog.reading_time} min read</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function BlogListingClient({
  blogs,
  categories,
  allTags,
}: BlogListingClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const filteredBlogs = useMemo(() => {
    let result = blogs;

    // Category filter
    if (activeCategory !== "All") {
      result = result.filter((blog) =>
        blog.categories?.includes(activeCategory),
      );
    }

    // Tag filter
    if (activeTag) {
      result = result.filter(
        (blog) => blog.tags && blog.tags.includes(activeTag),
      );
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((blog) => {
        const titleMatch = blog.title.toLowerCase().includes(query);
        const categoryMatch = blog.categories?.some((c) =>
          c.toLowerCase().includes(query),
        );
        const tagMatch = blog.tags?.some((tag) =>
          tag.toLowerCase().includes(query),
        );
        const excerptMatch = blog.excerpt?.toLowerCase().includes(query);
        return titleMatch || categoryMatch || tagMatch || excerptMatch;
      });
    }

    return result;
  }, [blogs, searchQuery, activeCategory, activeTag]);

  const handleCategoryClick = (category: string) => {
    setActiveCategory(category);
    setActiveTag(null);
  };

  const handleTagClick = (tag: string) => {
    setActiveTag(activeTag === tag ? null : tag);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setActiveCategory("All");
    setActiveTag(null);
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" || activeCategory !== "All" || activeTag !== null;

  return (
    <>
      {/* Search & Filters */}
      <section className="blog-filters-section">
        <div className="blog-filters-container">
          {/* Search Bar */}
          <div className="blog-search-wrapper">
            <svg
              className="blog-search-icon"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <input
              id="blog-search-input"
              type="text"
              className="blog-search-input"
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="blog-search-clear"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                id="blog-search-clear"
              >
                ✕
              </button>
            )}
          </div>

          {/* Category Tabs */}
          {categories.length > 0 && (
            <div className="blog-category-tabs" id="blog-category-tabs">
              <button
                className="blog-category-tab"
                data-active={activeCategory === "All"}
                onClick={() => handleCategoryClick("All")}
                id="blog-category-all"
              >
                All
              </button>
              {categories.map((category) => (
                <button
                  key={category}
                  className="blog-category-tab"
                  data-active={activeCategory === category}
                  onClick={() => handleCategoryClick(category)}
                  id={`blog-category-${category.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {category}
                </button>
              ))}
            </div>
          )}

          {/* Tag Pills */}
          {allTags.length > 0 && (
            <div className="blog-tag-pills" id="blog-tag-pills">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  className="blog-tag-pill"
                  data-active={activeTag === tag}
                  onClick={() => handleTagClick(tag)}
                  id={`blog-tag-${tag.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Blog Grid */}
      <section className="blog-grid-section">
        <div className="blog-grid-container">
          {hasActiveFilters && (
            <p className="blog-results-count">
              {filteredBlogs.length}{" "}
              {filteredBlogs.length === 1 ? "article" : "articles"} found
            </p>
          )}

          {filteredBlogs.length > 0 ? (
            <div className="blog-grid" id="blog-grid">
              {filteredBlogs.map((blog) => (
                <BlogCard key={blog.id} blog={blog} />
              ))}
            </div>
          ) : (
            <div className="blog-empty-state" id="blog-empty-state">
              <svg
                className="blog-empty-icon"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
                />
              </svg>
              <h3 className="blog-empty-title">No articles found</h3>
              <p className="blog-empty-description">
                {hasActiveFilters
                  ? "Try adjusting your search or filters to find what you're looking for."
                  : "We're working on new content. Check back soon for fresh stories and insights."}
              </p>
              {hasActiveFilters && (
                <button
                  className="blog-empty-reset"
                  onClick={clearFilters}
                  id="blog-empty-reset"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    width={16}
                    height={16}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.992 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
                    />
                  </svg>
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export { BlogCard };
export type { Blog };
