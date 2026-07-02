import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStoreSetting } from "@/lib/settings/resolve";
import { getCurrentStore } from "@/lib/store/resolve";
import { getBlogTaxonomyNames } from "@/lib/storefront/queries";
import WriteBlogEditor from "../write/write-blog-editor-lazy";
import "../write/write-blog.css";

export const metadata: Metadata = {
  title: "My Submissions",
  description: "View and manage the blog posts you've submitted.",
};

export default async function MySubmissionsPage() {
  // Store feature setting — stores can switch customer submissions off.
  if (!(await getStoreSetting("blogs.customerSubmissions"))) {
    redirect("/blogs");
  }
  // This store's own categories/tags — the editor opens from here too.
  const store = await getCurrentStore();
  const { categories, tags } = await getBlogTaxonomyNames(store.id);
  return (
    <WriteBlogEditor
      initialMode="submissions"
      categoryOptions={categories}
      tagOptions={tags}
    />
  );
}
