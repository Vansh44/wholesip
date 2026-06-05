import type { Metadata } from "next";
import WriteBlogEditor from "./write-blog-editor";
import "./write-blog.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Write a Blog | Soakd",
  description:
    "Share your story with the Soakd community. Write and submit your blog post for review.",
};

export default function WriteBlogPage() {
  return <WriteBlogEditor />;
}
