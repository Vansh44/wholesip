import type { Metadata } from "next";
import WriteBlogEditor from "../write/write-blog-editor-lazy";
import "../write/write-blog.css";

// Static shell — the editor is a client-only, lazily loaded component.

export const metadata: Metadata = {
  title: "My Submissions | Soakd",
  description: "View and manage the blog posts you've submitted to Soakd.",
};

export default function MySubmissionsPage() {
  return <WriteBlogEditor initialMode="submissions" />;
}
