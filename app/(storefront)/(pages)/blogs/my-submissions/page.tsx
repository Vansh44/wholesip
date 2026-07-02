import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStoreSetting } from "@/lib/settings/resolve";
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
  return <WriteBlogEditor initialMode="submissions" />;
}
