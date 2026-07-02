import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStoreSetting } from "@/lib/settings/resolve";
import { getCurrentStore } from "@/lib/store/resolve";
import { getBlogTaxonomyNames } from "@/lib/storefront/queries";
import WriteBlogEditor from "./write-blog-editor-lazy";
import "./write-blog.css";

export const metadata: Metadata = {
  title: "Write a Blog",
  description:
    "Share your story with the community. Write and submit your blog post.",
};

export default async function WriteBlogPage() {
  // Store feature setting — stores can switch customer submissions off.
  if (!(await getStoreSetting("blogs.customerSubmissions"))) {
    redirect("/blogs");
  }
  // This store's own categories/tags (managed in /dashboard/blogs/settings).
  const store = await getCurrentStore();
  const { categories, tags } = await getBlogTaxonomyNames(store.id);
  return <WriteBlogEditor categoryOptions={categories} tagOptions={tags} />;
}
