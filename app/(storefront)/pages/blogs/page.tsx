import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import BlogListingClient from "./blog-listing-client";
import "./blogs.css";

export const metadata: Metadata = {
  title: "Blog | Soakd",
  description:
    "Stories, insights and updates from the Soakd team. Discover wellness tips, recipes, and the latest from our kitchen.",
  openGraph: {
    title: "Blog | Soakd",
    description:
      "Stories, insights and updates from the Soakd team. Discover wellness tips, recipes, and the latest from our kitchen.",
    type: "website",
  },
};

export default async function BlogsPage() {
  const supabase = await createClient();

  const { data: blogs } = await supabase
    .from("blogs")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  const publishedBlogs = blogs ?? [];

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
          <span className="blog-hero-kicker">The Soakd Journal</span>
          <h1 className="blog-hero-title">Our Blog</h1>
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
      />
    </main>
  );
}
