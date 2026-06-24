import type { Metadata } from "next";
import WriteBlogEditor from "./write-blog-editor-lazy";
import "./write-blog.css";

// Static shell: this page does no server work — it just renders the (client-only,
// lazily loaded) editor. No reason to force per-request dynamic rendering.

export const metadata: Metadata = {
  title: "Write a Blog | Soakd",
  description:
    "Share your story with the Soakd community. Write and submit your blog post for review.",
};

export default function WriteBlogPage() {
  return <WriteBlogEditor />;
}
