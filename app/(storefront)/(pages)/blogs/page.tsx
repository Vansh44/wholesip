import type { Metadata } from "next";
import { getPublishedBlogCards } from "@/lib/storefront/queries";
import { requireStorefrontStoreId } from "@/lib/store/resolve";
import { getStoreBrand } from "@/lib/store/brand";
import { getStoreSetting } from "@/lib/settings/resolve";
import BlogListingClient from "./blog-listing-client";
import "./blogs.css";

export const revalidate = 300;

// Per-store metadata — the blog belongs to whichever store is on this host,
// so the title/description use that store's brand, never a hardcoded name.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getStoreBrand();
  const description = `Stories, insights and updates from the ${brand.name} team.`;
  return {
    // Layout templates as "%s | {brand}", so just "Blog".
    title: "Blog",
    description,
    alternates: { canonical: "/blogs" },
    openGraph: {
      title: `Blog | ${brand.name}`,
      description,
      url: "/blogs",
      type: "website",
    },
  };
}

export default async function BlogsPage() {
  const brand = await getStoreBrand();
  // Cached, trimmed read — card columns only (no full `content` HTML).
  const publishedBlogs = await getPublishedBlogCards(
    await requireStorefrontStoreId(),
  );

  // Store feature setting: hides the "Post your own blog" / "My Submissions"
  // CTAs when this store has customer submissions switched off.
  const allowSubmissions = await getStoreSetting("blogs.customerSubmissions");

  // Extract unique categories
  const categories = Array.from(
    new Set(publishedBlogs.flatMap((blog) => blog.categories ?? [])),
  );

  // Extract unique tags
  const allTags = Array.from(
    new Set(publishedBlogs.flatMap((blog) => blog.tags ?? [])),
  );

  return (
    <main>
      {/* Hero Section */}
      <section className="blog-hero">
        <div className="blog-hero-content blog-animate-in">
          <span className="blog-hero-kicker">The {brand.name} Journal</span>
          {/* <h1 className="blog-hero-title">Our Blog</h1> */}
          <p className="blog-hero-subtitle">
            Stories, insights and updates from our team
          </p>
          <div className="blog-hero-divider" />
        </div>
      </section>

      {/* Client component handles search, filters, and grid */}
      <BlogListingClient
        blogs={publishedBlogs}
        categories={categories}
        allTags={allTags}
        allowSubmissions={Boolean(allowSubmissions)}
      />
    </main>
  );
}
