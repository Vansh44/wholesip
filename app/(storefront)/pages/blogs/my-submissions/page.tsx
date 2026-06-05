import type { Metadata } from "next";
import WriteBlogEditor from "../write/write-blog-editor";
import "../write/write-blog.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Submissions | Soakd",
  description: "View and manage the blog posts you've submitted to Soakd.",
};

export default function MySubmissionsPage() {
  return <WriteBlogEditor initialMode="submissions" />;
}
